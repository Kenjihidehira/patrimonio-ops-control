begin;

set local lock_timeout = '5s';

create table public.patrimonio_access_requests (
  id uuid primary key default gen_random_uuid(),
  identifier varchar(254) not null,
  username varchar(32),
  display_name varchar(180) not null default '',
  auth_user_id uuid references auth.users(id) on delete set null,
  justification varchar(400) not null default '',
  status varchar(12) not null default 'pending',
  review_note varchar(400) not null default '',
  reviewed_by varchar(254),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint patrimonio_access_requests_identifier_check
    check (
      identifier = lower(trim(identifier))
      and identifier ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint patrimonio_access_requests_username_check
    check (
      username is null
      or (
        username = lower(trim(username))
        and username ~ '^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$'
      )
    ),
  constraint patrimonio_access_requests_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint patrimonio_access_requests_review_check
    check (
      (status = 'pending' and reviewed_by is null and reviewed_at is null)
      or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
    )
);

create unique index patrimonio_access_requests_pending_identifier_key
  on public.patrimonio_access_requests (identifier)
  where status = 'pending';

create unique index patrimonio_access_requests_pending_username_key
  on public.patrimonio_access_requests (username)
  where status = 'pending' and username is not null;

create index patrimonio_access_requests_status_created_idx
  on public.patrimonio_access_requests (status, created_at desc);

alter table public.patrimonio_access_requests enable row level security;

create policy patrimonio_access_requests_no_direct_access
  on public.patrimonio_access_requests for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.patrimonio_access_requests from anon, authenticated;
grant all on table public.patrimonio_access_requests to service_role;

-- Registra uma solicitacao de acesso feita pelo proprio interessado na tela de login.
-- A senha nunca chega ate aqui: ela fica exclusivamente no Supabase Auth, e a
-- identidade criada permanece inerte enquanto nao existir usuario autorizado.
create or replace function public.patrimonio_register_access_request(
  p_identifier text,
  p_username text,
  p_display_name text,
  p_justification text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  normalized_identifier text := lower(trim(coalesce(p_identifier, '')));
  normalized_username text := nullif(lower(trim(coalesce(p_username, ''))), '');
  normalized_name text := trim(coalesce(p_display_name, ''));
  normalized_justification text := trim(coalesce(p_justification, ''));
  created_request public.patrimonio_access_requests%rowtype;
begin
  if normalized_identifier !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(normalized_identifier) > 254 then
    raise exception using errcode = '22023', message = 'invalid_user_identifier';
  end if;
  if normalized_username is null
    or normalized_username !~ '^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$' then
    raise exception using errcode = '22023', message = 'invalid_credential_username';
  end if;
  if length(normalized_name) = 0 or length(normalized_name) > 180 then
    raise exception using errcode = '22023', message = 'invalid_display_name';
  end if;
  if length(normalized_justification) > 400 then
    raise exception using errcode = '22023', message = 'invalid_justification';
  end if;

  if exists (
    select 1 from public.patrimonio_users
    where identifier = normalized_identifier
       or username = normalized_username
  ) then
    raise exception using errcode = '23505', message = 'access_request_duplicate';
  end if;
  if exists (
    select 1 from public.patrimonio_access_requests
    where status = 'pending'
      and (identifier = normalized_identifier or username = normalized_username)
  ) then
    raise exception using errcode = '23505', message = 'access_request_duplicate';
  end if;

  insert into public.patrimonio_access_requests (
    identifier,
    username,
    display_name,
    auth_user_id,
    justification
  ) values (
    normalized_identifier,
    normalized_username,
    normalized_name,
    p_auth_user_id,
    normalized_justification
  )
  returning * into created_request;

  perform public.patrimonio_record_security_event(
    'access_request_submitted',
    'success',
    null,
    normalized_identifier,
    null,
    jsonb_build_object('requestId', created_request.id),
    1825
  );

  return jsonb_build_object(
    'id', created_request.id,
    'identifier', created_request.identifier,
    'status', created_request.status
  );
end;
$function$;

-- Aprova ou recusa a solicitacao. A aprovacao reaproveita as mesmas funcoes ja
-- auditadas de concessao de acesso e de vinculo de credencial.
create or replace function public.patrimonio_review_access_request(
  p_admin_identifier text,
  p_request_id uuid,
  p_decision text,
  p_review_note text,
  p_is_admin boolean,
  p_is_auditor boolean,
  p_can_write boolean,
  p_can_import boolean,
  p_can_export boolean,
  p_can_view_financial_data boolean,
  p_department_slugs text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  normalized_admin text := lower(trim(coalesce(p_admin_identifier, '')));
  normalized_decision text := lower(trim(coalesce(p_decision, '')));
  normalized_note text := trim(coalesce(p_review_note, ''));
  target_request public.patrimonio_access_requests%rowtype;
begin
  if not exists (
    select 1
    from public.patrimonio_users
    where identifier = normalized_admin
      and active
      and is_admin
  ) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if normalized_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'invalid_review_decision';
  end if;
  if length(normalized_note) > 400 then
    raise exception using errcode = '22023', message = 'invalid_review_note';
  end if;

  select * into target_request
  from public.patrimonio_access_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'access_request_not_found';
  end if;
  if target_request.status <> 'pending' then
    raise exception using errcode = '22023', message = 'access_request_already_reviewed';
  end if;

  if normalized_decision = 'approve' then
    perform public.patrimonio_save_user_access_v5(
      normalized_admin,
      target_request.identifier,
      target_request.display_name,
      coalesce(p_is_admin, false),
      coalesce(p_is_auditor, false),
      true,
      coalesce(p_can_write, false),
      coalesce(p_can_import, false),
      coalesce(p_can_export, false),
      coalesce(p_can_view_financial_data, false),
      coalesce(p_department_slugs, array[]::text[])
    );
    perform public.patrimonio_set_user_credentials(
      normalized_admin,
      target_request.identifier,
      target_request.username,
      target_request.auth_user_id,
      true
    );
  end if;

  update public.patrimonio_access_requests
  set status = case when normalized_decision = 'approve' then 'approved' else 'rejected' end,
      review_note = normalized_note,
      reviewed_by = normalized_admin,
      reviewed_at = now(),
      auth_user_id = case when normalized_decision = 'approve' then auth_user_id else null end
  where id = target_request.id
  returning * into target_request;

  perform public.patrimonio_record_security_event(
    case when normalized_decision = 'approve'
      then 'access_request_approved'
      else 'access_request_rejected'
    end,
    'success',
    normalized_admin,
    target_request.identifier,
    null,
    jsonb_build_object('requestId', target_request.id),
    1825
  );

  return jsonb_build_object(
    'id', target_request.id,
    'identifier', target_request.identifier,
    'status', target_request.status
  );
end;
$function$;

-- Descreve uma solicitacao pendente para o fluxo de login, permitindo distinguir
-- "aguardando aprovacao" de "credenciais invalidas" apos a senha ser conferida.
create or replace function public.patrimonio_resolve_pending_access_request(
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
    'id', request.id,
    'identifier', request.identifier,
    'authUserId', request.auth_user_id
  )
  into result
  from public.patrimonio_access_requests request
  where request.status = 'pending'
    and (request.identifier = normalized_login or request.username = normalized_login)
  limit 1;

  return result;
end;
$function$;

update public.patrimonio_data_source_policies
set scope_note = 'Google ou Supabase Auth comprovam a identidade. Senhas ficam exclusivamente no Supabase Auth; o autocadastro cria apenas uma solicitacao pendente e nenhum acesso e concedido sem aprovacao administrativa.',
    updated_at = now()
where domain_key = 'access_identity';

revoke all on function public.patrimonio_register_access_request(text, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.patrimonio_review_access_request(text, uuid, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text[])
  from public, anon, authenticated;
revoke all on function public.patrimonio_resolve_pending_access_request(text)
  from public, anon, authenticated;

grant execute on function public.patrimonio_register_access_request(text, text, text, text, uuid)
  to service_role;
grant execute on function public.patrimonio_review_access_request(text, uuid, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text[])
  to service_role;
grant execute on function public.patrimonio_resolve_pending_access_request(text)
  to service_role;

commit;
