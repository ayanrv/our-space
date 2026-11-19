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
    "004_mailbox_notifications.sql",
    "006_daily_agenda.sql",
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

it("delivers private invitation, heart and reply activity exactly once per change", async () => {
  await asUser(alex);
  expect(
    (await db.query("select * from notifications where kind='invitation'"))
      .rows,
  ).toHaveLength(0);
  // The earlier recipient sent the heart twice, with ON CONFLICT DO NOTHING.
  expect(
    (await db.query("select * from notifications where kind='heart'")).rows,
  ).toHaveLength(1);
  await asUser(sam);
  expect(
    (await db.query("select * from notifications where kind='invitation'"))
      .rows,
  ).toHaveLength(2);
  await db.query(
    "insert into event_responses(event_id,user_id,response,note) values($1,$2,'accepted','Can’t wait ♡')",
    [event, sam],
  );
  await db.query(
    "update event_responses set updated_at=now() where event_id=$1",
    [event],
  );
  await asUser(alex);
  const replies = (
    await db.query<{ body: string }>(
      "select body from notifications where kind='accepted' order by created_at",
    )
  ).rows;
  expect(replies).toHaveLength(2); // one earlier response, one after rescheduling
  expect(replies[1].body).toBe("Can’t wait ♡");
  await asUser(other);
  expect((await db.query("select * from notifications")).rows).toHaveLength(0);
});
it("allows only recipients to mark notifications read, without forging activity", async () => {
  await asUser(alex);
  const id = (
    await db.query<{ id: string }>("select id from notifications limit 1")
  ).rows[0].id;
  await db.query("update notifications set read_at=now() where id=$1", [id]);
  expect(
    (
      await db.query<{ read_at: string }>(
        "select read_at from notifications where id=$1",
        [id],
      )
    ).rows[0].read_at,
  ).toBeTruthy();
  await expect(
    db.query("update notifications set body='Forged' where id=$1", [id]),
  ).rejects.toThrow();
  await expect(
    db.query(
      "insert into notifications(recipient_id,actor_id,event_id,kind) values($1,$2,$3,'accepted')",
      [sam, alex, event],
    ),
  ).rejects.toThrow();
  await asUser(sam);
  expect(
    (
      await db.query(
        "update notifications set read_at=now() where id=$1 returning id",
        [id],
      )
    ).rows,
  ).toHaveLength(0);
});
it("sends independent notes only to the date partner and rejects outsiders and oversized notes", async () => {
  await asUser(alex);
  await db.query("select send_date_note($1,'Bring your favourite scarf ♡')", [
    event,
  ]);
  await asUser(sam);
  expect(
    (
      await db.query<{ body: string }>(
        "select body from notifications where kind='note'",
      )
    ).rows[0].body,
  ).toBe("Bring your favourite scarf ♡");
  await expect(
    db.query("select send_date_note($1,$2)", [event, "x".repeat(501)]),
  ).rejects.toThrow();
  await expect(
    db.query("select send_date_note($1,'  ')", [event]),
  ).rejects.toThrow();
  await asUser(other);
  await expect(
    db.query("select send_date_note($1,'hello')", [event]),
  ).rejects.toThrow("unavailable");
});

