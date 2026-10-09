import { supabase } from "./supabase";
import { readDemo, writeDemo } from "./demo";
import { addDays } from "./dates";
import { emptySnapshot } from "./types";
import type { NewEvent, Snapshot, Table } from "./types";

function client() {
  if (!supabase) throw new Error("Connect Supabase to use a shared space.");
  return supabase;
}
export async function loadSnapshot(
  demo: boolean,
  userId: string,
): Promise<Snapshot> {
  if (demo) {
    const d = readDemo();
    return {
      ...d,
      tasks: d.tasks.filter((t) => !t.private || t.created_by === userId),
      event_secrets: d.event_secrets.filter((s) =>
        d.events.some((e) => e.id === s.event_id && e.created_by === userId),
      ),
    };
  }
  const db = client();
  const membership = await db
    .from("memberships")
    .select("space_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (membership.error) throw membership.error;
  if (!membership.data) return emptySnapshot;
  const spaceId = membership.data.space_id;
  const queries = [
    db.from("spaces").select("*").eq("id", spaceId).single(),
    db.from("profiles").select("*"),
    db.from("tasks").select("*").eq("space_id", spaceId).order("created_at"),
    db.from("lists").select("*").eq("space_id", spaceId).order("created_at"),
    db.from("list_items").select("*").order("created_at"),
    db.from("events").select("*").eq("space_id", spaceId).order("day"),
    db.from("event_secrets").select("*"),
    db.from("ideas").select("*").eq("space_id", spaceId).order("created_at"),
    db.from("reactions").select("*"),
    db.from("event_responses").select("*"),
    db.from("meals").select("*"),
    db.from("trips").select("*"),
    db.from("trip_items").select("*"),
    db.from("reminder_preferences").select("*"),
  ];
  const results = await Promise.all(queries);
  for (const result of results) if (result.error) throw result.error;
  return Object.fromEntries(
    [
      "space",
      "profiles",
      "tasks",
      "lists",
      "list_items",
      "events",
      "event_secrets",
      "ideas",
      "reactions",
      "event_responses",
      "meals",
      "trips",
      "trip_items",
      "reminder_preferences",
    ].map((key, i) => [key, results[i].data]),
  ) as Snapshot;
}

export async function saveRow(
  demo: boolean,
  table: Table,
  values: Record<string, unknown>,
  id?: string,
) {
  if (demo) {
    const d = readDemo();
    const rows = d[table] as unknown as Record<string, unknown>[];
    if (id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index < 0) throw new Error("This item no longer exists.");
      if (
        table === "events" &&
        ["day", "at_time", "timezone"].some(
          (k) => k in values && values[k] !== rows[index][k],
        )
      )
        d.event_responses = d.event_responses.filter((r) => r.event_id !== id);
      rows[index] = { ...rows[index], ...values };
    } else rows.push({ id: crypto.randomUUID(), done: false, ...values });
    writeDemo(d);
    return;
  }
  const db = client();
  const result = id
    ? await db.from(table).update(values).eq("id", id).select("id").single()
    : await db.from(table).insert(values).select("id").single();
  if (result.error) throw result.error;
}
export async function deleteRow(demo: boolean, table: Table, id: string) {
  if (demo) {
    const d = readDemo();
    (d[table] as { id: string }[]) = d[table].filter((r) => r.id !== id);
    if (table === "lists")
      d.list_items = d.list_items.filter((r) => r.list_id !== id);
    if (table === "trips")
      d.trip_items = d.trip_items.filter((r) => r.trip_id !== id);
    if (table === "events") {
      d.event_responses = d.event_responses.filter((r) => r.event_id !== id);
      d.event_secrets = d.event_secrets.filter((r) => r.event_id !== id);
      d.reactions = d.reactions.filter((r) => r.event_id !== id);
    }
    writeDemo(d);
    return;
  }
  const result = await client()
    .from(table)
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  if (result.error) throw result.error;
}
export async function createEvent(
  demo: boolean,
  userId: string,
  values: NewEvent,
) {
  if (demo) {
    const d = readDemo();
    for (let i = 0; i < (values.repeat_count || 1); i++) {
      const id = crypto.randomUUID();
      d.events.push({
        ...values,
        day: addDays(values.day, i * (values.repeat_days || 7)),
        id,
        created_by: userId,
        ...(values.surprise
          ? {
              title: "A surprise for you",
              place: "",
              message: values.clue || "",
            }
          : {}),
      });
      if (values.surprise)
        d.event_secrets.push({
          event_id: id,
          title: values.title,
          place: values.place,
          message: values.message,
        });
    }
    writeDemo(d);
    return;
  }
  const result = await client().rpc("create_event", { payload: values });
  if (result.error) throw result.error;
}
export async function revealEvent(demo: boolean, eventId: string) {
  if (demo) {
    const d = readDemo();
    const secret = d.event_secrets.find((s) => s.event_id === eventId);
    if (!secret) throw new Error("No surprise details found.");
    d.events = d.events.map((e) =>
      e.id === eventId
        ? {
            ...e,
            title: secret.title,
            place: secret.place,
            message: secret.message,
            surprise: false,
          }
        : e,
    );
    d.event_secrets = d.event_secrets.filter((s) => s.event_id !== eventId);
    writeDemo(d);
    return;
  }
  const result = await client().rpc("reveal_event", { e: eventId });
  if (result.error) throw result.error;
}
export async function sendHeart(
  demo: boolean,
  eventId: string,
  userId: string,
) {
  if (demo) {
    const d = readDemo();
    const event = d.events.find((e) => e.id === eventId);
    if (!event || event.created_by === userId || event.kind !== "date")
      throw new Error("Only the recipient can send a heart.");
    if (
      !d.reactions.some((r) => r.event_id === eventId && r.user_id === userId)
    )
      d.reactions.push({ event_id: eventId, user_id: userId });
    writeDemo(d);
    return;
  }
  const r = await client()
    .from("reactions")
    .upsert(
      { event_id: eventId, user_id: userId },
      { onConflict: "event_id,user_id", ignoreDuplicates: true },
    );
  if (r.error) throw r.error;
}
export async function respondToEvent(
  demo: boolean,
  eventId: string,
  userId: string,
  response: "accepted" | "reschedule",
) {
  if (demo) {
    const d = readDemo();
    d.event_responses = d.event_responses.filter((r) => r.event_id !== eventId);
    d.event_responses.push({ event_id: eventId, user_id: userId, response });
    writeDemo(d);
    return;
  }
  const r = await client().from("event_responses").upsert({
    event_id: eventId,
    user_id: userId,
    response,
    updated_at: new Date().toISOString(),
  });
  if (r.error) throw r.error;
}
export async function advanceTask(
  demo: boolean,
  taskId: string,
  expectedDay: string,
  skip = false,
) {
  if (demo) {
    const d = readDemo();
    const t = d.tasks.find((t) => t.id === taskId);
    if (!t?.repeat_days || t.due_date !== expectedDay)
      throw new Error(
        "This routine has already changed. Refresh and try again.",
      );
    t.due_date = addDays(expectedDay, t.repeat_days);
    t.skipped = skip;
    writeDemo(d);
    return;
  }
  const r = await client().rpc("advance_task", {
    task_id: taskId,
    expected_day: expectedDay,
    skip,
  });
  if (r.error) throw r.error;
}
export async function mealToGroceries(
  demo: boolean,
  mealId: string,
  listId: string,
) {
  if (demo) {
    const d = readDemo();
    const m = d.meals.find((m) => m.id === mealId);
    if (!m || m.groceries_added) return;
    for (const title of m.ingredients
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean))
      d.list_items.push({
        id: crypto.randomUUID(),
        list_id: listId,
        title,
        done: false,
      });
    m.groceries_added = true;
    writeDemo(d);
    return;
  }
  const r = await client().rpc("meal_to_groceries", {
    meal_id: mealId,
    target_list: listId,
  });
  if (r.error) throw r.error;
}
export async function saveReminderPreference(
  demo: boolean,
  values: import("./types").ReminderPreference,
) {
  if (demo) {
    const d = readDemo();
    d.reminder_preferences = [values];
    writeDemo(d);
    return;
  }
  const r = await client().from("reminder_preferences").upsert(values);
  if (r.error) throw r.error;
}
