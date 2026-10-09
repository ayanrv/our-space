import { useState } from "react";
import { Flower2 } from "lucide-react";
import { supabase, demoEnabled } from "../lib/supabase";
import { Field, FormError } from "../components/Form";
import { useSpace } from "../lib/store";
export function Auth({ onDemo }: { onDemo: () => void }) {
  const [signup, setSignup] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
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
        <h2>{signup ? "Your own little space." : "Welcome back."}</h2>
        {supabase ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setMessage("");
              const f = new FormData(e.currentTarget);
              const email = String(f.get("email")).trim();
              const password = String(f.get("password"));
              const result = signup
                ? await supabase!.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: window.location.origin },
                  })
                : await supabase!.auth.signInWithPassword({ email, password });
              setBusy(false);
              if (result.error) setError(result.error.message);
              else if (signup && !result.data.session)
                setMessage(
                  "Check your email to confirm your account, then sign in here.",
                );
            }}
          >
            <Field label="Email">
              <input name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                minLength={8}
                autoComplete={signup ? "new-password" : "current-password"}
                required
              />
            </Field>
            <FormError text={error} />
            {message && <p role="status">{message}</p>}
            <button className="button primary" disabled={busy}>
              {busy ? "One moment…" : signup ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setSignup(!signup);
                setError("");
              }}
            >
              {signup
                ? "Already have an account? Sign in"
                : "First time? Create an account"}
            </button>
          </form>
        ) : (
          <div className="setup-message">
            <h3>The app is ready to connect.</h3>
            <p>
              Add your Supabase URL and publishable key to enable accounts and
              your shared space. The included setup guide walks through it.
            </p>
          </div>
        )}
        {demoEnabled && (
          <button className="button demo-entry" onClick={onDemo}>
            Explore the demo
          </button>
        )}
        {demoEnabled && (
          <p className="muted small">
            Demo changes stay in this browser. No shared account is created.
          </p>
        )}
      </section>
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
            placeholder="Alex"
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
