create or replace function public.patrimonio_import_sabium_assets(
  p_rows jsonb,
  p_file_name text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_owner_key text;
  v_row_count integer;
  v_existing_count integer;
  v_inserted_count integer;
  v_updated_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_sabium_rows';
  end if;

  v_row_count := jsonb_array_length(p_rows);
  if v_row_count < 1 or v_row_count > 3000 then
    raise exception using errcode = '22023', message = 'invalid_sabium_row_count';
  end if;

  if length(trim(coalesce(p_file_name, ''))) < 1
    or length(trim(coalesce(p_actor, ''))) < 1
  then
    raise exception using errcode = '22023', message = 'invalid_import_metadata';
  end if;

  select department.owner_key
    into v_owner_key
  from public.patrimonio_departments department
  where department.slug = 'gazin-log'
    and department.active
  limit 1;

  if v_owner_key is null then
    raise exception using errcode = '22023', message = 'gazin_log_department_not_found';
  end if;

  insert into public.patrimonio_workspaces (owner_key)
  values (v_owner_key)
  on conflict (owner_key) do nothing;

  create temporary table sabium_import_rows (
    code varchar(24) primary key,
    type text not null,
    nucleus_id varchar(80) not null,
    nucleus_code varchar(20) not null,
    nucleus_name varchar(120) not null,
    location varchar(180) not null,
    brand_model varchar(180) not null,
    acquired_at date,
    acquisition_value numeric(14, 2) not null,
    status text not null,
    source_fingerprint varchar(64) not null,
    base_code varchar(40) not null,
    incorporation integer not null,
    source_identifier varchar(80) not null,
    source_description varchar(500) not null,
    asset_group varchar(160),
    branch_code varchar(80),
    disposed_at date,
    operation_value numeric(14, 2),
    invoice_number varchar(80),
    source_row integer not null
  ) on commit drop;

  insert into sabium_import_rows
  select
    trim(row_data ->> 'code'),
    trim(row_data ->> 'type'),
    trim(row_data ->> 'nucleusId'),
    trim(row_data ->> 'nucleusCode'),
    trim(row_data ->> 'nucleusName'),
    trim(row_data ->> 'location'),
    trim(row_data ->> 'brandModel'),
    nullif(row_data ->> 'acquiredAt', '')::date,
    coalesce((row_data ->> 'acquisitionValue')::numeric, 0),
    trim(row_data ->> 'status'),
    trim(row_data ->> 'sourceFingerprint'),
    trim(row_data ->> 'baseCode'),
    (row_data ->> 'incorporation')::integer,
    trim(row_data ->> 'sourceIdentifier'),
    trim(row_data ->> 'sourceDescription'),
    nullif(trim(row_data ->> 'assetGroup'), ''),
    nullif(trim(row_data ->> 'branchCode'), ''),
    nullif(row_data ->> 'disposedAt', '')::date,
    nullif(row_data ->> 'operationValue', '')::numeric,
    nullif(trim(row_data ->> 'invoiceNumber'), ''),
    (row_data ->> 'sourceRow')::integer
  from jsonb_array_elements(p_rows) as rows(row_data);

  if (select count(*) from sabium_import_rows) <> v_row_count then
    raise exception using errcode = '22023', message = 'duplicate_internal_asset_code';
  end if;

  if exists (
    select 1
    from sabium_import_rows row_data
    where row_data.code !~ '^G[A-F0-9]{20}$'
      or row_data.type not in (
        'cpu', 'monitor_1', 'monitor_2', 'chair', 'notebook', 'fleet',
        'car', 'trailer', 'vehicle_component', 'equipment', 'furniture',
        'extinguisher', 'software', 'other'
      )
      or row_data.nucleus_id !~ '^[a-z0-9-]+$'
      or row_data.nucleus_code !~ '^[A-Z0-9-]+$'
      or row_data.status not in ('available', 'retired')
      or row_data.source_fingerprint !~ '^[a-f0-9]{64}$'
      or row_data.source_row <= 1
  ) then
    raise exception using errcode = '22023', message = 'invalid_normalized_sabium_row';
  end if;

  insert into public.patrimonio_nuclei (
    owner_key, id, code, name, location, manager
  )
  select distinct on (row_data.nucleus_id)
    v_owner_key,
    row_data.nucleus_id,
    row_data.nucleus_code,
    row_data.nucleus_name,
    row_data.location,
    'Informação pendente de validação'
  from sabium_import_rows row_data
  order by row_data.nucleus_id, row_data.nucleus_code
  on conflict (owner_key, id) do update set
    code = excluded.code,
    name = excluded.name,
    location = excluded.location,
    updated_at = now();

  select count(*)
    into v_existing_count
  from sabium_import_rows source_row
  join public.patrimonio_assets asset
    on asset.owner_key = v_owner_key
   and asset.source_system = 'sabium'
   and asset.source_fingerprint = source_row.source_fingerprint;

  insert into public.patrimonio_assets (
    owner_key,
    code,
    type,
    nucleus_id,
    assignee,
    location,
    serial,
    brand_model,
    acquired_at,
    acquisition_value,
    status,
    notes,
    source_system,
    source_fingerprint,
    base_code,
    incorporation,
    source_identifier,
    source_description,
    asset_group,
    branch_code,
    disposed_at,
    operation_value,
    invoice_number,
    source_row
  )
  select
    v_owner_key,
    source_row.code,
    source_row.type,
    source_row.nucleus_id,
    '',
    source_row.location,
    '',
    source_row.brand_model,
    source_row.acquired_at,
    source_row.acquisition_value,
    source_row.status,
    '',
    'sabium',
    source_row.source_fingerprint,
    source_row.base_code,
    source_row.incorporation,
    source_row.source_identifier,
    source_row.source_description,
    source_row.asset_group,
    source_row.branch_code,
    source_row.disposed_at,
    source_row.operation_value,
    source_row.invoice_number,
    source_row.source_row
  from sabium_import_rows source_row
  on conflict (owner_key, code) do update set
    type = excluded.type,
    nucleus_id = excluded.nucleus_id,
    location = excluded.location,
    brand_model = excluded.brand_model,
    acquired_at = excluded.acquired_at,
    acquisition_value = excluded.acquisition_value,
    status = excluded.status,
    source_system = excluded.source_system,
    source_fingerprint = excluded.source_fingerprint,
    base_code = excluded.base_code,
    incorporation = excluded.incorporation,
    source_identifier = excluded.source_identifier,
    source_description = excluded.source_description,
    asset_group = excluded.asset_group,
    branch_code = excluded.branch_code,
    disposed_at = excluded.disposed_at,
    operation_value = excluded.operation_value,
    invoice_number = excluded.invoice_number,
    source_row = excluded.source_row,
    updated_at = now();

  insert into public.patrimonio_movements (
    owner_key,
    asset_code,
    type,
    actor,
    from_label,
    to_label,
    note,
    occurred_at
  )
  select
    v_owner_key,
    source_row.code,
    'import',
    trim(p_actor),
    'Sabium',
    source_row.source_identifier,
    'Carga inicial Gazin LOG · linha ' || source_row.source_row::text,
    now()
  from sabium_import_rows source_row
  where not exists (
    select 1
    from public.patrimonio_movements movement
    where movement.owner_key = v_owner_key
      and movement.asset_code = source_row.code
      and movement.type = 'import'
  );

  v_inserted_count := v_row_count - v_existing_count;
  v_updated_count := v_existing_count;

  insert into public.patrimonio_import_runs (
    owner_key,
    file_name,
    row_count,
    inserted_count,
    updated_count,
    rejected_count,
    warnings,
    imported_by
  )
  values (
    v_owner_key,
    left(trim(p_file_name), 255),
    v_row_count,
    v_inserted_count,
    v_updated_count,
    0,
    '[]'::jsonb,
    left(trim(p_actor), 180)
  );

  update public.patrimonio_workspaces
  set revision = revision + 1,
      updated_at = now()
  where owner_key = v_owner_key;

  return jsonb_build_object(
    'rowCount', v_row_count,
    'inserted', v_inserted_count,
    'updated', v_updated_count,
    'rejected', 0
  );
end;
$function$;

revoke all on function public.patrimonio_import_sabium_assets(jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.patrimonio_import_sabium_assets(jsonb, text, text)
  to service_role;

