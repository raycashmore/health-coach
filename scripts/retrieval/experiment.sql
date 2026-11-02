-- Isolated synthetic experiment only. Not an application migration.
begin;
create extension if not exists vector with schema extensions;
create table if not exists public.hc_retrieval_exp_sections (
  experiment_id uuid not null,
  owner_id uuid not null,
  section_id text not null,
  document_id text not null,
  revision text not null,
  heading_path jsonb not null,
  start_line integer not null,
  end_line integer not null,
  body text not null,
  embedding extensions.vector(1536) not null,
  fts tsvector generated always as (to_tsvector('english', body)) stored,
  primary key (experiment_id, owner_id, section_id)
);
alter table public.hc_retrieval_exp_sections enable row level security;
revoke all on public.hc_retrieval_exp_sections from public, anon, authenticated;
grant select on public.hc_retrieval_exp_sections to authenticated;
grant all on public.hc_retrieval_exp_sections to service_role;
drop policy if exists experiment_owner on public.hc_retrieval_exp_sections;
create policy experiment_owner on public.hc_retrieval_exp_sections for select to authenticated
  using (owner_id = (select auth.uid()));
create index if not exists hc_retrieval_exp_fts on public.hc_retrieval_exp_sections using gin (fts);

create or replace function public.hc_retrieval_exp_publish(p_experiment uuid, p_owner uuid, p_sections jsonb)
returns void language plpgsql security invoker set search_path = pg_catalog, public, extensions as $$
begin
  -- One transaction replaces the complete synthetic projection for this owner/run.
  delete from public.hc_retrieval_exp_sections where experiment_id = p_experiment and owner_id = p_owner;
  insert into public.hc_retrieval_exp_sections
    (experiment_id, owner_id, section_id, document_id, revision, heading_path, start_line, end_line, body, embedding)
  select p_experiment, p_owner, x->>'id', x->>'documentId', x->>'revision', x->'headingPath',
    (x->>'startLine')::integer, (x->>'endLine')::integer, x->>'text', (x->>'embedding')::extensions.vector
  from jsonb_array_elements(p_sections) x;
end;
$$;
revoke all on function public.hc_retrieval_exp_publish(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.hc_retrieval_exp_publish(uuid, uuid, jsonb) to service_role;

create or replace function public.hc_retrieval_exp_search(
  p_experiment uuid, p_query text, p_embedding extensions.vector(1536), p_mode text,
  p_limit integer default 10, p_document text default null
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public, extensions as $$
declare started timestamptz := clock_timestamp(); result jsonb;
begin
  if p_mode not in ('keyword', 'semantic', 'hybrid') or p_limit < 1 or p_limit > 10 then
    raise exception 'Invalid experiment search arguments';
  end if;
  with eligible as materialized (
    select * from public.hc_retrieval_exp_sections
    where experiment_id = p_experiment and (p_document is null or document_id = p_document)
  ), lexical as (
    select section_id, row_number() over (order by ts_rank_cd(fts, websearch_to_tsquery('english', p_query)) desc, section_id) as rank
    from eligible where p_mode <> 'semantic' and fts @@ websearch_to_tsquery('english', p_query)
  ), semantic as (
    select section_id, row_number() over (order by embedding <=> p_embedding, section_id) as rank from eligible where p_mode <> 'keyword'
  ), ranked as (
    select e.section_id, e.document_id, e.revision,
      case p_mode
        when 'keyword' then 1.0 / (60 + l.rank)
        when 'semantic' then 1.0 / (60 + s.rank)
        else coalesce(1.0 / (60 + l.rank), 0) + coalesce(1.0 / (60 + s.rank), 0)
      end as score
    from eligible e left join lexical l using(section_id) left join semantic s using(section_id)
    where p_mode <> 'keyword' or l.rank is not null
    order by score desc, e.section_id limit p_limit
  ) select coalesce(jsonb_agg(to_jsonb(ranked) order by score desc, section_id), '[]'::jsonb) into result from ranked;
  return jsonb_build_object('hits', result, 'databaseMs', extract(epoch from clock_timestamp() - started) * 1000);
end;
$$;
revoke all on function public.hc_retrieval_exp_search(uuid, text, extensions.vector, text, integer, text) from public, anon;
grant execute on function public.hc_retrieval_exp_search(uuid, text, extensions.vector, text, integer, text) to authenticated;
notify pgrst, 'reload schema';
commit;
