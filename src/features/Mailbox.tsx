import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Heart } from "lucide-react";
import { useSpace } from "../lib/store";
import { Invitation, EventDetail } from "./Calendar";
import { Empty } from "../components/Form";
import { dayKey, niceDay } from "../lib/dates";
export function Mailbox() {
  const { data, userId } = useSpace();
  const [archive, setArchive] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
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
        event={data.events.find((e) => e.id === detail) || null}
        onClose={() => setDetail(null)}
      />
    </>
  );
}
