import { useState } from "react";
import { Plus, Map, Sparkles, Home, Trash2 } from "lucide-react";
import { useSpace } from "../lib/store";
import { saveRow, deleteRow } from "../lib/repository";
import { EventForm, EventDetail } from "./Calendar";
import { Modal } from "../components/Modal";
import { Field, Empty } from "../components/Form";
import { niceDay, dayKey } from "../lib/dates";
import type { Idea } from "../lib/types";
export function Plans() {
  const { data, demo, run, busy, error } = useSpace();
  const [newIdea, setNewIdea] = useState(false);
  const [newDate, setNewDate] = useState(false);
  const [idea, setIdea] = useState<Idea | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [deleteIdea, setDeleteIdea] = useState<Idea | null>(null);
  const upcoming = data.events
    .filter((e) => e.day >= dayKey(new Date()) && e.kind !== "busy")
    .sort((a, b) => a.day.localeCompare(b.day));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Something to look forward to</span>
          <h1>Plans for us.</h1>
        </div>
        <div className="inline-actions">
          <button className="button" onClick={() => setNewIdea(true)}>
            <Plus size={18} />
            Save an idea
          </button>
          <button className="button primary" onClick={() => setNewDate(true)}>
            Plan a date
          </button>
        </div>
      </div>
      <h2>In the diary</h2>
      <div className="plan-grid">
        {upcoming.map((e) => (
          <button
            className="plan-tile"
            key={e.id}
            onClick={() => setDetail(e.id)}
          >
            <span className="eyebrow">
              {niceDay(e.day)} · {e.status}
            </span>
            <h3>{e.title}</h3>
            <span className="muted small">
              {e.surprise
                ? "A surprise"
                : e.place || "Details in your invitation"}
            </span>
          </button>
        ))}
      </div>
      {!upcoming.length && (
        <Empty>Your next date can start with a saved idea.</Empty>
      )}
      <div className="section-heading spaced">
        <h2>For another time</h2>
        <span className="muted small">No dates needed</span>
      </div>
      <div className="idea-grid">
        {data.ideas.map((i) => (
          <article className="idea-tile" key={i.id}>
            <div className="section-heading">
              <span className="idea-icon">
                {i.kind === "trip" ? (
                  <Map />
                ) : i.kind === "home" ? (
                  <Home />
                ) : (
                  <Sparkles />
                )}
              </span>
              <button
                className="icon-button"
                aria-label={"Delete " + i.title}
                onClick={() => setDeleteIdea(i)}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <h3>{i.title}</h3>
            <p>{i.notes}</p>
            {i.budget !== null && (
              <p className="muted small">About €{i.budget}</p>
            )}
            <button className="text-button" onClick={() => setIdea(i)}>
              Pick a date
            </button>
          </article>
        ))}
      </div>
      {!data.ideas.length && (
        <Empty>
          Save a place, a trip, or something you’d like to try together.
        </Empty>
      )}
      <Modal
        open={newIdea}
        onClose={() => setNewIdea(false)}
        title="Let’s try this sometime"
        description="Save the idea now. Figure out the details later."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const title = String(f.get("title")).trim();
            if (
              title &&
              (await run(
                () =>
                  saveRow(demo, "ideas", {
                    space_id: data.space!.id,
                    title,
                    notes: String(f.get("notes")),
                    kind: String(f.get("kind")),
                    budget: f.get("budget") ? Number(f.get("budget")) : null,
                  }),
                "Idea saved",
              ))
            )
              setNewIdea(false);
          }}
        >
          <div className="form-grid">
            <Field label="The idea" wide>
              <input name="title" required maxLength={200} autoFocus />
            </Field>
            <Field label="Kind">
              <select name="kind">
                <option value="date">Date idea</option>
                <option value="trip">Trip</option>
                <option value="home">At home</option>
              </select>
            </Field>
            <Field label="Estimated budget (€)">
              <input type="number" name="budget" min="0" step="0.01" />
            </Field>
            <Field label="Notes" wide>
              <textarea name="notes" rows={3} maxLength={2000} />
            </Field>
          </div>
          <p className="error">{error}</p>
          <button className="button primary" disabled={busy}>
            Save idea
          </button>
        </form>
      </Modal>
      {(newDate || idea) && (
        <EventForm
          open
          idea={idea}
          onClose={() => {
            setNewDate(false);
            setIdea(null);
          }}
        />
      )}
      <EventDetail
        key={detail}
        event={data.events.find((e) => e.id === detail) || null}
        onClose={() => setDetail(null)}
      />
      <Modal
        open={!!deleteIdea}
        onClose={() => setDeleteIdea(null)}
        title="Remove this idea?"
        description="Any plans you already made from it will stay on the calendar."
      >
        <div className="form-actions">
          <button className="button" onClick={() => setDeleteIdea(null)}>
            Keep it
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              if (
                deleteIdea &&
                (await run(
                  () => deleteRow(demo, "ideas", deleteIdea.id),
                  "Idea removed",
                ))
              )
                setDeleteIdea(null);
            }}
          >
            Remove idea
          </button>
        </div>
      </Modal>
    </>
  );
}
