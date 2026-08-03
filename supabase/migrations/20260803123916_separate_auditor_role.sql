begin;

alter table public.patrimonio_users
  add column is_auditor boolean not null default false;

alter table public.patrimonio_users
  add constraint patrimonio_users_auditor_read_only_check
  check (
    not is_auditor
    or (
      not is_admin
      and not can_write
      and not can_import
    )
  );

comment on column public.patrimonio_users.is_auditor is
  'Perfil de auditoria: leitura nos departamentos vinculados e exportacao controlada, sem administracao, escrita ou importacao.';

create index patrimonio_users_auditor_active_idx
  on public.patrimonio_users (is_auditor, active)
  where is_auditor;

insert into public.patrimonio_users (
  identifier,
  display_name,
  is_admin,
  is_auditor,
  active,
  can_write,
  can_import,
  can_export
) values (
  'fabiano.audit@gmail.com',
  'Fabiano - Auditoria',
  false,
  true,
  true,
  false,
  false,
  true
)
on conflict (identifier) do update
set is_admin = false,
    is_auditor = true,
    active = true,
    can_write = false,
    can_import = false,
    can_export = true,
    deactivated_at = null,
    session_version = public.patrimonio_users.session_version + 1,
    updated_at = now();

insert into public.patrimonio_department_memberships (
  user_identifier,
  department_slug
)
select 'fabiano.audit@gmail.com', department.slug
from public.patrimonio_departments department
where department.active
on conflict (user_identifier, department_slug) do nothing;

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
      jsonb_build_object(
        'operation', normalized_operation,
        'role', case
          when app_user.is_admin then 'admin'
          when app_user.is_auditor then 'auditor'
          else 'operator'
        end
      ),
      730
    );
    raise exception using errcode = '42501', message = 'operation_not_allowed';
  end if;

  if normalized_operation = 'export' then
    perform public.patrimonio_record_security_event(
      'export_authorized',
      'success',
      normalized_identifier,
      null,
      normalized_department,
      jsonb_build_object(
        'role', case
          when app_user.is_admin then 'admin'
          when app_user.is_auditor then 'auditor'
          else 'operator'
        end
      ),
      1825
    );
  elsif normalized_operation = 'import' then
    perform public.patrimonio_record_security_event(
      'import_authorized',
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
    'isAuditor', app_user.is_auditor,
    'sessionVersion', app_user.session_version
  );
end;
$function$;

create or replace function public.patrimonio_save_user_access_v3(
  p_admin_identifier text,
  p_identifier text,
  p_display_name text,
  p_is_admin boolean,
  p_is_auditor boolean,
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
  target_is_auditor boolean := target_active
    and not target_is_admin
    and coalesce(p_is_auditor, false);
  target_can_write boolean := target_active
    and (target_is_admin or (not target_is_auditor and coalesce(p_can_write, false)));
  target_can_import boolean := target_active
    and (target_is_admin or (not target_is_auditor and coalesce(p_can_import, false)));
  target_can_export boolean := target_active
    and (target_is_admin or target_is_auditor or coalesce(p_can_export, false));
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
    is_auditor,
    active,
    can_write,
    can_import,
    can_export,
    deactivated_at
  ) values (
    target_identifier,
    trim(coalesce(p_display_name, '')),
    target_is_admin,
    target_is_auditor,
    target_active,
    target_can_write,
    target_can_import,
    target_can_export,
    case when target_active then null else now() end
  )
  on conflict (identifier) do update
  set display_name = excluded.display_name,
      is_admin = excluded.is_admin,
      is_auditor = excluded.is_auditor,
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
      user_identifier,
      department_slug
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
      'role', case
        when target_is_admin then 'admin'
        when target_is_auditor then 'auditor'
        else 'operator'
      end,
      'isAdmin', target_is_admin,
      'isAuditor', target_is_auditor,
      'canWrite', target_can_write,
      'canImport', target_can_import,
      'canExport', target_can_export,
      'departments', to_jsonb(normalized_departments)
    ),
    1825
  );
end;
$function$;

revoke all on function public.patrimonio_save_user_access_v3(
  text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text[]
) from public, anon, authenticated;

grant execute on function public.patrimonio_save_user_access_v3(
  text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text[]
) to service_role;

commit;
