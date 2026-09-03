alter table public.health_review_requests
  add column lease_expires_at timestamptz;

update public.health_review_requests
  set lease_expires_at = started_at + interval '15 minutes'
  where state = 'running' and started_at is not null;

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
    set finished_at = now(), lease_expires_at = null, state = review_state
    where id = review_request_id
      and state = 'running'
      and material_changed_at = expected_updated_at;

  if found then
    return true;
  end if;

  update public.health_review_requests
    set lease_expires_at = null, state = 'queued'
    where id = review_request_id and state = 'running';

  return false;
end;
$$;
