begin;

create or replace function public.patrimonio_import_assets(
  p_owner_key text,
  p_actor text,
  p_expected_revision bigint,
  p_file_name text,
  p_nuclei jsonb,
  p_assets jsonb,
  p_rejected_count integer,
  p_warnings jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_revision bigint;
  v_row_count integer;
  v_inserted_count integer;
  v_updated_count integer;
  v_existing_codes jsonb;
begin
  if p_owner_key !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_owner_key';
  end if;
  if jsonb_typeof(p_nuclei) <> 'array' or jsonb_typeof(p_assets) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_import_payload';
  end if;

  v_row_count := jsonb_array_length(p_assets);
  if v_row_count > 2000 then
    raise exception using errcode = '22023', message = 'invalid_import_size';
  end if;

  insert into public.patrimonio_workspaces (owner_key)
  values (p_owner_key)
  on conflict (owner_key) do nothing;

  select revision into v_revision
  from public.patrimonio_workspaces
  where owner_key = p_owner_key
  for update;

  if v_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'revision_conflict';
  end if;

  insert into public.patrimonio_nuclei (
    owner_key, id, code, name, location, manager
  )
  select
    p_owner_key,
    row.id,
    upper(row.code),
    row.name,
    row.location,
    row.manager
  from jsonb_to_recordset(p_nuclei) as row(
    id text,
    code text,
    name text,
    location text,
    manager text
  )
  on conflict (owner_key, code) do update
  set
    name = excluded.name,
    location = excluded.location,
    manager = excluded.manager,
    updated_at = now();

  with import_codes as (
    select row.code
    from jsonb_to_recordset(p_assets) as row(code text)
  ), existing as (
    select asset.code
    from public.patrimonio_assets asset
    join import_codes imported on imported.code = asset.code
    where asset.owner_key = p_owner_key
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(code), '[]'::jsonb)
  into v_updated_count, v_existing_codes
  from existing;

  v_inserted_count := v_row_count - v_updated_count;

  insert into public.patrimonio_assets (
    owner_key, code, type, nucleus_id, assignee, location, serial,
    brand_model, acquired_at, acquisition_value, status, notes
  )
  select
    p_owner_key,
    row.code,
    row.type,
    persisted_nucleus.id,
    coalesce(row.assignee, ''),
    row.location,
    coalesce(row.serial, ''),
    row."brandModel",
    nullif(row."acquiredAt", '')::date,
    coalesce(row.value, 0),
    row.status,
    coalesce(row.notes, '')
  from jsonb_to_recordset(p_assets) as row(
    code text,
    type text,
    "nucleusId" text,
    assignee text,
    location text,
    serial text,
    "brandModel" text,
    "acquiredAt" text,
    value numeric,
    status text,
    notes text
  )
  join jsonb_to_recordset(p_nuclei) as source_nucleus(id text, code text)
    on source_nucleus.id = row."nucleusId"
  join public.patrimonio_nuclei persisted_nucleus
    on persisted_nucleus.owner_key = p_owner_key
    and persisted_nucleus.code = upper(source_nucleus.code)
  on conflict (owner_key, code) do update
  set
    type = excluded.type,
    nucleus_id = excluded.nucleus_id,
    assignee = excluded.assignee,
    location = excluded.location,
    serial = excluded.serial,
    brand_model = excluded.brand_model,
    acquired_at = excluded.acquired_at,
    acquisition_value = excluded.acquisition_value,
    status = excluded.status,
    notes = excluded.notes,
    updated_at = now();

  insert into public.patrimonio_movements (
    owner_key, asset_code, type, actor, from_label, to_label, note
  )
  select
    p_owner_key,
    row.code,
    case when v_existing_codes ? row.code then 'import' else 'registration' end,
    p_actor,
    case when v_existing_codes ? row.code then 'Cadastro anterior' else 'Não cadastrado' end,
    concat_ws(
      ' • ',
      persisted_nucleus.name,
      row.location,
      coalesce(nullif(row.assignee, ''), 'Sem responsável')
    ),
    'Importado do arquivo ' || left(p_file_name, 220)
  from jsonb_to_recordset(p_assets) as row(
    code text,
    "nucleusId" text,
    assignee text,
    location text
  )
  join jsonb_to_recordset(p_nuclei) as source_nucleus(id text, code text)
    on source_nucleus.id = row."nucleusId"
  join public.patrimonio_nuclei persisted_nucleus
    on persisted_nucleus.owner_key = p_owner_key
    and persisted_nucleus.code = upper(source_nucleus.code);

  insert into public.patrimonio_import_runs (
    owner_key, file_name, row_count, inserted_count, updated_count,
    rejected_count, warnings, imported_by
  ) values (
    p_owner_key,
    left(p_file_name, 255),
    v_row_count,
    v_inserted_count,
    v_updated_count,
    greatest(coalesce(p_rejected_count, 0), 0),
    coalesce(p_warnings, '[]'::jsonb),
    p_actor
  );

  update public.patrimonio_workspaces
  set revision = revision + 1, updated_at = now()
  where owner_key = p_owner_key
  returning revision into v_revision;

  return jsonb_build_object(
    'revision', v_revision,
    'inserted', v_inserted_count,
    'updated', v_updated_count,
    'rejected', greatest(coalesce(p_rejected_count, 0), 0)
  );
end;
$function$;

revoke all on function public.patrimonio_import_assets(
  text, text, bigint, text, jsonb, jsonb, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.patrimonio_import_assets(
  text, text, bigint, text, jsonb, jsonb, integer, jsonb
) to service_role;

commit;
