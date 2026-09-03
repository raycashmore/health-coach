alter table public.health_review_requests
  add column material_change_version bigint not null default 1 check (material_change_version > 0);

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
    material_change_version = case
      when excluded.trigger_kind = 'data-change' then public.health_review_requests.material_change_version + 1
      else public.health_review_requests.material_change_version
    end,
    material_changed_at = case
      when excluded.trigger_kind = 'data-change' then clock_timestamp()
      else public.health_review_requests.material_changed_at
    end,
    requested_at = now(),
    trigger_kind = excluded.trigger_kind,
    updated_at = now()
  returning id into review_request_id;

  return review_request_id;
end;
$$;

drop function public.complete_health_review_request(uuid, timestamptz, text);

create function public.complete_health_review_request(
  review_request_id uuid,
  expected_material_change_version bigint,
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
    set finished_at = now(), lease_expires_at = null, state = review_state
    where id = review_request_id
      and state = 'running'
      and material_change_version = expected_material_change_version;

  if found then
    return true;
  end if;

  update public.health_review_requests
    set lease_expires_at = null, state = 'queued'
    where id = review_request_id and state = 'running';

  return false;
end;
$$;

revoke all on function public.complete_health_review_request(uuid, bigint, text) from public;
grant execute on function public.complete_health_review_request(uuid, bigint, text) to service_role;
