import { Reminders } from "./Reminders";
import { useState } from "react";
import { Copy, LogOut, Users } from "lucide-react";
import { useSpace } from "../lib/store";
import { supabase } from "../lib/supabase";
import { Field } from "../components/Form";
export function Settings({ onSignOut }: { onSignOut: () => void }) {
  const { data, userId, demo, run, busy, notify, error } = useSpace();
  const [link, setLink] = useState("");
  const me = data.profiles.find((p) => p.id === userId);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Make yourself at home</span>
          <h1>Our space.</h1>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-panel">
          <Users />
          <h2>The two of us</h2>
          <div className="members">
            {data.profiles.map((p, i) => (
              <div key={p.id}>
                <span className={"avatar " + (i ? "green" : "")}>
                  {p.name.slice(0, 1)}
                </span>
                <span>
                  {p.name}
                  {p.id === userId ? " (you)" : ""}
                </span>
              </div>
            ))}
          </div>
          {demo ? (
            <p className="muted">
              This is a local demo with sample people. Sign in to create your
              real shared space.
            </p>
          ) : data.profiles.length < 2 ? (
            <>
              <p>
                Invite your person. The link works once and expires after seven
                days.
              </p>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await supabase!.rpc("create_invite", {
                      s: data.space!.id,
                    });
                    if (r.error) throw r.error;
                    setLink(`${window.location.origin}/?invite=${r.data}`);
                  }, "Invitation link created")
                }
              >
                Create invitation link
              </button>
              {link && (
                <div className="share-link">
                  <Field label="Invitation link">
                    <input
                      readOnly
                      value={link}
                      onFocus={(e) => e.target.select()}
                    />
                  </Field>
                  <button
                    className="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link);
                        notify("Link copied");
                      } catch {
                        notify("Select the link and copy it manually.");
                      }
                    }}
                  >
                    <Copy size={16} />
                    Copy link
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="muted">
              You’re both here. Everything shared belongs to this space.
            </p>
          )}
        </section>
        <section className="settings-panel">
          <h2>Your name</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const name = String(
                new FormData(e.currentTarget).get("name"),
              ).trim();
              if (!name) return;
              if (demo) {
                notify(
                  "Demo uses sample profiles. Your real profile becomes editable after sign-in.",
                );
                return;
              }
              await run(async () => {
                const result = await supabase!
                  .from("profiles")
                  .update({ name })
                  .eq("id", userId);
                if (result.error) throw result.error;
              }, "Name updated");
            }}
          >
            <Field label="What should we call you?">
              <input
                name="name"
                defaultValue={me?.name}
                required
                maxLength={60}
              />
            </Field>
            <button className="button" disabled={busy || demo}>
              Save name
            </button>
          </form>
          <p className="error">{error}</p>
          <hr />
          <Reminders />
          <hr />
          <button className="button" onClick={onSignOut}>
            <LogOut size={16} />
            {demo ? "Leave demo" : "Sign out"}
          </button>
        </section>
      </div>
    </>
  );
}
