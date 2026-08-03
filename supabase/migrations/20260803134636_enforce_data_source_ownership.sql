begin;

set local lock_timeout = '5s';

create table public.patrimonio_data_source_policies (
  domain_key text primary key,
  domain_label varchar(120) not null,
  master_system varchar(120) not null,
  write_policy text not null,
  activation_status text not null,
  owned_fields text[] not null default '{}',
  scope_note varchar(500) not null,
  sort_order smallint not null,
  updated_at timestamptz not null default now(),
  constraint patrimonio_data_source_policies_domain_key_check
    check (domain_key ~ '^[a-z0-9_]+$'),
  constraint patrimonio_data_source_policies_write_policy_check
    check (write_policy in ('authoritative', 'operational_protected', 'append_only')),
  constraint patrimonio_data_source_policies_activation_status_check
    check (activation_status in ('active', 'planned')),
  constraint patrimonio_data_source_policies_owned_fields_check
    check (cardinality(owned_fields) > 0),
  constraint patrimonio_data_source_policies_sort_order_check
    check (sort_order between 1 and 100)
);

comment on table public.patrimonio_data_source_policies is
  'Matriz executavel de propriedade dos dados. Cada dominio tem uma unica fonte oficial e uma regra de escrita.';
comment on column public.patrimonio_data_source_policies.write_policy is
  'authoritative: a fonte atualiza apenas seus campos; operational_protected: integracoes externas nao sobrescrevem; append_only: evidencias nao podem ser regravadas.';

insert into public.patrimonio_data_source_policies (
  domain_key,
  domain_label,
  master_system,
  write_policy,
  activation_status,
  owned_fields,
  scope_note,
  sort_order
)
values
  (
    'asset_fiscal',
    'Cadastro fiscal do patrimônio',
    'Sabium',
    'authoritative',
    'active',
    array[
      'base_code', 'incorporation', 'source_identifier', 'source_description',
      'asset_group', 'branch_code', 'acquired_at', 'acquisition_value',
      'disposed_at', 'operation_value', 'invoice_number', 'source_row',
      'source_fingerprint'
    ],
    'O Sabium atualiza somente dados fiscais e metadados de origem. Não altera responsável, núcleo, localização, status, série, classificação operacional, modelo nem observações.',
    10
  ),
  (
    'asset_operations',
    'Custódia e localização atual',
    'Patrimônio Ops Control',
    'operational_protected',
    'active',
    array['nucleus_id', 'assignee', 'location', 'status', 'serial', 'type', 'brand_model', 'notes'],
    'Transferências, conferências e correções operacionais são feitas no Patrimônio Ops. Divergências recebidas de outras fontes entram na fila de conciliação.',
    20
  ),
  (
    'workforce_directory',
    'Identidade organizacional do colaborador',
    'RH / diretório corporativo',
    'authoritative',
    'planned',
    array['collaborator_name', 'collaborator_email', 'department', 'employment_status'],
    'A integração corporativa ainda não está ativa. Até a ativação, o cadastro administrativo interno continua sendo o custodiante temporário.',
    30
  ),
  (
    'maintenance',
    'Manutenção e atendimento técnico',
    'Patrimônio Ops Control',
    'operational_protected',
    'active',
    array['maintenance_kind', 'priority', 'maintenance_status', 'due_at', 'maintenance_notes'],
    'O Patrimônio Ops é a fonte vigente. Um ITSM só poderá assumir esses campos após decisão formal e contrato de integração.',
    40
  ),
  (
    'fleet_telemetry',
    'Telemetria de frota',
    'Provedor de frota',
    'append_only',
    'planned',
    array['latitude', 'longitude', 'accuracy_meters', 'odometer', 'observed_at'],
    'O provedor externo poderá acrescentar eventos de telemetria, mas não editar o cadastro patrimonial nem a custódia.',
    50
  ),
  (
    'device_compliance',
    'Conformidade de dispositivos',
    'MDM corporativo',
    'authoritative',
    'planned',
    array['device_compliance', 'last_seen_at', 'encryption_status', 'management_status'],
    'O MDM será mestre apenas para postura e estado técnico do dispositivo; não para valor, responsável ou localização patrimonial.',
    60
  ),
  (
    'access_identity',
    'Identidade e autorização de acesso',
    'Google OIDC + administração interna',
    'authoritative',
    'active',
    array['login_identifier', 'display_name', 'department_access', 'role_permissions', 'session_version'],
    'O provedor comprova a identidade. Departamentos, perfis e permissões continuam controlados pelo cadastro administrativo do Patrimônio Ops.',
    70
  ),
  (
    'audit_trail',
    'Trilha de auditoria',
    'Patrimônio Ops Control',
    'append_only',
    'active',
    array['actor', 'event_type', 'before_state', 'after_state', 'occurred_at'],
    'Alterações geram novos eventos. Importações e integrações não podem reescrever nem apagar evidências anteriores.',
    80
  );

