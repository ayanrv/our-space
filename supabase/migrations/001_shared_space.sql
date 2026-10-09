-- Run once in a new Supabase project's SQL editor. All writes are scoped to a space.
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60)
);
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.memberships (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  primary key (space_id, user_id)
);
create table public.space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  owner_id uuid references public.profiles(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  private boolean not null default false,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null check (length(title) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  day date not null,
  at_time time,
  timezone text not null default 'Europe/Paris',
  kind text not null check (kind in ('date','plan','trip','busy')),
  status text not null default 'confirmed' check (status in ('tentative','confirmed')),
  place text not null default '',
  message text not null default '' check (length(message) <= 2000),
  surprise boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.event_secrets (
  event_id uuid primary key references public.events(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  place text not null default '',
  message text not null default '' check (length(message) <= 2000)
);
create table public.reactions (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id),
  primary key (event_id, user_id)
);
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  kind text not null check (kind in ('date','trip','home')),
  notes text not null default '' check (length(notes) <= 2000),
  budget numeric check (budget >= 0),
  created_at timestamptz not null default now()
);
create index on public.tasks(space_id);
create index on public.lists(space_id);
create index on public.list_items(list_id);
create index on public.events(space_id,day);
create index on public.ideas(space_id);

-- Small security-definer helpers avoid recursive membership policies.
create function public.is_member(s uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships where space_id=s and user_id=auth.uid());
$$;
create function public.shares_space(u uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships a join public.memberships b using(space_id)
    where a.user_id=auth.uid() and b.user_id=u);
$$;
create function public.owns_event(e uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.events where id=e and created_by=auth.uid() and public.is_member(space_id));
$$;
create function public.create_space(space_name text, display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.profiles(id,name) values(auth.uid(),trim(display_name))
    on conflict(id) do update set name=excluded.name;
  insert into public.spaces(name,created_by) values(trim(space_name),auth.uid()) returning id into s;
  insert into public.memberships(space_id,user_id) values(s,auth.uid());
  insert into public.lists(space_id,title) values(s,'Groceries');
  return s;
end $$;
create function public.create_invite(s uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  if not public.is_member(s) then raise exception 'Access denied'; end if;
  perform 1 from public.spaces where id=s for update;
  if (select count(*) from public.memberships where space_id=s)>=2 then raise exception 'Your space already has two people'; end if;
  delete from public.space_invites where space_id=s and used_at is null;
  token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.space_invites(space_id,token_hash) values(s,encode(extensions.digest(token,'sha256'),'hex'));
  return token;
end $$;
create function public.join_space(invite_token text, display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare invitation public.space_invites;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into invitation from public.space_invites where token_hash=encode(extensions.digest(invite_token,'sha256'),'hex') for update;
  if not found or invitation.used_at is not null or invitation.expires_at<now() then raise exception 'This invitation has expired or was already used'; end if;
  perform 1 from public.spaces where id=invitation.space_id for update;
  if (select count(*) from public.memberships where space_id=invitation.space_id)>=2 then raise exception 'This space is full'; end if;
  insert into public.profiles(id,name) values(auth.uid(),trim(display_name)) on conflict(id) do update set name=excluded.name;
  insert into public.memberships(space_id,user_id) values(invitation.space_id,auth.uid());
  update public.space_invites set used_at=now() where id=invitation.id;
  return invitation.space_id;
end $$;
create function public.create_event(payload jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare e uuid; secret boolean := coalesce((payload->>'surprise')::boolean,false);
begin
  insert into public.events(space_id,title,day,at_time,timezone,kind,status,place,message,surprise)
  values((payload->>'space_id')::uuid,case when secret then 'A surprise for you' else payload->>'title' end,
    (payload->>'day')::date,nullif(payload->>'at_time','')::time,coalesce(payload->>'timezone','Europe/Paris'),
    payload->>'kind',coalesce(payload->>'status','confirmed'),case when secret then '' else coalesce(payload->>'place','') end,
    case when secret then coalesce(payload->>'clue','') else coalesce(payload->>'message','') end,secret) returning id into e;
  if secret then insert into public.event_secrets(event_id,title,place,message)
    values(e,payload->>'title',coalesce(payload->>'place',''),coalesce(payload->>'message','')); end if;
  return e;
end $$;
create function public.reveal_event(e uuid) returns void language plpgsql security invoker set search_path='' as $$
declare secret public.event_secrets;
begin
  if not public.owns_event(e) then raise exception 'Only the organizer can reveal this surprise'; end if;
  select * into secret from public.event_secrets where event_id=e;
  if not found then raise exception 'No hidden details'; end if;
  update public.events set title=secret.title,place=secret.place,message=secret.message,surprise=false where id=e;
  delete from public.event_secrets where event_id=e;
end $$;

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.memberships enable row level security;
alter table public.space_invites enable row level security;
alter table public.tasks enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.events enable row level security;
alter table public.event_secrets enable row level security;
alter table public.reactions enable row level security;
alter table public.ideas enable row level security;

create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.shares_space(id));
create policy profiles_edit on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy spaces_read on public.spaces for select to authenticated using(public.is_member(id));
create policy members_read on public.memberships for select to authenticated using(public.is_member(space_id));
-- Invitation hashes and membership writes are only accessible through the functions above.
create policy tasks_read on public.tasks for select to authenticated using(public.is_member(space_id) and (not private or created_by=auth.uid()));
create policy tasks_create on public.tasks for insert to authenticated with check(public.is_member(space_id) and created_by=auth.uid() and (owner_id is null or public.shares_space(owner_id)));
create policy tasks_update on public.tasks for update to authenticated using(public.is_member(space_id) and (not private or created_by=auth.uid())) with check(public.is_member(space_id) and (not private or created_by=auth.uid()) and (owner_id is null or public.shares_space(owner_id)));
create policy tasks_delete on public.tasks for delete to authenticated using(public.is_member(space_id) and (not private or created_by=auth.uid()));
create policy lists_access on public.lists for all to authenticated using(public.is_member(space_id)) with check(public.is_member(space_id));
create policy items_access on public.list_items for all to authenticated using(exists(select 1 from public.lists l where l.id=list_id and public.is_member(l.space_id))) with check(exists(select 1 from public.lists l where l.id=list_id and public.is_member(l.space_id)));
create policy events_read on public.events for select to authenticated using(public.is_member(space_id));
create policy events_create on public.events for insert to authenticated with check(public.is_member(space_id) and created_by=auth.uid());
create policy events_update on public.events for update to authenticated using(public.is_member(space_id)) with check(public.is_member(space_id));
create policy events_delete on public.events for delete to authenticated using(public.is_member(space_id));
create policy secrets_access on public.event_secrets for all to authenticated using(public.owns_event(event_id)) with check(public.owns_event(event_id));
create policy reactions_read on public.reactions for select to authenticated using(exists(select 1 from public.events e where e.id=event_id and public.is_member(e.space_id)));
create policy reactions_insert on public.reactions for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.events e where e.id=event_id and public.is_member(e.space_id)));
create policy reactions_delete on public.reactions for delete to authenticated using(user_id=auth.uid());
create policy ideas_access on public.ideas for all to authenticated using(public.is_member(space_id)) with check(public.is_member(space_id));

-- Prevent ownership/space changes that could bypass private-detail policies.
create function public.keep_record_identity() returns trigger language plpgsql set search_path='' as $$
begin
  if new.created_by is distinct from old.created_by or new.space_id is distinct from old.space_id then
    raise exception 'Record ownership cannot change'; end if;
  return new;
end $$;
create trigger tasks_identity before update on public.tasks for each row execute function public.keep_record_identity();
create trigger events_identity before update on public.events for each row execute function public.keep_record_identity();

revoke all on all tables in schema public from anon;
grant select on public.profiles,public.spaces,public.memberships to authenticated;
grant update(name) on public.profiles to authenticated;
grant select,insert,update,delete on public.tasks,public.lists,public.list_items,public.events,public.event_secrets,public.reactions,public.ideas to authenticated;
revoke all on function public.is_member(uuid), public.shares_space(uuid), public.owns_event(uuid),public.create_space(text,text),public.create_invite(uuid),public.join_space(text,text),public.create_event(jsonb),public.reveal_event(uuid) from public;
grant execute on function public.is_member(uuid),public.shares_space(uuid),public.owns_event(uuid),public.create_space(text,text),public.create_invite(uuid),public.join_space(text,text),public.create_event(jsonb),public.reveal_event(uuid) to authenticated;

alter publication supabase_realtime add table public.tasks,public.lists,public.list_items,public.events,public.ideas,public.reactions,public.memberships;
