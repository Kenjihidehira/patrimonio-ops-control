begin;

set local lock_timeout = '5s';

alter table public.patrimonio_users
  add column can_view_financial_data boolean not null default false;

update public.patrimonio_users
set can_view_financial_data = true
where is_admin;

alter table public.patrimonio_users
  add constraint patrimonio_users_admin_financial_access_check
  check (not is_admin or can_view_financial_data);

comment on column public.patrimonio_users.can_view_financial_data is
  'Permite consultar valores, dados contabeis, custos, notas fiscais e exportacoes financeiras. Administradores recebem a permissao obrigatoriamente.';

alter table public.patrimonio_asset_documents
  add column contains_financial_data boolean not null default false;

update public.patrimonio_asset_documents
set contains_financial_data = true
where category in ('invoice', 'contract', 'disposal');

create index patrimonio_asset_documents_financial_idx
  on public.patrimonio_asset_documents (owner_key, uploaded_at desc)
  where contains_financial_data and deleted_at is null;

comment on column public.patrimonio_asset_documents.contains_financial_data is
  'Classificacao obrigatoria para restringir documentos que contenham valores, notas, contratos ou dados contabeis.';

alter table public.patrimonio_custom_fields
  add column contains_financial_data boolean not null default false;

comment on column public.patrimonio_custom_fields.contains_financial_data is
  'Indica que os valores do campo personalizado exigem permissao financeira.';

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
  if normalized_operation not in ('read', 'write', 'import', 'export', 'export_financial', 'admin', 'financial') then
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
    and not app_user.is_auditor
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
    or (normalized_operation = 'export' and app_user.can_export)
    or (
      normalized_operation = 'export_financial'
      and app_user.can_export
      and app_user.can_view_financial_data
    )
    or (normalized_operation = 'financial' and app_user.can_view_financial_data);

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

  if normalized_operation in ('export', 'export_financial') then
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
        end,
        'includesFinancialData', normalized_operation = 'export_financial'
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
  elsif normalized_operation = 'financial' then
    perform public.patrimonio_record_security_event(
      'financial_data_accessed',
      'success',
      normalized_identifier,
      null,
      normalized_department,
      jsonb_build_object('surface', 'workspace'),
      1825
    );
  end if;

  return jsonb_build_object(
    'departmentSlug', normalized_department,
    'canWrite', app_user.is_admin or app_user.can_write,
    'canImport', app_user.is_admin or app_user.can_import,
    'canExport', app_user.is_admin or app_user.can_export,
    'canViewFinancialData', app_user.can_view_financial_data,
    'isAdmin', app_user.is_admin,
    'isAuditor', app_user.is_auditor,
    'sessionVersion', app_user.session_version
  );
end;
$function$;

create or replace function public.patrimonio_save_user_access_v5(
  p_admin_identifier text,
  p_identifier text,
  p_display_name text,
  p_is_admin boolean,
  p_is_auditor boolean,
  p_active boolean,
  p_can_write boolean,
  p_can_import boolean,
  p_can_export boolean,
  p_can_view_financial_data boolean,
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
  target_can_view_financial_data boolean := target_active
    and (target_is_admin or coalesce(p_can_view_financial_data, false));
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
  if target_active
    and not target_is_admin
    and not target_is_auditor
    and cardinality(normalized_departments) = 0 then
    raise exception using errcode = '22023', message = 'no_department_access';
  end if;
  if target_active
    and not target_is_admin
    and not target_is_auditor
    and exists (
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
    can_view_financial_data,
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
    target_can_view_financial_data,
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
      can_view_financial_data = excluded.can_view_financial_data,
      deactivated_at = excluded.deactivated_at,
      session_version = public.patrimonio_users.session_version + 1,
      updated_at = now();

  delete from public.patrimonio_department_memberships
  where user_identifier = target_identifier
    and (
      not target_active
      or target_is_admin
      or target_is_auditor
      or not (department_slug = any(normalized_departments))
    );

  if target_active and not target_is_admin and not target_is_auditor then
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
      'canViewFinancialData', target_can_view_financial_data,
      'departmentScope', case
        when target_is_admin or target_is_auditor then 'all_active'
        else 'explicit'
      end,
      'departments', case
        when target_is_admin or target_is_auditor then '[]'::jsonb
        else to_jsonb(normalized_departments)
      end
    ),
    1825
  );
end;
$function$;

