create table public.patrimonio_workspaces (
  owner_key text primary key,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patrimonio_workspaces_owner_key_check
    check (owner_key ~ '^[a-f0-9]{64}$')
);

create table public.patrimonio_nuclei (
  owner_key text not null references public.patrimonio_workspaces(owner_key) on delete cascade,
  id varchar(60) not null,
  code varchar(12) not null,
  name varchar(180) not null,
  location varchar(180) not null,
  manager varchar(180) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_key, id),
  unique (owner_key, code),
  constraint patrimonio_nuclei_id_check check (id ~ '^[a-z0-9-]+$'),
  constraint patrimonio_nuclei_code_check check (code ~ '^[A-Z0-9-]+$')
);

create table public.patrimonio_assets (
  owner_key text not null references public.patrimonio_workspaces(owner_key) on delete cascade,
  code char(6) not null,
  type text not null,
  nucleus_id varchar(60) not null,
  assignee varchar(180) not null default '',
  location varchar(180) not null,
  serial varchar(180) not null default '',
  brand_model varchar(180) not null,
  acquired_at date,
  acquisition_value numeric(14, 2) not null default 0,
  status text not null,
  notes varchar(500) not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_key, code),
  foreign key (owner_key, nucleus_id)
    references public.patrimonio_nuclei(owner_key, id),
  constraint patrimonio_assets_code_check check (code ~ '^[0-9]{6}$'),
  constraint patrimonio_assets_type_check
    check (type in ('cpu', 'monitor_1', 'monitor_2', 'chair', 'notebook')),
  constraint patrimonio_assets_status_check
    check (status in ('available', 'allocated', 'maintenance', 'discrepancy', 'retired')),
  constraint patrimonio_assets_value_check
    check (acquisition_value >= 0 and acquisition_value <= 100000000)
);

create table public.patrimonio_movements (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  asset_code char(6) not null,
  type text not null,
  actor varchar(180) not null,
  from_label varchar(500) not null,
  to_label varchar(500) not null,
  note varchar(500) not null default '',
  occurred_at timestamptz not null default now(),
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on delete restrict,
  constraint patrimonio_movements_type_check
    check (type in ('registration', 'transfer', 'status_change', 'import'))
);

create table public.patrimonio_import_runs (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null references public.patrimonio_workspaces(owner_key) on delete cascade,
  file_name varchar(255) not null,
  row_count integer not null check (row_count >= 0),
  inserted_count integer not null check (inserted_count >= 0),
  updated_count integer not null check (updated_count >= 0),
  rejected_count integer not null check (rejected_count >= 0),
  warnings jsonb not null default '[]'::jsonb,
  imported_by varchar(180) not null,
  created_at timestamptz not null default now()
);

create index patrimonio_assets_owner_status_idx
  on public.patrimonio_assets (owner_key, status);
create index patrimonio_assets_owner_nucleus_idx
  on public.patrimonio_assets (owner_key, nucleus_id);
create index patrimonio_assets_owner_type_idx
  on public.patrimonio_assets (owner_key, type);
create index patrimonio_assets_owner_assignee_idx
  on public.patrimonio_assets (owner_key, lower(assignee));
create index patrimonio_assets_owner_updated_idx
  on public.patrimonio_assets (owner_key, updated_at desc);
create index patrimonio_movements_owner_occurred_idx
  on public.patrimonio_movements (owner_key, occurred_at desc);
create index patrimonio_import_runs_owner_created_idx
  on public.patrimonio_import_runs (owner_key, created_at desc);

alter table public.patrimonio_workspaces enable row level security;
alter table public.patrimonio_nuclei enable row level security;
alter table public.patrimonio_assets enable row level security;
alter table public.patrimonio_movements enable row level security;
alter table public.patrimonio_import_runs enable row level security;

revoke all on table public.patrimonio_workspaces from anon, authenticated;
revoke all on table public.patrimonio_nuclei from anon, authenticated;
revoke all on table public.patrimonio_assets from anon, authenticated;
revoke all on table public.patrimonio_movements from anon, authenticated;
revoke all on table public.patrimonio_import_runs from anon, authenticated;

