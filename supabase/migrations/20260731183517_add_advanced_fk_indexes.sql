create index if not exists patrimonio_asset_contracts_owner_document_idx
  on public.patrimonio_asset_contracts (owner_key, document_id)
  where document_id is not null;

create index if not exists patrimonio_asset_custom_values_owner_field_idx
  on public.patrimonio_asset_custom_values (owner_key, field_id);

create index if not exists patrimonio_asset_inspections_owner_document_idx
  on public.patrimonio_asset_inspections (owner_key, document_id)
  where document_id is not null;

create index if not exists patrimonio_lifecycle_requests_owner_asset_idx
  on public.patrimonio_lifecycle_requests (owner_key, asset_code)
  where asset_code is not null;

create index if not exists patrimonio_reconciliation_issues_owner_integration_idx
  on public.patrimonio_reconciliation_issues (owner_key, integration_id)
  where integration_id is not null;
