-- Registered in production as Supabase migration 20260727153629.
begin;

set local lock_timeout = '5s';

create table public.patrimonio_departments (
  slug varchar(60) primary key,
  name varchar(120) not null unique,
  owner_key text not null unique
    references public.patrimonio_workspaces(owner_key) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patrimonio_departments_slug_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.patrimonio_users (
  identifier varchar(254) primary key,
  display_name varchar(180) not null default '',
  is_admin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patrimonio_users_identifier_check
    check (
      identifier = lower(trim(identifier))
      and identifier ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
);

create table public.patrimonio_department_memberships (
  user_identifier varchar(254) not null
    references public.patrimonio_users(identifier)
    on update cascade on delete cascade,
  department_slug varchar(60) not null
    references public.patrimonio_departments(slug)
    on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_identifier, department_slug)
);

create table public.patrimonio_department_transfers (
  id uuid primary key default gen_random_uuid(),
  source_department_slug varchar(60) not null
    references public.patrimonio_departments(slug) on delete restrict,
  target_department_slug varchar(60) not null
    references public.patrimonio_departments(slug) on delete restrict,
  entity_type text not null,
  entity_id varchar(60) not null,
  entity_label varchar(180) not null,
  asset_codes jsonb not null default '[]'::jsonb,
  actor varchar(254) not null,
  note varchar(500) not null,
  occurred_at timestamptz not null default now(),
  constraint patrimonio_department_transfers_distinct_check
    check (source_department_slug <> target_department_slug),
  constraint patrimonio_department_transfers_entity_type_check
    check (entity_type in ('asset', 'collaborator')),
  constraint patrimonio_department_transfers_asset_codes_check
    check (jsonb_typeof(asset_codes) = 'array')
);

create index patrimonio_department_memberships_department_idx
  on public.patrimonio_department_memberships (department_slug, user_identifier);
create index patrimonio_department_transfers_source_time_idx
  on public.patrimonio_department_transfers (source_department_slug, occurred_at desc);
create index patrimonio_department_transfers_target_time_idx
  on public.patrimonio_department_transfers (target_department_slug, occurred_at desc);
create index if not exists patrimonio_asset_aliases_owner_asset_idx
  on public.patrimonio_asset_aliases (owner_key, asset_code);

alter table public.patrimonio_departments enable row level security;
alter table public.patrimonio_users enable row level security;
alter table public.patrimonio_department_memberships enable row level security;
alter table public.patrimonio_department_transfers enable row level security;

create policy patrimonio_departments_no_direct_access
  on public.patrimonio_departments for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_users_no_direct_access
  on public.patrimonio_users for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_department_memberships_no_direct_access
  on public.patrimonio_department_memberships for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_department_transfers_no_direct_access
  on public.patrimonio_department_transfers for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.patrimonio_departments from anon, authenticated;
revoke all on table public.patrimonio_users from anon, authenticated;
revoke all on table public.patrimonio_department_memberships from anon, authenticated;
revoke all on table public.patrimonio_department_transfers from anon, authenticated;

grant all on table public.patrimonio_departments to service_role;
grant all on table public.patrimonio_users to service_role;
grant all on table public.patrimonio_department_memberships to service_role;
grant all on table public.patrimonio_department_transfers to service_role;

do $seed$
declare
  current_owner_key text;
  gazin_log_owner_key text;
begin
  select owner_key
  into current_owner_key
  from public.patrimonio_workspaces
  order by created_at
  limit 1;

  if current_owner_key is null then
    raise exception 'existing patrimonio workspace not found';
  end if;

  insert into public.patrimonio_departments (slug, name, owner_key)
  values ('atendimento-ao-cliente', 'Atendimento ao Cliente', current_owner_key);

  gazin_log_owner_key :=
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', '');

  insert into public.patrimonio_workspaces (owner_key)
  values (gazin_log_owner_key);

  insert into public.patrimonio_departments (slug, name, owner_key)
  values ('gazin-log', 'Gazin LOG', gazin_log_owner_key);

  insert into public.patrimonio_users (
    identifier, display_name, is_admin, active
  ) values (
    'atend.gazin@gmail.com', 'Administrador Patrimônio Ops', true, true
  );

  insert into public.patrimonio_department_memberships (
    user_identifier, department_slug
  ) values
    ('atend.gazin@gmail.com', 'atendimento-ao-cliente'),
    ('atend.gazin@gmail.com', 'gazin-log');
end;
$seed$;

alter table public.patrimonio_movements
  drop constraint patrimonio_movements_type_check;

alter table public.patrimonio_movements
  add constraint patrimonio_movements_type_check
  check (
    type in (
      'registration',
      'transfer',
      'department_transfer',
      'status_change',
      'identifier_change',
      'details_update',
      'import'
    )
  );

create or replace function public.patrimonio_save_user_access(
  p_admin_identifier text,
  p_identifier text,
  p_display_name text,
  p_is_admin boolean,
  p_department_slugs text[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  admin_identifier text := lower(trim(p_admin_identifier));
  target_identifier text := lower(trim(p_identifier));
  normalized_departments text[] := coalesce(p_department_slugs, array[]::text[]);
begin
  if not exists (
    select 1
    from public.patrimonio_users
    where identifier = admin_identifier
      and active
      and is_admin
  ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if target_identifier !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'invalid_user_identifier';
  end if;
  if target_identifier = admin_identifier and not coalesce(p_is_admin, false) then
    raise exception using errcode = '22023', message = 'cannot_remove_own_admin';
  end if;
  if length(trim(coalesce(p_display_name, ''))) > 180 then
    raise exception using errcode = '22023', message = 'display_name_too_long';
  end if;
  if exists (
    select 1
    from unnest(normalized_departments) requested(slug)
    left join public.patrimonio_departments department
      on department.slug = requested.slug and department.active
    where department.slug is null
  ) then
    raise exception using errcode = '22023', message = 'invalid_department';
  end if;

  insert into public.patrimonio_users (
    identifier, display_name, is_admin, active
  ) values (
    target_identifier,
    trim(coalesce(p_display_name, '')),
    coalesce(p_is_admin, false),
    true
  )
  on conflict (identifier) do update
  set display_name = excluded.display_name,
      is_admin = excluded.is_admin,
      active = true,
      updated_at = now();

  delete from public.patrimonio_department_memberships
  where user_identifier = target_identifier
    and not (department_slug = any(normalized_departments));

  insert into public.patrimonio_department_memberships (
    user_identifier, department_slug
  )
  select target_identifier, requested.slug
  from unnest(normalized_departments) requested(slug)
  on conflict (user_identifier, department_slug) do nothing;
end;
$function$;

create or replace function public.patrimonio_transfer_department_entity(
  p_admin_identifier text,
  p_source_department_slug text,
  p_target_department_slug text,
  p_expected_source_revision bigint,
  p_expected_target_revision bigint,
  p_entity_type text,
  p_entity_id text,
  p_target_nucleus_id text,
  p_target_location text,
  p_target_assignee text,
  p_note text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  admin_identifier text := lower(trim(p_admin_identifier));
  source_owner_key text;
  target_owner_key text;
  source_department_name text;
  target_department_name text;
  source_revision bigint;
  target_revision bigint;
  target_nucleus_name text;
  transferred_asset_codes text[];
  transferred_asset_count integer := 0;
  entity_label text;
  collaborator_name text;
  asset_record public.patrimonio_assets%rowtype;
begin
  if not exists (
    select 1
    from public.patrimonio_users
    where identifier = admin_identifier
      and active
      and is_admin
  ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if p_source_department_slug = p_target_department_slug then
    raise exception using errcode = '22023', message = 'same_department';
  end if;
  if p_entity_type not in ('asset', 'collaborator') then
    raise exception using errcode = '22023', message = 'invalid_transfer_entity';
  end if;
  if length(trim(coalesce(p_target_location, ''))) = 0
    or length(trim(p_target_location)) > 180 then
    raise exception using errcode = '22023', message = 'invalid_target_location';
  end if;
  if length(trim(coalesce(p_target_assignee, ''))) > 180 then
    raise exception using errcode = '22023', message = 'invalid_target_assignee';
  end if;
  if length(trim(coalesce(p_note, ''))) = 0
    or length(trim(p_note)) > 500 then
    raise exception using errcode = '22023', message = 'invalid_transfer_note';
  end if;

  select owner_key, name
  into source_owner_key, source_department_name
  from public.patrimonio_departments
  where slug = p_source_department_slug and active;

  select owner_key, name
  into target_owner_key, target_department_name
  from public.patrimonio_departments
  where slug = p_target_department_slug and active;

  if source_owner_key is null or target_owner_key is null then
    raise exception using errcode = 'P0002', message = 'department_not_found';
  end if;

  perform 1
  from public.patrimonio_workspaces
  where owner_key in (source_owner_key, target_owner_key)
  order by owner_key
  for update;

  select revision into source_revision
  from public.patrimonio_workspaces
  where owner_key = source_owner_key;

  select revision into target_revision
  from public.patrimonio_workspaces
  where owner_key = target_owner_key;

  if source_revision <> p_expected_source_revision
    or target_revision <> p_expected_target_revision then
    raise exception using errcode = '40001', message = 'revision_conflict';
  end if;

  select name into target_nucleus_name
  from public.patrimonio_nuclei
  where owner_key = target_owner_key
    and id = p_target_nucleus_id;

  if target_nucleus_name is null then
    raise exception using errcode = '23503', message = 'target_nucleus_not_found';
  end if;

  if p_entity_type = 'asset' then
    select *
    into asset_record
    from public.patrimonio_assets
    where owner_key = source_owner_key
      and code = trim(p_entity_id)
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'asset_not_found';
    end if;
    if exists (
      select 1
      from public.patrimonio_assets
      where owner_key = target_owner_key
        and code = asset_record.code
    ) then
      raise exception using errcode = '23505', message = 'target_asset_code_exists';
    end if;

    entity_label := asset_record.code::text || ' · ' || asset_record.brand_model;
    transferred_asset_codes := array[asset_record.code::text];
    transferred_asset_count := 1;

    update public.patrimonio_assets
    set owner_key = target_owner_key,
        nucleus_id = p_target_nucleus_id,
        location = trim(p_target_location),
        assignee = trim(coalesce(p_target_assignee, '')),
        status = case
          when status = 'available' and length(trim(coalesce(p_target_assignee, ''))) > 0
            then 'allocated'
          else status
        end,
        updated_at = now()
    where owner_key = source_owner_key
      and code = asset_record.code;

    insert into public.patrimonio_movements (
      owner_key, asset_code, type, actor, from_label, to_label, note
    ) values (
      target_owner_key,
      asset_record.code,
      'department_transfer',
      'google:' || admin_identifier,
      source_department_name || ' · ' || asset_record.location,
      target_department_name || ' · ' || target_nucleus_name || ' · ' || trim(p_target_location),
      trim(p_note)
    );
  else
    select name
    into collaborator_name
    from public.patrimonio_collaborators
    where owner_key = source_owner_key
      and id = trim(p_entity_id)
    for update;

    if collaborator_name is null then
      raise exception using errcode = 'P0002', message = 'collaborator_not_found';
    end if;
    if exists (
      select 1
      from public.patrimonio_collaborators
      where owner_key = target_owner_key
        and (
          id = trim(p_entity_id)
          or lower(trim(name)) = lower(trim(collaborator_name))
        )
    ) then
      raise exception using errcode = '23505', message = 'target_collaborator_exists';
    end if;
    if exists (
      select 1
      from public.patrimonio_assets source_asset
      join public.patrimonio_assets target_asset
        on target_asset.owner_key = target_owner_key
        and target_asset.code = source_asset.code
      where source_asset.owner_key = source_owner_key
        and lower(trim(source_asset.assignee)) = lower(trim(collaborator_name))
    ) then
      raise exception using errcode = '23505', message = 'target_asset_code_exists';
    end if;

    select coalesce(array_agg(code::text order by code), array[]::text[])
    into transferred_asset_codes
    from public.patrimonio_assets
    where owner_key = source_owner_key
      and lower(trim(assignee)) = lower(trim(collaborator_name));

    transferred_asset_count := cardinality(transferred_asset_codes);
    entity_label := collaborator_name;

    update public.patrimonio_assets
    set owner_key = target_owner_key,
        nucleus_id = p_target_nucleus_id,
        location = trim(p_target_location),
        assignee = collaborator_name,
        status = case when status = 'available' then 'allocated' else status end,
        updated_at = now()
    where owner_key = source_owner_key
      and lower(trim(assignee)) = lower(trim(collaborator_name));

    insert into public.patrimonio_movements (
      owner_key, asset_code, type, actor, from_label, to_label, note
    )
    select
      target_owner_key,
      code,
      'department_transfer',
      'google:' || admin_identifier,
      source_department_name || ' · ' || collaborator_name,
      target_department_name || ' · ' || target_nucleus_name || ' · ' || collaborator_name,
      trim(p_note)
    from public.patrimonio_assets
    where owner_key = target_owner_key
      and code::text = any(transferred_asset_codes);

    update public.patrimonio_collaborators
    set owner_key = target_owner_key,
        nucleus_id = p_target_nucleus_id,
        updated_at = now()
    where owner_key = source_owner_key
      and id = trim(p_entity_id);
  end if;

  insert into public.patrimonio_department_transfers (
    source_department_slug,
    target_department_slug,
    entity_type,
    entity_id,
    entity_label,
    asset_codes,
    actor,
    note
  ) values (
    p_source_department_slug,
    p_target_department_slug,
    p_entity_type,
    trim(p_entity_id),
    entity_label,
    to_jsonb(transferred_asset_codes),
    'google:' || admin_identifier,
    trim(p_note)
  );

  update public.patrimonio_workspaces
  set revision = revision + 1, updated_at = now()
  where owner_key = source_owner_key
  returning revision into source_revision;

  update public.patrimonio_workspaces
  set revision = revision + 1, updated_at = now()
  where owner_key = target_owner_key
  returning revision into target_revision;

  return jsonb_build_object(
    'sourceRevision', source_revision,
    'targetRevision', target_revision,
    'transferredAssets', transferred_asset_count,
    'targetDepartmentSlug', p_target_department_slug
  );
end;
$function$;

revoke all on function public.patrimonio_save_user_access(text, text, text, boolean, text[])
  from public, anon, authenticated;
revoke all on function public.patrimonio_transfer_department_entity(
  text, text, text, bigint, bigint, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.patrimonio_save_user_access(
  text, text, text, boolean, text[]
) to service_role;
grant execute on function public.patrimonio_transfer_department_entity(
  text, text, text, bigint, bigint, text, text, text, text, text, text
) to service_role;

commit;
