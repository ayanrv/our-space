import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { runInNewContext } from "node:vm";
async function worker({
  enabled = true,
  job = true,
  provider = 201,
  throws = false,
  authorized = true,
  empty = false,
} = {}) {
  const jobs = job
    ? [
        {
          job_id: "job-1",
          user_id: "user-1",
          email: "sample@example.test",
          local_day: "2026-10-09",
          plan_count: 2,
          task_count: 1,
          agenda: {
            timezone: "Europe/Paris",
            chores: {
              total: empty ? 0 : 1,
              items: empty
                ? []
                : [{ title: "Wash <plates> & cups", due_date: "2026-10-08" }],
            },
            today: {
              total: empty ? 0 : 1,
              items: empty
                ? []
                : [
                    {
                      title: "Dinner together",
                      at_time: "19:00",
                      kind: "date",
                    },
                  ],
            },
            tomorrow: {
              total: empty ? 0 : 1,
              items: empty
                ? []
                : [
                    {
                      title: "A surprise for you",
                      at_time: null,
                      kind: "date",
                    },
                  ],
            },
          },
        },
      ]
    : [];
  const updates: Record<string, unknown>[] = [];
  const send = vi.fn(async () => {
    if (throws) throw new Error("Network interrupted");
    return new Response("{}", { status: provider });
  });
  const rpc = vi.fn(async () => ({ data: jobs, error: null }));
  const db = {
    rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "reminder_preferences"
                ? { enabled }
                : { space_id: "space" },
            error: null,
          }),
        }),
      }),
      update: (value: Record<string, unknown>) => {
        updates.push(value);
        return { eq: () => ({ eq: async () => ({ error: null }) }) };
      },
    }),
  };
  let handler: (req: Request) => Promise<Response> = async () =>
    new Response("missing");
  const env: Record<string, string> = {
    REMINDER_CRON_SECRET: "secret",
    BREVO_API_KEY: "api",
    BREVO_SENDER_EMAIL: "sender@example.test",
    APP_URL: "https://demo.example.test",
    SUPABASE_URL: "https://db.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "server",
  };
  const source = readFileSync(
    new URL("../supabase/functions/send-reminders/index.ts", import.meta.url),
    "utf8",
  ).replace(/import .*?from .*?;\n/s, "");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  runInNewContext(js, {
    createClient: () => db,
    Deno: {
      env: { get: (k: string) => env[k] },
      serve: (h: typeof handler) => {
        handler = h;
      },
    },
    fetch: send,
    Response,
    AbortSignal,
    console,
    Date,
    JSON,
  });
  const result = await handler(
    new Request("https://worker.example.test", {
      method: "POST",
      headers: authorized ? { "x-cron-secret": "secret" } : {},
    }),
  );
  return { result, updates, send, rpc };
}
it("rejects unauthenticated sends before reading recipients", async () => {
  const r = await worker({ authorized: false });
  expect(r.result.status).toBe(401);
  expect(r.rpc).not.toHaveBeenCalled();
  expect(r.send).not.toHaveBeenCalled();
});
it("rechecks opt-out and does not deliver after it is disabled", async () => {
  const r = await worker({ enabled: false });
  expect(r.send).not.toHaveBeenCalled();
  expect(r.updates[0].status).toBe("cancelled");
});
it("sends escaped chore titles, dated plans, timezone and opt-out instructions", async () => {
  const r = await worker();
  expect(r.send).toHaveBeenCalledTimes(1);
  const body = JSON.parse(
    (r.send.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as string,
  );
  expect(body.htmlContent).toContain("Wash &lt;plates&gt; &amp; cups");
  expect(body.htmlContent).not.toContain("Wash <plates>");
  expect(body.htmlContent).toContain("Overdue");
  expect(body.htmlContent).toContain("19:00 · Dinner together");
  expect(body.htmlContent).toContain("A surprise for you");
  expect(body.htmlContent).toContain("Europe/Paris");
  expect(body.textContent).toContain("Wash <plates> & cups");
  expect(r.rpc).toHaveBeenCalledWith("claim_daily_agenda");
  expect(body.htmlContent).toContain("/settings");
  expect(body).not.toHaveProperty("event_secrets");
  expect(r.updates[0].status).toBe("sent");
});
it("holds uncertain network outcomes instead of automatically sending twice", async () => {
  const r = await worker({ throws: true });
  expect(r.updates[0].status).toBe("unknown");
  expect(r.send).toHaveBeenCalledTimes(1);
});
it("retries rate limits but records definite provider rejection", async () => {
  expect((await worker({ provider: 429 })).updates[0].status).toBe("pending");
  expect((await worker({ provider: 401 })).updates[0].status).toBe("failed");
});

it("sends quiet-day summaries with explicit empty sections", async () => {
  const r = await worker({ empty: true });
  expect(r.send).toHaveBeenCalledTimes(1);
  const body = JSON.parse(
    (r.send.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as string,
  );
  for (const value of [
    "All caught up — no unfinished chores.",
    "Nothing planned for today.",
    "Nothing planned for tomorrow.",
  ]) {
    expect(body.htmlContent).toContain(value);
    expect(body.textContent).toContain(value);
  }
  expect(r.updates[0].status).toBe("sent");
});
