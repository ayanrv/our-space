import { useEffect, useState } from "react";
import { Flower2 } from "lucide-react";
import { supabase, demoEnabled } from "../lib/supabase";
import { Field, FormError } from "../components/Form";
import { useSpace } from "../lib/store";
function friendlyError(error: { message: string; code?: string }) {
  if (error.code === "over_email_send_rate_limit")
    return "Too many emails requested. Please wait before trying again.";
  if (error.code === "email_not_confirmed")
    return "Confirm your email first, or choose “Resend confirmation” below.";
  if (error.code === "invalid_credentials")
    return "The email or password does not match. Try again or reset your password.";
  return error.message;
}
function confirmationUrl() {
  const url = new URL(window.location.origin);
  const token = sessionStorage.getItem("our-space-invite");
  if (token) url.searchParams.set("invite", token);
  return url.toString();
}
export function Auth({ onDemo }: { onDemo: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "resend">(
    window.location.pathname === "/reset-password" ? "reset" : "signin",
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    window.location.pathname === "/reset-password"
      ? "Open a fresh reset link from your email. If the link expired, request a new one below."
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  const labels = {
    signin: "Welcome back.",
    signup: "Your own little space.",
    reset: "Let’s get you back in.",
    resend: "Check your inbox.",
  };
  return (
    <main className="auth-layout">
      <section className="auth-art">
        <div className="brand">
          <Flower2 />
          our space
        </div>
        <h1>
          Life together.
          <br />A little more
          <br />
          <em>room for us.</em>
        </h1>
        <p>Plans, everyday things, and something to look forward to.</p>
        <div className="auth-names">Yours + theirs</div>
      </section>
      <section className="auth-form">
        <span className="eyebrow">Make yourself at home</span>
        <h2>{labels[mode]}</h2>
        {supabase ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              setMessage("");
              try {
                const password = String(f.get("password") || "");
                if (mode === "signin") {
                  const r = await supabase!.auth.signInWithPassword({
                    email: email.trim(),
                    password,
                  });
                  if (r.error) throw r.error;
                } else if (mode === "signup") {
                  const r = await supabase!.auth.signUp({
                    email: email.trim(),
                    password,
                    options: { emailRedirectTo: confirmationUrl() },
                  });
                  if (r.error) throw r.error;
                  if (!r.data.session) {
                    setMessage(
                      "Check your inbox to confirm your account. Already registered? Sign in or reset your password.",
                    );
                    setCooldown(60);
                  }
                } else if (mode === "reset") {
                  const r = await supabase!.auth.resetPasswordForEmail(
                    email.trim(),
                    { redirectTo: window.location.origin + "/reset-password" },
                  );
                  if (r.error) throw r.error;
                  setMessage(
                    "If this email has an account, a reset link is on its way.",
                  );
                  setCooldown(60);
                } else {
                  const r = await supabase!.auth.resend({
                    type: "signup",
                    email: email.trim(),
                    options: { emailRedirectTo: confirmationUrl() },
                  });
                  if (r.error) throw r.error;
                  setMessage(
                    "If confirmation is needed, an email is on its way. Check spam too.",
                  );
                  setCooldown(60);
                }
              } catch (e) {
                setError(
                  friendlyError(e as { message: string; code?: string }),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Email">
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            {(mode === "signin" || mode === "signup") && (
              <Field label="Password">
                <input
                  name="password"
                  type="password"
                  minLength={mode === "signup" ? 8 : undefined}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  required
                />
              </Field>
            )}
            <FormError text={error} />
            {message && <p role="status">{message}</p>}
            <button
              className="button primary"
              disabled={busy || (mode !== "signin" && cooldown > 0)}
            >
              {busy
                ? "One moment…"
                : mode !== "signin" && cooldown
                  ? `Try again in ${cooldown}s`
                  : mode === "signin"
                    ? "Sign in"
                    : mode === "signup"
                      ? "Create account"
                      : mode === "reset"
                        ? "Send reset link"
                        : "Resend confirmation"}
            </button>
            <div className="auth-options">
              {(["signin", "signup", "reset", "resend"] as const)
                .filter((m) => m !== mode)
                .map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setMode(m);
                      setError("");
                      setMessage("");
                    }}
                  >
                    {m === "signin"
                      ? "Back to sign in"
                      : m === "signup"
                        ? "Create an account"
                        : m === "reset"
                          ? "Forgot password?"
                          : "Resend confirmation"}
                  </button>
                ))}
            </div>
          </form>
        ) : (
          <p className="setup-message">
            Connect Supabase to use real accounts.
          </p>
        )}
        {demoEnabled && (
          <>
            <button className="button demo-entry" onClick={onDemo}>
              Explore the demo
            </button>
            <p className="muted small">
              Fictional people and sample plans. Changes stay in this browser.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
export function ResetPassword({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="onboarding">
      <Flower2 size={32} />
      <h1>A fresh start.</h1>
      <p>Choose a new password for your account.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const password = String(f.get("password"));
          if (password !== f.get("confirm")) {
            setError("The passwords don’t match.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            const r = await supabase!.auth.updateUser({ password });
            if (r.error) throw r.error;
            onDone();
          } catch (e) {
            setError(friendlyError(e as { message: string }));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="New password">
          <input
            name="password"
            type="password"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Repeat password">
          <input
            name="confirm"
            type="password"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </Field>
        <FormError text={error} />
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </main>
  );
}
export function Onboarding() {
  const { run, busy, error } = useSpace();
  const initialToken = sessionStorage.getItem("our-space-invite") || "";
  const [join, setJoin] = useState(!!initialToken);
  return (
    <main className="onboarding">
      <Flower2 size={36} />
      <h1>{join ? "Join your person." : "Let’s make it yours."}</h1>
      <p>Two accounts. One space for your plans.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const okay = await run(async () => {
            const result = join
              ? await supabase!.rpc("join_space", {
                  invite_token: String(f.get("token")).trim(),
                  display_name: String(f.get("name")).trim(),
                })
              : await supabase!.rpc("create_space", {
                  space_name: String(f.get("space")).trim(),
                  display_name: String(f.get("name")).trim(),
                });
            if (result.error) throw result.error;
          }, "Your space is ready");
          if (okay) sessionStorage.removeItem("our-space-invite");
        }}
      >
        <Field label="What should we call you?">
          <input
            name="name"
            autoComplete="given-name"
            placeholder="Your name"
            maxLength={60}
            required
          />
        </Field>
        {join ? (
          <Field label="Invitation code">
            <input name="token" defaultValue={initialToken} required />
          </Field>
        ) : (
          <Field label="Name of your space">
            <input
              name="space"
              defaultValue="Our space"
              maxLength={80}
              required
            />
          </Field>
        )}
        <FormError text={error} />
        <button className="button primary" disabled={busy}>
          {busy ? "One moment…" : join ? "Join space" : "Create space"}
        </button>
      </form>
      <button className="text-button" onClick={() => setJoin(!join)}>
        {join ? "Create a new space instead" : "I have an invitation code"}
      </button>
    </main>
  );
}
