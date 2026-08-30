alter table public.health_observations
  add constraint health_observations_source_test_recorded_at_key
  unique (source_id, test_name, recorded_at);
