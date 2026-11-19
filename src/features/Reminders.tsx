import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSpace } from "../lib/store";
import { supabase } from "../lib/supabase";
import { saveReminderPreference } from "../lib/repository";
import { Field } from "../components/Form";
export function Reminders() {
  const { data, demo, userId, run, busy } = useSpace();
  const delivery = useQuery({
    queryKey: ["reminder-delivery", userId],
    enabled: !demo,
    refetchInterval: 30000,
    queryFn: async () => {
      const r = await supabase!.rpc("my_reminder_status");
      if (r.error) throw r.error;
      return (r.data?.[0] || null) as {
        local_day: string;
        status: string;
        sent_at: string | null;
        last_error: string | null;
      } | null;
    },
  });
  const saved = data.reminder_preferences.find((p) => p.user_id === userId);
  const [ready, setReady] = useState(demo);
  const [status, setStatus] = useState("Checking reminder service…");
  useEffect(() => {
    if (demo) {
      setReady(true);
      return;
    }
    let active = true;
    void supabase!.rpc("reminders_ready").then(({ data, error }) => {
      if (active) {
        setReady(!error && !!data);
        setStatus(
          error
            ? "Could not check the reminder service. Refresh to try again."
            : "Email reminders need to be activated by the space administrator.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [demo]);
  return (
    <section>
      <h2>Email reminders</h2>
      <p className="muted">
        A daily list of unfinished chores, today’s plans and tomorrow’s plans.
        Quiet days get a little “nothing planned” too. Each person opts in
        separately.
      </p>
      {!ready && (
        <p role="status" className="small">
          {status}
        </p>
      )}
      {demo && <p className="small">Demo only. No emails are sent.</p>}
      <form
        key={JSON.stringify(saved)}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await run(
            () =>
              saveReminderPreference(demo, {
                user_id: userId,
                enabled: f.get("enabled") === "on",
                timezone: String(f.get("timezone")),
                hour: Number(f.get("hour")),
              }),
            "Reminder preferences saved",
          );
        }}
      >
        <label className="check-label">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={saved?.enabled || false}
            disabled={!ready}
          />
          Email me a daily summary
        </label>
        <div className="form-grid">
          <Field label="Around this time">
            <select name="hour" defaultValue={saved?.hour ?? 8}>
              {Array.from({ length: 24 }, (_, h) => (
                <option value={h} key={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </Field>
          <Field label="My time zone">
            <select
              name="timezone"
              defaultValue={
                saved?.timezone ||
                Intl.DateTimeFormat().resolvedOptions().timeZone
              }
            >
              {Array.from(
                new Set([
                  Intl.DateTimeFormat().resolvedOptions().timeZone,
                  saved?.timezone || "Europe/Paris",
                  "Europe/Paris",
                  "Europe/London",
                  "Asia/Almaty",
                  "America/New_York",
                  "UTC",
                ]),
              ).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <p className="small muted">
          Sent to your confirmed account email, usually within 15 minutes of
          your chosen time, once per local day. Includes shared unfinished
          chores and your own private tasks, including undated and future tasks.
          Partner-private tasks, notes and hidden surprise details stay out of
          the email. Plan times use your selected time zone. You can turn this
          off here any time.
        </p>
        <button className="button" disabled={busy || !ready}>
          Save reminders
        </button>
      </form>
      {!demo && (
        <div className="reminder-delivery small" role="status">
          <strong>Last daily reminder</strong>
          {delivery.error ? (
            <p>Delivery status could not be checked. Please try again later.</p>
          ) : delivery.isLoading ? (
            <p>Checking delivery…</p>
          ) : !delivery.data ? (
            <p>
              No delivery recorded yet. Your first summary runs after your
              selected hour. An email already processed today won’t be sent
              again automatically.
            </p>
          ) : (
            <>
              <p>
                {delivery.data.local_day} ·{" "}
                {delivery.data.status === "sent"
                  ? "Accepted by the email provider"
                  : delivery.data.status}
              </p>
              <p>
                {delivery.data.status === "sent"
                  ? "If it is missing, check spam and Brevo’s delivery log. Accepted does not guarantee inbox delivery."
                  : delivery.data.status === "cancelled"
                    ? "This delivery was skipped. Older reminder versions skipped days without due tasks or plans; the new daily agenda includes quiet days."
                    : delivery.data.status === "unknown"
                      ? "Delivery is uncertain. Check Brevo before retrying to avoid a duplicate email."
                      : delivery.data.status === "failed"
                        ? "Delivery failed. Check the function configuration and Brevo logs."
                        : "Waiting for the next scheduled check."}
              </p>
              {delivery.data.last_error && <p>{delivery.data.last_error}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
