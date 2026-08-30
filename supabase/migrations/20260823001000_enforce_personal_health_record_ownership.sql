alter table public.health_sources add unique (id, owner_id);

alter table public.source_coverage drop constraint source_coverage_source_id_fkey;
alter table public.source_coverage
  add constraint source_coverage_source_owner_fkey
  foreign key (source_id, owner_id)
  references public.health_sources (id, owner_id)
  on delete cascade;

alter table public.genetic_variants drop constraint genetic_variants_source_id_fkey;
alter table public.genetic_variants
  add constraint genetic_variants_source_owner_fkey
  foreign key (source_id, owner_id)
  references public.health_sources (id, owner_id)
  on delete cascade;

alter table public.health_observations drop constraint health_observations_source_id_fkey;
alter table public.health_observations
  add constraint health_observations_source_owner_fkey
  foreign key (source_id, owner_id)
  references public.health_sources (id, owner_id)
  on delete cascade;

alter table public.provider_interpretations drop constraint provider_interpretations_source_id_fkey;
alter table public.provider_interpretations
  add constraint provider_interpretations_source_owner_fkey
  foreign key (source_id, owner_id)
  references public.health_sources (id, owner_id)
  on delete cascade;
