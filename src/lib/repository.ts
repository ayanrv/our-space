import { supabase } from "./supabase";
import { readDemo, writeDemo } from "./demo";
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
    if (table === "events") {
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
    const id = crypto.randomUUID();
    d.events.push({
      ...values,
      id,
      created_by: userId,
      ...(values.surprise
        ? { title: "A surprise for you", place: "", message: values.clue || "" }
        : {}),
    });
    if (values.surprise)
      d.event_secrets.push({
        event_id: id,
        title: values.title,
        place: values.place,
        message: values.message,
      });
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
export async function setReaction(
  demo: boolean,
  eventId: string,
  userId: string,
  liked: boolean,
) {
  if (demo) {
    const d = readDemo();
    d.reactions = d.reactions.filter(
      (r) => r.event_id !== eventId || r.user_id !== userId,
    );
    if (liked) d.reactions.push({ event_id: eventId, user_id: userId });
    writeDemo(d);
    return;
  }
  const query = client().from("reactions");
  const r = liked
    ? await query.upsert({ event_id: eventId, user_id: userId })
    : await query.delete().eq("event_id", eventId).eq("user_id", userId);
  if (r.error) throw r.error;
}
