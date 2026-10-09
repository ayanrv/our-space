-- Apply once after 001_shared_space.sql. Existing plans and accounts are preserved.
begin;
alter table public.events add column card_style text not null default 'cherry' check(card_style in ('cherry','pistachio','midnight'));
create table public.event_responses (
 event_id uuid primary key references public.events on delete cascade,
 user_id uuid not null references public.profiles on delete cascade,
 response text not null check(response in ('accepted','reschedule')),
 updated_at timestamptz not null default now()
);
alter table public.event_responses enable row level security;
create policy response_read on public.event_responses for select to authenticated using(exists(select 1 from public.events e where e.id=event_id and public.is_member(e.space_id)));
create policy response_write on public.event_responses for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.events e where e.id=event_id and e.kind='date' and e.created_by<>auth.uid() and public.is_member(e.space_id)))
 with check(user_id=auth.uid() and exists(select 1 from public.events e where e.id=event_id and e.kind='date' and e.created_by<>auth.uid() and public.is_member(e.space_id)));
grant select,insert,update on public.event_responses to authenticated;
-- A response applies to the time that was offered; a new time needs a new reply.
create function public.reset_event_response() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.day is distinct from old.day or new.at_time is distinct from old.at_time or new.timezone is distinct from old.timezone then
  delete from public.event_responses where event_id=new.id;
 end if;
 return new;
end $$;
create trigger reset_reply after update on public.events for each row execute function public.reset_event_response();
-- A heart is a receipt from the recipient; sending twice is harmless.
delete from public.reactions r using public.events e where r.event_id=e.id and (r.user_id=e.created_by or e.kind<>'date');
drop policy reactions_insert on public.reactions;
create policy reactions_insert on public.reactions for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.events e where e.id=event_id and e.kind='date' and e.created_by<>auth.uid() and public.is_member(e.space_id)));
revoke delete,update on public.reactions from authenticated;

-- Extend the existing creation function without changing its security boundary.
alter function public.create_event(jsonb) rename to create_single_event;
create function public.create_event(payload jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare e uuid; first_id uuid; i integer; repetitions integer:=coalesce((payload->>'repeat_count')::integer,1); step_days integer:=coalesce((payload->>'repeat_days')::integer,7); p jsonb;
begin
 if repetitions not between 1 and 12 or step_days not in (1,7,14) then raise exception 'Choose up to 12 repetitions'; end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=coalesce(payload->>'timezone','Europe/Paris')) then raise exception 'Invalid time zone'; end if;
 for i in 0..repetitions-1 loop
  p:=payload || jsonb_build_object('day',((payload->>'day')::date+i*step_days)::text);
  e:=public.create_single_event(p);
  update public.events set card_style=coalesce(payload->>'card_style','cherry') where id=e;
  if i=0 then first_id:=e; end if;
 end loop;
 return first_id;
end $$;
revoke all on function public.create_event(jsonb) from public;
grant execute on function public.create_event(jsonb) to authenticated;

alter table public.tasks add column repeat_days integer check(repeat_days in (1,7,14,30));
alter table public.tasks add column skipped boolean not null default false;
alter table public.tasks add constraint recurring_due_date check(repeat_days is null or due_date is not null);
-- Roll the routine forward in place. Lock + expected due date prevent duplicate completion.
create function public.advance_task(task_id uuid, expected_day date, skip boolean default false) returns void language plpgsql security invoker set search_path='' as $$
declare t public.tasks;
begin
 select * into t from public.tasks where id=task_id for update;
 if not found then raise exception 'Task unavailable'; end if;
 if t.repeat_days is null then raise exception 'This task does not repeat'; end if;
 if t.due_date is distinct from expected_day then raise exception 'This routine was already moved forward. Refresh to see the next date.'; end if;
 update public.tasks set due_date=t.due_date+t.repeat_days,done=false,skipped=skip where id=task_id;
end $$;
revoke all on function public.advance_task(uuid,date,boolean) from public;
grant execute on function public.advance_task(uuid,date,boolean) to authenticated;

create table public.meals (
 id uuid primary key default gen_random_uuid(), space_id uuid not null references public.spaces on delete cascade,
 day date not null, slot text not null check(slot in ('breakfast','lunch','dinner')),
 title text not null check(length(title) between 1 and 120), ingredients text not null default '' check(length(ingredients)<=4000),
 groceries_added boolean not null default false, unique(space_id,day,slot), created_at timestamptz not null default now()
);
alter table public.meals enable row level security;
create policy meals_access on public.meals for all to authenticated using(public.is_member(space_id)) with check(public.is_member(space_id));
grant select,insert,update,delete on public.meals to authenticated;
create function public.meal_to_groceries(meal_id uuid, target_list uuid) returns void language plpgsql security invoker set search_path='' as $$
declare m public.meals; ingredient text;
begin
 select * into m from public.meals where id=meal_id for update;
 if not found then raise exception 'Meal unavailable'; end if;
 if not exists(select 1 from public.lists where id=target_list and space_id=m.space_id) then raise exception 'Choose a list in this space'; end if;
 if m.groceries_added then return; end if;
 for ingredient in select trim(v) from regexp_split_to_table(m.ingredients,E'\n') v where trim(v)<>'' loop
  insert into public.list_items(list_id,title) values(target_list,ingredient);
 end loop;
 update public.meals set groceries_added=true where id=meal_id;
end $$;
revoke all on function public.meal_to_groceries(uuid,uuid) from public;
grant execute on function public.meal_to_groceries(uuid,uuid) to authenticated;

create table public.trips (
 id uuid primary key default gen_random_uuid(),space_id uuid not null references public.spaces on delete cascade,
 title text not null check(length(title) between 1 and 120),start_day date not null,end_day date not null check(end_day>=start_day),
 budget numeric check(budget>=0), accommodation_url text not null default '' check(accommodation_url='' or accommodation_url ~ '^https?://'),
 notes text not null default '' check(length(notes)<=6000),created_at timestamptz not null default now()
);
create table public.trip_items (
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,
 kind text not null check(kind in ('packing','itinerary','expense')), title text not null check(length(title) between 1 and 200),
 day date, amount numeric check(amount>=0), done boolean not null default false,created_at timestamptz not null default now()
);
alter table public.trips enable row level security;
alter table public.trip_items enable row level security;
create policy trips_access on public.trips for all to authenticated using(public.is_member(space_id)) with check(public.is_member(space_id));
create policy trip_items_access on public.trip_items for all to authenticated using(exists(select 1 from public.trips t where t.id=trip_id and public.is_member(t.space_id))) with check(exists(select 1 from public.trips t where t.id=trip_id and public.is_member(t.space_id)));
grant select,insert,update,delete on public.trips,public.trip_items to authenticated;
create index on public.meals(space_id,day);
create index on public.trips(space_id);
create index on public.trip_items(trip_id);
revoke all on public.meals,public.trips,public.trip_items,public.event_responses from anon;
alter publication supabase_realtime add table public.meals,public.trips,public.trip_items,public.event_responses;
commit;