alter table public.patrimonio_data_source_policies enable row level security;

create policy patrimonio_data_source_policies_no_direct_access
  on public.patrimonio_data_source_policies
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.patrimonio_data_source_policies
  from public, anon, authenticated;
grant select on table public.patrimonio_data_source_policies to service_role;

do $migration$
declare
  function_definition text;
  unsafe_nucleus_upsert text;
begin
  select pg_get_functiondef(
    'public.patrimonio_import_assets_without_aliases(text,text,bigint,text,jsonb,jsonb,integer,jsonb)'::regprocedure
  ) into function_definition;

  unsafe_nucleus_upsert := 'on conflict (owner_key, code) do update' || chr(10) ||
    '  set' || chr(10) ||
    '    name = excluded.name,' || chr(10) ||
    '    location = excluded.location,' || chr(10) ||
    '    manager = excluded.manager,' || chr(10) ||
    '    updated_at = now();';

  if position(unsafe_nucleus_upsert in function_definition) = 0 then
    raise exception 'patrimonio_import_assets_without_aliases nucleus upsert marker not found';
  end if;

  execute replace(
    function_definition,
    unsafe_nucleus_upsert,
    'on conflict (owner_key, code) do nothing;'
  );
end;
$migration$;

create unique index patrimonio_assets_owner_sabium_natural_key_uidx
  on public.patrimonio_assets (owner_key, source_system, base_code, incorporation)
  where source_system = 'sabium';

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
  v_conflict_count integer;
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
    source_row integer not null,
    unique (base_code, incorporation)
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
    raise exception using errcode = '22023', message = 'duplicate_sabium_asset_identity';
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
  on conflict do nothing;

  select count(*)
    into v_existing_count
  from sabium_import_rows source_row
  join public.patrimonio_assets asset
    on asset.owner_key = v_owner_key
   and asset.source_system = 'sabium'
   and asset.base_code = source_row.base_code
   and asset.incorporation = source_row.incorporation;

  create temporary table sabium_changed_assets (
    code varchar(24) primary key,
    previous_source_identifier varchar(80) not null
  ) on commit drop;

  insert into sabium_changed_assets (code, previous_source_identifier)
  select asset.code, coalesce(asset.source_identifier, '')
  from sabium_import_rows source_row
  join public.patrimonio_assets asset
    on asset.owner_key = v_owner_key
   and asset.source_system = 'sabium'
   and asset.base_code = source_row.base_code
   and asset.incorporation = source_row.incorporation
  where asset.acquired_at is distinct from source_row.acquired_at
     or asset.acquisition_value is distinct from source_row.acquisition_value
     or asset.source_fingerprint is distinct from source_row.source_fingerprint
     or asset.source_identifier is distinct from source_row.source_identifier
     or asset.source_description is distinct from source_row.source_description
     or asset.asset_group is distinct from source_row.asset_group
     or asset.branch_code is distinct from source_row.branch_code
     or asset.disposed_at is distinct from source_row.disposed_at
     or asset.operation_value is distinct from source_row.operation_value
     or asset.invoice_number is distinct from source_row.invoice_number
     or asset.source_row is distinct from source_row.source_row;

  select count(*) into v_updated_count from sabium_changed_assets;
  v_inserted_count := v_row_count - v_existing_count;

  insert into public.patrimonio_reconciliation_issues (
    owner_key,
    source,
    external_ref,
    entity_type,
    entity_id,
    issue_type,
    severity,
    details,
    assigned_to
  )
  select
    v_owner_key,
    'Sabium',
    source_row.source_identifier,
    'asset',
    asset.code,
    'sabium_operational_conflict',
    case
      when source_row.status = 'retired' and asset.status <> 'retired' then 'high'
      else 'medium'
    end,
    jsonb_build_object(
      'policyVersion', '2026-08-03',
      'message', 'O Sabium diverge de campos protegidos pelo Patrimônio Ops; nenhuma correção operacional foi sobrescrita.',
      'differences', jsonb_strip_nulls(jsonb_build_object(
        'type', case when asset.type is distinct from source_row.type
          then jsonb_build_object('current', asset.type, 'incoming', source_row.type) end,
        'nucleusId', case when asset.nucleus_id is distinct from source_row.nucleus_id
          then jsonb_build_object('current', asset.nucleus_id, 'incoming', source_row.nucleus_id) end,
        'location', case when asset.location is distinct from source_row.location
          then jsonb_build_object('current', asset.location, 'incoming', source_row.location) end,
        'brandModel', case when asset.brand_model is distinct from source_row.brand_model
          then jsonb_build_object('current', asset.brand_model, 'incoming', source_row.brand_model) end,
        'status', case when asset.status is distinct from source_row.status
          then jsonb_build_object('current', asset.status, 'incoming', source_row.status) end
      ))
    ),
    ''
  from sabium_import_rows source_row
  join public.patrimonio_assets asset
    on asset.owner_key = v_owner_key
   and asset.source_system = 'sabium'
   and asset.base_code = source_row.base_code
   and asset.incorporation = source_row.incorporation
  where (
    asset.type is distinct from source_row.type
    or asset.nucleus_id is distinct from source_row.nucleus_id
    or asset.location is distinct from source_row.location
    or asset.brand_model is distinct from source_row.brand_model
    or asset.status is distinct from source_row.status
  )
  and not exists (
    select 1
    from public.patrimonio_reconciliation_issues issue
    where issue.owner_key = v_owner_key
      and issue.source = 'Sabium'
      and issue.entity_type = 'asset'
      and issue.entity_id = asset.code
      and issue.issue_type = 'sabium_operational_conflict'
      and issue.status = 'open'
  );

  get diagnostics v_conflict_count = row_count;

  update public.patrimonio_assets asset
  set
    acquired_at = source_row.acquired_at,
    acquisition_value = source_row.acquisition_value,
    source_fingerprint = source_row.source_fingerprint,
    source_identifier = source_row.source_identifier,
    source_description = source_row.source_description,
    asset_group = source_row.asset_group,
    branch_code = source_row.branch_code,
    disposed_at = source_row.disposed_at,
    operation_value = source_row.operation_value,
    invoice_number = source_row.invoice_number,
    source_row = source_row.source_row,
    updated_at = now()
  from sabium_import_rows source_row
  join sabium_changed_assets changed on true
  where asset.owner_key = v_owner_key
    and asset.code = changed.code
    and asset.source_system = 'sabium'
    and asset.base_code = source_row.base_code
    and asset.incorporation = source_row.incorporation;

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
  where not exists (
    select 1
    from public.patrimonio_assets asset
    where asset.owner_key = v_owner_key
      and asset.source_system = 'sabium'
      and asset.base_code = source_row.base_code
      and asset.incorporation = source_row.incorporation
  );

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
    asset.code,
    'import',
    trim(p_actor),
    'Sabium',
    source_row.source_identifier,
    'Carga inicial Gazin LOG · linha ' || source_row.source_row::text,
    now()
  from sabium_import_rows source_row
  join public.patrimonio_assets asset
    on asset.owner_key = v_owner_key
   and asset.source_system = 'sabium'
   and asset.base_code = source_row.base_code
   and asset.incorporation = source_row.incorporation
  where not exists (
    select 1
    from public.patrimonio_movements movement
    where movement.owner_key = v_owner_key
      and movement.asset_code = asset.code
      and movement.type = 'import'
  );

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
    changed.code,
    'import',
    trim(p_actor),
    changed.previous_source_identifier,
    source_row.source_identifier,
    'Campos fiscais e metadados de origem atualizados pelo Sabium; campos operacionais preservados.',
    now()
  from sabium_changed_assets changed
  join public.patrimonio_assets asset
    on asset.owner_key = v_owner_key
   and asset.code = changed.code
  join sabium_import_rows source_row
    on source_row.base_code = asset.base_code
   and source_row.incorporation = asset.incorporation;

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
    case when v_conflict_count > 0 then jsonb_build_array(jsonb_build_object(
      'row', 0,
      'column', 'Fonte oficial',
      'message', v_conflict_count::text || ' divergência(s) operacional(is) encaminhada(s) para conciliação.'
    )) else '[]'::jsonb end,
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
    'unchanged', v_existing_count - v_updated_count,
    'conflicts', v_conflict_count,
    'rejected', 0
  );
end;
$function$;

revoke all on function public.patrimonio_import_sabium_assets(jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.patrimonio_import_sabium_assets(jsonb, text, text)
  to service_role;

commit;
