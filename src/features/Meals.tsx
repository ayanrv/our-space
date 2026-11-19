import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Utensils } from "lucide-react";
import { useSpace } from "../lib/store";
import { saveRow, deleteRow, mealToGroceries } from "../lib/repository";
import { dayKey, weekDays, addDays, niceDay } from "../lib/dates";
import { Modal } from "../components/Modal";
import { Field } from "../components/Form";
import type { Meal } from "../lib/types";
export function Meals() {
  const { data, demo, run, busy, error } = useSpace();
  const [week, setWeek] = useState(dayKey(new Date()));
  const [editor, setEditor] = useState<Meal | "new" | null>(null);
  const [list, setList] = useState("");
  const [day, setDay] = useState(dayKey(new Date()));
  const editing = editor && editor !== "new" ? editor : null;
  const days = weekDays(week);
  const target =
    list ||
    data.lists.find((l) => l.title.toLowerCase() === "groceries")?.id ||
    data.lists[0]?.id ||
    "";
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">What sounds good?</span>
          <h1>At our table.</h1>
        </div>
        <Link to="/lists" className="button">
          Groceries
        </Link>
      </div>
      <div className="toolbar">
        <div className="inline-actions">
          <button
            className="icon-button"
            aria-label="Previous week"
            onClick={() => setWeek(addDays(week, -7))}
          >
            <ChevronLeft />
          </button>
          <span>
            {niceDay(days[0])} – {niceDay(days[6])}
          </span>
          <button
            className="icon-button"
            aria-label="Next week"
            onClick={() => setWeek(addDays(week, 7))}
          >
            <ChevronRight />
          </button>
        </div>
        <Field label="Add ingredients to">
          <select value={target} onChange={(e) => setList(e.target.value)}>
            {data.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!data.lists.length && (
        <p>
          Create a grocery list first in <Link to="/lists">Lists</Link>.
        </p>
      )}
      <div className="meal-week">
        {days.map((d) => (
          <section className="meal-day" key={d}>
            <div className="section-heading">
              <h2>{niceDay(d)}</h2>
              <button
                className="icon-button"
                aria-label={`Add meal for ${niceDay(d)}`}
                onClick={() => {
                  setDay(d);
                  setEditor("new");
                }}
              >
                <Plus size={18} />
              </button>
            </div>
            {data.meals
              .filter((m) => m.day === d)
              .sort(
                (a, b) =>
                  ["breakfast", "lunch", "dinner"].indexOf(a.slot) -
                  ["breakfast", "lunch", "dinner"].indexOf(b.slot),
              )
              .map((m) => (
                <article className="meal-entry" key={m.id}>
                  <button className="text-button" onClick={() => setEditor(m)}>
                    <Utensils size={15} />
                    {m.title}
                  </button>
                  <p className="small muted">{m.slot}</p>
                  <p className="small preserve-lines">{m.ingredients}</p>
                  <button
                    className="text-button"
                    disabled={
                      busy ||
                      m.groceries_added ||
                      !target ||
                      !m.ingredients.trim()
                    }
                    onClick={() =>
                      void run(
                        () => mealToGroceries(demo, m.id, target),
                        "Ingredients added to your list",
                      )
                    }
                  >
                    {m.groceries_added
                      ? "Ingredients added ✓"
                      : "Add ingredients to groceries"}
                  </button>
                </article>
              ))}
            {!data.meals.some((m) => m.day === d) && (
              <p className="muted small">Leave it open, or choose something.</p>
            )}
          </section>
        ))}
      </div>
      <Modal
        description="Choose a meal, then add its ingredients to your list."
        title={editing ? "Edit meal" : "Something delicious"}
        open={!!editor}
        onClose={() => setEditor(null)}
      >
        {editor && (
          <form
            key={editing?.id || day}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const ingredients = String(f.get("ingredients")).trim();
              if (ingredients.split("\n").some((l) => l.trim().length > 200)) {
                alert("Keep each ingredient under 200 characters.");
                return;
              }
              if (
                await run(
                  () =>
                    saveRow(
                      demo,
                      "meals",
                      {
                        space_id: data.space!.id,
                        title: String(f.get("title")).trim(),
                        day: String(f.get("day")),
                        slot: String(f.get("slot")),
                        ingredients,
                        groceries_added:
                          editing?.ingredients === ingredients
                            ? editing.groceries_added
                            : false,
                      },
                      editing?.id,
                    ),
                  "Meal saved",
                )
              )
                setEditor(null);
            }}
          >
            <Field label="Meal">
              <input
                name="title"
                defaultValue={editing?.title}
                maxLength={120}
                required
                autoFocus
              />
            </Field>
            <div className="form-grid">
              <Field label="Day">
                <input
                  name="day"
                  type="date"
                  defaultValue={editing?.day || day}
                  required
                />
              </Field>
              <Field label="Meal time">
                <select name="slot" defaultValue={editing?.slot || "dinner"}>
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                </select>
              </Field>
            </div>
            <Field label="Ingredients — one per line, including quantities">
              <textarea
                name="ingredients"
                defaultValue={editing?.ingredients}
                rows={5}
                maxLength={4000}
                placeholder={"Pasta — 200 g\nTomatoes — 4"}
              />
            </Field>
            <p className="small muted">
              One meal per slot. Ingredients are copied once; changes here won’t
              remove items already on your grocery list.
            </p>
            <p className="error">{error}</p>
            <div className="form-actions">
              {editing && (
                <button
                  type="button"
                  className="button danger"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await run(
                        () => deleteRow(demo, "meals", editing.id),
                        "Meal removed",
                      )
                    )
                      setEditor(null);
                  }}
                >
                  Remove meal
                </button>
              )}
              <button className="button primary" disabled={busy}>
                Save meal
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
