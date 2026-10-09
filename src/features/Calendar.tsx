import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MapPin,
  CalendarDays,
  Heart,
  Mail,
  Flower2,
  LockKeyhole,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Modal } from "../components/Modal";
import { Empty, Field } from "../components/Form";
import { useSpace } from "../lib/store";
import {
  createEvent,
  deleteRow,
  revealEvent,
  saveRow,
  setReaction,
} from "../lib/repository";
import type { EventKind, Idea, SharedEvent } from "../lib/types";
import {
  addDays,
  dayKey,
  formatTime,
  fromDay,
  monthDays,
  niceDay,
  weekDays,
} from "../lib/dates";

export function EventForm({
  open,
  onClose,
  day,
  idea,
}: {
  open: boolean;
  onClose: () => void;
  day?: string;
  idea?: Idea | null;
}) {
  const { data, userId, demo, run, busy, error } = useSpace();
  const [surprise, setSurprise] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={idea ? "Make it a plan" : "Something on the calendar"}
      description="Add what affects you both. The rest can stay offline."
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const title = String(f.get("title")).trim();
          if (!title) return;
          if (
            await run(
              () =>
                createEvent(demo, userId, {
                  space_id: data.space!.id,
                  title,
                  day: String(f.get("day")),
                  at_time: String(f.get("time")) || null,
                  timezone: String(f.get("timezone")),
                  kind: f.get("kind") as EventKind,
                  status: f.get("status") as "confirmed" | "tentative",
                  place: String(f.get("place")).trim(),
                  message: String(f.get("message")).trim(),
                  clue: String(f.get("clue") || "").trim(),
                  surprise,
                }),
              "Added to your calendar",
            )
          )
            onClose();
        }}
      >
        <div className="form-grid">
          <Field
            label={
              surprise ? "Secret title (only you see this)" : "What’s the plan?"
            }
            wide
          >
            <input
              name="title"
              defaultValue={idea?.title}
              maxLength={120}
              autoFocus
              required
            />
          </Field>
          <Field label="Day">
            <input
              type="date"
              name="day"
              defaultValue={day || dayKey(new Date())}
              required
            />
          </Field>
          <Field label="Time (leave empty for all day)">
            <input type="time" name="time" />
          </Field>
          <Field label="Kind">
            <select
              name="kind"
              defaultValue={idea?.kind === "trip" ? "trip" : "date"}
            >
              <option value="date">Date together</option>
              <option value="plan">Shared plan</option>
              <option value="trip">Trip / holiday</option>
              <option value="busy">Availability block</option>
            </select>
          </Field>
          <Field label="Status">
            <select name="status">
              <option value="confirmed">Confirmed</option>
              <option value="tentative">Tentative</option>
            </select>
          </Field>
          <Field label="Time zone" wide>
            <select name="timezone" defaultValue="Europe/Paris">
              <option>Europe/Paris</option>
              <option>Europe/London</option>
              <option>Asia/Almaty</option>
              <option>America/New_York</option>
              <option>UTC</option>
            </select>
          </Field>
          <Field
            label={surprise ? "Secret location" : "Where? (optional)"}
            wide
          >
            <input name="place" maxLength={200} />
          </Field>
          <Field
            label={surprise ? "Secret message" : "Invitation / notes"}
            wide
          >
            <textarea
              name="message"
              rows={3}
              defaultValue={idea?.notes}
              maxLength={2000}
            />
          </Field>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={surprise}
            onChange={(e) => setSurprise(e.target.checked)}
          />
          Keep the details a surprise
        </label>
        {surprise && (
          <Field label="A clue your person can see">
            <input
              name="clue"
              placeholder="Keep this evening free. Wear comfy shoes."
              maxLength={2000}
            />
          </Field>
        )}
        <p className="small muted">
          {surprise
            ? "Only the reserved time and clue are shared until you reveal the details."
            : "This plan appears in your shared space. No email is sent yet."}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save plan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Invitation({ event }: { event: SharedEvent }) {
  const { data, demo, userId, run, busy } = useSpace();
  const [open, setOpen] = useState(false);
  const sender =
    data.profiles.find((p) => p.id === event.created_by)?.name || "Your person";
  const recipient =
    data.profiles.find((p) => p.id !== event.created_by)?.name || "Your person";
  const secret = data.event_secrets.find((s) => s.event_id === event.id);
  const liked = data.reactions.some(
    (r) => r.event_id === event.id && r.user_id === userId,
  );
  const otherLiked = data.reactions.some(
    (r) => r.event_id === event.id && r.user_id !== userId,
  );
  return (
    <article className="invitation">
      <div className="invitation-address">
        <div>
          <span className="eyebrow">A little invitation</span>
          <p>
            For {recipient}
            <br />
            <span className="muted small">From {sender}</span>
          </p>
        </div>
        <span className="stamp">
          <Flower2 size={24} />
        </span>
      </div>
      <h3>{event.surprise ? "Keep a little time for me." : event.title}</h3>
      <p className="small">
        {niceDay(event.day)} · {formatTime(event.at_time)}
      </p>
      <button
        className="button cherry"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Mail size={17} />
        {open ? "Close invitation" : "Open invitation"}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="letter"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="letter-inner">
              {event.surprise && (
                <p className="small">
                  <LockKeyhole size={14} /> The details are a surprise.
                </p>
              )}
              <p>{event.message || "Something for us to look forward to."}</p>
              {event.place && (
                <p className="small muted">
                  <MapPin size={14} />
                  {event.place}
                </p>
              )}
              {secret && (
                <div className="secret-note">
                  <span className="eyebrow">Only you can see this</span>
                  <h4>{secret.title}</h4>
                  <p>{secret.message}</p>
                  <p className="small">{secret.place}</p>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => revealEvent(demo, event.id),
                        "Surprise revealed",
                      )
                    }
                  >
                    Reveal details to your person
                  </button>
                </div>
              )}
              <div className="letter-bottom">
                <span className="small">
                  {otherLiked
                    ? "A little heart from your person ♡"
                    : "With love, " + sender}
                </span>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  animate={{ scale: liked ? [1, 1.18, 1] : 1 }}
                  className={"heart-button " + (liked ? "liked" : "")}
                  aria-label={liked ? "Remove your heart" : "Send a heart"}
                  aria-pressed={liked}
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => setReaction(demo, event.id, userId, !liked),
                      liked ? "Heart removed" : "A heart, sent back",
                    )
                  }
                >
                  <Heart size={20} fill={liked ? "currentColor" : "none"} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
