-- Run only in a disposable synthetic database after experiment.sql.
begin;
set local role service_role;
select public.hc_retrieval_exp_publish(
 '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
 jsonb_build_array(jsonb_build_object(
  'id', 'section-v1', 'documentId', 'synthetic-note', 'revision', 'v1',
  'headingPath', jsonb_build_array('Synthetic'), 'startLine', 1, 'endLine', 2,
  'text', 'The printer uses ribbon R7.',
  'embedding', array_prepend(1::real, array_fill(0::real, array[1535]))::extensions.vector::text
 ))
);
select public.hc_retrieval_exp_publish(
 '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003',
 jsonb_build_array(jsonb_build_object(
  'id', 'private-canary', 'documentId', 'other-owner', 'revision', 'v1',
  'headingPath', '[]'::jsonb, 'startLine', 1, 'endLine', 1,
  'text', 'The printer uses ribbon R7.',
  'embedding', array_prepend(1::real, array_fill(0::real, array[1535]))::extensions.vector::text
 ))
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
declare result jsonb; mode text;
begin
  if (select count(*) from public.hc_retrieval_exp_sections) <> 1 then raise exception 'RLS isolation failed'; end if;
  foreach mode in array array['keyword', 'semantic', 'hybrid'] loop
    result := public.hc_retrieval_exp_search('00000000-0000-4000-8000-000000000001', 'printer ribbon',
      array_prepend(1::real, array_fill(0::real, array[1535]))::extensions.vector, mode, 10);
    if jsonb_array_length(result->'hits') <> 1 or result->'hits'->0->>'section_id' <> 'section-v1' then
      raise exception 'Search or owner isolation failed for %', mode;
    end if;
  end loop;
  begin
    perform public.hc_retrieval_exp_search('00000000-0000-4000-8000-000000000001', 'printer', null, 'keyword', 11);
    raise exception 'Limit was not rejected';
  exception when raise_exception then
    if sqlerrm <> 'Invalid experiment search arguments' then raise; end if;
  end;
end $$;
set local role anon;
do $$ begin
  begin
    perform * from public.hc_retrieval_exp_sections;
    raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
set local role service_role;
do $$ begin
  begin
    perform public.hc_retrieval_exp_publish('00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002', '[{"id":"broken"}]'::jsonb);
    raise exception 'Invalid publication succeeded';
  exception when not_null_violation then null;
  end;
  if (select count(*) from public.hc_retrieval_exp_sections where section_id='section-v1') <> 1 then
    raise exception 'Failed publication destroyed previous revision';
  end if;
end $$;
select public.hc_retrieval_exp_publish('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '[]'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$ begin
  if (select count(*) from public.hc_retrieval_exp_sections) <> 0 then raise exception 'Deletion left active evidence'; end if;
end $$;
rollback;
