create table public.supplement_regimens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null,
  ingredient text not null check (char_length(ingredient) <= 160),
  form text not null check (char_length(form) <= 120),
  dose text not null check (char_length(dose) <= 120),
  frequency text not null check (char_length(frequency) <= 120),
  active_from timestamptz not null,
  active_until timestamptz,
  check (active_until is null or active_until >= active_from),
  foreign key (source_id, owner_id)
    references public.health_sources (id, owner_id)
    on delete cascade
);

create index supplement_regimens_owner_active_idx
  on public.supplement_regimens (owner_id, active_until, active_from desc);

alter table public.supplement_regimens enable row level security;

create policy "Owners can manage their supplement regimens"
  on public.supplement_regimens for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.supplement_regimens to authenticated;
grant all privileges on public.supplement_regimens to service_role;
