-- Daily agenda payloads are server-only; the existing claim lock/deduplication is preserved.
begin;
create function public.reminder_agenda(target_user uuid, for_day date) returns jsonb
language sql stable security definer set search_path='' as $$
 with prefs as (select timezone from public.reminder_preferences where user_id=target_user),
 chores as (
  select t.id,t.title,t.due_date from public.tasks t join public.memberships m on m.space_id=t.space_id
  where m.user_id=target_user and not t.done and (not t.private or t.created_by=target_user)
 ), events_local as (
  select e.id,case when e.surprise then 'A surprise for you' else e.title end title,e.kind,
   case when e.at_time is null then e.day else ((e.day+e.at_time) at time zone e.timezone at time zone p.timezone)::date end as day,
   case when e.at_time is null then null else to_char((e.day+e.at_time) at time zone e.timezone at time zone p.timezone,'HH24:MI') end at_time
  from public.events e join public.memberships m on m.space_id=e.space_id cross join prefs p
  where m.user_id=target_user and e.kind<>'busy'
 ), plans as (
  select * from events_local where day between for_day and for_day+1
  union all
  select t.id,t.title,'trip',for_day+d.step_days,null::text
  from public.trips t join public.memberships m on m.space_id=t.space_id cross join (values(0),(1)) d(step_days)
  where m.user_id=target_user and for_day+d.step_days between t.start_day and t.end_day
 )
 select jsonb_build_object(
  'timezone',(select timezone from prefs),
  'chores',jsonb_build_object('total',(select count(*) from chores),'items',coalesce((select jsonb_agg(jsonb_build_object('title',title,'due_date',due_date) order by due_date nulls last,title,id) from (select * from chores order by due_date nulls last,title,id limit 50) x),'[]'::jsonb)),
  'today',jsonb_build_object('total',(select count(*) from plans where day=for_day),'items',coalesce((select jsonb_agg(jsonb_build_object('title',title,'at_time',at_time,'kind',kind) order by at_time nulls first,title,id) from (select * from plans where day=for_day order by at_time nulls first,title,id limit 50) x),'[]'::jsonb)),
  'tomorrow',jsonb_build_object('total',(select count(*) from plans where day=for_day+1),'items',coalesce((select jsonb_agg(jsonb_build_object('title',title,'at_time',at_time,'kind',kind) order by at_time nulls first,title,id) from (select * from plans where day=for_day+1 order by at_time nulls first,title,id limit 50) x),'[]'::jsonb))
 );
$$;
revoke all on function public.reminder_agenda(uuid,date) from public,anon,authenticated;
grant execute on function public.reminder_agenda(uuid,date) to service_role;
-- A new RPC keeps older deployed workers compatible while this release is rolled out.
create function public.claim_daily_agenda() returns table(job_id uuid,user_id uuid,email text,local_day date,plan_count bigint,task_count bigint,agenda jsonb)
language sql security definer set search_path='' as $$
 select c.*,public.reminder_agenda(c.user_id,c.local_day) from public.claim_reminders() c;
$$;
revoke all on function public.claim_daily_agenda() from public,anon,authenticated;
grant execute on function public.claim_daily_agenda() to service_role;
-- Each person can see delivery status without access to anyone else's history.
create function public.my_reminder_status() returns table(local_day date,status text,sent_at timestamptz,last_error text)
language sql stable security definer set search_path='' as $$
 select d.local_day,d.status,d.sent_at,d.last_error from public.reminder_deliveries d
 where d.user_id=auth.uid() order by d.local_day desc limit 1;
$$;
revoke all on function public.my_reminder_status() from public,anon;
grant execute on function public.my_reminder_status() to authenticated;
commit;
