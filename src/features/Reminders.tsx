import { useEffect, useState } from "react";
import { useSpace } from "../lib/store";
import { supabase } from "../lib/supabase";
import { saveReminderPreference } from "../lib/repository";
import { Field } from "../components/Form";
export function Reminders() {
  const { data, demo, userId, run, busy } = useSpace();
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
        One gentle daily summary when you have plans today or tomorrow, or tasks
        due. Each person chooses their own reminders.
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
          your chosen time. Emails show counts, so surprise details stay in the
          app. You can turn this off here any time.
        </p>
        <button className="button" disabled={busy || !ready}>
          Save reminders
        </button>
      </form>
    </section>
  );
}
