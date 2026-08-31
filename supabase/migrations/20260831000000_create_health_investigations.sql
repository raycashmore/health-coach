create table public.health_investigations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  panel_id text not null check (char_length(panel_id) <= 120),
  panel_version text not null check (char_length(panel_version) <= 40),
  input_fingerprint text not null check (char_length(input_fingerprint) <= 160),
  result_type text not null check (
    result_type in (
      'no-genetic-lead',
      'data-quality-follow-up',
      'worth-checking-genetic-lead',
      'clinician-review-prompt',
      'no-current-panel-escalation'
    )
  ),
  summary text not null check (char_length(summary) <= 2000),
  personal_evidence_references uuid[] not null default '{}',
  citation_references text[] not null default '{}',
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (owner_id, panel_id, panel_version, input_fingerprint)
);

create index health_investigations_owner_created_at_idx
  on public.health_investigations (owner_id, created_at desc);

alter table public.health_investigations enable row level security;

create policy "Owners can read their health investigations"
  on public.health_investigations for select to authenticated
  using ((select auth.uid()) = owner_id);

grant select on public.health_investigations to authenticated;
grant all privileges on public.health_investigations to service_role;
