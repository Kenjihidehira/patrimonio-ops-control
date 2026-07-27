-- LGPD security controls applied to production on 2026-07-27.
begin;

set local lock_timeout = '5s';

alter table public.patrimonio_users
  add column can_write boolean not null default false,
  add column can_import boolean not null default false,
  add column can_export boolean not null default false,
  add column session_version bigint not null default 1
    check (session_version > 0),
  add column deactivated_at timestamptz,
  add column last_login_at timestamptz;

update public.patrimonio_users
set can_write = true,
    can_import = true,
    can_export = true
where is_admin;

create table public.patrimonio_security_events (
  id uuid primary key default gen_random_uuid(),
  event_type varchar(60) not null,
  outcome varchar(20) not null default 'success',
  actor_identifier varchar(254),
  target_identifier varchar(254),
  department_slug varchar(60)
    references public.patrimonio_departments(slug)
    on update cascade on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint patrimonio_security_events_type_check
    check (event_type ~ '^[a-z][a-z0-9_]{2,59}$'),
  constraint patrimonio_security_events_outcome_check
    check (outcome in ('success', 'denied', 'failure')),
  constraint patrimonio_security_events_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

create index patrimonio_security_events_occurred_idx
  on public.patrimonio_security_events (occurred_at desc);
create index patrimonio_security_events_actor_idx
  on public.patrimonio_security_events (actor_identifier, occurred_at desc)
  where actor_identifier is not null;
create index patrimonio_security_events_expiry_idx
  on public.patrimonio_security_events (expires_at);

create table public.patrimonio_request_limits (
  identifier varchar(254) not null,
  operation varchar(60) not null,
  bucket_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (identifier, operation, bucket_start),
  constraint patrimonio_request_limits_operation_check
    check (operation ~ '^[a-z][a-z0-9_]{2,59}$')
);

create table public.patrimonio_maintenance_state (
  task_name varchar(60) primary key,
  last_run_at timestamptz not null
);

create table public.patrimonio_gateway_nonces (
  nonce varchar(80) primary key,
  expires_at timestamptz not null
);

alter table public.patrimonio_security_events enable row level security;
alter table public.patrimonio_request_limits enable row level security;
alter table public.patrimonio_maintenance_state enable row level security;
alter table public.patrimonio_gateway_nonces enable row level security;

create policy patrimonio_security_events_no_direct_access
  on public.patrimonio_security_events for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_request_limits_no_direct_access
  on public.patrimonio_request_limits for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_maintenance_state_no_direct_access
  on public.patrimonio_maintenance_state for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_gateway_nonces_no_direct_access
  on public.patrimonio_gateway_nonces for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.patrimonio_security_events from anon, authenticated;
revoke all on table public.patrimonio_request_limits from anon, authenticated;
revoke all on table public.patrimonio_maintenance_state from anon, authenticated;
revoke all on table public.patrimonio_gateway_nonces from anon, authenticated;

grant all on table public.patrimonio_security_events to service_role;
grant all on table public.patrimonio_request_limits to service_role;
grant all on table public.patrimonio_maintenance_state to service_role;
grant all on table public.patrimonio_gateway_nonces to service_role;

create or replace function public.patrimonio_apply_retention()
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  should_run boolean;
begin
  insert into public.patrimonio_maintenance_state (task_name, last_run_at)
  values ('technical_retention', '-infinity'::timestamptz)
  on conflict (task_name) do nothing;

  update public.patrimonio_maintenance_state
  set last_run_at = now()
  where task_name = 'technical_retention'
    and last_run_at < now() - interval '1 day'
  returning true into should_run;

  if not coalesce(should_run, false) then
    return false;
  end if;

  delete from public.patrimonio_request_limits
  where bucket_start < now() - interval '2 days';

  delete from public.patrimonio_gateway_nonces
  where expires_at < now();

  delete from public.patrimonio_security_events
  where expires_at < now();

  return true;
end;
$function$;

create or replace function public.patrimonio_consume_gateway_nonce(
  p_nonce text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if p_nonce !~ '^[A-Za-z0-9_-]{16,80}$'
    or p_expires_at <= now()
    or p_expires_at > now() + interval '10 minutes' then
    return false;
  end if;

  insert into public.patrimonio_gateway_nonces (nonce, expires_at)
  values (p_nonce, p_expires_at)
  on conflict (nonce) do nothing;

  return found;
end;
$function$;

create or replace function public.patrimonio_consume_rate_limit(
  p_identifier text,
  p_operation text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  normalized_identifier text := lower(trim(coalesce(p_identifier, '')));
  normalized_operation text := lower(trim(coalesce(p_operation, '')));
  current_bucket timestamptz;
  next_count integer;
begin
  if normalized_identifier !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or normalized_operation !~ '^[a-z][a-z0-9_]{2,59}$'
    or p_limit < 1
    or p_limit > 10000
    or p_window_seconds < 1
    or p_window_seconds > 86400 then
    return false;
  end if;

  current_bucket := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds)
    * p_window_seconds
  );

  insert into public.patrimonio_request_limits (
    identifier, operation, bucket_start, request_count
  ) values (
    normalized_identifier, normalized_operation, current_bucket, 1
  )
  on conflict (identifier, operation, bucket_start) do update
  set request_count = public.patrimonio_request_limits.request_count + 1
  returning request_count into next_count;

  perform public.patrimonio_apply_retention();
  return next_count <= p_limit;
end;
$function$;

create or replace function public.patrimonio_record_security_event(
  p_event_type text,
  p_outcome text,
  p_actor_identifier text default null,
  p_target_identifier text default null,
  p_department_slug text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_retention_days integer default 1825
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  event_id uuid;
  normalized_actor text := nullif(lower(trim(coalesce(p_actor_identifier, ''))), '');
  normalized_target text := nullif(lower(trim(coalesce(p_target_identifier, ''))), '');
  normalized_department text := nullif(lower(trim(coalesce(p_department_slug, ''))), '');
begin
  if p_event_type !~ '^[a-z][a-z0-9_]{2,59}$'
    or p_outcome not in ('success', 'denied', 'failure')
    or p_retention_days < 1
    or p_retention_days > 3650
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_security_event';
  end if;

  if normalized_actor is not null
    and normalized_actor !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    normalized_actor := null;
  end if;
  if normalized_target is not null
    and normalized_target !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    normalized_target := null;
  end if;
  if normalized_department is not null
    and not exists (
      select 1 from public.patrimonio_departments
      where slug = normalized_department
    ) then
    normalized_department := null;
  end if;

  insert into public.patrimonio_security_events (
    event_type,
    outcome,
    actor_identifier,
    target_identifier,
    department_slug,
    metadata,
    expires_at
  ) values (
    p_event_type,
    p_outcome,
    normalized_actor,
    normalized_target,
    normalized_department,
    coalesce(p_metadata, '{}'::jsonb),
    now() + make_interval(days => p_retention_days)
  )
  returning id into event_id;

  if p_event_type = 'login_succeeded' and normalized_actor is not null then
    update public.patrimonio_users
    set last_login_at = now(), updated_at = now()
    where identifier = normalized_actor;
  end if;

  return event_id;
end;
$function$;

create or replace function public.patrimonio_authorize_operation(
  p_identifier text,
  p_department_slug text,
  p_operation text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  normalized_identifier text := lower(trim(coalesce(p_identifier, '')));
  normalized_department text := lower(trim(coalesce(p_department_slug, '')));
  normalized_operation text := lower(trim(coalesce(p_operation, '')));
  app_user public.patrimonio_users%rowtype;
  allowed boolean := false;
begin
  if normalized_operation not in ('read', 'write', 'import', 'export', 'admin') then
    raise exception using errcode = '22023', message = 'invalid_operation';
  end if;

  select *
  into app_user
  from public.patrimonio_users
  where identifier = normalized_identifier
    and active;

  if not found then
    raise exception using errcode = '42501', message = 'user_not_authorized';
  end if;

  if not exists (
    select 1
    from public.patrimonio_departments
    where slug = normalized_department
      and active
  ) then
    raise exception using errcode = '42501', message = 'department_not_authorized';
  end if;

  if not app_user.is_admin
    and not exists (
      select 1
      from public.patrimonio_department_memberships
      where user_identifier = normalized_identifier
        and department_slug = normalized_department
    ) then
    raise exception using errcode = '42501', message = 'department_not_authorized';
  end if;

  allowed := app_user.is_admin
    or normalized_operation = 'read'
    or (normalized_operation = 'write' and app_user.can_write)
    or (normalized_operation = 'import' and app_user.can_import)
    or (normalized_operation = 'export' and app_user.can_export);

  if normalized_operation = 'admin' then
    allowed := app_user.is_admin;
  end if;

  if not allowed then
    perform public.patrimonio_record_security_event(
      'operation_denied',
      'denied',
      normalized_identifier,
      null,
      normalized_department,
      jsonb_build_object('operation', normalized_operation),
      730
    );
    raise exception using errcode = '42501', message = 'operation_not_allowed';
  end if;

  if normalized_operation in ('export', 'import') then
    perform public.patrimonio_record_security_event(
      normalized_operation || '_authorized',
      'success',
      normalized_identifier,
      null,
      normalized_department,
      '{}'::jsonb,
      1825
    );
  end if;

  return jsonb_build_object(
    'departmentSlug', normalized_department,
    'canWrite', app_user.is_admin or app_user.can_write,
    'canImport', app_user.is_admin or app_user.can_import,
    'canExport', app_user.is_admin or app_user.can_export,
    'isAdmin', app_user.is_admin,
    'sessionVersion', app_user.session_version
  );
end;
$function$;

create or replace function public.patrimonio_save_user_access_v2(
  p_admin_identifier text,
  p_identifier text,
  p_display_name text,
  p_is_admin boolean,
  p_active boolean,
  p_can_write boolean,
  p_can_import boolean,
  p_can_export boolean,
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
  target_active boolean := coalesce(p_active, false);
  target_is_admin boolean := target_active and coalesce(p_is_admin, false);
  target_can_write boolean := target_active and (target_is_admin or coalesce(p_can_write, false));
  target_can_import boolean := target_active and (target_is_admin or coalesce(p_can_import, false));
  target_can_export boolean := target_active and (target_is_admin or coalesce(p_can_export, false));
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
  if target_identifier = admin_identifier
    and (not target_active or not target_is_admin) then
    raise exception using errcode = '22023', message = 'cannot_remove_own_admin';
  end if;
  if length(trim(coalesce(p_display_name, ''))) > 180 then
    raise exception using errcode = '22023', message = 'display_name_too_long';
  end if;
  if target_active and not target_is_admin and cardinality(normalized_departments) = 0 then
    raise exception using errcode = '22023', message = 'no_department_access';
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
    identifier,
    display_name,
    is_admin,
    active,
    can_write,
    can_import,
    can_export,
    deactivated_at
  ) values (
    target_identifier,
    trim(coalesce(p_display_name, '')),
    target_is_admin,
    target_active,
    target_can_write,
    target_can_import,
    target_can_export,
    case when target_active then null else now() end
  )
  on conflict (identifier) do update
  set display_name = excluded.display_name,
      is_admin = excluded.is_admin,
      active = excluded.active,
      can_write = excluded.can_write,
      can_import = excluded.can_import,
      can_export = excluded.can_export,
      deactivated_at = excluded.deactivated_at,
      session_version = public.patrimonio_users.session_version + 1,
      updated_at = now();

  delete from public.patrimonio_department_memberships
  where user_identifier = target_identifier
    and (
      not target_active
      or not (department_slug = any(normalized_departments))
    );

  if target_active then
    insert into public.patrimonio_department_memberships (
      user_identifier, department_slug
    )
    select target_identifier, requested.slug
    from unnest(normalized_departments) requested(slug)
    on conflict (user_identifier, department_slug) do nothing;
  end if;

  perform public.patrimonio_record_security_event(
    case when target_active then 'access_updated' else 'user_deactivated' end,
    'success',
    admin_identifier,
    target_identifier,
    null,
    jsonb_build_object(
      'isAdmin', target_is_admin,
      'canWrite', target_can_write,
      'canImport', target_can_import,
      'canExport', target_can_export,
      'departments', to_jsonb(normalized_departments)
    ),
    1825
  );
end;
$function$;

create or replace function public.patrimonio_minimize_actor()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  raw_actor text;
  actor_identifier text;
  actor_label text;
begin
  raw_actor := new.actor;

  if raw_actor not like 'google:%' then
    return new;
  end if;

  actor_identifier := lower(trim(substring(raw_actor from 8)));
  select nullif(trim(display_name), '')
  into actor_label
  from public.patrimonio_users
  where identifier = actor_identifier;

  actor_label := coalesce(actor_label, 'Usuário autorizado');
  new.actor := actor_label;
  return new;
end;
$function$;

create or replace function public.patrimonio_minimize_import_actor()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  actor_identifier text;
  actor_label text;
begin
  if new.imported_by not like 'google:%' then
    return new;
  end if;

  actor_identifier := lower(trim(substring(new.imported_by from 8)));
  select nullif(trim(display_name), '')
  into actor_label
  from public.patrimonio_users
  where identifier = actor_identifier;

  new.imported_by := coalesce(actor_label, 'Usuário autorizado');
  return new;
end;
$function$;

drop function public.patrimonio_save_user_access(
  text, text, text, boolean, text[]
);

create trigger patrimonio_movements_minimize_actor
before insert or update of actor on public.patrimonio_movements
for each row execute function public.patrimonio_minimize_actor();

create trigger patrimonio_import_runs_minimize_actor
before insert or update of imported_by on public.patrimonio_import_runs
for each row execute function public.patrimonio_minimize_import_actor();

create trigger patrimonio_department_transfers_minimize_actor
before insert or update of actor on public.patrimonio_department_transfers
for each row execute function public.patrimonio_minimize_actor();

update public.patrimonio_movements movement
set actor = coalesce(nullif(trim(app_user.display_name), ''), 'Usuário autorizado')
from public.patrimonio_users app_user
where movement.actor = 'google:' || app_user.identifier;

update public.patrimonio_movements
set actor = 'Usuário autorizado'
where actor like 'google:%';

update public.patrimonio_import_runs import_run
set imported_by = coalesce(nullif(trim(app_user.display_name), ''), 'Usuário autorizado')
from public.patrimonio_users app_user
where import_run.imported_by = 'google:' || app_user.identifier;

update public.patrimonio_import_runs
set imported_by = 'Usuário autorizado'
where imported_by like 'google:%';

update public.patrimonio_department_transfers transfer
set actor = coalesce(nullif(trim(app_user.display_name), ''), 'Usuário autorizado')
from public.patrimonio_users app_user
where transfer.actor = 'google:' || app_user.identifier;

update public.patrimonio_department_transfers
set actor = 'Usuário autorizado'
where actor like 'google:%';

revoke all on function public.patrimonio_apply_retention()
  from public, anon, authenticated;
revoke all on function public.patrimonio_consume_gateway_nonce(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.patrimonio_consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.patrimonio_record_security_event(
  text, text, text, text, text, jsonb, integer
) from public, anon, authenticated;
revoke all on function public.patrimonio_authorize_operation(text, text, text)
  from public, anon, authenticated;
revoke all on function public.patrimonio_save_user_access_v2(
  text, text, text, boolean, boolean, boolean, boolean, boolean, text[]
) from public, anon, authenticated;
revoke all on function public.patrimonio_minimize_actor()
  from public, anon, authenticated;
revoke all on function public.patrimonio_minimize_import_actor()
  from public, anon, authenticated;

grant execute on function public.patrimonio_apply_retention()
  to service_role;
grant execute on function public.patrimonio_consume_gateway_nonce(text, timestamptz)
  to service_role;
grant execute on function public.patrimonio_consume_rate_limit(text, text, integer, integer)
  to service_role;
grant execute on function public.patrimonio_record_security_event(
  text, text, text, text, text, jsonb, integer
) to service_role;
grant execute on function public.patrimonio_authorize_operation(text, text, text)
  to service_role;
grant execute on function public.patrimonio_save_user_access_v2(
  text, text, text, boolean, boolean, boolean, boolean, boolean, text[]
) to service_role;

commit;
