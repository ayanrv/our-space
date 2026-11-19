import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Mail, Heart } from "lucide-react";
import { useSpace } from "../lib/store";
import { Invitation, EventDetail } from "./Calendar";
import { Empty } from "../components/Form";
import { markNotificationsRead } from "../lib/repository";
import { ActivityIcon, activityText } from "./Notifications";
import { dayKey, niceDay } from "../lib/dates";
export function Mailbox() {
  const { data, userId, demo, run, busy } = useSpace();
  const [params, setParams] = useSearchParams();
  const unread = data.notifications.filter((n) => !n.read_at);
  const [archive, setArchive] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const selected = params.get("event") || detail;
  const [onlyUnread, setOnlyUnread] = useState(false);
  const dates = data.events
    .filter(
      (e) =>
        e.kind === "date" &&
        (archive ? e.day < dayKey(new Date()) : e.day >= dayKey(new Date())),
    )
    .sort((a, b) => a.day.localeCompare(b.day));
  const incoming = dates.filter((e) => e.created_by !== userId);
  const sent = dates.filter((e) => e.created_by === userId);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A little something for you</span>
          <h1>Your mailbox.</h1>
        </div>
        <Link className="button" to="/plans">
          Plan a date
        </Link>
      </div>
      <section className="mailbox-inbox" aria-label="Notifications">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Little things, delivered</span>
            <h2>
              Your letters{" "}
              <span className="inbox-total">
                {unread.length ? `${unread.length} unread` : "All caught up"}
              </span>
            </h2>
          </div>
          <button
            className="text-button"
            disabled={busy || !unread.length}
            onClick={() =>
              void run(
                () =>
                  markNotificationsRead(
                    demo,
                    userId,
                    unread.map((n) => n.id),
                  ),
                "All caught up ♡",
              )
            }
          >
            Mark all as read
          </button>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
          />
          Unread only
        </label>
        <div className="inbox-list">
          {data.notifications
            .filter((n) => !onlyUnread || !n.read_at)
            .map((n) => {
              const event = data.events.find((e) => e.id === n.event_id);
              const name =
                data.profiles.find((p) => p.id === n.actor_id)?.name ||
                "Your person";
              return (
                <button
                  key={n.id}
                  className={`inbox-item ${n.read_at ? "" : "is-unread"}`}
                  onClick={() => {
                    setParams({ event: n.event_id, mail: n.id });
                    void run(
                      () => markNotificationsRead(demo, userId, [n.id]),
                      "Opened your mail",
                    );
                  }}
                >
                  <span className={`inbox-icon kind-${n.kind}`}>
                    <ActivityIcon kind={n.kind} />
                  </span>
                  <span className="inbox-copy">
                    <strong>{activityText(n, name)}</strong>
                    {n.body && <span className="inbox-note">“{n.body}”</span>}
                    <small>
                      {event?.title || "A date together"} ·{" "}
                      {new Date(n.created_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </span>
                  {!n.read_at && (
                    <span className="unread-dot" aria-label="Unread" />
                  )}
                </button>
              );
            })}
        </div>
        {!data.notifications.some((n) => !onlyUnread || !n.read_at) && (
          <Empty>
            {onlyUnread
              ? "All caught up. Your next little letter will find you here."
              : "Invitations, replies, hearts and little notes will land here."}
          </Empty>
        )}
      </section>
      <div className="segmented">
        <button aria-pressed={!archive} onClick={() => setArchive(false)}>
          Upcoming
        </button>
        <button aria-pressed={archive} onClick={() => setArchive(true)}>
          Past dates
        </button>
      </div>
      <div className="section-heading spaced">
        <h2>
          <Mail size={20} /> Received invitations
        </h2>
      </div>
      <div className="idea-grid">
        {incoming.map((e) => (
          <Invitation key={e.id} event={e} />
        ))}
      </div>
      {!incoming.length && (
        <Empty>
          No invitations here yet. There’s room for something lovely.
        </Empty>
      )}
      <div className="section-heading spaced">
        <h2>Plans you made</h2>
        <Link className="text-link" to="/calendar">
          See calendar
        </Link>
      </div>
      {sent.map((e) => {
        const response = data.event_responses.find((r) => r.event_id === e.id);
        const heart = data.reactions.some(
          (r) => r.event_id === e.id && r.user_id !== userId,
        );
        return (
          <button
            className="agenda-event"
            key={e.id}
            onClick={() => setDetail(e.id)}
          >
            <span>
              <strong>
                {data.event_secrets.find((s) => s.event_id === e.id)?.title ||
                  e.title}
              </strong>
              <small>
                {niceDay(e.day)} ·{" "}
                {response?.response === "accepted"
                  ? "Accepted"
                  : response?.response === "reschedule"
                    ? "Another time requested"
                    : "Waiting for a reply"}
              </small>
            </span>
            {heart && (
              <Heart
                size={20}
                fill="currentColor"
                aria-label="Heart received"
              />
            )}
          </button>
        );
      })}
      {!sent.length && (
        <Empty>Your planned dates will appear here and on the calendar.</Empty>
      )}
      <EventDetail
        key={`${selected}:${params.get("mail") || ""}`}
        mail={data.notifications.find(
          (n) => n.id === params.get("mail") && n.event_id === selected,
        )}
        event={data.events.find((e) => e.id === selected) || null}
        onClose={() => {
          setDetail(null);
          setParams({});
        }}
      />
    </>
  );
}
