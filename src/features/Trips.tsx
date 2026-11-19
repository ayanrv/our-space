import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, MapPin } from "lucide-react";
import { useSpace } from "../lib/store";
import { saveRow, deleteRow } from "../lib/repository";
import { Modal } from "../components/Modal";
import { Field, Empty } from "../components/Form";
import { dayKey, niceDay } from "../lib/dates";
import type { Trip } from "../lib/types";
export function Trips() {
  const { data, demo, run, busy, error } = useSpace();
  const [editor, setEditor] = useState<Trip | "new" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [kind, setKind] = useState("packing");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = editor && editor !== "new" ? editor : null;
  const trip = data.trips.find((t) => t.id === selected);
  const items = data.trip_items.filter((i) => i.trip_id === selected);
  const spent = items
    .filter((i) => i.kind === "expense")
    .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A change of scenery</span>
          <h1>Our getaways.</h1>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setConfirmDelete(false);
            setEditor("new");
          }}
        >
          <Plus size={18} />
          Plan a trip
        </button>
      </div>
      <Link className="text-link" to="/plans">
        Date ideas & plans
      </Link>
      <div className="plan-grid">
        {data.trips.map((t) => (
          <button
            className="plan-tile"
            key={t.id}
            aria-pressed={selected === t.id}
            onClick={() => setSelected(t.id)}
          >
            <MapPin size={20} />
            <h3>{t.title}</h3>
            <span className="small">
              {niceDay(t.start_day)} – {niceDay(t.end_day)}
            </span>
          </button>
        ))}
      </div>
      {!data.trips.length && (
        <Empty>
          A weekend away or a bigger adventure. Start with the dates.
        </Empty>
      )}
      {trip && (
        <section className="trip-detail spaced">
          <div className="section-heading">
            <h2>{trip.title}</h2>
            <button
              className="button"
              onClick={() => {
                setConfirmDelete(false);
                setEditor(trip);
              }}
            >
              Edit trip
            </button>
          </div>
          <p className="preserve-lines">{trip.notes}</p>
          {/^https?:\/\//.test(trip.accommodation_url) && (
            <a
              className="text-link"
              href={trip.accommodation_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Accommodation ↗
            </a>
          )}
          <p className="budget-note">
            €{spent.toFixed(2)} recorded
            {trip.budget !== null
              ? ` of €${Number(trip.budget).toFixed(2)} budget`
              : ""}
            {trip.budget !== null && spent > Number(trip.budget)
              ? " · Over budget"
              : ""}
          </p>
          <div className="segmented">
            {["packing", "itinerary", "expense"].map((k) => (
              <button
                key={k}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {k === "expense" ? "Costs" : k}
              </button>
            ))}
          </div>
          {items
            .filter((i) => i.kind === kind)
            .sort((a, b) => (a.day || "").localeCompare(b.day || ""))
            .map((i) => (
              <div className="task-row" key={i.id}>
                {kind === "packing" && (
                  <input
                    type="checkbox"
                    checked={i.done}
                    disabled={busy}
                    aria-label={`Packed ${i.title}`}
                    onChange={(e) =>
                      void run(
                        () =>
                          saveRow(
                            demo,
                            "trip_items",
                            { done: e.target.checked },
                            i.id,
                          ),
                        "Packing updated",
                      )
                    }
                  />
                )}
                <div className="task-copy">
                  <span>{i.title}</span>
                  {i.day && <small>{niceDay(i.day)}</small>}
                  {i.amount !== null && (
                    <small>€{Number(i.amount).toFixed(2)}</small>
                  )}
                </div>
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label={`Remove ${i.title}`}
                  onClick={() =>
                    void run(
                      () => deleteRow(demo, "trip_items", i.id),
                      "Removed",
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          <form
            key={trip.id + kind}
            className="spaced"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              if (
                await run(
                  () =>
                    saveRow(demo, "trip_items", {
                      trip_id: trip.id,
                      kind,
                      title: String(f.get("title")).trim(),
                      day: kind === "itinerary" ? String(f.get("day")) : null,
                      amount:
                        kind === "expense" ? Number(f.get("amount")) : null,
                      done: false,
                    }),
                  "Added to your trip",
                )
              )
                form.reset();
            }}
          >
            <div className="form-grid">
              <Field
                label={
                  kind === "packing"
                    ? "Pack something"
                    : kind === "expense"
                      ? "What was the cost for?"
                      : "Something to do"
                }
              >
                <input name="title" required maxLength={200} />
              </Field>
              {kind === "itinerary" && (
                <Field label="Day">
                  <input
                    name="day"
                    type="date"
                    required
                    min={trip.start_day}
                    max={trip.end_day}
                    defaultValue={trip.start_day}
                  />
                </Field>
              )}
              {kind === "expense" && (
                <Field label="Amount (€)">
                  <input
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </Field>
              )}
            </div>
            <button className="button" disabled={busy}>
              Add{" "}
              {kind === "packing"
                ? "item"
                : kind === "expense"
                  ? "cost"
                  : "stop"}
            </button>
          </form>
        </section>
      )}
      <Modal
        description="A few details now. The adventure can grow from here."
        title={editing ? "Edit getaway" : "Where shall we go?"}
        open={!!editor}
        onClose={() => setEditor(null)}
      >
        {editor && (
          <form
            key={editing?.id || "new"}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const start = String(f.get("start"));
              const end = String(f.get("end"));
              if (end < start) {
                alert("The end date must be on or after the start.");
                return;
              }
              const url = String(f.get("url")).trim();
              if (url && !/^https?:\/\//.test(url)) {
                alert("Use an https:// or http:// accommodation link.");
                return;
              }
              if (
                await run(
                  () =>
                    saveRow(
                      demo,
                      "trips",
                      {
                        space_id: data.space!.id,
                        title: String(f.get("title")).trim(),
                        start_day: start,
                        end_day: end,
                        budget: f.get("budget")
                          ? Number(f.get("budget"))
                          : null,
                        accommodation_url: url,
                        notes: String(f.get("notes")),
                      },
                      editing?.id,
                    ),
                  "Trip saved",
                )
              )
                setEditor(null);
            }}
          >
            <Field label="Trip name">
              <input
                name="title"
                defaultValue={editing?.title}
                required
                maxLength={120}
              />
            </Field>
            <div className="form-grid">
              <Field label="From">
                <input
                  name="start"
                  type="date"
                  defaultValue={editing?.start_day || dayKey(new Date())}
                  required
                />
              </Field>
              <Field label="Until">
                <input
                  name="end"
                  type="date"
                  defaultValue={editing?.end_day || dayKey(new Date())}
                  required
                />
              </Field>
            </div>
            <Field label="Budget (€)">
              <input
                name="budget"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editing?.budget ?? ""}
              />
            </Field>
            <Field label="Accommodation link">
              <input
                name="url"
                type="url"
                defaultValue={editing?.accommodation_url}
                maxLength={2000}
              />
            </Field>
            <Field label="Notes">
              <textarea
                name="notes"
                defaultValue={editing?.notes}
                maxLength={6000}
                rows={4}
              />
            </Field>
            <p className="small muted">
              Trip dates appear on the calendar. Packing and costs stay here.
            </p>
            <p className="error">{error}</p>
            <div className="form-actions">
              {editing && (
                <button
                  type="button"
                  className="button danger"
                  disabled={busy}
                  onClick={async () => {
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    if (
                      await run(
                        () => deleteRow(demo, "trips", editing.id),
                        "Trip removed",
                      )
                    ) {
                      setEditor(null);
                      setSelected(null);
                    }
                  }}
                >
                  {confirmDelete
                    ? "Confirm delete trip & items"
                    : "Delete trip"}
                </button>
              )}
              <button className="button primary" disabled={busy}>
                Save trip
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
