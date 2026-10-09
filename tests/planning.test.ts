import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const alex = "00000000-0000-0000-0000-000000000001",
  sam = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
let space: string, event: string;
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema extensions;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to authenticated,service_role;grant execute on function auth.uid() to authenticated;insert into auth.users values('${alex}','alex@example.test',now()),('${sam}','sam@example.test',now()),('${other}','other@example.test',now());`,
  );
  for (const file of [
    "001_shared_space.sql",
    "002_planning.sql",
    "003_email_reminders.sql",
  ]) {
    const sql = readFileSync(
      new URL("../supabase/migrations/" + file, import.meta.url),
      "utf8",
    )
      .replace(
        "create extension if not exists pgcrypto with schema extensions;",
        "",
      )
      .replace(/alter publication supabase_realtime[^;]*;/g, "");
    await db.exec(sql);
  }
  await asUser(alex);
  space = (
    await db.query<{ id: string }>(
      "select public.create_space('Test home','Alex') id",
    )
  ).rows[0].id;
  await db.exec("reset role");
  await db.query("insert into profiles(id,name) values($1,'Sam')", [sam]);
  await db.query("insert into memberships values($1,$2)", [space, sam]);
  await asUser(other);
  await db.query("select public.create_space('Other home','Other')");
  await asUser(alex);
  event = (
    await db.query<{ id: string }>("select public.create_event($1) id", [
      JSON.stringify({
        space_id: space,
        title: "Secret concert",
        day: "2027-03-27",
        at_time: "19:00",
        kind: "date",
        surprise: true,
        timezone: "Europe/Paris",
        repeat_count: 2,
        repeat_days: 7,
        card_style: "pistachio",
      }),
    ])
  ).rows[0].id;
}, 30000);
afterAll(() => db.close());
it("only the recipient can reply and send a single durable heart", async () => {
  await asUser(alex);
  await expect(
    db.query("insert into reactions values($1,$2)", [event, alex]),
  ).rejects.toThrow();
  await expect(
    db.query(
      "insert into event_responses(event_id,user_id,response) values($1,$2,'accepted')",
      [event, alex],
    ),
  ).rejects.toThrow();
  await asUser(sam);
  for (let i = 0; i < 2; i++)
    await db.query(
      "insert into reactions values($1,$2) on conflict do nothing",
      [event, sam],
    );
  expect((await db.query("select * from reactions")).rows).toHaveLength(1);
  await expect(db.query("delete from reactions")).rejects.toThrow();
  await db.query(
    "insert into event_responses(event_id,user_id,response) values($1,$2,'accepted')",
    [event, sam],
  );
  await asUser(alex);
  expect(
    (
      await db.query<{ response: string }>(
        "select response from event_responses",
      )
    ).rows[0].response,
  ).toBe("accepted");
  await asUser(other);
  expect((await db.query("select * from event_responses")).rows).toHaveLength(
    0,
  );
  await expect(
    db.query(
      "insert into event_responses(event_id,user_id,response) values($1,$2,'accepted')",
      [event, other],
    ),
  ).rejects.toThrow();
});
it("repeated surprises keep their secrets and local time across DST", async () => {
  await asUser(sam);
  expect((await db.query("select * from event_secrets")).rows).toHaveLength(0);
  const rows = (
    await db.query<{
      title: string;
      at_time: string;
      day: string;
      card_style: string;
    }>("select title,at_time,day::text,card_style from events order by day")
  ).rows;
  expect(rows).toHaveLength(2);
  expect(rows[1]).toMatchObject({
    title: "A surprise for you",
    day: "2027-04-03",
    at_time: "19:00:00",
    card_style: "pistachio",
  });
});
it("advances routines once and rejects a stale second completion", async () => {
  await asUser(alex);
  const id = (
    await db.query<{ id: string }>(
      "insert into tasks(space_id,title,due_date,repeat_days) values($1,'Laundry','2026-12-28',7) returning id",
      [space],
    )
  ).rows[0].id;
  await asUser(sam);
  await db.query("select advance_task($1,'2026-12-28',true)", [id]);
  await expect(
    db.query("select advance_task($1,'2026-12-28',false)", [id]),
  ).rejects.toThrow("already moved");
  expect(
    (
      await db.query<{ due_date: string }>(
        "select due_date::text from tasks where id=$1",
        [id],
      )
    ).rows[0].due_date,
  ).toBe("2027-01-04");
});
it("copies ingredients atomically once and prevents cross-space writes", async () => {
  await asUser(alex);
  const id = (
    await db.query<{ id: string }>(
      "insert into meals(space_id,day,slot,title,ingredients) values($1,'2026-10-09','dinner','Pasta',E'Pasta — 200 g\nTomatoes — 4') returning id",
      [space],
    )
  ).rows[0].id;
  const list = (await db.query<{ id: string }>("select id from lists")).rows[0]
    .id;
  for (let i = 0; i < 2; i++)
    await db.query("select meal_to_groceries($1,$2)", [id, list]);
  expect((await db.query("select * from list_items")).rows).toHaveLength(2);
  await asUser(other);
  expect((await db.query("select * from meals")).rows).toHaveLength(0);
  await expect(
    db.query("select meal_to_groceries($1,$2)", [id, list]),
  ).rejects.toThrow();
});
it("protects trip details, preferences and delivery metadata", async () => {
  await asUser(alex);
  const trip = (
    await db.query<{ id: string }>(
      "insert into trips(space_id,title,start_day,end_day) values($1,'Lake weekend','2026-10-10','2026-10-12') returning id",
      [space],
    )
  ).rows[0].id;
  await db.query(
    "insert into trip_items(trip_id,kind,title) values($1,'packing','Camera')",
    [trip],
  );
  await db.query(
    "insert into reminder_preferences(user_id,enabled,timezone,hour) values($1,true,'UTC',0)",
    [alex],
  );
  await asUser(sam);
  expect(
    (await db.query("select * from reminder_preferences")).rows,
  ).toHaveLength(0);
  await expect(
    db.query("insert into reminder_preferences(user_id) values($1)", [alex]),
  ).rejects.toThrow();
  await expect(db.query("select claim_reminders()")).rejects.toThrow();
  await expect(db.query("select * from reminder_deliveries")).rejects.toThrow();
  await asUser(other);
  expect((await db.query("select * from trips")).rows).toHaveLength(0);
  expect((await db.query("select * from trip_items")).rows).toHaveLength(0);
});
it("claims each enabled recipient once, excludes private partner tasks, and exposes only counts", async () => {
  await db.exec("reset role");
  await db.exec("update reminder_service set enabled=true");
  await db.query(
    "insert into tasks(space_id,title,created_by,private,due_date) values($1,'Private partner task',$2,true,current_date)",
    [space, sam],
  );
  await db.query(
    "insert into tasks(space_id,title,created_by,due_date) values($1,'Shared due task',$2,current_date)",
    [space, sam],
  );
  await db.exec("set role service_role");
  const jobs = (
    await db.query<{ task_count: number }>("select * from claim_reminders()")
  ).rows;
  expect(jobs).toHaveLength(1);
  expect(Number(jobs[0].task_count)).toBe(1);
  expect(Object.keys(jobs[0]).sort()).toEqual([
    "email",
    "job_id",
    "local_day",
    "plan_count",
    "task_count",
    "user_id",
  ]);
  expect((await db.query("select * from claim_reminders()")).rows).toHaveLength(
    0,
  );
});
it("clears a reply when the proposed time changes, while keeping the heart", async () => {
  await asUser(alex);
  await db.query("update events set day='2027-03-28' where id=$1", [event]);
  expect(
    (await db.query("select * from event_responses where event_id=$1", [event]))
      .rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from reactions where event_id=$1", [event])).rows,
  ).toHaveLength(1);
});
it("does not allow invalid time zones or a recurrence without a date", async () => {
  await asUser(sam);
  await expect(
    db.query(
      "insert into reminder_preferences(user_id,timezone) values($1,'Not/AZone')",
      [sam],
    ),
  ).rejects.toThrow("valid time zone");
  await expect(
    db.query(
      "insert into tasks(space_id,title,repeat_days) values($1,'Undated repeat',7)",
      [space],
    ),
  ).rejects.toThrow();
});
