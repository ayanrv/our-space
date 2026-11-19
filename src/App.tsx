import { useEffect, useState, lazy, Suspense } from "react";
import type { Session } from "@supabase/supabase-js";
import { NavLink, Route, Routes, useLocation, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  Flower2,
  House,
  CalendarDays,
  ListChecks,
  Heart,
  CheckCheck,
  Settings2,
  Moon,
  Sun,
  Mail,
  Mountain,
  WifiOff,
} from "lucide-react";
import { supabase, portfolioDemo } from "./lib/supabase";
import { demoUser, resetDemo } from "./lib/demo";
import { SpaceProvider, useSpace } from "./lib/store";
import { Auth, Onboarding, ResetPassword } from "./features/Auth";
import { Calendar, Invitation } from "./features/Calendar";
import { Tasks } from "./features/Tasks";
import { Lists } from "./features/Lists";
import { Plans } from "./features/Plans";
import { Settings } from "./features/Settings";
import { Portfolio } from "./features/Portfolio";
import { Mailbox } from "./features/Mailbox";
import { MailboxLink, IncomingActivity } from "./features/Notifications";
const Meals = lazy(() =>
  import("./features/Meals").then((m) => ({ default: m.Meals })),
);
const Trips = lazy(() =>
  import("./features/Trips").then((m) => ({ default: m.Trips })),
);
import { Avatar } from "./components/Avatar";
import { dayKey } from "./lib/dates";

