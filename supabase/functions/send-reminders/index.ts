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
  const { data: jobs, error } = await db.rpc("claim_daily_agenda");
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
    if (!job.agenda) {
      await finish(
        "failed",
        "Daily agenda payload missing; check migration 006",
      );
      continue;
    }
    const { html, text } = renderAgenda(job.agenda, job.local_day, site);
    try {
      const result = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          sender: { email: sender, name: "Our Space" },
          to: [{ email: job.email }],
          subject: "A little look at your day ♡",
          htmlContent: html,
          textContent: text,
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

type AgendaItem = {
  title: string;
  due_date?: string | null;
  at_time?: string | null;
  kind?: string;
};
type AgendaSection = { total: number; items: AgendaItem[] };
type Agenda = {
  timezone: string;
  chores: AgendaSection;
  today: AgendaSection;
  tomorrow: AgendaSection;
};
function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (c) => entities[c]);
}

function renderAgenda(agenda: Agenda, day: string, site: string) {
  const origin = site.replace(/\/$/, "");
  function dateLabel(value: string) {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(value + "T12:00:00Z"));
  }
  const next = new Date(day + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const tomorrow = next.toISOString().slice(0, 10);
  const sections = [
    {
      heading: `Unfinished chores (${agenda.chores.total})`,
      data: agenda.chores,
      empty: "All caught up — no unfinished chores.",
      task: true,
    },
    {
      heading: `Today · ${dateLabel(day)}`,
      data: agenda.today,
      empty: "Nothing planned for today.",
      task: false,
    },
    {
      heading: `Tomorrow · ${dateLabel(tomorrow)}`,
      data: agenda.tomorrow,
      empty: "Nothing planned for tomorrow.",
      task: false,
    },
  ];
  const labels = (item: AgendaItem, task: boolean) =>
    task
      ? item.title +
        (item.due_date
          ? ` — ${item.due_date < day ? "Overdue · " : item.due_date === day ? "Due today · " : "Due "}${dateLabel(item.due_date)}`
          : "")
      : `${item.at_time || (item.kind === "trip" ? "Trip" : "All day")} · ${item.title}`;
  const parts = sections.map((s) => {
    const lines = s.data.items.map((item) => labels(item, s.task));
    const extra = Math.max(0, Number(s.data.total) - lines.length);
    const more = extra ? `+ ${extra} more in the app.` : "";
    return {
      html:
        `<h2 style="font-size:18px;margin:28px 0 10px;color:#382f32">${escapeHtml(s.heading)}</h2>` +
        (lines.length
          ? `<ul style="padding-left:20px;margin:0">${lines.map((line) => `<li style="margin:10px 0;line-height:1.6;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(line)}</li>`).join("")}</ul>`
          : `<p style="color:#706369">${s.empty}</p>`) +
        (more ? `<p>${more}</p>` : ""),
      text:
        s.heading +
        "\n" +
        (lines.length ? lines.map((line) => "• " + line).join("\n") : s.empty) +
        (more ? "\n" + more : ""),
    };
  });
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:Arial,sans-serif;color:#382f32;padding:24px"><div style="max-width:540px;margin:auto;background:white;border-radius:20px;padding:28px;border-top:6px solid #b93854"><p style="color:#b93854;font-size:12px;letter-spacing:2px">OUR SPACE</p><h1 style="font-size:27px">A little room for today.</h1><p style="color:#706369">Your everyday things and something to look forward to.</p><p style="font-size:12px;color:#706369">Times shown in ${escapeHtml(agenda.timezone)}.</p>${parts.map((p) => p.html).join("")}<p style="margin:30px 0"><a href="${escapeHtml(origin)}" style="display:inline-block;background:#b93854;color:white;padding:12px 20px;border-radius:8px;text-decoration:none">Open our space</a></p><p style="font-size:12px;line-height:1.6;color:#706369">A daily snapshot, including quiet days. Changes made later will appear in the app. Surprise details and your partner’s private tasks stay private.<br/>You enabled daily reminders. <a href="${escapeHtml(origin)}/settings">Manage email reminders</a>.</p></div></body></html>`;
  return {
    html,
    text: `Our Space — ${dateLabel(day)}\nTimes shown in ${agenda.timezone}.\n\n${parts.map((p) => p.text).join("\n\n")}\n\nOpen your space: ${origin}\nManage email reminders: ${origin}/settings`,
  };
}
