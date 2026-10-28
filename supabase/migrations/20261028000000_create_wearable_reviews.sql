create table public.wearable_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  input_fingerprint text not null,
  model_id text not null,
  prompt_version text not null,
  input_snapshot jsonb not null,
  output_snapshot jsonb,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  elapsed_ms integer,
  input_tokens integer,
  output_tokens integer,
  feedback text check (feedback in ('useful', 'not-useful', 'concerning'))
);
create index wearable_reviews_owner_created_idx on public.wearable_reviews(owner_id, created_at desc);
alter table public.wearable_reviews enable row level security;
revoke all on public.wearable_reviews from anon, authenticated;
create policy "Owners read their wearable reviews" on public.wearable_reviews
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners rate their wearable reviews" on public.wearable_reviews
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
grant select, update(feedback) on public.wearable_reviews to authenticated;
grant all on public.wearable_reviews to service_role;

-- Serialize reservations per owner so retries cannot multiply model spend.
create function public.reserve_wearable_review(
  review_owner_id uuid, fingerprint text, configured_model text, version text, snapshot jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare review_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(review_owner_id::text, 0));
  -- Abandoned requests can be retried after the bounded model timeout.
  update public.wearable_reviews set status = 'failed'
    where owner_id = review_owner_id and status = 'running' and created_at < now() - interval '5 minutes';
  select id into review_id from public.wearable_reviews
    where owner_id = review_owner_id and input_fingerprint = fingerprint
      and status in ('running', 'succeeded') order by created_at desc limit 1;
  if review_id is not null then return review_id; end if;
  if (select count(*) from public.wearable_reviews
      where owner_id = review_owner_id and created_at >= now() - interval '24 hours') >= 5 then
    raise exception 'Wearable review request limit reached' using errcode = 'P0001';
  end if;
  insert into public.wearable_reviews(owner_id, input_fingerprint, model_id, prompt_version, input_snapshot)
    values(review_owner_id, fingerprint, configured_model, version, snapshot) returning id into review_id;
  return review_id;
end;
$$;
revoke all on function public.reserve_wearable_review(uuid, text, text, text, jsonb) from public;
grant execute on function public.reserve_wearable_review(uuid, text, text, text, jsonb) to service_role;
