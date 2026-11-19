import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const alex = "00000000-0000-0000-0000-000000000001",
  sam = "00000000-0000-0000-0000-000000000002",
  other = "00000000-0000-0000-0000-000000000003";
const path = `${alex}/11111111-1111-1111-1111-111111111111.webp`;
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema extensions;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;
 insert into auth.users values('${alex}','alex@example.test'),('${sam}','sam@example.test'),('${other}','other@example.test');`);
  for (const file of ["001_shared_space.sql", "005_profile_pictures.sql"])
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      )
        .replace(
          "create extension if not exists pgcrypto with schema extensions;",
          "",
        )
        .replace(/alter publication supabase_realtime[^;]*;/g, ""),
    );
  await asUser(alex);
  const space = (
    await db.query<{ id: string }>("select create_space('Home','Alex') id")
  ).rows[0].id;
  await db.exec("reset role");
  await db.query("insert into profiles(id,name) values($1,'Sam')", [sam]);
  await db.query("insert into memberships values($1,$2)", [space, sam]);
  await asUser(other);
  await db.query("select create_space('Elsewhere','Other')");
}, 30000);
afterAll(() => db.close());
it("creates a private bucket with image and size restrictions", async () => {
  await db.exec("reset role");
  const bucket = (
    await db.query<{
      public: boolean;
      file_size_limit: number;
      allowed_mime_types: string[];
    }>("select * from storage.buckets")
  ).rows[0];
  expect(bucket.public).toBe(false);
  expect(Number(bucket.file_size_limit)).toBe(2097152);
  expect(bucket.allowed_mime_types).toEqual([
    "image/webp",
    "image/png",
    "image/jpeg",
  ]);
});
it("allows owners to upload only to their folder, without overwriting another image", async () => {
  await asUser(alex);
  await db.query(
    "insert into storage.objects(bucket_id,name) values('profile-pictures',$1)",
    [path],
  );
  await expect(
    db.query(
      "insert into storage.objects(bucket_id,name) values('profile-pictures',$1)",
      [`${sam}/11111111-1111-1111-1111-111111111111.webp`],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      "insert into storage.objects(bucket_id,name) values('profile-pictures',$1)",
      [`${alex}/image.svg`],
    ),
  ).rejects.toThrow();
  expect(
    (
      await db.query(
        "update storage.objects set name='changed.webp' returning *",
      )
    ).rows,
  ).toHaveLength(0);
});
it("shows only the chosen avatar to a partner and denies other spaces", async () => {
  await asUser(sam);
  expect((await db.query("select * from storage.objects")).rows).toHaveLength(
    0,
  );
  await asUser(alex);
  await db.query("update profiles set avatar_path=$1 where id=$2", [
    path,
    alex,
  ]);
  await expect(
    db.query("update profiles set avatar_path=$1 where id=$2", [
      `${sam}/11111111-1111-1111-1111-111111111111.webp`,
      alex,
    ]),
  ).rejects.toThrow();
  await asUser(sam);
  expect((await db.query("select * from storage.objects")).rows).toHaveLength(
    1,
  );
  expect(
    (
      await db.query(
        "update profiles set avatar_path=null where id=$1 returning id",
        [alex],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("delete from storage.objects returning id")).rows,
  ).toHaveLength(0);
  await asUser(other);
  expect((await db.query("select * from storage.objects")).rows).toHaveLength(
    0,
  );
});
it("lets the owner remove the photo and revoke partner access", async () => {
  await asUser(alex);
  await db.query("update profiles set avatar_path=null where id=$1", [alex]);
  await asUser(sam);
  expect((await db.query("select * from storage.objects")).rows).toHaveLength(
    0,
  );
  await asUser(alex);
  expect(
    (await db.query("delete from storage.objects returning id")).rows,
  ).toHaveLength(1);
});