create or replace function public.patrimonio_save_user_access_v4(
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
language sql
security invoker
set search_path = public, pg_temp
as $function$
  select public.patrimonio_save_user_access_v5(
    p_admin_identifier,
    p_identifier,
    p_display_name,
    p_is_admin,
    p_is_auditor,
    p_active,
    p_can_write,
    p_can_import,
    p_can_export,
    coalesce(p_is_admin, false),
    p_department_slugs
  );
$function$;

create or replace function public.patrimonio_load_advanced_context(
  p_owner_key text,
  p_actor_identifier text,
  p_is_admin boolean,
  p_can_view_financial_data boolean
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'assetDocuments', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.uploaded_at desc)
      from (
        select id, asset_code, category, file_name, mime_type, byte_size,
          checksum_sha256, note, uploaded_by, uploaded_at, retention_until,
          contains_financial_data
        from public.patrimonio_asset_documents
        where owner_key = p_owner_key
          and deleted_at is null
          and (
            not contains_financial_data
            or coalesce(p_can_view_financial_data, false)
          )
        order by uploaded_at desc
        limit 200
      ) item
    ), '[]'::jsonb),
    'assetContracts', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.updated_at desc)
      from (
        select id, asset_code, kind, name, provider, contract_number,
          starts_on, ends_on, renewal_notice_days,
          case when coalesce(p_can_view_financial_data, false) then monthly_cost else null end as monthly_cost,
          currency, status, document_id, notes, created_by, created_at,
          updated_by, updated_at
        from public.patrimonio_asset_contracts
        where owner_key = p_owner_key
        order by updated_at desc
        limit 200
      ) item
    ), '[]'::jsonb),
    'assetAccounting', case when coalesce(p_can_view_financial_data, false) then coalesce((
      select jsonb_agg(to_jsonb(item) order by item.asset_code)
      from (
        select asset_code, acquisition_value, residual_value, depreciation_method,
          useful_life_months, depreciation_starts_on, cost_center, ledger_account,
          supplier, purchase_order, invoice_number, updated_by, updated_at
        from public.patrimonio_asset_accounting
        where owner_key = p_owner_key
        order by asset_code
      ) item
    ), '[]'::jsonb) else '[]'::jsonb end,
    'assetKits', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select id, name, description, item_count, status, created_by, created_at,
          dissolved_by, dissolved_at
        from public.patrimonio_asset_kits
        where owner_key = p_owner_key
        order by created_at desc
        limit 100
      ) item
    ), '[]'::jsonb),
    'assetKitItems', coalesce((
      select jsonb_agg(to_jsonb(item))
      from (
        select kit_id, asset_code, added_at, released_at
        from public.patrimonio_asset_kit_items
        where owner_key = p_owner_key
          and kit_id in (
            select id from public.patrimonio_asset_kits
            where owner_key = p_owner_key order by created_at desc limit 100
          )
      ) item
    ), '[]'::jsonb),
    'reservations', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select id, requester_name,
          case when coalesce(p_is_admin, false) or requester_identifier = lower(trim(p_actor_identifier))
            then requester_identifier else '' end as requester_identifier,
          starts_at, ends_at, purpose, status, created_by, created_at,
          approved_by, approved_at, checked_out_at, returned_at, updated_by, updated_at
        from public.patrimonio_reservations
        where owner_key = p_owner_key
        order by created_at desc
        limit 100
      ) item
    ), '[]'::jsonb),
    'reservationAssets', coalesce((
      select jsonb_agg(to_jsonb(item))
      from (
        select reservation_id, asset_code
        from public.patrimonio_reservation_assets
        where owner_key = p_owner_key
          and reservation_id in (
            select id from public.patrimonio_reservations
            where owner_key = p_owner_key order by created_at desc limit 100
          )
      ) item
    ), '[]'::jsonb),
    'offboardingCases', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select id, collaborator_name,
          case when coalesce(p_is_admin, false) then collaborator_identifier else '' end as collaborator_identifier,
          due_at, status, notes, created_by, created_at, completed_by,
          completed_at, updated_at
        from public.patrimonio_offboarding_cases
        where owner_key = p_owner_key
        order by created_at desc
        limit 100
      ) item
    ), '[]'::jsonb),
    'offboardingAssets', coalesce((
      select jsonb_agg(to_jsonb(item))
      from (
        select case_id, asset_code, result, destination_assignee, note,
          checked_by, checked_at
        from public.patrimonio_offboarding_assets
        where owner_key = p_owner_key
          and case_id in (
            select id from public.patrimonio_offboarding_cases
            where owner_key = p_owner_key order by created_at desc limit 100
          )
      ) item
    ), '[]'::jsonb),
    'lifecycleRequests', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.requested_at desc)
      from (
        select id, request_type, asset_code, title, reason, quantity,
          case when coalesce(p_can_view_financial_data, false) then estimated_cost else null end as estimated_cost,
          status, requested_by, requested_at, decided_by, decided_at,
          decision_note, completed_at, updated_at
        from public.patrimonio_lifecycle_requests
        where owner_key = p_owner_key
        order by requested_at desc
        limit 200
      ) item
    ), '[]'::jsonb),
    'customFields', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.name)
      from (
        select id, name, field_type, options, required, active,
          contains_financial_data, created_by, created_at
        from public.patrimonio_custom_fields
        where owner_key = p_owner_key
          and active
          and (
            not contains_financial_data
            or coalesce(p_can_view_financial_data, false)
          )
        order by name
      ) item
    ), '[]'::jsonb),
    'assetCustomValues', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.updated_at desc)
      from (
        select custom_value.asset_code, custom_value.field_id, custom_value.value,
          custom_value.updated_by, custom_value.updated_at
        from public.patrimonio_asset_custom_values custom_value
        join public.patrimonio_custom_fields field
          on field.owner_key = custom_value.owner_key
          and field.id = custom_value.field_id
        where custom_value.owner_key = p_owner_key
          and (
            not field.contains_financial_data
            or coalesce(p_can_view_financial_data, false)
          )
      ) item
    ), '[]'::jsonb),
    'integrations', case when coalesce(p_is_admin, false) then coalesce((
      select jsonb_agg(to_jsonb(item) order by item.name)
      from (
        select id, name, provider, direction, status, last_sync_at,
          last_sync_status, created_by, created_at, updated_by, updated_at
        from public.patrimonio_integrations
        where owner_key = p_owner_key
        order by name
      ) item
    ), '[]'::jsonb) else '[]'::jsonb end,
    'integrationEvents', case when coalesce(p_is_admin, false) then coalesce((
      select jsonb_agg(to_jsonb(item) order by item.received_at desc)
      from (
        select id, integration_id, external_id, event_type, entity_type,
          entity_id, status, attempts, error_message, received_at, processed_at
        from public.patrimonio_integration_events
        where owner_key = p_owner_key
        order by received_at desc
        limit 200
      ) item
    ), '[]'::jsonb) else '[]'::jsonb end,
    'reconciliationIssues', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select id, integration_id, source, external_ref, entity_type, entity_id,
          issue_type, severity,
          case when coalesce(p_can_view_financial_data, false)
            then details else '{}'::jsonb end as details,
          status, assigned_to, created_at,
          resolved_by, resolved_at, resolution_note
        from public.patrimonio_reconciliation_issues
        where owner_key = p_owner_key
        order by created_at desc
        limit 200
      ) item
    ), '[]'::jsonb),
    'assetInspections', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.requested_at desc)
      from (
        select id, asset_code, document_id, inspection_type, status, provider,
          detected_asset_code, confidence, findings, model_version, requested_by,
          requested_at, processed_at, reviewed_by, reviewed_at, review_note
        from public.patrimonio_asset_inspections
        where owner_key = p_owner_key
        order by requested_at desc
        limit 200
      ) item
    ), '[]'::jsonb)
  );
