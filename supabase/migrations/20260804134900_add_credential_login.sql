begin;

set local lock_timeout = '5s';

alter table public.patrimonio_users
  add column username varchar(32),
  add column auth_user_id uuid references auth.users(id) on delete set null,
  add column credentials_updated_at timestamptz,
  add constraint patrimonio_users_username_check
    check (
      username is null
      or (
        username = lower(trim(username))
        and username ~ '^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$'
      )
    );

create unique index patrimonio_users_username_key
  on public.patrimonio_users (username)
  where username is not null;

create unique index patrimonio_users_auth_user_key
  on public.patrimonio_users (auth_user_id)
  where auth_user_id is not null;

create or replace function public.patrimonio_resolve_credential_login(
  p_login text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  normalized_login text := lower(trim(coalesce(p_login, '')));
  result jsonb;
begin
  if length(normalized_login) < 3
    or length(normalized_login) > 254
    or normalized_login ~ '[[:space:]]' then
    return null;
  end if;

  select jsonb_build_object(
    'identifier', app_user.identifier,
    'displayName', app_user.display_name,
    'active', app_user.active,
    'sessionVersion', app_user.session_version,
    'authUserId', app_user.auth_user_id
  )
  into result
  from public.patrimonio_users app_user
  where app_user.identifier = normalized_login
     or app_user.username = normalized_login
  limit 1;

  return result;
end;
$function$;

create or replace function public.patrimonio_set_user_credentials(
  p_admin_identifier text,
  p_target_identifier text,
  p_username text,
  p_auth_user_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  normalized_admin text := lower(trim(coalesce(p_admin_identifier, '')));
  normalized_target text := lower(trim(coalesce(p_target_identifier, '')));
  normalized_username text := nullif(lower(trim(coalesce(p_username, ''))), '');
  admin_user public.patrimonio_users%rowtype;
  target_user public.patrimonio_users%rowtype;
begin
  select * into admin_user
  from public.patrimonio_users
  where identifier = normalized_admin;

  if not found or not admin_user.active or not admin_user.is_admin then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  select * into target_user
  from public.patrimonio_users
  where identifier = normalized_target;

  if not found then
    raise exception using errcode = 'P0002', message = 'credential_user_not_found';
  end if;

  if p_enabled then
    if p_auth_user_id is null then
      raise exception using errcode = '22023', message = 'credential_identity_required';
    end if;
    if normalized_username is not null
      and normalized_username !~ '^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$' then
      raise exception using errcode = '22023', message = 'invalid_credential_username';
    end if;
    if exists (
      select 1 from public.patrimonio_users
      where username = normalized_username
        and identifier <> normalized_target
    ) then
      raise exception using errcode = '23505', message = 'credential_username_exists';
    end if;
    if exists (
      select 1 from public.patrimonio_users
      where auth_user_id = p_auth_user_id
        and identifier <> normalized_target
    ) then
      raise exception using errcode = '23505', message = 'credential_identity_exists';
    end if;
  else
    normalized_username := null;
    p_auth_user_id := null;
  end if;

  update public.patrimonio_users
  set username = normalized_username,
      auth_user_id = p_auth_user_id,
      credentials_updated_at = now(),
      session_version = session_version + 1,
      updated_at = now()
  where identifier = normalized_target
  returning * into target_user;

  perform public.patrimonio_record_security_event(
    case when p_enabled then 'credential_login_configured' else 'credential_login_disabled' end,
    'success',
    normalized_admin,
    normalized_target,
    null,
    jsonb_build_object('usernameConfigured', normalized_username is not null),
    1825
  );

  return jsonb_build_object(
    'identifier', target_user.identifier,
    'username', target_user.username,
    'hasCredentials', target_user.auth_user_id is not null,
    'sessionVersion', target_user.session_version
  );
end;
$function$;

update public.patrimonio_data_source_policies
set master_system = 'Google OIDC + Supabase Auth + administracao interna',
    owned_fields = array[
      'login_identifier',
      'username',
      'password_verification',
      'display_name',
      'department_access',
      'role_permissions',
      'session_version'
    ],
    scope_note = 'Google ou Supabase Auth comprovam a identidade. Senhas ficam exclusivamente no Supabase Auth; departamentos, perfis e permissoes continuam no Patrimonio Ops.',
    updated_at = now()
where domain_key = 'access_identity';

revoke all on function public.patrimonio_resolve_credential_login(text)
  from public, anon, authenticated;
revoke all on function public.patrimonio_set_user_credentials(text, text, text, uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.patrimonio_resolve_credential_login(text)
  to service_role;
grant execute on function public.patrimonio_set_user_credentials(text, text, text, uuid, boolean)
  to service_role;

commit;
