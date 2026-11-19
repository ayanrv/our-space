import { createClient } from "npm:@supabase/supabase-js@2";
// Server-only secrets. Never prefix these with VITE_.
Deno.serve(async (request: Request) => {
  const secret = Deno.env.get("REMINDER_CRON_SECRET");
  if (
    request.method !== "POST" ||
    !secret ||
    request.headers.get("x-cron-secret") !== secret
  )
    return new Response("Unauthorized", { status: 401 });
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const sender = Deno.env.get("BREVO_SENDER_EMAIL");
  const site = Deno.env.get("APP_URL");
  if (!apiKey || !sender || !site || !/^https:\/\/[^<>"\s]+$/.test(site))
    return new Response("Configure server secrets first", { status: 503 });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: jobs, error } = await db.rpc("claim_reminders");
  if (error) {
    console.error("Reminder claim failed", error.code);
    return new Response("Claim failed", { status: 500 });
  }
  let sent = 0;
  for (const job of jobs || []) {
    async function finish(status: string, last_error: string | null = null) {
      const { error } = await db
        .from("reminder_deliveries")
        .update({
          status,
          last_error,
          ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}),
          next_attempt: new Date(Date.now() + 5 * 60_000).toISOString(),
        })
        .eq("id", job.job_id)
        .eq("status", "sending");
      if (error) console.error("Reminder acknowledgement failed", error.code);
    }
    // Recheck opt-out and membership immediately before delivery.
    const { data: pref, error: prefError } = await db
      .from("reminder_preferences")
      .select("enabled")
      .eq("user_id", job.user_id)
      .maybeSingle();
    const { data: member, error: memberError } = await db
      .from("memberships")
      .select("space_id")
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (prefError || memberError) {
      await finish("pending", "Preference check failed");
      continue;
    }
    if (!pref?.enabled || !member || !job.email) {
      await finish("cancelled");
      continue;
    }
    if (!job.plan_count && !job.task_count) {
      await finish("cancelled", "Nothing to remind about");
      continue;
    }
    const plans = Number(job.plan_count);
    const tasks = Number(job.task_count);
    const summary = `${plans} plan${plans === 1 ? "" : "s"} today or tomorrow, and ${tasks} task${tasks === 1 ? "" : "s"} due or overdue.`;
    // Counts only: titles, private notes, invitations and hidden surprises never enter email.
    const html = `<html><body style="margin:0;background:#f5f5f7;font-family:Arial,sans-serif;color:#382f32;padding:32px"><div style="max-width:480px;margin:auto;background:white;border-radius:20px;padding:32px;border-top:6px solid #b93854"><p style="color:#b93854">OUR SPACE</p><h1 style="font-size:26px">A little room for today.</h1><p>${summary}</p><p>Take a moment to see what’s coming up together.</p><p style="margin:28px 0"><a href="${site}" style="background:#b93854;color:white;padding:12px 20px;border-radius:8px;text-decoration:none">Open our space</a></p><p style="font-size:12px;color:#706369">You enabled daily reminders. Turn them off any time in <a href="${site.replace(/\/$/, "")}/settings">Settings → Email reminders</a>.</p></div></body></html>`;
    try {
      const result = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          sender: { email: sender, name: "Our Space" },
          to: [{ email: job.email }],
          subject: "A little look at your day ♡",
          htmlContent: html,
          textContent: `${summary}\nOpen your space: ${site}\nDisable reminders in Settings.`,
          tags: ["daily-reminder"],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (result.ok) {
        await finish("sent");
        sent++;
      } else if (result.status === 429) {
        await finish("pending", "Provider rate limit");
      } else if (result.status >= 500) {
        await finish(
          "unknown",
          `Provider ${result.status}; check Brevo before retrying`,
        );
      } else {
        await finish(
          "failed",
          `Provider rejected request (${result.status}); check configuration`,
        );
      }
    } catch {
      await finish(
        "unknown",
        "Delivery outcome uncertain; check Brevo before retrying",
      );
    }
  }
  return Response.json({ processed: jobs?.length || 0, sent });
});
