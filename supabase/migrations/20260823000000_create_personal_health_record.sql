create table public.health_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (char_length(provider) <= 120),
  source_identifier text not null check (char_length(source_identifier) <= 160),
  kind text not null check (kind in ('genetic-export', 'provider-report', 'owner-entry')),
  observed_at timestamptz,
  imported_at timestamptz not null default now(),
  verification_state text not null check (verification_state in ('unverified', 'parsed', 'verified')),
  unique (owner_id, provider, source_identifier)
);

create table public.source_coverage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null references public.health_sources (id) on delete cascade,
  data_types text[] not null check (cardinality(data_types) > 0),
  period_start timestamptz,
  period_end timestamptz,
  synchronized_at timestamptz not null default now(),
  unique (source_id)
);

create table public.genetic_variants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null references public.health_sources (id) on delete cascade,
  rsid text not null check (rsid ~* '^rs[0-9]+$'),
  chromosome text not null check (chromosome ~* '^[a-z0-9]+$'),
  position bigint not null check (position > 0),
  genotype text not null check (genotype ~* '^[a-z0-9-]{1,2}$'),
  genome_build text,
  unique (source_id, rsid)
);

create index genetic_variants_owner_rsid_idx on public.genetic_variants (owner_id, rsid);

create table public.health_observations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null references public.health_sources (id) on delete cascade,
  kind text not null check (kind in ('blood-pressure', 'lab-result')),
  recorded_at timestamptz not null,
  test_name text,
  numeric_value numeric,
  unit text,
  reference_range text,
  systolic_mmhg integer,
  diastolic_mmhg integer,
  pulse_bpm integer,
  check (
    (kind = 'lab-result'
      and test_name is not null
      and numeric_value is not null
      and unit is not null
      and systolic_mmhg is null
      and diastolic_mmhg is null
      and pulse_bpm is null)
    or (kind = 'blood-pressure'
      and test_name is null
      and numeric_value is null
      and unit is null
      and reference_range is null
      and systolic_mmhg is not null
      and diastolic_mmhg is not null)
  )
);

create index health_observations_owner_recorded_at_idx on public.health_observations (owner_id, recorded_at desc);

create table public.provider_interpretations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null references public.health_sources (id) on delete cascade,
  topic text not null check (char_length(topic) <= 240),
  interpretation text not null check (char_length(interpretation) <= 4000),
  extracted_at timestamptz not null
);

alter table public.health_sources enable row level security;
alter table public.source_coverage enable row level security;
alter table public.genetic_variants enable row level security;
alter table public.health_observations enable row level security;
alter table public.provider_interpretations enable row level security;

create policy "Owners can manage their health sources" on public.health_sources for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners can manage their source coverage" on public.source_coverage for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners can manage their genetic variants" on public.genetic_variants for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners can manage their health observations" on public.health_observations for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners can manage their provider interpretations" on public.provider_interpretations for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.health_sources, public.source_coverage, public.genetic_variants, public.health_observations, public.provider_interpretations to authenticated;
grant all privileges on public.health_sources, public.source_coverage, public.genetic_variants, public.health_observations, public.provider_interpretations to service_role;
