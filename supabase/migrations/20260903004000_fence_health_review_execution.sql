alter table public.health_review_requests
  add column execution_token uuid;

create index health_review_requests_recoverable_idx
  on public.health_review_requests (lease_expires_at)
  where state = 'running';

create function public.queued_health_review_request_ids()
returns table (id uuid)
language sql
security definer
set search_path = public
as $$
  select review_request.id
  from public.health_review_requests as review_request
  where review_request.state = 'queued'
    or (
      review_request.state = 'running'
      and (review_request.lease_expires_at is null or review_request.lease_expires_at < now())
    )
  order by review_request.requested_at
  limit 20;
$$;

revoke all on function public.queued_health_review_request_ids() from public;
grant execute on function public.queued_health_review_request_ids() to service_role;

create function public.claim_health_review_request(review_request_id uuid)
returns table (
  execution_token uuid,
  id uuid,
  material_change_version bigint,
  owner_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_started_at timestamptz := clock_timestamp();
  claim_token uuid := gen_random_uuid();
begin
  return query
  update public.health_review_requests
    set execution_token = claim_token,
        lease_expires_at = claim_started_at + interval '15 minutes',
        started_at = claim_started_at,
        state = 'running'
    where health_review_requests.id = review_request_id
      and (
        health_review_requests.state = 'queued'
        or (
          health_review_requests.state = 'running'
          and (
            health_review_requests.lease_expires_at is null
            or health_review_requests.lease_expires_at < claim_started_at
          )
        )
      )
    returning
      health_review_requests.execution_token,
      health_review_requests.id,
      health_review_requests.material_change_version,
      health_review_requests.owner_id;
end;
$$;

revoke all on function public.claim_health_review_request(uuid) from public;
grant execute on function public.claim_health_review_request(uuid) to service_role;

drop function public.complete_health_review_request(uuid, bigint, text);

create function public.complete_health_review_request(
  review_request_id uuid,
  expected_material_change_version bigint,
  expected_execution_token uuid,
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
      and execution_token = expected_execution_token
      and material_change_version = expected_material_change_version;

  if found then
    return true;
  end if;

  update public.health_review_requests
    set lease_expires_at = null, state = 'queued'
    where id = review_request_id
      and state = 'running'
      and execution_token = expected_execution_token;

  return false;
end;
$$;

revoke all on function public.complete_health_review_request(uuid, bigint, uuid, text) from public;
grant execute on function public.complete_health_review_request(uuid, bigint, uuid, text) to service_role;
