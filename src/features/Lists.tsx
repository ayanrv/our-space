import { useState } from "react";
import { Plus, ShoppingBasket, ListChecks, Trash2, Pencil } from "lucide-react";
import { useSpace } from "../lib/store";
import { saveRow, deleteRow } from "../lib/repository";
import { Modal } from "../components/Modal";
import { Empty, Field } from "../components/Form";
import type { ListItem } from "../lib/types";
export function Lists() {
  const { data, demo, busy, run, error } = useSpace();
  const [active, setActive] = useState("");
  const [create, setCreate] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const selected = data.lists.find((l) => l.id === active) || data.lists[0];
  const items = data.list_items.filter((i) => i.list_id === selected?.id);
  const left = items.filter((i) => !i.done).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Remember it together</span>
          <h1>Our lists.</h1>
        </div>
        <button className="button" onClick={() => setCreate(true)}>
          <Plus size={18} />
          New list
        </button>
      </div>
      <div className="lists-layout">
        <aside className="list-tabs" aria-label="Choose a list">
          {data.lists.map((list) => (
            <button
              key={list.id}
              aria-pressed={list.id === selected?.id}
              onClick={() => setActive(list.id)}
            >
              {list.title === "Groceries" ? (
                <ShoppingBasket size={19} />
              ) : (
                <ListChecks size={19} />
              )}
              <span>{list.title}</span>
              <small>
                {
                  data.list_items.filter(
                    (i) => i.list_id === list.id && !i.done,
                  ).length
                }
              </small>
            </button>
          ))}
        </aside>
        <section className="list-paper">
          {selected ? (
            <>
              <div className="section-heading">
                <div>
                  <h2>{selected.title}</h2>
                  <p className="muted small">
                    {left} {left === 1 ? "thing" : "things"} left
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label="Delete this list"
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <form
                className="quick-add"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const title = String(new FormData(form).get("title")).trim();
                  if (
                    title &&
                    (await run(
                      () =>
                        saveRow(demo, "list_items", {
                          list_id: selected.id,
                          title,
                          done: false,
                        }),
                      "Added to the list",
                    ))
                  )
                    form.reset();
                }}
              >
                <input
                  aria-label="New list item"
                  placeholder="Add something…"
                  name="title"
                  maxLength={200}
                  required
                />
                <button
                  className="button primary"
                  aria-label="Add item"
                  disabled={busy}
                >
                  <Plus size={20} />
                </button>
              </form>
              {items.map((item) => (
                <div
                  key={item.id}
                  className={"task-row " + (item.done ? "completed" : "")}
                >
                  <input
                    type="checkbox"
                    checked={item.done}
                    aria-label={"Check off " + item.title}
                    disabled={busy}
                    onChange={(e) =>
                      void run(
                        () =>
                          saveRow(
                            demo,
                            "list_items",
                            { done: e.target.checked },
                            item.id,
                          ),
                        "List updated",
                      )
                    }
                  />
                  <span className="task-copy">{item.title}</span>
                  <button
                    className="icon-button"
                    onClick={() => setEditing(item)}
                    aria-label={"Edit " + item.title}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              ))}
              {!items.length && (
                <Empty>An empty list, ready for whatever you need.</Empty>
              )}
            </>
          ) : (
            <Empty>Create your first shared list.</Empty>
          )}
        </section>
      </div>
      <Modal
        open={create}
        onClose={() => setCreate(false)}
        title="A list for…"
        description="Groceries, packing, films, or anything you want to remember."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const title = String(
              new FormData(e.currentTarget).get("title"),
            ).trim();
            if (
              title &&
              (await run(
                () =>
                  saveRow(demo, "lists", { space_id: data.space!.id, title }),
                "List created",
              ))
            )
              setCreate(false);
          }}
        >
          <Field label="List name">
            <input name="title" maxLength={100} autoFocus required />
          </Field>
          <p className="error">{error}</p>
          <button className="button primary" disabled={busy}>
            Create list
          </button>
        </form>
      </Modal>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit item"
        description="Keep the details useful."
      >
        {editing && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const title = String(
                new FormData(e.currentTarget).get("title"),
              ).trim();
              if (
                title &&
                (await run(
                  () => saveRow(demo, "list_items", { title }, editing.id),
                  "Item updated",
                ))
              )
                setEditing(null);
            }}
          >
            <Field label="Item">
              <input
                name="title"
                defaultValue={editing.title}
                required
                maxLength={200}
              />
            </Field>
            <p className="error">{error}</p>
            <div className="form-actions">
              <button
                type="button"
                className="button danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    await run(
                      () => deleteRow(demo, "list_items", editing.id),
                      "Item deleted",
                    )
                  )
                    setEditing(null);
                }}
              >
                Delete item
              </button>
              <button className="button primary" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this list?"
        description="Its items will be deleted too. This can’t be undone."
      >
        <div className="form-actions">
          <button className="button" onClick={() => setDeleting(false)}>
            Keep it
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              if (
                selected &&
                (await run(
                  () => deleteRow(demo, "lists", selected.id),
                  "List deleted",
                ))
              )
                setDeleting(false);
            }}
          >
            Delete list
          </button>
        </div>
      </Modal>
    </>
  );
}
