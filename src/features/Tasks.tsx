import { useState } from "react";
import { LockKeyhole, Pencil, Plus, Check } from "lucide-react";
import { useSpace } from "../lib/store";
import { saveRow, deleteRow, advanceTask } from "../lib/repository";
import type { Task } from "../lib/types";
import { Modal } from "../components/Modal";
import { Field, Empty } from "../components/Form";
import { niceDay } from "../lib/dates";
export function Tasks({ compact = false }: { compact?: boolean }) {
  const { data, userId, demo, busy, run, error } = useSpace();
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [filter, setFilter] = useState("all");
  const [hideDone, setHideDone] = useState(true);
  const tasks = data.tasks.filter(
    (t) =>
      (!hideDone || !t.done) &&
      (filter !== "mine" ||
        t.owner_id === userId ||
        (t.private && t.created_by === userId)) &&
      (filter !== "shared" || !t.private),
  );
  const editing = editor && editor !== "new" ? editor : null;
  return (
    <section>
      <div className="section-heading">
        <h2>{compact ? "A few things to do" : "Things to do"}</h2>
        <button
          className="button small-button"
          onClick={() => setEditor("new")}
        >
          <Plus size={16} />
          Add task
        </button>
      </div>
      {!compact && (
        <div className="toolbar">
          <div className="segmented">
            {["all", "shared", "mine"].map((f) => (
              <button
                key={f}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === "mine"
                  ? "Assigned to me"
                  : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
            />
            Hide completed
          </label>
        </div>
      )}
      <div className="task-list">
        {tasks.slice(0, compact ? 4 : undefined).map((task) => (
          <div
            className={"task-row " + (task.done ? "completed" : "")}
            key={task.id}
          >
            {task.repeat_days && task.due_date ? (
              <button
                className="icon-button"
                disabled={busy}
                aria-label={"Complete this occurrence of " + task.title}
                onClick={() =>
                  void run(
                    () => advanceTask(demo, task.id, task.due_date!),
                    "Done. Next occurrence is ready.",
                  )
                }
              >
                <Check size={19} />
              </button>
            ) : (
              <input
                aria-label={"Complete " + task.title}
                type="checkbox"
                checked={task.done}
                disabled={busy}
                onChange={(e) =>
                  void run(
                    () =>
                      task.repeat_days && task.due_date
                        ? advanceTask(demo, task.id, task.due_date)
                        : saveRow(
                            demo,
                            "tasks",
                            { done: e.target.checked },
                            task.id,
                          ),
                    task.repeat_days
                      ? "Done. Next occurrence is ready."
                      : e.target.checked
                        ? "Done. One less thing."
                        : "Task reopened",
                  )
                }
              />
            )}
            <div className="task-copy">
              <span>{task.title}</span>
              {task.due_date && (
                <small>
                  {niceDay(task.due_date)}
                  {task.repeat_days ? ` · Every ${task.repeat_days} days` : ""}
                </small>
              )}
              {task.repeat_days && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => advanceTask(demo, task.id, task.due_date!, true),
                      "Skipped this occurrence",
                    )
                  }
                >
                  Skip this time
                </button>
              )}
            </div>
            {task.private && (
              <LockKeyhole size={14} aria-label="Private task" />
            )}
            <span
              className={"owner " + (task.owner_id === userId ? "pink" : "")}
            >
              {task.owner_id
                ? data.profiles.find((p) => p.id === task.owner_id)?.name ||
                  "Member"
                : "Both"}
            </span>
            <button
              className="icon-button"
              aria-label={"Edit " + task.title}
              onClick={() => setEditor(task)}
            >
              <Pencil size={16} />
            </button>
          </div>
        ))}
      </div>
      {!tasks.length && (
        <Empty>Nothing on this list. Add something when you need to.</Empty>
      )}
      <Modal
        title={editing ? "Edit task" : "Something to do"}
        description="Keep it simple. A name is enough."
        open={!!editor}
        onClose={() => setEditor(null)}
      >
        {editor && (
          <form
            key={editing?.id || "new"}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const title = String(f.get("title")).trim();
              if (!title) return;
              const values = {
                title,
                owner_id: String(f.get("owner")) || null,
                private: f.get("private") === "on",
                due_date: String(f.get("day")) || null,
                repeat_days: f.get("repeat_days")
                  ? Number(f.get("repeat_days"))
                  : null,
              };
              if (values.repeat_days && !values.due_date) {
                window.alert("Choose a due date for this routine.");
                return;
              }
              if (
                await run(
                  () =>
                    saveRow(
                      demo,
                      "tasks",
                      editing
                        ? values
                        : {
                            ...values,
                            space_id: data.space!.id,
                            created_by: userId,
                            done: false,
                          },
                      editing?.id,
                    ),
                  "Task saved",
                )
              )
                setEditor(null);
            }}
          >
            <div className="form-grid">
              <Field label="Task" wide>
                <input
                  name="title"
                  defaultValue={editing?.title}
                  maxLength={200}
                  required
                  autoFocus
                />
              </Field>
              <Field label="Who’s taking it?">
                <select name="owner" defaultValue={editing?.owner_id || ""}>
                  <option value="">Both / either of us</option>
                  {data.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Repeat">
                <select
                  name="repeat_days"
                  defaultValue={editing?.repeat_days || ""}
                >
                  <option value="">Does not repeat</option>
                  <option value="1">Daily</option>
                  <option value="7">Weekly</option>
                  <option value="14">Every two weeks</option>
                  <option value="30">Every 30 days</option>
                </select>
              </Field>
              <Field label="Due date (required for routines)">
                <input
                  type="date"
                  name="day"
                  defaultValue={editing?.due_date || ""}
                />
              </Field>
            </div>
            {(!editing || editing.created_by === userId) && (
              <label className="check-label">
                <input
                  name="private"
                  type="checkbox"
                  defaultChecked={editing?.private}
                />
                Only visible to me
              </label>
            )}
            {editing && editing.created_by !== userId && (
              <input name="private" type="hidden" value="off" />
            )}
            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              {editing && (
                <button
                  type="button"
                  className="button danger"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await run(
                        () => deleteRow(demo, "tasks", editing.id),
                        "Task deleted",
                      )
                    )
                      setEditor(null);
                  }}
                >
                  Delete task
                </button>
              )}
              <button className="button primary" disabled={busy}>
                Save task
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