function Home() {
  const { data, userId } = useSpace();
  const next = data.events
    .filter(
      (e) =>
        e.kind === "date" &&
        e.created_by !== userId &&
        e.day >= dayKey(new Date()),
    )
    .sort((a, b) => a.day.localeCompare(b.day))[0];
  const trip = data.ideas.find((i) => i.kind === "trip");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          <h1>Our week, together.</h1>
        </div>
        <span className="home-note">
          Room for everyday life.
          <br />
          And the good bits.
        </span>
      </div>
      <div className="home-grid">
        <div className="home-main">
          <Calendar compact />
          <div className="spaced">
            <Tasks compact />
          </div>
          <Link className="text-link" to="/tasks">
            See all tasks
          </Link>
        </div>
        <aside className="home-aside">
          <MailboxLink label />
          {next ? (
            <Invitation key={next.id} event={next} />
          ) : (
            <div className="empty-mailbox">
              <Mail size={32} />
              <h3>No invitations yet.</h3>
              <p>Make a little plan for the two of you.</p>
              <Link className="button" to="/plans">
                Plan something
              </Link>
            </div>
          )}
          <Link className="text-link" to="/mailbox">
            Open mailbox
          </Link>
          {trip && (
            <Link className="trip-peek" to="/plans">
              <span className="idea-icon">
                <Mountain size={23} />
              </span>
              <div>
                <strong>{trip.title}</strong>
                <p className="small muted">An idea for another time</p>
              </div>
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
function Shell({
  onSignOut,
  onSwitchDemo,
}: {
  onSignOut: () => void;
  onSwitchDemo: () => void;
}) {
  const { data, userId, loading, error, notice, demo, refresh } = useSpace();
  const location = useLocation();
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem("our-space-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "night"
        : "day"),
  );
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("our-space-theme", theme);
  }, [theme]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("offline", update);
    window.addEventListener("online", update);
    return () => {
      window.removeEventListener("offline", update);
      window.removeEventListener("online", update);
    };
  }, []);
  if (loading)
    return (
      <div className="loading-screen">
        <Flower2 className="loading-flower" />
        <p>Opening your space…</p>
      </div>
    );
  if (!data.space && error)
    return (
      <main className="onboarding">
        <h1>We couldn’t open your space.</h1>
        <p className="error">{error}</p>
        <button className="button" onClick={refresh}>
          Try again
        </button>
        <button className="text-button" onClick={onSignOut}>
          Sign out
        </button>
      </main>
    );
  if (!data.space) return <Onboarding />;
  const nav = [
    ["/", "Home", House],
    ["/calendar", "Calendar", CalendarDays],
    ["/tasks", "Tasks", CheckCheck],
    ["/lists", "Lists", ListChecks],
    ["/plans", "Plans", Heart],
  ] as const;
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Flower2 size={23} />
          </span>
          {data.space.name.toLowerCase()}
        </Link>
        <div className="header-right">
          <div
            className="avatar-pair"
            aria-label={data.profiles.map((p) => p.name).join(" and ")}
          >
            {data.profiles.map((p, i) => (
              <Avatar key={p.id} profile={p} green={!!i} />
            ))}
          </div>
          <span className="header-names">
            {data.profiles.map((p) => p.name).join(" + ")}
          </span>
          <button
            className="icon-button theme-button"
            aria-label={
              theme === "day" ? "Switch to night mode" : "Switch to day mode"
            }
            onClick={() => setTheme(theme === "day" ? "night" : "day")}
          >
            {theme === "day" ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <MailboxLink />
          <NavLink to="/settings" className="icon-button" aria-label="Settings">
            <Settings2 size={20} />
          </NavLink>
        </div>
      </header>
      <nav className="main-nav" aria-label="Main navigation">
        {nav.map(([path, name, Icon]) => (
          <NavLink key={path} to={path} end={path === "/"}>
            <Icon size={19} />
            <span>{name}</span>
          </NavLink>
        ))}
      </nav>
      {demo && (
        <div className="demo-banner">
          <span>
            Fictional demo · viewing as{" "}
            {data.profiles.find((p) => p.id === userId)?.name}
          </span>
          <button onClick={onSwitchDemo}>Switch person</button>
          <button
            onClick={() => {
              resetDemo();
              refresh();
            }}
          >
            Reset demo
          </button>
          <button onClick={onSignOut}>
            {portfolioDemo ? "About this project" : "Leave demo"}
          </button>
        </div>
      )}
      {offline && !demo && (
        <div className="offline-banner">
          <WifiOff size={16} />
          You’re offline. Changes need a connection to save.
        </div>
      )}
      <main className="main-content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            <Suspense
              fallback={
                <p className="muted" role="status">
                  Opening…
                </p>
              }
            >
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route
                  path="/tasks"
                  element={
                    <>
                      <div className="page-heading">
                        <div>
                          <span className="eyebrow">
                            One less thing to remember
                          </span>
                          <h1>Our to-dos.</h1>
                        </div>
                      </div>
                      <Tasks />
                    </>
                  }
                />
                <Route path="/lists" element={<Lists />} />
                <Route path="/plans" element={<Plans />} />
                <Route path="/mailbox" element={<Mailbox />} />
                <Route path="/meals" element={<Meals />} />
                <Route path="/trips" element={<Trips />} />
                <Route
                  path="/settings"
                  element={<Settings onSignOut={onSignOut} />}
                />
                <Route
                  path="*"
                  element={
                    <>
                      <h1>Nothing here yet.</h1>
                      <Link className="button" to="/">
                        Back home
                      </Link>
                    </>
                  }
                />
              </Routes>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button className="text-button" onClick={refresh}>
            Refresh
          </button>
        </div>
      )}
      <AnimatePresence>
        {notice && (
          <motion.div
            className="toast"
            role="status"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
      <IncomingActivity />
      <footer className="app-footer">
        <Flower2 size={14} />
        <span>A space for the two of you.</span>
      </footer>
    </div>
  );
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [demo, setDemo] = useState(false);
  const [demoActor, setDemoActor] = useState(demoUser);
  const [recovery, setRecovery] = useState(
    window.location.pathname === "/reset-password" ||
      new URLSearchParams(window.location.hash.slice(1)).get("type") ===
        "recovery",
  );
  const queryClient = useQueryClient();
  useEffect(() => {
    const url = new URL(window.location.href);
    const invite = url.searchParams.get("invite");
    if (invite) {
      sessionStorage.setItem("our-space-invite", invite);
      url.searchParams.delete("invite");
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
    }
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!error) setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (_event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(next);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function signOut() {
    if (supabase && !demo) {
      const result = await supabase.auth.signOut();
      if (result.error) {
        alert("Could not sign out. Please try again.");
        return;
      }
    }
    setDemo(false);
    setSession(null);
    queryClient.clear();
  }
  if (!ready)
    return <main className="loading-screen">Opening your space…</main>;
  return (
    <MotionConfig reducedMotion="user">
      {recovery && session && !demo ? (
        <ResetPassword
          onDone={() => {
            setRecovery(false);
            window.location.assign("/");
          }}
        />
      ) : !session && !demo ? (
        portfolioDemo ? (
          <Portfolio
            onExplore={() => {
              setDemoActor(demoUser);
              setDemo(true);
            }}
          />
        ) : (
          <Auth onDemo={() => setDemo(true)} />
        )
      ) : (
        <SpaceProvider
          key={demo ? demoActor : session!.user.id}
          userId={demo ? demoActor : session!.user.id}
          demo={demo}
        >
          <Shell
            onSignOut={() => void signOut()}
            onSwitchDemo={() =>
              setDemoActor((a) => (a === demoUser ? "demo-sam" : demoUser))
            }
          />
        </SpaceProvider>
      )}
    </MotionConfig>
  );
}
