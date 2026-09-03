create table public.health_review_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  panel_id text not null check (panel_id = 'iron-regulation'),
  trigger_kind text not null check (trigger_kind in ('data-change', 'weekly')),
  state text not null default 'queued' check (state in ('queued', 'running', 'succeeded', 'failed', 'superseded')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index health_review_requests_one_pending_per_panel_idx
  on public.health_review_requests (owner_id, panel_id)
  where state in ('queued', 'running');

create index health_review_requests_pending_idx
  on public.health_review_requests (state, requested_at)
  where state = 'queued';

create table public.health_review_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.health_review_requests (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  panel_id text not null check (panel_id = 'iron-regulation'),
  status text not null check (status in ('running', 'succeeded', 'failed', 'superseded')),
  result_type text,
  attempt_count integer not null default 1 check (attempt_count > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.health_review_runs add unique (request_id);

create table public.operational_traces (
  id uuid primary key default gen_random_uuid(),
  review_run_id uuid not null references public.health_review_runs (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  event_name text not null check (char_length(event_name) <= 120),
  workflow_version text not null check (char_length(workflow_version) <= 40),
  status text not null check (status in ('started', 'succeeded', 'failed', 'superseded')),
  error_category text check (char_length(error_category) <= 120),
  created_at timestamptz not null default now()
);

create table public.private_evaluation_snapshots (
  id uuid primary key default gen_random_uuid(),
  review_run_id uuid not null references public.health_review_runs (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  input_snapshot jsonb not null,
  output_snapshot jsonb not null,
  evidence_references uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (review_run_id)
);

create table public.health_investigation_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  investigation_id uuid not null references public.health_investigations (id) on delete cascade,
  judgement text not null check (judgement in ('useful', 'not-useful', 'concerning')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, investigation_id)
);

alter table public.health_investigations add unique (id, owner_id);

alter table public.health_investigation_feedback
  add constraint health_investigation_feedback_investigation_owner_fkey
  foreign key (investigation_id, owner_id)
  references public.health_investigations (id, owner_id)
  on delete cascade;

alter table public.health_review_requests enable row level security;
alter table public.health_review_runs enable row level security;
alter table public.operational_traces enable row level security;
alter table public.private_evaluation_snapshots enable row level security;
alter table public.health_investigation_feedback enable row level security;

create policy "Owners can read their Health Review requests"
  on public.health_review_requests for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can read their Health Review runs"
  on public.health_review_runs for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can read their Operational Traces"
  on public.operational_traces for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can read their private evaluation snapshots"
  on public.private_evaluation_snapshots for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can manage their Health Investigation feedback"
  on public.health_investigation_feedback for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

grant select on public.health_review_requests, public.health_review_runs, public.operational_traces, public.private_evaluation_snapshots to authenticated;
grant select, insert, update on public.health_investigation_feedback to authenticated;
grant all privileges on public.health_review_requests, public.health_review_runs, public.operational_traces, public.private_evaluation_snapshots, public.health_investigation_feedback to service_role;

create or replace function public.queue_iron_regulation_review(review_owner_id uuid, review_trigger_kind text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  review_request_id uuid;
begin
  insert into public.health_review_requests (owner_id, panel_id, trigger_kind)
  values (review_owner_id, 'iron-regulation', review_trigger_kind)
  on conflict (owner_id, panel_id) where state in ('queued', 'running')
  do update set requested_at = now(), trigger_kind = excluded.trigger_kind, updated_at = now()
  returning id into review_request_id;

  return review_request_id;
end;
$$;

revoke all on function public.queue_iron_regulation_review(uuid, text) from public;
grant execute on function public.queue_iron_regulation_review(uuid, text) to service_role;

create or replace function public.begin_health_review_run(review_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  review_run_id uuid;
begin
  insert into public.health_review_runs (owner_id, panel_id, request_id, status)
  select owner_id, panel_id, id, 'running'
  from public.health_review_requests
  where id = review_request_id
  on conflict (request_id)
  do update set
    attempt_count = public.health_review_runs.attempt_count + 1,
    finished_at = null,
    started_at = now(),
    status = 'running'
  returning id into review_run_id;

  return review_run_id;
end;
$$;

revoke all on function public.begin_health_review_run(uuid) from public;
grant execute on function public.begin_health_review_run(uuid) to service_role;

create or replace function public.complete_health_review_request(
  review_request_id uuid,
  expected_updated_at timestamptz,
  review_state text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if review_state not in ('queued', 'succeeded') then
    raise exception 'Unsupported Health Review completion state';
  end if;

  update public.health_review_requests
    set finished_at = now(), state = review_state
    where id = review_request_id
      and state = 'running'
      and updated_at = expected_updated_at;

  if found then
    return true;
  end if;

  update public.health_review_requests
    set state = 'queued'
    where id = review_request_id and state = 'running';

  return false;
end;
$$;

revoke all on function public.complete_health_review_request(uuid, timestamptz, text) from public;
grant execute on function public.complete_health_review_request(uuid, timestamptz, text) to service_role;

create or replace function public.queue_iron_review_after_material_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_iron_regulation_review(new.owner_id, 'data-change');
  return new;
end;
$$;

create trigger queue_iron_review_after_variant_change
  after insert or update on public.genetic_variants
  for each row execute function public.queue_iron_review_after_material_change();

create trigger queue_iron_review_after_lab_change
  after insert or update on public.lab_results
  for each row execute function public.queue_iron_review_after_material_change();

create trigger queue_iron_review_after_source_change
  after update of kind, provider, verification_state on public.health_sources
  for each row execute function public.queue_iron_review_after_material_change();

create or replace function public.touch_health_review_request()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_health_review_request
  before update on public.health_review_requests
  for each row execute function public.touch_health_review_request();

create trigger touch_health_investigation_feedback
  before update on public.health_investigation_feedback
  for each row execute function public.touch_health_review_request();
