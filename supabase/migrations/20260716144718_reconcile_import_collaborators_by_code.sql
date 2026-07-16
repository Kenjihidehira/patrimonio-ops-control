begin;

create or replace function public.patrimonio_import_workspace(
  p_owner_key text,
  p_actor text,
  p_expected_revision bigint,
  p_file_name text,
  p_nuclei jsonb,
  p_assets jsonb,
  p_rejected_count integer,
  p_warnings jsonb,
  p_collaborators jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_collaborator_count integer;
begin
  if jsonb_typeof(p_collaborators) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_collaborators_payload';
  end if;

  v_result := public.patrimonio_import_assets(
    p_owner_key,
    p_actor,
    p_expected_revision,
    p_file_name,
    p_nuclei,
    p_assets,
    p_rejected_count,
    p_warnings
  );

  insert into public.patrimonio_collaborators (
    owner_key, id, name, nucleus_id
  )
  select
    p_owner_key,
    collaborator.id,
    collaborator.name,
    persisted_nucleus.id
  from jsonb_to_recordset(p_collaborators) as collaborator(
    id text,
    name text,
    "nucleusId" text
  )
  join jsonb_to_recordset(p_nuclei) as source_nucleus(id text, code text)
    on source_nucleus.id = collaborator."nucleusId"
  join public.patrimonio_nuclei persisted_nucleus
    on persisted_nucleus.owner_key = p_owner_key
    and persisted_nucleus.code = upper(source_nucleus.code)
  on conflict (owner_key, id) do update
  set
    name = excluded.name,
    nucleus_id = excluded.nucleus_id,
    updated_at = now();

  v_collaborator_count := jsonb_array_length(p_collaborators);
  return v_result || jsonb_build_object('collaborators', v_collaborator_count);
end;
$function$;

revoke all on function public.patrimonio_import_workspace(
  text, text, bigint, text, jsonb, jsonb, integer, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.patrimonio_import_workspace(
  text, text, bigint, text, jsonb, jsonb, integer, jsonb, jsonb
) to service_role;

commit;
