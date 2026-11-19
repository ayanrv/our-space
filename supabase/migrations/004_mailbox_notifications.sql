-- Apply once after 003. Notifications are private to their recipient.
begin;
alter table public.event_responses add column note text not null default '' check(length(note)<=500);
create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.profiles on delete cascade,
 actor_id uuid not null references public.profiles on delete cascade,
 event_id uuid not null references public.events on delete cascade,
 kind text not null check(kind in ('invitation','accepted','reschedule','heart','note')),
 body text not null default '' check(length(body)<=500),
 created_at timestamptz not null default now(), read_at timestamptz,
 check(recipient_id<>actor_id)
);
create index notifications_inbox on public.notifications(recipient_id,created_at desc);
alter table public.notifications enable row level security;
create policy notifications_read on public.notifications for select to authenticated using(recipient_id=auth.uid() and exists(select 1 from public.events e where e.id=event_id and public.is_member(e.space_id)));
create policy notifications_seen on public.notifications for update to authenticated using(recipient_id=auth.uid() and exists(select 1 from public.events e where e.id=event_id and public.is_member(e.space_id))) with check(recipient_id=auth.uid());
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
-- All activity is emitted atomically by the database, never by a second client write.
create function public.notify_date_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.events; actor uuid; notification_kind text; note_body text:='';
begin
 if tg_table_name='events' then
  e:=new; actor:=e.created_by; notification_kind:='invitation';
  if e.kind<>'date' then return new; end if;
  insert into public.notifications(recipient_id,actor_id,event_id,kind)
   select user_id,actor,e.id,notification_kind from public.memberships where space_id=e.space_id and user_id<>actor;
  return new;
 end if;
 select * into e from public.events where id=new.event_id;
 if e.kind<>'date' then return new; end if;
 actor:=new.user_id;
 if actor=e.created_by then return new; end if;
 if tg_table_name='reactions' then notification_kind:='heart';
 else
  if tg_op='UPDATE' then
   if new.response=old.response and new.note=old.note then return new; end if;
  end if;
  notification_kind:=new.response; note_body:=new.note;
 end if;
 insert into public.notifications(recipient_id,actor_id,event_id,kind,body) values(e.created_by,actor,e.id,notification_kind,note_body);
 return new;
end $$;
revoke all on function public.notify_date_activity() from public;
create trigger invitation_notification after insert on public.events for each row execute function public.notify_date_activity();
create trigger heart_notification after insert on public.reactions for each row execute function public.notify_date_activity();
create trigger response_notification after insert or update on public.event_responses for each row execute function public.notify_date_activity();
-- A note can be sent independently of a heart or RSVP, in either direction.
create function public.send_date_note(target_event uuid, message text) returns void language plpgsql security definer set search_path='' as $$
declare e public.events; actor uuid:=auth.uid();
begin
 select * into e from public.events where id=target_event;
 if actor is null or e.id is null or e.kind<>'date' or not public.is_member(e.space_id) then raise exception 'Date unavailable'; end if;
 if length(trim(message)) not between 1 and 500 or message is null then raise exception 'Write a note of 1 to 500 characters'; end if;
 insert into public.notifications(recipient_id,actor_id,event_id,kind,body)
 select user_id,actor,e.id,'note',trim(message) from public.memberships where space_id=e.space_id and user_id<>actor;
end $$;
revoke all on function public.send_date_note(uuid,text) from public;
grant execute on function public.send_date_note(uuid,text) to authenticated;
-- Existing upcoming invitations get an unread entry; old hearts are not replayed.
insert into public.notifications(recipient_id,actor_id,event_id,kind)
 select m.user_id,e.created_by,e.id,'invitation' from public.events e join public.memberships m on m.space_id=e.space_id and m.user_id<>e.created_by
 where e.kind='date' and e.day>=current_date;
alter publication supabase_realtime add table public.notifications;
commit;