$function$;

create or replace function public.patrimonio_apply_advanced_action(
  p_owner_key text,
  p_actor text,
  p_actor_identifier text,
  p_is_admin boolean,
  p_expected_revision bigint,
  p_action jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_action jsonb := coalesce(p_action, '{}'::jsonb);
  v_action_type text := trim(coalesce(p_action ->> 'type', ''));
  v_document_id uuid;
  v_custom_field_id uuid;
  v_revision bigint;
  v_contains_financial_data boolean := false;
  v_custom_field_financial boolean := false;
begin
  if v_action_type = 'upsert_asset_accounting' and not coalesce(p_is_admin, false) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if v_action_type = 'create_asset_contract' and not coalesce(p_is_admin, false) then
    v_action := jsonb_set(v_action, '{contract,monthlyCost}', '0'::jsonb, true);
  end if;

  if v_action_type = 'create_lifecycle_request' and not coalesce(p_is_admin, false) then
    v_action := jsonb_set(v_action, '{request,estimatedCost}', '0'::jsonb, true);
  end if;

  if v_action_type = 'create_asset_document' then
    v_contains_financial_data := coalesce(
      (v_action #>> '{document,containsFinancialData}')::boolean,
      false
    ) or coalesce(v_action #>> '{document,category}', '') in ('invoice', 'contract', 'disposal');
    if v_contains_financial_data and not coalesce(p_is_admin, false) then
      raise exception using errcode = '42501', message = 'admin_required';
    end if;
    v_document_id := (v_action #>> '{document,id}')::uuid;
  elsif v_action_type = 'delete_asset_document' then
    v_document_id := (v_action ->> 'documentId')::uuid;
    if not coalesce(p_is_admin, false) and exists (
      select 1
      from public.patrimonio_asset_documents
      where owner_key = p_owner_key
        and id = v_document_id
        and deleted_at is null
        and contains_financial_data
    ) then
      raise exception using errcode = '42501', message = 'admin_required';
    end if;
  elsif v_action_type = 'create_custom_field' then
    v_custom_field_id := (v_action #>> '{field,id}')::uuid;
    v_custom_field_financial := coalesce(
      (v_action #>> '{field,containsFinancialData}')::boolean,
      false
    );
  elsif v_action_type = 'set_asset_custom_value' and not coalesce(p_is_admin, false) then
    v_custom_field_id := (v_action ->> 'fieldId')::uuid;
    if exists (
      select 1
      from public.patrimonio_custom_fields
      where owner_key = p_owner_key
        and id = v_custom_field_id
        and active
        and contains_financial_data
    ) then
      raise exception using errcode = '42501', message = 'admin_required';
    end if;
  end if;

  v_revision := public.patrimonio_apply_advanced_action_internal(
    p_owner_key,
    p_actor,
    p_actor_identifier,
    p_is_admin,
    p_expected_revision,
    v_action
  );

  if v_action_type = 'create_asset_document' and v_document_id is not null then
    update public.patrimonio_asset_documents
    set contains_financial_data = v_contains_financial_data
    where owner_key = p_owner_key
      and id = v_document_id;
  elsif v_action_type = 'create_custom_field' and v_custom_field_id is not null then
    update public.patrimonio_custom_fields
    set contains_financial_data = v_custom_field_financial
    where owner_key = p_owner_key
      and id = v_custom_field_id;
  end if;

  return v_revision;
end;
$function$;

create or replace function public.patrimonio_transfer_department_entity_v2(
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
  admin_identifier text := lower(trim(coalesce(p_admin_identifier, '')));
  transfer_result jsonb;
begin
  if not exists (
    select 1
    from public.patrimonio_users
    where identifier = admin_identifier
      and active
      and is_admin
      and can_view_financial_data
  ) then
    perform public.patrimonio_record_security_event(
      'financial_transfer_denied',
      'denied',
      nullif(admin_identifier, ''),
      null,
      nullif(lower(trim(coalesce(p_source_department_slug, ''))), ''),
      jsonb_build_object(
        'targetDepartmentSlug', lower(trim(coalesce(p_target_department_slug, ''))),
        'entityType', trim(coalesce(p_entity_type, ''))
      ),
      1825
    );
    raise exception using errcode = '42501', message = 'financial_data_permission_required';
  end if;

  transfer_result := public.patrimonio_transfer_department_entity(
    admin_identifier,
    p_source_department_slug,
    p_target_department_slug,
    p_expected_source_revision,
    p_expected_target_revision,
    p_entity_type,
    p_entity_id,
    p_target_nucleus_id,
    p_target_location,
    p_target_assignee,
    p_note
  );

  perform public.patrimonio_record_security_event(
    'financial_data_transferred',
    'success',
    admin_identifier,
    null,
    lower(trim(p_source_department_slug)),
    jsonb_build_object(
      'targetDepartmentSlug', lower(trim(p_target_department_slug)),
      'entityType', trim(p_entity_type),
      'entityId', trim(p_entity_id),
      'transferredAssets', coalesce((transfer_result ->> 'transferredAssets')::integer, 0)
    ),
    1825
  );

  return transfer_result;
end;
$function$;

revoke all on function public.patrimonio_save_user_access_v5(
  text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text[]
) from public, anon, authenticated;
grant execute on function public.patrimonio_save_user_access_v5(
  text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text[]
) to service_role;

revoke all on function public.patrimonio_save_user_access_v4(
  text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text[]
) from public, anon, authenticated;
grant execute on function public.patrimonio_save_user_access_v4(
  text, text, text, boolean, boolean, boolean, boolean, boolean, boolean, text[]
) to service_role;

revoke all on function public.patrimonio_load_advanced_context(text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.patrimonio_load_advanced_context(text, text, boolean, boolean)
  to service_role;

revoke all on function public.patrimonio_apply_advanced_action(
  text, text, text, boolean, bigint, jsonb
) from public, anon, authenticated;
grant execute on function public.patrimonio_apply_advanced_action(
  text, text, text, boolean, bigint, jsonb
) to service_role;

revoke all on function public.patrimonio_transfer_department_entity_v2(
  text, text, text, bigint, bigint, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.patrimonio_transfer_department_entity_v2(
  text, text, text, bigint, bigint, text, text, text, text, text, text
) to service_role;

commit;
