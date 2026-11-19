-- Apply once after 004. Profile photos stay in a private bucket.
begin;
alter table public.profiles add column avatar_path text;
alter table public.profiles add constraint own_avatar_path check(avatar_path is null or (split_part(avatar_path,'/',1)=id::text and avatar_path ~ '^[0-9a-f-]+/[0-9a-f-]+\.(webp|png|jpg)$'));
grant update(avatar_path) on public.profiles to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-pictures','profile-pictures',false,2097152,array['image/webp','image/png','image/jpeg']);
create policy profile_picture_read on storage.objects for select to authenticated using (
 bucket_id='profile-pictures' and (
 split_part(name,'/',1)=auth.uid()::text or exists (
  select 1 from public.profiles p join public.memberships m on m.user_id=p.id
  where p.avatar_path=storage.objects.name and public.is_member(m.space_id)
 ))
);
create policy profile_picture_insert on storage.objects for insert to authenticated with check (
 bucket_id='profile-pictures' and split_part(name,'/',1)=auth.uid()::text and name ~ '^[0-9a-f-]+/[0-9a-f-]+\.(webp|png|jpg)$'
);
-- Use unique immutable paths when replacing a picture. Only the owner can delete.
create policy profile_picture_delete on storage.objects for delete to authenticated using (
 bucket_id='profile-pictures' and split_part(name,'/',1)=auth.uid()::text
);
alter publication supabase_realtime add table public.profiles;
commit;
