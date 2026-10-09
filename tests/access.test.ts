import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

// Runs the real RLS policies in PostgreSQL/WASM. Auth is a small test fixture.
// pgcrypto + Realtime are Supabase extensions and are not simulated here.
const db = new PGlite();
const alex = "00000000-0000-0000-0000-000000000001";
const sam = "00000000-0000-0000-0000-000000000002";
const outsider = "00000000-0000-0000-0000-000000000003";
let space = "";
let event = "";
let privateTask = "";
async function asUser(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema extensions;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users values ('${alex}'),('${sam}'),('${outsider}');`);
  const schema = readFileSync(
    new URL("../supabase/migrations/001_shared_space.sql", import.meta.url),
    "utf8",
  )
    .replace(
      "create extension if not exists pgcrypto with schema extensions;",
      "",
    )
    .replace(/alter publication supabase_realtime[^;]*;/g, "");
  await db.exec(schema);
  await asUser(alex);
  space = (
    await db.query<{ id: string }>(
      "select public.create_space('Our space','Alex') as id",
    )
  ).rows[0].id;
  await db.exec("reset role");
  await db.query("insert into public.profiles values ($1,'Sam')", [sam]);
  await db.query("insert into public.memberships values ($1,$2)", [
    space,
    sam,
  ]);
  await asUser(outsider);
  await db.query("select public.create_space('Another space','Other person')");
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("shared-space permissions", () => {
  it("exposes profiles only to the people in the space", async () => {
    await asUser(sam);
    const result = await db.query("select * from public.profiles");
    expect(result.rows).toHaveLength(2);
    await asUser(outsider);
    expect((await db.query("select * from public.profiles")).rows).toHaveLength(
      1,
    );
  });
  it("keeps private tasks out of the partner’s response", async () => {
    await asUser(alex);
    privateTask = (
      await db.query<{ id: string }>(
        "insert into public.tasks(space_id,title,private) values ($1,'Secret shopping',true) returning id",
        [space],
      )
    ).rows[0].id;
    await asUser(sam);
    expect((await db.query("select * from public.tasks")).rows).toHaveLength(0);
    expect(
      (
        await db.query(
          "update public.tasks set done=true where id=$1 returning id",
          [privateTask],
        )
      ).rows,
    ).toHaveLength(0);
    await asUser(alex);
    expect((await db.query("select * from public.tasks")).rows).toHaveLength(1);
  });
  it("allows shared edits and denies cross-space reads and inserts", async () => {
    await asUser(alex);
    await db.query(
      "insert into public.tasks(space_id,title) values ($1,'Groceries')",
      [space],
    );
    await asUser(sam);
    expect(
      (
        await db.query(
          "update public.tasks set done=true where title='Groceries' returning id",
        )
      ).rows,
    ).toHaveLength(1);
    await asUser(outsider);
    expect(
      (await db.query("select * from public.tasks where space_id=$1", [space]))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "insert into public.tasks(space_id,title) values ($1,'Intrusion')",
        [space],
      ),
    ).rejects.toThrow();
  });
  it("keeps surprise contents server-side until the organizer reveals them", async () => {
    await asUser(alex);
    event = (
      await db.query<{ id: string }>(
        "select public.create_event($1::jsonb) as id",
        [
          JSON.stringify({
            space_id: space,
            title: "Secret concert",
            day: "2026-11-01",
            at_time: "19:00",
            kind: "date",
            surprise: true,
            place: "Hidden venue",
            message: "Tickets booked",
            clue: "Keep the evening free",
          }),
        ],
      )
    ).rows[0].id;
    await asUser(sam);
    const publicEvent = (
      await db.query<{ title: string; place: string }>(
        "select * from public.events where id=$1",
        [event],
      )
    ).rows[0];
    expect(publicEvent.title).toBe("A surprise for you");
    expect(publicEvent.place).toBe("");
    expect(
      (await db.query("select * from public.event_secrets")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.reveal_event($1)", [event]),
    ).rejects.toThrow();
    await expect(
      db.query("update public.events set created_by=$1 where id=$2", [
        sam,
        event,
      ]),
    ).rejects.toThrow("Record ownership cannot change");
    await asUser(alex);
    await db.query("select public.reveal_event($1)", [event]);
    await asUser(sam);
    expect(
      (
        await db.query<{ title: string }>(
          "select title from public.events where id=$1",
          [event],
        )
      ).rows[0].title,
    ).toBe("Secret concert");
  });
  it("does not allow direct membership or invitation-table access", async () => {
    await asUser(outsider);
    await expect(
      db.query(
        "insert into public.memberships(space_id,user_id) values ($1,$2)",
        [space, outsider],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("select * from public.space_invites"),
    ).rejects.toThrow();
  });
});
