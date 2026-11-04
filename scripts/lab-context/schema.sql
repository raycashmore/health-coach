-- Experiment schema only: install in a new disposable database, never as a
-- production migration. The local runner owns its DB connection and identity.
create schema hc_context;
revoke all on schema hc_context from public;
create table hc_context.publications (
  owner_id uuid primary key, revision uuid not null, published_at timestamptz not null
);
create table hc_context.revisions (
  owner_id uuid not null, revision uuid not null, primary key(owner_id, revision)
);
create table hc_context.documents (
  owner_id uuid not null, document_id text not null, content_hash text not null,
  primary key(owner_id, document_id)
);
create table hc_context.sections (
  owner_id uuid not null, section_id text not null, document_id text not null,
  heading_path jsonb not null, start_line integer not null check(start_line > 0),
  end_line integer not null check(end_line >= start_line), authored_date date,
  body text not null check(length(body) > 0),
  fts tsvector generated always as (to_tsvector('english', body)) stored,
  primary key(owner_id, section_id),
  foreign key(owner_id, document_id) references hc_context.documents on delete cascade
);
create index on hc_context.sections using gin(fts);
create table hc_context.tombstones (
  owner_id uuid not null, document_id text not null, removed_at timestamptz not null,
  primary key(owner_id, document_id)
);
do $$ declare t text; begin
  foreach t in array array['publications','revisions','documents','sections','tombstones'] loop
    execute format('alter table hc_context.%I enable row level security', t);
    execute format('alter table hc_context.%I force row level security', t);
    execute format('create policy owner_only on hc_context.%I using (owner_id = nullif(current_setting(''hc_context.owner_id'', true), '''')::uuid) with check (owner_id = nullif(current_setting(''hc_context.owner_id'', true), '''')::uuid)', t);
  end loop;
end $$;

create function hc_context.publish(p_owner uuid, p_revision uuid, p_expected uuid,
  p_manifest jsonb, p_removed text[]) returns void language plpgsql security invoker
  set search_path = pg_catalog, hc_context as $$
declare current_revision uuid; doc jsonb; section jsonb;
begin
  if nullif(current_setting('hc_context.owner_id', true), '')::uuid is distinct from p_owner then
    raise exception 'owner-required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 0));
  select revision into current_revision from hc_context.publications where owner_id = p_owner;
  if current_revision is distinct from p_expected then raise exception 'publication-conflict'; end if;
  if jsonb_typeof(p_manifest) is distinct from 'array' then raise exception 'invalid-manifest'; end if;
  if exists(select 1 from hc_context.documents d where d.owner_id = p_owner
    and not exists(select 1 from jsonb_array_elements(p_manifest) x where x->>'id' = d.document_id)
    and not (d.document_id = any(p_removed))) then raise exception 'explicit-removal-required'; end if;
  if exists(select 1 from jsonb_array_elements(p_manifest) x where x->>'id' = any(p_removed)) then
    raise exception 'invalid-removal'; end if;
  insert into hc_context.revisions values(p_owner, p_revision);
  insert into hc_context.tombstones
    select p_owner, document_id, clock_timestamp() from hc_context.documents d where d.owner_id = p_owner
      and not exists(select 1 from jsonb_array_elements(p_manifest) x where x->>'id' = d.document_id)
    on conflict(owner_id, document_id) do update set removed_at = excluded.removed_at;
  delete from hc_context.documents where owner_id = p_owner;
  for doc in select * from jsonb_array_elements(p_manifest) loop
    if length(doc->>'id') = 0 or length(doc->>'hash') <> 64
      or jsonb_typeof(doc->'sections') is distinct from 'array'
      or jsonb_array_length(doc->'sections') = 0 then raise exception 'invalid-document'; end if;
    insert into hc_context.documents values(p_owner, doc->>'id', doc->>'hash');
    delete from hc_context.tombstones where owner_id = p_owner and document_id = doc->>'id';
    for section in select * from jsonb_array_elements(doc->'sections') loop
      insert into hc_context.sections(owner_id, section_id, document_id, heading_path,
        start_line, end_line, authored_date, body) values(p_owner, section->>'id', doc->>'id',
        section->'headingPath', (section->>'startLine')::integer, (section->>'endLine')::integer,
        (doc->>'authoredDate')::date, section->>'text');
    end loop;
  end loop;
  insert into hc_context.publications values(p_owner, p_revision, clock_timestamp())
    on conflict(owner_id) do update set revision = excluded.revision, published_at = excluded.published_at;
end $$;
revoke all on function hc_context.publish(uuid,uuid,uuid,jsonb,text[]) from public;
