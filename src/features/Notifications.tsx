import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Mail, Check, MessageCircle, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSpace } from "../lib/store";
import { markNotificationsRead } from "../lib/repository";
import type { InboxNotification } from "../lib/types";
export function activityText(n: InboxNotification, name: string) {
  return n.kind === "invitation"
    ? `${name} sent you a date invitation`
    : n.kind === "accepted"
      ? `${name} said yes. It’s a date!`
      : n.kind === "reschedule"
        ? `${name} would love to find another time`
        : n.kind === "heart"
          ? `${name} sent you a little love`
          : `${name} left you a little note`;
}
export function ActivityIcon({ kind }: { kind: InboxNotification["kind"] }) {
  return kind === "heart" ? (
    <Heart fill="currentColor" />
  ) : kind === "accepted" ? (
    <Check />
  ) : kind === "note" ? (
    <MessageCircle />
  ) : (
    <Mail />
  );
}
export function MailboxLink({ label = false }: { label?: boolean }) {
  const { data } = useSpace();
  const count = data.notifications.filter((n) => !n.read_at).length;
  return (
    <Link
      to="/mailbox"
      className={
        label ? "mailbox-label mailbox-link" : "icon-button mailbox-link"
      }
      aria-label={`Your mailbox${count ? `, ${count} unread notifications` : ""}`}
    >
      <Mail size={label ? 16 : 20} />
      {label && "Your mailbox"}
      {count > 0 && (
        <span className="unread-count" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
export function IncomingActivity() {
  const { data, demo, userId, run } = useSpace();
  const reduced = useReducedMotion();
  const shown = useRef(new Set<string>());
  const [active, setActive] = useState<InboxNotification | null>(null);
  // One toast at a time. Previously read activity never replays on reconnect.
  useEffect(() => {
    if (active) return;
    const next = [...data.notifications]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .find((n) => !n.read_at && !shown.current.has(n.id));
    if (next) {
      setActive(next);
    }
  }, [data.notifications, active]);
  useEffect(() => {
    if (!active) return;
    shown.current.add(active.id);
    const timer = window.setTimeout(() => setActive(null), 8000);
    return () => clearTimeout(timer);
  }, [active]);
  useEffect(() => {
    if (
      active &&
      data.notifications.some((n) => n.id === active.id && n.read_at)
    )
      setActive(null);
  }, [data.notifications, active]);
  const name =
    data.profiles.find((p) => p.id === active?.actor_id)?.name || "Your person";
  return (
    <AnimatePresence>
      {active && (
        <motion.aside
          key={active.id}
          className={`activity-toast activity-${active.kind}`}
          role="status"
          aria-live="polite"
          initial={{
            opacity: 0,
            y: reduced ? 0 : 24,
            scale: reduced ? 1 : 0.94,
          }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduced ? 0 : 12 }}
        >
          <div className="activity-art" aria-hidden="true">
            <span className="activity-symbol">
              <ActivityIcon kind={active.kind} />
            </span>
            {!reduced &&
              (active.kind === "heart" || active.kind === "accepted") &&
              Array.from({ length: 7 }, (_, i) => (
                <span
                  key={i}
                  className="heart-petal"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  ♡
                </span>
              ))}
          </div>
          <div className="activity-copy">
            <strong>{activityText(active, name)}</strong>
            {active.body && <p>{active.body}</p>}
            <Link
              to={`/mailbox?event=${active.event_id}`}
              onClick={() => {
                void run(
                  () => markNotificationsRead(demo, userId, [active.id]),
                  "Opened your mail",
                );
                setActive(null);
              }}
            >
              Open in mailbox <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setActive(null)}
          >
            <X size={16} />
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
