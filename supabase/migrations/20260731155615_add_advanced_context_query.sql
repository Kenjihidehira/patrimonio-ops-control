begin;

set local lock_timeout = '5s';

create or replace function public.patrimonio_load_advanced_context(
  p_owner_key text,
  p_actor_identifier text,
  p_is_admin boolean
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
          checksum_sha256, note, uploaded_by, uploaded_at, retention_until
        from public.patrimonio_asset_documents
        where owner_key = p_owner_key and deleted_at is null
        order by uploaded_at desc
        limit 200
      ) item
    ), '[]'::jsonb),
    'assetContracts', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.updated_at desc)
      from (
        select id, asset_code, kind, name, provider, contract_number,
          starts_on, ends_on, renewal_notice_days,
          case when coalesce(p_is_admin, false) then monthly_cost else null end as monthly_cost,
          currency, status, document_id, notes, created_by, created_at,
          updated_by, updated_at
        from public.patrimonio_asset_contracts
        where owner_key = p_owner_key
        order by updated_at desc
        limit 200
      ) item
    ), '[]'::jsonb),
    'assetAccounting', case when coalesce(p_is_admin, false) then coalesce((
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
      select jsonb_agg(to_jsonb(item) order by item.added_at)
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
          case when coalesce(p_is_admin, false) then estimated_cost else null end as estimated_cost,
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
        select id, name, field_type, options, required, active, created_by, created_at
        from public.patrimonio_custom_fields
        where owner_key = p_owner_key and active
        order by name
      ) item
    ), '[]'::jsonb),
    'assetCustomValues', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.updated_at desc)
      from (
        select asset_code, field_id, value, updated_by, updated_at
        from public.patrimonio_asset_custom_values
        where owner_key = p_owner_key
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
          issue_type, severity, details, status, assigned_to, created_at,
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

revoke all on function public.patrimonio_load_advanced_context(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.patrimonio_load_advanced_context(text, text, boolean)
  to service_role;

commit;