it("builds daily agenda lists without leaking partner-private tasks or surprises", async () => {
  await asUser(alex);
  await db.query(
    "insert into tasks(space_id,title,owner_id,due_date) values($1,'Partner laundry',$2,null)",
    [space, sam],
  );
  await db.query(
    "insert into tasks(space_id,title,created_by,private) values($1,'My private chore',$2,true)",
    [space, alex],
  );
  await db.query(
    "insert into tasks(space_id,title,done) values($1,'Already finished',true)",
    [space],
  );
  await db.query(
    "insert into tasks(space_id,title,due_date) values($1,'Future chore','2031-01-01')",
    [space],
  );
  await db.query("select create_event($1)", [
    JSON.stringify({
      space_id: space,
      title: "Secret title never mailed",
      day: "2027-03-28",
      at_time: "01:30",
      timezone: "UTC",
      kind: "date",
      surprise: true,
      place: "Hidden address",
      message: "Hidden note",
    }),
  ]);
  await db.exec("reset role");
  await db.query(
    "update reminder_preferences set timezone='Europe/Paris' where user_id=$1",
    [alex],
  );
  await db.exec("set role service_role");
  const a = (
    await db.query<{ agenda: any }>(
      "select reminder_agenda($1,'2027-03-28') agenda",
      [alex],
    )
  ).rows[0].agenda;
  const tasks = a.chores.items.map((t: any) => t.title);
  expect(tasks).toContain("Partner laundry");
  expect(tasks).toContain("My private chore");
  expect(tasks).toContain("Future chore");
  expect(tasks).not.toContain("Already finished");
  expect(tasks).not.toContain("Private partner task");
  expect(a.today.items).toContainEqual({
    title: "A surprise for you",
    at_time: "03:30",
    kind: "date",
  });
  expect(JSON.stringify(a)).not.toContain("Secret title never mailed");
  expect(JSON.stringify(a)).not.toContain("Hidden address");
  expect(JSON.stringify(a)).not.toContain("Hidden note");
  await asUser(sam);
  await expect(
    db.query("select reminder_agenda($1,current_date)", [alex]),
  ).rejects.toThrow();
  await expect(db.query("select claim_daily_agenda()")).rejects.toThrow();
});
it("moves timed plans across midnight and includes trips on both days", async () => {
  await asUser(alex);
  await db.query("select create_event($1)", [
    JSON.stringify({
      space_id: space,
      title: "Late UTC plan",
      day: "2027-03-27",
      at_time: "23:30",
      timezone: "UTC",
      kind: "plan",
    }),
  ]);
  await db.query(
    "insert into trips(space_id,title,start_day,end_day) values($1,'Long weekend','2027-03-28','2027-03-29')",
    [space],
  );
  await db.exec("reset role");
  await db.exec("set role service_role");
  const a = (
    await db.query<{ agenda: any }>(
      "select reminder_agenda($1,'2027-03-28') agenda",
      [alex],
    )
  ).rows[0].agenda;
  expect(a.today.items).toContainEqual({
    title: "Late UTC plan",
    at_time: "00:30",
    kind: "plan",
  });
  for (const section of [a.today, a.tomorrow])
    expect(section.items).toContainEqual({
      title: "Long weekend",
      at_time: null,
      kind: "trip",
    });
});
it("claims quiet days once and exposes only the signed-in person's delivery status", async () => {
  await asUser(other);
  await db.query(
    "insert into reminder_preferences(user_id,enabled,timezone,hour) values($1,true,'UTC',0)",
    [other],
  );
  expect(
    (await db.query("select * from my_reminder_status()")).rows,
  ).toHaveLength(0);
  await db.exec("reset role");
  await db.exec("set role service_role");
  const jobs = (
    await db.query<{ user_id: string; agenda: any }>(
      "select * from claim_daily_agenda()",
    )
  ).rows;
  const empty = jobs.find((j) => j.user_id === other)!;
  expect(empty.agenda.chores).toEqual({ total: 0, items: [] });
  expect(empty.agenda.today).toEqual({ total: 0, items: [] });
  expect(empty.agenda.tomorrow).toEqual({ total: 0, items: [] });
  expect(
    (await db.query("select * from claim_daily_agenda()")).rows,
  ).toHaveLength(0);
  await asUser(other);
  expect(
    (await db.query("select * from my_reminder_status()")).rows,
  ).toHaveLength(1);
  await asUser(sam);
  expect(
    (await db.query("select * from my_reminder_status()")).rows,
  ).toHaveLength(0);
});

it("caps long chore lists while preserving their total", async () => {
  await asUser(other);
  await db.query(
    "insert into tasks(space_id,title) select space_id,'Chore '||n from memberships cross join generate_series(1,55) n where user_id=$1",
    [other],
  );
  await db.exec("reset role");
  await db.exec("set role service_role");
  const a = (
    await db.query<{ agenda: any }>(
      "select reminder_agenda($1,current_date) agenda",
      [other],
    )
  ).rows[0].agenda;
  expect(a.chores.total).toBe(55);
  expect(a.chores.items).toHaveLength(50);
});
