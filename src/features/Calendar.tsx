import { Link } from "react-router-dom";
import { useState, useId, useEffect } from "react";
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
import { HeartLetter } from "./HeartLetter";
import { Modal } from "../components/Modal";
import { Empty, Field } from "../components/Form";
import { useSpace } from "../lib/store";
import {
  createEvent,
  deleteRow,
  revealEvent,
  saveRow,
  sendHeart,
  respondToEvent,
  sendDateNote,
} from "../lib/repository";
import type {
  EventKind,
  Idea,
  SharedEvent,
  InboxNotification,
} from "../lib/types";
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
  const [repeating, setRepeating] = useState(false);
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
                  card_style: String(f.get("card_style")) as
                    "cherry" | "pistachio" | "midnight",
                  repeat_count: repeating ? Number(f.get("repeat_count")) : 1,
                  repeat_days: repeating ? Number(f.get("repeat_days")) : 7,
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
          <Field label="Card design">
            <select name="card_style">
              <option value="cherry">Cherry postcard</option>
              <option value="pistachio">Pistachio garden</option>
              <option value="midnight">Under the stars</option>
            </select>
          </Field>
          <div className="full">
            <label className="check-label">
              <input
                type="checkbox"
                checked={repeating}
                onChange={(e) => setRepeating(e.target.checked)}
              />
              Repeat this plan
            </label>
          </div>
          {repeating && (
            <>
              <Field label="How many times?">
                <input
                  name="repeat_count"
                  type="number"
                  min="1"
                  max="12"
                  defaultValue="1"
                  required
                />
              </Field>
              <Field label="Repeat every (when more than once)">
                <select name="repeat_days">
                  <option value="7">Week</option>
                  <option value="14">Two weeks</option>
                  <option value="1">Day</option>
                </select>
              </Field>
            </>
          )}
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
            : "Dates arrive in your person’s mailbox and appear as plans on your calendar. Other plans go straight to the shared calendar."}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {repeating && (
          <p className="small muted">
            Repeating creates separate calendar entries. You can reschedule or
            delete each occurrence.
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
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  useEffect(() => {
    if (!justSent) return;
    const timer = window.setTimeout(() => setJustSent(false), 1600);
    return () => clearTimeout(timer);
  }, [justSent]);
  const [note, setNote] = useState("");
  const noteId = useId();
  const sender =
    data.profiles.find((p) => p.id === event.created_by)?.name || "Your person";
  const recipient =
    data.profiles.find((p) => p.id !== event.created_by)?.name || "Your person";
  const secret = data.event_secrets.find((s) => s.event_id === event.id);
  const mine = event.created_by === userId;
  const invitation = event.kind === "date" && !mine;
  const liked = data.reactions.some(
    (r) => r.event_id === event.id && r.user_id === userId,
  );
  const received = data.reactions.some(
    (r) => r.event_id === event.id && r.user_id !== userId,
  );
  const response = data.event_responses.find(
    (r) => r.event_id === event.id,
  )?.response;
  return (
    <article
      className={
        "invitation card-" +
        (event.card_style || "cherry") +
        (open ? " is-open" : "")
      }
    >
      <div className="postcard-ribbon" aria-hidden="true">
        {event.card_style === "midnight"
          ? "✧  a night for us  ✧"
          : event.card_style === "pistachio"
            ? "a little time to bloom"
            : "sealed with a little love"}
      </div>
      <div className="invitation-address">
        <div>
          <span className="eyebrow">
            {invitation ? "A little invitation" : "On our calendar"}
          </span>
          <p>
            {invitation
              ? `For ${recipient}`
              : event.kind === "date"
                ? `You planned this for ${recipient}`
                : "A plan for us"}
            <br />
            <span className="small">
              {invitation ? `From ${sender}` : niceDay(event.day)}
            </span>
          </p>
        </div>
        <span className="stamp">
          {event.card_style === "midnight" ? (
            <span className="star-stamp">✧</span>
          ) : event.card_style === "pistachio" ? (
            <Flower2 size={24} />
          ) : (
            <Heart size={24} />
          )}
        </span>
      </div>
      <h3>
        {secret?.title ||
          (event.surprise ? "Keep a little time for me." : event.title)}
      </h3>
      <p className="small">
        {niceDay(event.day)} · {formatTime(event.at_time)} · {event.timezone}
      </p>
      {event.kind === "date" && (
        <p className="response-badge">
          {response === "accepted"
            ? "It’s a date ♡"
            : response === "reschedule"
              ? "Let’s find another time"
              : mine
                ? "Waiting for your person’s reply"
                : "An invitation just for you"}
        </p>
      )}
      {invitation && (
        <button
          className="button cherry"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Mail size={17} />
          {open ? "Fold away" : "Open invitation"}
        </button>
      )}
      <AnimatePresence initial={false}>
        {(open || !invitation) && (
          <motion.div
            className="letter"
            initial={{ height: 0, opacity: 0, y: 8 }}
            animate={{ height: "auto", opacity: 1, y: 0 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="letter-inner">
              {event.surprise && !secret && (
                <p className="small">
                  <LockKeyhole size={14} /> The details are a surprise.
                </p>
              )}
              <p>
                {secret?.message ||
                  event.message ||
                  "Something for us to look forward to."}
              </p>
              {(secret?.place || event.place) && (
                <p className="small">
                  <MapPin size={14} /> {secret?.place || event.place}
                </p>
              )}
              {secret && (
                <div className="secret-note">
                  <span className="eyebrow">Details visible only to you</span>
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
                    Reveal to your person
                  </button>
                </div>
              )}
              {event.kind === "date" && (
                <div className="reply-note">
                  <label htmlFor={noteId}>
                    A little note{" "}
                    {invitation ? "with your reply" : "for your person"}{" "}
                    <span className="muted">(optional)</span>
                  </label>
                  <textarea
                    id={noteId}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Can’t wait to spend this time with you ♡"
                  />
                  <div className="note-footer">
                    <small className="muted">{note.length}/500</small>
                    <button
                      className="text-button"
                      disabled={busy || !note.trim()}
                      onClick={async () => {
                        if (
                          await run(
                            () => sendDateNote(demo, event.id, userId, note),
                            "Your note is on its way ♡",
                          )
                        )
                          setNote("");
                      }}
                    >
                      Send just the note ↗
                    </button>
                  </div>
                </div>
              )}
              {invitation && (
                <div className="invitation-actions">
                  <button
                    className="button"
                    disabled={busy || response === "accepted"}
                    onClick={async () => {
                      if (
                        await run(
                          () =>
                            respondToEvent(
                              demo,
                              event.id,
                              userId,
                              "accepted",
                              note.trim(),
                            ),
                          "It’s a date ♡",
                        )
                      )
                        setNote("");
                    }}
                  >
                    {response === "accepted" ? "Accepted ♡" : "I’d love to"}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy || response === "reschedule"}
                    onClick={async () => {
                      if (
                        await run(
                          () =>
                            respondToEvent(
                              demo,
                              event.id,
                              userId,
                              "reschedule",
                              note.trim(),
                            ),
                          "Your person can see you’d like another time",
                        )
                      )
                        setNote("");
                    }}
                  >
                    Another time?
                  </button>
                </div>
              )}
              {mine &&
                data.event_responses.find((r) => r.event_id === event.id)
                  ?.note && (
                  <blockquote className="reply-quote">
                    “
                    {
                      data.event_responses.find((r) => r.event_id === event.id)
                        ?.note
                    }
                    ”<cite>— {recipient}</cite>
                  </blockquote>
                )}
              {event.kind === "date" && (
                <div className="letter-bottom">
                  <span className="small" aria-live="polite">
                    {mine
                      ? received
                        ? `A heart from ${recipient} ♡`
                        : "Your person can send a heart back"
                      : liked
                        ? `Your heart reached ${sender} ♡`
                        : "Send a little love back"}
                  </span>
                  {invitation && (
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      animate={
                        justSent
                          ? { scale: [1, 1.25, 1], rotate: [0, -10, 8, 0] }
                          : { scale: 1 }
                      }
                      className={
                        "heart-button " +
                        (liked ? "liked " : "") +
                        (justSent ? "heart-sending" : "")
                      }
                      aria-label={
                        liked ? "Heart sent" : `Send a heart to ${sender}`
                      }
                      disabled={busy || sending || liked}
                      onClick={async () => {
                        if (sending) return;
                        setSending(true);
                        const sent = await run(
                          () => sendHeart(demo, event.id, userId),
                          "A little love, delivered ♡",
                        );
                        if (sent) setJustSent(true);
                        setSending(false);
                      }}
                    >
                      <Heart size={20} fill={liked ? "currentColor" : "none"} />
                      {justSent && (
                        <span className="sent-heart-spark" aria-hidden="true">
                          <Heart
                            size={28}
                            fill="currentColor"
                            strokeWidth={1.5}
                          />
                        </span>
                      )}
                    </motion.button>
                  )}
                  {mine && received && (
                    <Heart
                      aria-label="Heart received"
                      fill="currentColor"
                      size={20}
                    />
                  )}
                </div>
              )}
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
  mail,
}: {
  event: SharedEvent | null;
  onClose: () => void;
  mail?: InboxNotification;
}) {
  const { data, demo, run, busy, error } = useSpace();
  const [deleting, setDeleting] = useState(false);
  if (!event) return null;
  return (
    <Modal
      open={!!event}
      onClose={onClose}
      title={event.title}
      description={`${event.status === "tentative" ? "Tentative · " : ""}${event.timezone}`}
    >
      {mail?.kind === "heart" && (
        <HeartLetter
          key={mail.id}
          name={
            data.profiles.find((p) => p.id === mail.actor_id)?.name ||
            "Your person"
          }
        />
      )}
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
          const count =
            data.events.filter((e) => e.day === day).length +
            data.trips.filter((t) => t.start_day <= day && t.end_day >= day)
              .length;
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
        {data.trips
          .filter((t) => t.start_day <= selected && t.end_day >= selected)
          .map((t) => (
            <Link className="agenda-event" key={t.id} to="/trips">
              <span className="event-time">Trip</span>
              <span>
                <strong>{t.title}</strong>
                <small>
                  {niceDay(t.start_day)} – {niceDay(t.end_day)}
                </small>
              </span>
            </Link>
          ))}
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
        {!events.length &&
          !data.trips.some(
            (t) => t.start_day <= selected && t.end_day >= selected,
          ) && <Empty>No shared plans entered for this day.</Empty>}
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