export function EventDetail({
  event,
  onClose,
}: {
  event: SharedEvent | null;
  onClose: () => void;
}) {
  const { demo, run, busy, error } = useSpace();
  const [deleting, setDeleting] = useState(false);
  if (!event) return null;
  return (
    <Modal
      open={!!event}
      onClose={onClose}
      title={event.title}
      description={`${event.status === "tentative" ? "Tentative · " : ""}${event.timezone}`}
    >
      <Invitation event={event} />
      <form
        className="reschedule"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            await run(
              () =>
                saveRow(
                  demo,
                  "events",
                  {
                    day: String(f.get("day")),
                    at_time: String(f.get("time")) || null,
                  },
                  event.id,
                ),
              "Plan rescheduled",
            )
          )
            onClose();
        }}
      >
        <h3>Change the time</h3>
        <div className="form-grid">
          <Field label="Day">
            <input type="date" name="day" defaultValue={event.day} required />
          </Field>
          <Field label="Time">
            <input
              type="time"
              name="time"
              defaultValue={event.at_time?.slice(0, 5)}
            />
          </Field>
        </div>
        <p className="error">{error}</p>
        <div className="form-actions">
          <button
            type="button"
            className="text-button danger-text"
            onClick={() => setDeleting(!deleting)}
          >
            {deleting ? "Keep this plan" : "Delete plan"}
          </button>
          <button className="button" disabled={busy}>
            Reschedule
          </button>
        </div>
      </form>
      {deleting && (
        <div className="delete-confirm">
          <p>Delete this plan and its invitation? This can’t be undone.</p>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              if (
                await run(
                  () => deleteRow(demo, "events", event.id),
                  "Plan deleted",
                )
              )
                onClose();
            }}
          >
            Yes, delete it
          </button>
        </div>
      )}
    </Modal>
  );
}
export function Calendar({ compact = false }: { compact?: boolean }) {
  const { data } = useSpace();
  const today = dayKey(new Date());
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today);
  const [view, setView] = useState<"week" | "month">("week");
  const [create, setCreate] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const days =
    view === "month" && !compact ? monthDays(month) : weekDays(selected);
  const events = data.events
    .filter((e) => e.day === selected)
    .sort((a, b) => (a.at_time || "").localeCompare(b.at_time || ""));
  function move(amount: number) {
    if (view === "month" && !compact) {
      const d = fromDay(month);
      d.setDate(1);
      d.setMonth(d.getMonth() + amount);
      setMonth(dayKey(d));
    } else setSelected(addDays(selected, amount * 7));
  }
  return (
    <section>
      {!compact && (
        <div className="page-heading">
          <div>
            <span className="eyebrow">Make some time</span>
            <h1>Our calendar.</h1>
          </div>
          <button className="button" onClick={() => setCreate(true)}>
            <Plus size={18} />
            Add a plan
          </button>
        </div>
      )}
      <div className="section-heading">
        <h2>
          {compact
            ? "This week"
            : fromDay(view === "month" ? month : selected).toLocaleDateString(
                "en-GB",
                { month: "long", year: "numeric" },
              )}
        </h2>
        <div className="calendar-controls">
          {!compact && (
            <div className="segmented">
              {(["week", "month"] as const).map((v) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  onClick={() => {
                    setView(v);
                    setMonth(selected);
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          <button
            className="icon-button"
            aria-label="Previous period"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="text-button"
            onClick={() => {
              setSelected(today);
              setMonth(today);
            }}
          >
            Today
          </button>
          <button
            className="icon-button"
            aria-label="Next period"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div
        className={
          "calendar-grid " + (view === "month" && !compact ? "month" : "week")
        }
      >
        {days.map((day) => {
          const d = fromDay(day);
          const count = data.events.filter((e) => e.day === day).length;
          return (
            <button
              key={day}
              className={
                "calendar-day " +
                (day === today ? "today " : "") +
                (count ? "has-plan " : "") +
                (view === "month" && day.slice(0, 7) !== month.slice(0, 7)
                  ? "outside"
                  : "")
              }
              aria-pressed={selected === day}
              aria-label={`${niceDay(day)}, ${count} plans`}
              onClick={() => setSelected(day)}
            >
              <small>
                {d.toLocaleDateString("en-GB", { weekday: "short" })}
              </small>
              <strong>{d.getDate()}</strong>
              <span className="day-indicator">
                {count ? `${count} ${count === 1 ? "plan" : "plans"}` : "·"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="agenda-heading">
        <span className="eyebrow">{niceDay(selected)}</span>
        {compact && (
          <button className="text-button" onClick={() => setCreate(true)}>
            + Add a plan
          </button>
        )}
      </div>
      <div className="agenda">
        {events.map((event) => (
          <button
            key={event.id}
            className="agenda-event"
            onClick={() => setDetail(event.id)}
          >
            <span className="event-time">{formatTime(event.at_time)}</span>
            <span>
              <strong>{event.title}</strong>
              <small>
                {event.status === "tentative" ? "Tentative · " : ""}
                {event.kind === "busy" ? "Availability" : event.kind}
                {event.at_time ? " · " + event.timezone : ""}
              </small>
            </span>
            <CalendarDays size={18} />
          </button>
        ))}
        {!events.length && <Empty>No shared plans entered for this day.</Empty>}
      </div>
      {create && (
        <EventForm open onClose={() => setCreate(false)} day={selected} />
      )}
      <EventDetail
        key={detail}
        event={data.events.find((e) => e.id === detail) || null}
        onClose={() => setDetail(null)}
      />
    </section>
  );
}
