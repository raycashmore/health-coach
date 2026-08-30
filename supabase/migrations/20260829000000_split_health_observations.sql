create table public.lab_results (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null,
  recorded_at timestamptz not null,
  test_name text not null,
  numeric_value numeric not null,
  unit text not null,
  reference_range text,
  unique (source_id, test_name, recorded_at),
  foreign key (source_id, owner_id)
    references public.health_sources (id, owner_id)
    on delete cascade
);

create index lab_results_owner_recorded_at_idx on public.lab_results (owner_id, recorded_at desc);

create table public.blood_pressure_readings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null,
  recorded_at timestamptz not null,
  systolic_mmhg integer not null check (systolic_mmhg > 0),
  diastolic_mmhg integer not null check (diastolic_mmhg > 0),
  pulse_bpm integer check (pulse_bpm > 0),
  unique (source_id, recorded_at),
  foreign key (source_id, owner_id)
    references public.health_sources (id, owner_id)
    on delete cascade
);

create index blood_pressure_readings_owner_recorded_at_idx
  on public.blood_pressure_readings (owner_id, recorded_at desc);

insert into public.lab_results (
  id,
  owner_id,
  source_id,
  recorded_at,
  test_name,
  numeric_value,
  unit,
  reference_range
)
select
  id,
  owner_id,
  source_id,
  recorded_at,
  test_name,
  numeric_value,
  unit,
  reference_range
from public.health_observations
where kind = 'lab-result';

insert into public.blood_pressure_readings (
  id,
  owner_id,
  source_id,
  recorded_at,
  systolic_mmhg,
  diastolic_mmhg,
  pulse_bpm
)
select
  id,
  owner_id,
  source_id,
  recorded_at,
  systolic_mmhg,
  diastolic_mmhg,
  pulse_bpm
from public.health_observations
where kind = 'blood-pressure';

drop table public.health_observations;

alter table public.lab_results enable row level security;
alter table public.blood_pressure_readings enable row level security;

create policy "Owners can manage their lab results"
  on public.lab_results for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can manage their blood pressure readings"
  on public.blood_pressure_readings for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.lab_results, public.blood_pressure_readings to authenticated;
grant all privileges on public.lab_results, public.blood_pressure_readings to service_role;
