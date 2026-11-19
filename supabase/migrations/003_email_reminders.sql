-- Opt-in daily summaries. No secret event details or email addresses go to browsers.
begin;
create table public.reminder_preferences (
 user_id uuid primary key references public.profiles on delete cascade,
 enabled boolean not null default false,
 timezone text not null default 'Europe/Paris', hour integer not null default 8 check(hour between 0 and 23)
);
alter table public.reminder_preferences enable row level security;
create policy own_reminders on public.reminder_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update on public.reminder_preferences to authenticated;
revoke all on public.reminder_preferences from anon;
create function public.check_reminder_timezone() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Choose a valid time zone'; end if;
 return new;
end $$;
create trigger valid_reminder_timezone before insert or update on public.reminder_preferences for each row execute function public.check_reminder_timezone();

create table public.reminder_service (id boolean primary key default true check(id), enabled boolean not null default false);
insert into public.reminder_service values(true,false);
alter table public.reminder_service enable row level security;
revoke all on public.reminder_service from anon,authenticated;
create function public.reminders_ready() returns boolean language sql stable security definer set search_path='' as $$ select enabled from public.reminder_service where id=true $$;
revoke all on function public.reminders_ready() from public;
grant execute on function public.reminders_ready() to authenticated,service_role;

create table public.reminder_deliveries (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,
 local_day date not null, status text not null default 'pending' check(status in ('pending','sending','sent','failed','unknown','cancelled')),
 attempts integer not null default 0, next_attempt timestamptz not null default now(),claimed_at timestamptz,
 last_error text, sent_at timestamptz, unique(user_id,local_day)
);
alter table public.reminder_deliveries enable row level security;
revoke all on public.reminder_deliveries from anon,authenticated;
-- service_role alone can run this; claims are atomic across overlapping cron calls.
create function public.claim_reminders() returns table(job_id uuid,user_id uuid,email text,local_day date,plan_count bigint,task_count bigint)
language plpgsql security definer set search_path='' as $$
begin
 if not (select enabled from public.reminder_service where id) then return; end if;
 update public.reminder_deliveries set status='failed',last_error='Retry limit reached' where status='pending' and attempts>=3;
 -- Ambiguous interrupted sends are held for review, never automatically duplicated.
 update public.reminder_deliveries set status='unknown',last_error='Worker interrupted; check Brevo before retrying' where status='sending' and claimed_at<now()-interval '5 minutes';
 insert into public.reminder_deliveries(user_id,local_day)
 select p.user_id,(now() at time zone p.timezone)::date from public.reminder_preferences p
 join auth.users u on u.id=p.user_id and u.email_confirmed_at is not null
 where p.enabled and extract(hour from now() at time zone p.timezone)>=p.hour
 and exists(select 1 from public.memberships m where m.user_id=p.user_id)
 on conflict on constraint reminder_deliveries_user_id_local_day_key do nothing;
 return query
 with candidates as (
 select d.id from public.reminder_deliveries d join public.reminder_preferences p on p.user_id=d.user_id
 where d.status='pending' and d.attempts<3 and d.next_attempt<=now() and p.enabled
 and d.local_day=(now() at time zone p.timezone)::date
 order by d.next_attempt for update of d skip locked limit 20
 ), claimed as (
 update public.reminder_deliveries d set status='sending',attempts=attempts+1,claimed_at=now()
 from candidates c where d.id=c.id returning d.*
 )
 select c.id,c.user_id,u.email::text,c.local_day,
 (select count(*) from public.events e join public.memberships m on m.space_id=e.space_id
 where m.user_id=c.user_id and e.day between c.local_day and c.local_day+1 and e.kind<>'busy')+
 (select count(*) from public.trips t join public.memberships m on m.space_id=t.space_id where m.user_id=c.user_id and t.start_day<=c.local_day+1 and t.end_day>=c.local_day),
 (select count(*) from public.tasks t join public.memberships m on m.space_id=t.space_id where m.user_id=c.user_id and not t.done and t.due_date<=c.local_day and (not t.private or t.created_by=c.user_id) and (t.owner_id is null or t.owner_id=c.user_id))
 from claimed c join auth.users u on u.id=c.user_id;
end $$;
revoke all on function public.claim_reminders() from public,anon,authenticated;
grant execute on function public.claim_reminders() to service_role;
grant select,update on public.reminder_deliveries to service_role;
grant select on public.reminder_preferences,public.reminder_service,public.memberships to service_role;
alter publication supabase_realtime add table public.reminder_preferences;
commit;
