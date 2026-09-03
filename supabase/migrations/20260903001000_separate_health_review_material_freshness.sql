alter table public.health_review_requests
  add column material_changed_at timestamptz not null default now();

update public.health_review_requests
  set material_changed_at = requested_at;

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
  do update set
    material_changed_at = case
      when excluded.trigger_kind = 'data-change' then now()
      else public.health_review_requests.material_changed_at
    end,
    requested_at = now(),
    trigger_kind = excluded.trigger_kind,
    updated_at = now()
  returning id into review_request_id;

  return review_request_id;
end;
$$;

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
      and material_changed_at = expected_updated_at;

  if found then
    return true;
  end if;

  update public.health_review_requests
    set state = 'queued'
    where id = review_request_id and state = 'running';

  return false;
end;
$$;
