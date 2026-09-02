create table public.health_follow_ups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  investigation_id uuid not null references public.health_investigations (id) on delete cascade,
  purpose text not null check (char_length(purpose) <= 500),
  rationale text not null check (char_length(rationale) <= 2000),
  due_start timestamptz not null,
  due_end timestamptz not null,
  state text not null default 'active' check (state in ('active', 'snoozed', 'completed', 'dismissed', 'superseded')),
  completion_note text check (char_length(completion_note) <= 1000),
  completed_at timestamptz,
  completed_source_id uuid,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_end >= due_start),
  check (
    (state = 'completed' and completed_at is not null and (completion_note is not null or completed_source_id is not null))
    or (state <> 'completed' and completed_at is null and completion_note is null and completed_source_id is null)
  ),
  check ((state = 'superseded') = (superseded_at is not null))
);

alter table public.health_follow_ups
  add constraint health_follow_ups_completion_source_owner_fkey
  foreign key (completed_source_id, owner_id)
  references public.health_sources (id, owner_id)
  on delete set null (completed_source_id);

alter table public.health_follow_ups add unique (investigation_id);

create index health_follow_ups_owner_due_idx
  on public.health_follow_ups (owner_id, state, due_end);

create table public.health_follow_up_events (
  id uuid primary key default gen_random_uuid(),
  follow_up_id uuid not null references public.health_follow_ups (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (event_type in ('created', 'snoozed', 'completed-by-owner-report', 'completed-by-source', 'dismissed', 'superseded')),
  note text check (char_length(note) <= 1000),
  source_id uuid,
  created_at timestamptz not null default now()
);

alter table public.health_follow_up_events
  add constraint health_follow_up_events_source_owner_fkey
  foreign key (source_id, owner_id)
  references public.health_sources (id, owner_id)
  on delete set null (source_id);

alter table public.health_follow_ups enable row level security;
alter table public.health_follow_up_events enable row level security;

create policy "Owners can manage their Health Follow-ups"
  on public.health_follow_ups for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can read their Health Follow-up events"
  on public.health_follow_up_events for select to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, update on public.health_follow_ups to authenticated;
grant select on public.health_follow_up_events to authenticated;
grant all privileges on public.health_follow_ups, public.health_follow_up_events to service_role;

create or replace function public.supersede_follow_ups_for_superseded_investigation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.superseded_at is not null and old.superseded_at is null then
    update public.health_follow_ups
      set state = 'superseded', superseded_at = new.superseded_at, updated_at = now()
      where investigation_id = new.id and state in ('active', 'snoozed');
  end if;
  return new;
end;
$$;

create trigger supersede_follow_ups_when_investigation_is_superseded
  after update of superseded_at on public.health_investigations
  for each row execute function public.supersede_follow_ups_for_superseded_investigation();

create or replace function public.record_health_follow_up_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recorded_event_type text;
begin
  if tg_op = 'INSERT' then
    recorded_event_type := 'created';
  elsif new.state = 'snoozed' and old.state <> 'snoozed' then
    recorded_event_type := 'snoozed';
  elsif new.state = 'completed' and old.state <> 'completed' then
    recorded_event_type := case when new.completed_source_id is null then 'completed-by-owner-report' else 'completed-by-source' end;
  elsif new.state = 'dismissed' and old.state <> 'dismissed' then
    recorded_event_type := 'dismissed';
  elsif new.state = 'superseded' and old.state <> 'superseded' then
    recorded_event_type := 'superseded';
  else
    return new;
  end if;

  insert into public.health_follow_up_events (follow_up_id, owner_id, event_type, note, source_id)
  values (new.id, new.owner_id, recorded_event_type, new.completion_note, new.completed_source_id);
  return new;
end;
$$;

create trigger record_health_follow_up_event
  after insert or update on public.health_follow_ups
  for each row execute function public.record_health_follow_up_event();

create or replace function public.touch_health_follow_up()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_health_follow_up
  before update on public.health_follow_ups
  for each row execute function public.touch_health_follow_up();