grant all on table public.patrimonio_workspaces to service_role;
grant all on table public.patrimonio_nuclei to service_role;
grant all on table public.patrimonio_assets to service_role;
grant all on table public.patrimonio_movements to service_role;
grant all on table public.patrimonio_import_runs to service_role;

create or replace function public.patrimonio_apply_action(
  p_owner_key text,
  p_actor text,
  p_expected_revision bigint,
  p_action jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_revision bigint;
  v_action_type text := p_action ->> 'type';
  v_asset_code text;
  v_previous_nucleus_id text;
  v_previous_nucleus_name text;
  v_next_nucleus_name text;
  v_previous_location text;
  v_previous_assignee text;
  v_previous_status text;
  v_next_status text;
  v_next_location text;
  v_next_assignee text;
  v_from_label text;
  v_to_label text;
begin
  if p_owner_key !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_owner_key';
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

  if v_action_type = 'create_nucleus' then
    insert into public.patrimonio_nuclei (
      owner_key, id, code, name, location, manager
    ) values (
      p_owner_key,
      p_action #>> '{nucleus,id}',
      upper(p_action #>> '{nucleus,code}'),
      p_action #>> '{nucleus,name}',
      p_action #>> '{nucleus,location}',
      p_action #>> '{nucleus,manager}'
    );

  elsif v_action_type = 'create_asset' then
    v_asset_code := p_action #>> '{asset,id}';

    select name into v_next_nucleus_name
    from public.patrimonio_nuclei
    where owner_key = p_owner_key
      and id = p_action #>> '{asset,nucleusId}';

    if v_next_nucleus_name is null then
      raise exception using errcode = '23503', message = 'nucleus_not_found';
    end if;

    insert into public.patrimonio_assets (
      owner_key, code, type, nucleus_id, assignee, location, serial,
      brand_model, acquired_at, acquisition_value, status, notes
    ) values (
      p_owner_key,
      v_asset_code,
      p_action #>> '{asset,type}',
      p_action #>> '{asset,nucleusId}',
      coalesce(p_action #>> '{asset,assignee}', ''),
      p_action #>> '{asset,location}',
      coalesce(p_action #>> '{asset,serial}', ''),
      p_action #>> '{asset,brandModel}',
      nullif(p_action #>> '{asset,acquiredAt}', '')::date,
      coalesce(nullif(p_action #>> '{asset,value}', '')::numeric, 0),
      coalesce(p_action #>> '{asset,status}', 'available'),
      coalesce(p_action #>> '{asset,notes}', '')
    );

    v_to_label := concat_ws(
      ' • ',
      v_next_nucleus_name,
      p_action #>> '{asset,location}',
      coalesce(nullif(p_action #>> '{asset,assignee}', ''), 'Sem responsável')
    );

    insert into public.patrimonio_movements (
      owner_key, asset_code, type, actor, from_label, to_label, note
    ) values (
      p_owner_key,
      v_asset_code,
      'registration',
      p_actor,
      'Não cadastrado',
      v_to_label,
      'Patrimônio cadastrado.'
    );

  elsif v_action_type = 'transfer_asset' then
    v_asset_code := p_action ->> 'assetId';

    select
      a.nucleus_id,
      n.name,
      a.location,
      a.assignee,
      a.status
    into
      v_previous_nucleus_id,
      v_previous_nucleus_name,
      v_previous_location,
      v_previous_assignee,
      v_previous_status
    from public.patrimonio_assets a
    join public.patrimonio_nuclei n
      on n.owner_key = a.owner_key and n.id = a.nucleus_id
    where a.owner_key = p_owner_key and a.code = v_asset_code
    for update of a;

    if not found then
      raise exception using errcode = 'P0002', message = 'asset_not_found';
    end if;
    if v_previous_status = 'retired' then
      raise exception using errcode = '22023', message = 'retired_asset_transfer';
    end if;

    select name into v_next_nucleus_name
    from public.patrimonio_nuclei
    where owner_key = p_owner_key and id = p_action ->> 'nucleusId';

    if v_next_nucleus_name is null then
      raise exception using errcode = '23503', message = 'nucleus_not_found';
    end if;

    v_next_location := p_action ->> 'location';
    v_next_assignee := coalesce(p_action ->> 'assignee', '');
    v_from_label := concat_ws(
      ' • ', v_previous_nucleus_name, v_previous_location,
      coalesce(nullif(v_previous_assignee, ''), 'Sem responsável')
    );
    v_to_label := concat_ws(
      ' • ', v_next_nucleus_name, v_next_location,
      coalesce(nullif(v_next_assignee, ''), 'Sem responsável')
    );

    if v_from_label = v_to_label then
      raise exception using errcode = '22023', message = 'unchanged_transfer';
    end if;

    update public.patrimonio_assets
    set
      nucleus_id = p_action ->> 'nucleusId',
      location = v_next_location,
      assignee = v_next_assignee,
      status = case
        when status = 'available' and v_next_assignee <> '' then 'allocated'
        else status
      end,
      updated_at = now()
    where owner_key = p_owner_key and code = v_asset_code;

    insert into public.patrimonio_movements (
      owner_key, asset_code, type, actor, from_label, to_label, note
    ) values (
      p_owner_key,
      v_asset_code,
      'transfer',
      p_actor,
      v_from_label,
      v_to_label,
      coalesce(nullif(p_action ->> 'note', ''), 'Transferência patrimonial registrada.')
    );

  elsif v_action_type = 'update_status' then
    v_asset_code := p_action ->> 'assetId';
    v_next_status := p_action ->> 'status';

    select status into v_previous_status
    from public.patrimonio_assets
    where owner_key = p_owner_key and code = v_asset_code
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'asset_not_found';
    end if;
    if v_previous_status = v_next_status then
      raise exception using errcode = '22023', message = 'unchanged_status';
    end if;

    update public.patrimonio_assets
    set status = v_next_status, updated_at = now()
    where owner_key = p_owner_key and code = v_asset_code;

    insert into public.patrimonio_movements (
      owner_key, asset_code, type, actor, from_label, to_label, note
    ) values (
      p_owner_key,
      v_asset_code,
      'status_change',
      p_actor,
      case v_previous_status
        when 'available' then 'Disponível'
        when 'allocated' then 'Em uso'
        when 'maintenance' then 'Manutenção'
        when 'discrepancy' then 'Divergência'
        when 'retired' then 'Baixado'
      end,
      case v_next_status
        when 'available' then 'Disponível'
        when 'allocated' then 'Em uso'
        when 'maintenance' then 'Manutenção'
        when 'discrepancy' then 'Divergência'
        when 'retired' then 'Baixado'
      end,
      p_action ->> 'note'
    );

  else
    raise exception using errcode = '22023', message = 'unsupported_action';
  end if;

  update public.patrimonio_workspaces
  set revision = revision + 1, updated_at = now()
  where owner_key = p_owner_key
  returning revision into v_revision;

  return v_revision;
end;
$function$;

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
  if v_row_count = 0 or v_row_count > 2000 then
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
  on conflict (owner_key, id) do update
  set
    code = excluded.code,
    name = excluded.name,
    location = excluded.location,
    manager = excluded.manager,
    updated_at = now();

  with import_codes as (
    select row.code
    from jsonb_to_recordset(p_assets) as row(code text)
  ), existing as (
    select a.code
    from public.patrimonio_assets a
    join import_codes i on i.code = a.code
    where a.owner_key = p_owner_key
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
    row."nucleusId",
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
      n.name,
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
  join public.patrimonio_nuclei n
    on n.owner_key = p_owner_key and n.id = row."nucleusId";

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

revoke all on function public.patrimonio_apply_action(text, text, bigint, jsonb)
  from public, anon, authenticated;
revoke all on function public.patrimonio_import_assets(text, text, bigint, text, jsonb, jsonb, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.patrimonio_apply_action(text, text, bigint, jsonb)
  to service_role;
grant execute on function public.patrimonio_import_assets(text, text, bigint, text, jsonb, jsonb, integer, jsonb)
  to service_role;
