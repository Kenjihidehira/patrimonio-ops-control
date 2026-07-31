begin;

set local lock_timeout = '5s';

create table public.patrimonio_asset_documents (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  asset_code varchar(24) not null,
  category text not null,
  file_name varchar(180) not null,
  mime_type varchar(120) not null,
  byte_size integer not null,
  storage_path text not null,
  checksum_sha256 char(64),
  note varchar(500) not null default '',
  uploaded_by varchar(180) not null,
  uploaded_at timestamptz not null default now(),
  retention_until date,
  deleted_by varchar(180),
  deleted_at timestamptz,
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  constraint patrimonio_asset_documents_category_check
    check (category in ('invoice', 'warranty', 'inspection', 'photo', 'contract', 'manual', 'disposal', 'other')),
  constraint patrimonio_asset_documents_file_name_check
    check (length(trim(file_name)) between 1 and 180),
  constraint patrimonio_asset_documents_mime_check
    check (mime_type in (
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )),
  constraint patrimonio_asset_documents_size_check check (byte_size between 1 and 2500000),
  constraint patrimonio_asset_documents_checksum_check
    check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  constraint patrimonio_asset_documents_delete_check check (
    (deleted_at is null and deleted_by is null)
    or (deleted_at is not null and deleted_by is not null)
  ),
  unique (owner_key, id),
  unique (storage_path)
);

create index patrimonio_asset_documents_owner_asset_idx
  on public.patrimonio_asset_documents (owner_key, asset_code, uploaded_at desc)
  where deleted_at is null;

create table public.patrimonio_asset_contracts (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  asset_code varchar(24) not null,
  kind text not null,
  name varchar(180) not null,
  provider varchar(180) not null default '',
  contract_number varchar(120) not null default '',
  starts_on date,
  ends_on date,
  renewal_notice_days integer not null default 30,
  monthly_cost numeric(14, 2) not null default 0,
  currency char(3) not null default 'BRL',
  status text not null default 'active',
  document_id uuid,
  notes varchar(500) not null default '',
  created_by varchar(180) not null,
  created_at timestamptz not null default now(),
  updated_by varchar(180) not null,
  updated_at timestamptz not null default now(),
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  foreign key (owner_key, document_id)
    references public.patrimonio_asset_documents(owner_key, id) on delete set null,
  constraint patrimonio_asset_contracts_kind_check
    check (kind in ('purchase', 'lease', 'insurance', 'warranty', 'license', 'service')),
  constraint patrimonio_asset_contracts_name_check check (length(trim(name)) between 3 and 180),
  constraint patrimonio_asset_contracts_dates_check
    check (starts_on is null or ends_on is null or ends_on >= starts_on),
  constraint patrimonio_asset_contracts_notice_check check (renewal_notice_days between 0 and 3650),
  constraint patrimonio_asset_contracts_cost_check check (monthly_cost >= 0),
  constraint patrimonio_asset_contracts_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint patrimonio_asset_contracts_status_check
    check (status in ('active', 'expired', 'cancelled')),
  unique (owner_key, id)
);

create index patrimonio_asset_contracts_owner_expiry_idx
  on public.patrimonio_asset_contracts (owner_key, status, ends_on);
create index patrimonio_asset_contracts_owner_asset_idx
  on public.patrimonio_asset_contracts (owner_key, asset_code);

create table public.patrimonio_asset_accounting (
  owner_key text not null,
  asset_code varchar(24) not null,
  acquisition_value numeric(14, 2) not null default 0,
  residual_value numeric(14, 2) not null default 0,
  depreciation_method text not null default 'straight_line',
  useful_life_months integer,
  depreciation_starts_on date,
  cost_center varchar(80) not null default '',
  ledger_account varchar(80) not null default '',
  supplier varchar(180) not null default '',
  purchase_order varchar(120) not null default '',
  invoice_number varchar(120) not null default '',
  updated_by varchar(180) not null,
  updated_at timestamptz not null default now(),
  primary key (owner_key, asset_code),
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  constraint patrimonio_asset_accounting_values_check
    check (acquisition_value >= 0 and residual_value >= 0 and residual_value <= acquisition_value),
  constraint patrimonio_asset_accounting_method_check
    check (depreciation_method in ('straight_line', 'none')),
  constraint patrimonio_asset_accounting_life_check
    check (useful_life_months is null or useful_life_months between 1 and 1200)
);

create index patrimonio_asset_accounting_owner_cost_center_idx
  on public.patrimonio_asset_accounting (owner_key, cost_center);

create table public.patrimonio_asset_kits (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  name varchar(180) not null,
  description varchar(500) not null default '',
  item_count integer not null default 0 check (item_count >= 0),
  status text not null default 'active',
  created_by varchar(180) not null,
  created_at timestamptz not null default now(),
  dissolved_by varchar(180),
  dissolved_at timestamptz,
  constraint patrimonio_asset_kits_name_check check (length(trim(name)) between 3 and 180),
  constraint patrimonio_asset_kits_status_check check (status in ('active', 'dissolved')),
  constraint patrimonio_asset_kits_dissolved_check check (
    (status = 'active' and dissolved_by is null and dissolved_at is null)
    or (status = 'dissolved' and dissolved_by is not null and dissolved_at is not null)
  ),
  unique (owner_key, id),
  foreign key (owner_key) references public.patrimonio_workspaces(owner_key) on delete cascade
);

create table public.patrimonio_asset_kit_items (
  owner_key text not null,
  kit_id uuid not null,
  asset_code varchar(24) not null,
  added_at timestamptz not null default now(),
  released_at timestamptz,
  primary key (owner_key, kit_id, asset_code),
  foreign key (owner_key, kit_id)
    references public.patrimonio_asset_kits(owner_key, id) on delete cascade,
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict
);

create unique index patrimonio_asset_kit_items_active_asset_uidx
  on public.patrimonio_asset_kit_items (owner_key, asset_code)
  where released_at is null;

create table public.patrimonio_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  requester_name varchar(180) not null,
  requester_identifier varchar(254) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  purpose varchar(500) not null,
  status text not null default 'requested',
  created_by varchar(180) not null,
  created_at timestamptz not null default now(),
  approved_by varchar(180),
  approved_at timestamptz,
  checked_out_at timestamptz,
  returned_at timestamptz,
  updated_by varchar(180) not null,
  updated_at timestamptz not null default now(),
  foreign key (owner_key) references public.patrimonio_workspaces(owner_key) on delete cascade,
  constraint patrimonio_reservations_identifier_check
    check (requester_identifier = lower(requester_identifier) and requester_identifier ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint patrimonio_reservations_period_check check (ends_at > starts_at),
  constraint patrimonio_reservations_purpose_check check (length(trim(purpose)) between 3 and 500),
  constraint patrimonio_reservations_status_check
    check (status in ('requested', 'approved', 'checked_out', 'returned', 'rejected', 'cancelled')),
  unique (owner_key, id)
);

create table public.patrimonio_reservation_assets (
  owner_key text not null,
  reservation_id uuid not null,
  asset_code varchar(24) not null,
  primary key (owner_key, reservation_id, asset_code),
  foreign key (owner_key, reservation_id)
    references public.patrimonio_reservations(owner_key, id) on delete cascade,
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict
);

create index patrimonio_reservations_owner_period_idx
  on public.patrimonio_reservations (owner_key, starts_at, ends_at)
  where status in ('requested', 'approved', 'checked_out');
create index patrimonio_reservation_assets_owner_asset_idx
  on public.patrimonio_reservation_assets (owner_key, asset_code);

create table public.patrimonio_offboarding_cases (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  collaborator_name varchar(180) not null,
  collaborator_identifier varchar(254) not null,
  due_at date,
  status text not null default 'open',
  notes varchar(500) not null default '',
  created_by varchar(180) not null,
  created_at timestamptz not null default now(),
  completed_by varchar(180),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (owner_key) references public.patrimonio_workspaces(owner_key) on delete cascade,
  constraint patrimonio_offboarding_name_check check (length(trim(collaborator_name)) between 2 and 180),
  constraint patrimonio_offboarding_identifier_check
    check (collaborator_identifier = lower(collaborator_identifier) and collaborator_identifier ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint patrimonio_offboarding_status_check check (status in ('open', 'completed', 'cancelled')),
  constraint patrimonio_offboarding_completion_check check (
    (status = 'open' and completed_by is null and completed_at is null)
    or (status <> 'open' and completed_by is not null and completed_at is not null)
  ),
  unique (owner_key, id)
);

create table public.patrimonio_offboarding_assets (
  owner_key text not null,
  case_id uuid not null,
  asset_code varchar(24) not null,
  result text not null default 'pending',
  destination_assignee varchar(180) not null default '',
  note varchar(500) not null default '',
  checked_by varchar(180),
  checked_at timestamptz,
  primary key (owner_key, case_id, asset_code),
  foreign key (owner_key, case_id)
    references public.patrimonio_offboarding_cases(owner_key, id) on delete cascade,
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  constraint patrimonio_offboarding_assets_result_check
    check (result in ('pending', 'returned', 'missing', 'reassigned')),
  constraint patrimonio_offboarding_assets_checked_check check (
    (result = 'pending' and checked_by is null and checked_at is null)
    or (result <> 'pending' and checked_by is not null and checked_at is not null)
  )
);

create unique index patrimonio_offboarding_assets_pending_uidx
  on public.patrimonio_offboarding_assets (owner_key, asset_code)
  where result = 'pending';

create table public.patrimonio_lifecycle_requests (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  request_type text not null,
  asset_code varchar(24),
  title varchar(180) not null,
  reason varchar(500) not null,
  quantity integer not null default 1,
  estimated_cost numeric(14, 2) not null default 0,
  status text not null default 'pending_approval',
  requested_by varchar(180) not null,
  requested_at timestamptz not null default now(),
  decided_by varchar(180),
  decided_at timestamptz,
  decision_note varchar(500) not null default '',
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (owner_key) references public.patrimonio_workspaces(owner_key) on delete cascade,
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  constraint patrimonio_lifecycle_requests_type_check
    check (request_type in ('purchase', 'transfer', 'disposal', 'repair', 'replacement')),
  constraint patrimonio_lifecycle_requests_title_check check (length(trim(title)) between 3 and 180),
  constraint patrimonio_lifecycle_requests_reason_check check (length(trim(reason)) between 3 and 500),
  constraint patrimonio_lifecycle_requests_quantity_check check (quantity between 1 and 10000),
  constraint patrimonio_lifecycle_requests_cost_check check (estimated_cost >= 0),
  constraint patrimonio_lifecycle_requests_status_check
    check (status in ('pending_approval', 'approved', 'rejected', 'completed', 'cancelled')),
  unique (owner_key, id)
);

create index patrimonio_lifecycle_requests_owner_status_idx
  on public.patrimonio_lifecycle_requests (owner_key, status, requested_at desc);

create table public.patrimonio_custom_fields (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  name varchar(80) not null,
  field_type text not null,
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  active boolean not null default true,
  created_by varchar(180) not null,
  created_at timestamptz not null default now(),
  foreign key (owner_key) references public.patrimonio_workspaces(owner_key) on delete cascade,
  constraint patrimonio_custom_fields_name_check check (length(trim(name)) between 2 and 80),
  constraint patrimonio_custom_fields_type_check
    check (field_type in ('text', 'number', 'date', 'boolean', 'select')),
  constraint patrimonio_custom_fields_options_check check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 100
  ),
  unique (owner_key, id),
  unique (owner_key, name)
);

create table public.patrimonio_asset_custom_values (
  owner_key text not null,
  asset_code varchar(24) not null,
  field_id uuid not null,
  value jsonb not null,
  updated_by varchar(180) not null,
  updated_at timestamptz not null default now(),
  primary key (owner_key, asset_code, field_id),
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete cascade,
  foreign key (owner_key, field_id)
    references public.patrimonio_custom_fields(owner_key, id) on delete cascade,
  constraint patrimonio_asset_custom_values_size_check check (octet_length(value::text) <= 4000)
);

create table public.patrimonio_integrations (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  name varchar(120) not null,
  provider text not null,
  direction text not null default 'bidirectional',
  status text not null default 'active',
  configuration jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_sync_status text,
  created_by varchar(180) not null,
  created_at timestamptz not null default now(),
  updated_by varchar(180) not null,
  updated_at timestamptz not null default now(),
  foreign key (owner_key) references public.patrimonio_workspaces(owner_key) on delete cascade,
  constraint patrimonio_integrations_name_check check (length(trim(name)) between 2 and 120),
  constraint patrimonio_integrations_provider_check
    check (provider in ('hr', 'erp', 'mdm', 'service_desk', 'iot', 'directory', 'custom')),
  constraint patrimonio_integrations_direction_check
    check (direction in ('inbound', 'outbound', 'bidirectional')),
  constraint patrimonio_integrations_status_check check (status in ('active', 'paused', 'error')),
  constraint patrimonio_integrations_configuration_check check (
    jsonb_typeof(configuration) = 'object'
    and octet_length(configuration::text) <= 16000
    and not (configuration ?| array['secret', 'password', 'token', 'apiKey', 'api_key'])
  ),
  unique (owner_key, id),
  unique (owner_key, name)
);

create table public.patrimonio_integration_events (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  integration_id uuid not null,
  external_id varchar(180) not null,
  event_type varchar(120) not null,
  entity_type varchar(60) not null default '',
  entity_id varchar(180) not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  error_message varchar(500) not null default '',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  foreign key (owner_key, integration_id)
    references public.patrimonio_integrations(owner_key, id) on delete cascade,
  constraint patrimonio_integration_events_external_check check (length(trim(external_id)) between 1 and 180),
  constraint patrimonio_integration_events_status_check
    check (status in ('pending', 'processed', 'failed', 'ignored')),
  constraint patrimonio_integration_events_attempts_check check (attempts between 0 and 100),
  constraint patrimonio_integration_events_payload_check
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  unique (owner_key, integration_id, external_id)
);

create index patrimonio_integration_events_owner_status_idx
  on public.patrimonio_integration_events (owner_key, status, received_at);

create table public.patrimonio_reconciliation_issues (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  integration_id uuid,
  source varchar(120) not null,
  external_ref varchar(180) not null default '',
  entity_type varchar(60) not null,
  entity_id varchar(180) not null default '',
  issue_type varchar(120) not null,
  severity text not null default 'medium',
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  assigned_to varchar(180) not null default '',
  created_at timestamptz not null default now(),
  resolved_by varchar(180),
  resolved_at timestamptz,
  resolution_note varchar(500) not null default '',
  foreign key (owner_key) references public.patrimonio_workspaces(owner_key) on delete cascade,
  foreign key (owner_key, integration_id)
    references public.patrimonio_integrations(owner_key, id) on delete set null,
  constraint patrimonio_reconciliation_issues_severity_check
    check (severity in ('low', 'medium', 'high', 'critical')),
  constraint patrimonio_reconciliation_issues_status_check
    check (status in ('open', 'resolved', 'ignored')),
  constraint patrimonio_reconciliation_issues_details_check
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 16000),
  unique (owner_key, id)
);

create index patrimonio_reconciliation_issues_owner_status_idx
  on public.patrimonio_reconciliation_issues (owner_key, status, severity, created_at desc);

create table public.patrimonio_asset_inspections (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  asset_code varchar(24) not null,
  document_id uuid,
  inspection_type text not null,
  status text not null default 'pending',
  provider varchar(120) not null default 'manual',
  detected_asset_code varchar(24) not null default '',
  confidence numeric(5, 4),
  findings jsonb not null default '{}'::jsonb,
  model_version varchar(120) not null default '',
  requested_by varchar(180) not null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  reviewed_by varchar(180),
  reviewed_at timestamptz,
  review_note varchar(500) not null default '',
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  foreign key (owner_key, document_id)
    references public.patrimonio_asset_documents(owner_key, id) on delete set null,
  constraint patrimonio_asset_inspections_type_check
    check (inspection_type in ('condition', 'identification', 'count')),
  constraint patrimonio_asset_inspections_status_check
    check (status in ('pending', 'processing', 'needs_review', 'approved', 'rejected', 'failed')),
  constraint patrimonio_asset_inspections_confidence_check
    check (confidence is null or confidence between 0 and 1),
  constraint patrimonio_asset_inspections_findings_check
    check (jsonb_typeof(findings) = 'object' and octet_length(findings::text) <= 16000),
  unique (owner_key, id)
);

create index patrimonio_asset_inspections_owner_status_idx
  on public.patrimonio_asset_inspections (owner_key, status, requested_at desc);
create index patrimonio_asset_inspections_owner_asset_idx
  on public.patrimonio_asset_inspections (owner_key, asset_code);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patrimonio-documents',
  'patrimonio-documents',
  false,
  2500000,
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.patrimonio_asset_documents enable row level security;
alter table public.patrimonio_asset_contracts enable row level security;
alter table public.patrimonio_asset_accounting enable row level security;
alter table public.patrimonio_asset_kits enable row level security;
alter table public.patrimonio_asset_kit_items enable row level security;
alter table public.patrimonio_reservations enable row level security;
alter table public.patrimonio_reservation_assets enable row level security;
alter table public.patrimonio_offboarding_cases enable row level security;
alter table public.patrimonio_offboarding_assets enable row level security;
alter table public.patrimonio_lifecycle_requests enable row level security;
alter table public.patrimonio_custom_fields enable row level security;
alter table public.patrimonio_asset_custom_values enable row level security;
alter table public.patrimonio_integrations enable row level security;
alter table public.patrimonio_integration_events enable row level security;
alter table public.patrimonio_reconciliation_issues enable row level security;
alter table public.patrimonio_asset_inspections enable row level security;

create policy patrimonio_asset_documents_no_direct_access on public.patrimonio_asset_documents
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_asset_contracts_no_direct_access on public.patrimonio_asset_contracts
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_asset_accounting_no_direct_access on public.patrimonio_asset_accounting
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_asset_kits_no_direct_access on public.patrimonio_asset_kits
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_asset_kit_items_no_direct_access on public.patrimonio_asset_kit_items
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_reservations_no_direct_access on public.patrimonio_reservations
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_reservation_assets_no_direct_access on public.patrimonio_reservation_assets
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_offboarding_cases_no_direct_access on public.patrimonio_offboarding_cases
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_offboarding_assets_no_direct_access on public.patrimonio_offboarding_assets
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_lifecycle_requests_no_direct_access on public.patrimonio_lifecycle_requests
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_custom_fields_no_direct_access on public.patrimonio_custom_fields
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_asset_custom_values_no_direct_access on public.patrimonio_asset_custom_values
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_integrations_no_direct_access on public.patrimonio_integrations
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_integration_events_no_direct_access on public.patrimonio_integration_events
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_reconciliation_issues_no_direct_access on public.patrimonio_reconciliation_issues
  for all to anon, authenticated using (false) with check (false);
create policy patrimonio_asset_inspections_no_direct_access on public.patrimonio_asset_inspections
  for all to anon, authenticated using (false) with check (false);

revoke all on table public.patrimonio_asset_documents from public, anon, authenticated;
revoke all on table public.patrimonio_asset_contracts from public, anon, authenticated;
revoke all on table public.patrimonio_asset_accounting from public, anon, authenticated;
revoke all on table public.patrimonio_asset_kits from public, anon, authenticated;
revoke all on table public.patrimonio_asset_kit_items from public, anon, authenticated;
revoke all on table public.patrimonio_reservations from public, anon, authenticated;
revoke all on table public.patrimonio_reservation_assets from public, anon, authenticated;
revoke all on table public.patrimonio_offboarding_cases from public, anon, authenticated;
revoke all on table public.patrimonio_offboarding_assets from public, anon, authenticated;
revoke all on table public.patrimonio_lifecycle_requests from public, anon, authenticated;
revoke all on table public.patrimonio_custom_fields from public, anon, authenticated;
revoke all on table public.patrimonio_asset_custom_values from public, anon, authenticated;
revoke all on table public.patrimonio_integrations from public, anon, authenticated;
revoke all on table public.patrimonio_integration_events from public, anon, authenticated;
revoke all on table public.patrimonio_reconciliation_issues from public, anon, authenticated;
revoke all on table public.patrimonio_asset_inspections from public, anon, authenticated;

grant all on table public.patrimonio_asset_documents to service_role;
grant all on table public.patrimonio_asset_contracts to service_role;
grant all on table public.patrimonio_asset_accounting to service_role;
grant all on table public.patrimonio_asset_kits to service_role;
grant all on table public.patrimonio_asset_kit_items to service_role;
grant all on table public.patrimonio_reservations to service_role;
grant all on table public.patrimonio_reservation_assets to service_role;
grant all on table public.patrimonio_offboarding_cases to service_role;
grant all on table public.patrimonio_offboarding_assets to service_role;
grant all on table public.patrimonio_lifecycle_requests to service_role;
grant all on table public.patrimonio_custom_fields to service_role;
grant all on table public.patrimonio_asset_custom_values to service_role;
grant all on table public.patrimonio_integrations to service_role;
grant all on table public.patrimonio_integration_events to service_role;
grant all on table public.patrimonio_reconciliation_issues to service_role;
grant all on table public.patrimonio_asset_inspections to service_role;

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
  v_revision bigint;
  v_action_type text := trim(coalesce(p_action ->> 'type', ''));
  v_id uuid;
  v_related_id uuid;
  v_asset_code varchar(24);
  v_status text;
  v_previous_status text;
  v_result text;
  v_item text;
  v_item_json jsonb;
  v_count integer;
  v_start timestamptz;
  v_end timestamptz;
  v_name text;
  v_identifier text := lower(trim(coalesce(p_actor_identifier, '')));
  v_json jsonb;
begin
  if p_owner_key !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_owner_key';
  end if;
  if length(trim(coalesce(p_actor, ''))) < 1
    or v_identifier !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using errcode = '22023', message = 'invalid_actor';
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

  if v_action_type = 'create_asset_document' then
    v_id := (p_action #>> '{document,id}')::uuid;
    v_asset_code := trim(p_action #>> '{document,assetId}');
    if p_action #>> '{document,category}' not in ('invoice', 'warranty', 'inspection', 'photo', 'contract', 'manual', 'disposal', 'other')
      or length(trim(coalesce(p_action #>> '{document,fileName}', ''))) < 1
      or (p_action #>> '{document,byteSize}')::integer not between 1 and 2500000
      or p_action #>> '{document,storagePath}' not like p_owner_key || '/%'
      or not exists (
        select 1 from public.patrimonio_assets
        where owner_key = p_owner_key and code = v_asset_code
      )
    then
      raise exception using errcode = '22023', message = 'invalid_asset_document';
    end if;

    insert into public.patrimonio_asset_documents (
      id, owner_key, asset_code, category, file_name, mime_type, byte_size,
      storage_path, checksum_sha256, note, uploaded_by, retention_until
    ) values (
      v_id, p_owner_key, v_asset_code, p_action #>> '{document,category}',
      left(trim(p_action #>> '{document,fileName}'), 180),
      left(trim(p_action #>> '{document,mimeType}'), 120),
      (p_action #>> '{document,byteSize}')::integer,
      p_action #>> '{document,storagePath}',
      nullif(p_action #>> '{document,checksumSha256}', ''),
      left(trim(coalesce(p_action #>> '{document,note}', '')), 500),
      left(trim(p_actor), 180),
      nullif(p_action #>> '{document,retentionUntil}', '')::date
    );

  elsif v_action_type = 'delete_asset_document' then
    v_id := (p_action ->> 'documentId')::uuid;
    update public.patrimonio_asset_documents
    set deleted_by = left(trim(p_actor), 180), deleted_at = now()
    where owner_key = p_owner_key and id = v_id and deleted_at is null;
    if not found then
      raise exception using errcode = 'P0002', message = 'asset_document_not_found';
    end if;

  elsif v_action_type = 'create_asset_contract' then
    v_id := (p_action #>> '{contract,id}')::uuid;
    v_asset_code := trim(p_action #>> '{contract,assetId}');
    if p_action #>> '{contract,kind}' not in ('purchase', 'lease', 'insurance', 'warranty', 'license', 'service')
      or length(trim(coalesce(p_action #>> '{contract,name}', ''))) < 3
      or not exists (
        select 1 from public.patrimonio_assets
        where owner_key = p_owner_key and code = v_asset_code
      )
    then
      raise exception using errcode = '22023', message = 'invalid_asset_contract';
    end if;

    insert into public.patrimonio_asset_contracts (
      id, owner_key, asset_code, kind, name, provider, contract_number,
      starts_on, ends_on, renewal_notice_days, monthly_cost, currency,
      document_id, notes, created_by, updated_by
    ) values (
      v_id, p_owner_key, v_asset_code, p_action #>> '{contract,kind}',
      left(trim(p_action #>> '{contract,name}'), 180),
      left(trim(coalesce(p_action #>> '{contract,provider}', '')), 180),
      left(trim(coalesce(p_action #>> '{contract,contractNumber}', '')), 120),
      nullif(p_action #>> '{contract,startsOn}', '')::date,
      nullif(p_action #>> '{contract,endsOn}', '')::date,
      coalesce(nullif(p_action #>> '{contract,renewalNoticeDays}', '')::integer, 30),
      coalesce(nullif(p_action #>> '{contract,monthlyCost}', '')::numeric, 0),
      upper(coalesce(nullif(p_action #>> '{contract,currency}', ''), 'BRL')),
      nullif(p_action #>> '{contract,documentId}', '')::uuid,
      left(trim(coalesce(p_action #>> '{contract,notes}', '')), 500),
      left(trim(p_actor), 180), left(trim(p_actor), 180)
    );

  elsif v_action_type = 'update_asset_contract_status' then
    v_id := (p_action ->> 'contractId')::uuid;
    v_status := trim(p_action ->> 'status');
    if v_status not in ('active', 'expired', 'cancelled') then
      raise exception using errcode = '22023', message = 'invalid_contract_status';
    end if;
    update public.patrimonio_asset_contracts
    set status = v_status, updated_by = left(trim(p_actor), 180), updated_at = now()
    where owner_key = p_owner_key and id = v_id and status <> v_status;
    if not found then
      raise exception using errcode = '22023', message = 'contract_not_changeable';
    end if;

  elsif v_action_type = 'upsert_asset_accounting' then
    v_asset_code := trim(p_action #>> '{accounting,assetId}');
    if not exists (
      select 1 from public.patrimonio_assets
      where owner_key = p_owner_key and code = v_asset_code
    ) then
      raise exception using errcode = 'P0002', message = 'asset_not_found';
    end if;
    insert into public.patrimonio_asset_accounting (
      owner_key, asset_code, acquisition_value, residual_value,
      depreciation_method, useful_life_months, depreciation_starts_on,
      cost_center, ledger_account, supplier, purchase_order, invoice_number,
      updated_by
    ) values (
      p_owner_key, v_asset_code,
      coalesce(nullif(p_action #>> '{accounting,acquisitionValue}', '')::numeric, 0),
      coalesce(nullif(p_action #>> '{accounting,residualValue}', '')::numeric, 0),
      coalesce(nullif(p_action #>> '{accounting,depreciationMethod}', ''), 'straight_line'),
      nullif(p_action #>> '{accounting,usefulLifeMonths}', '')::integer,
      nullif(p_action #>> '{accounting,depreciationStartsOn}', '')::date,
      left(trim(coalesce(p_action #>> '{accounting,costCenter}', '')), 80),
      left(trim(coalesce(p_action #>> '{accounting,ledgerAccount}', '')), 80),
      left(trim(coalesce(p_action #>> '{accounting,supplier}', '')), 180),
      left(trim(coalesce(p_action #>> '{accounting,purchaseOrder}', '')), 120),
      left(trim(coalesce(p_action #>> '{accounting,invoiceNumber}', '')), 120),
      left(trim(p_actor), 180)
    ) on conflict (owner_key, asset_code) do update set
      acquisition_value = excluded.acquisition_value,
      residual_value = excluded.residual_value,
      depreciation_method = excluded.depreciation_method,
      useful_life_months = excluded.useful_life_months,
      depreciation_starts_on = excluded.depreciation_starts_on,
      cost_center = excluded.cost_center,
      ledger_account = excluded.ledger_account,
      supplier = excluded.supplier,
      purchase_order = excluded.purchase_order,
      invoice_number = excluded.invoice_number,
      updated_by = excluded.updated_by,
      updated_at = now();

  elsif v_action_type = 'create_asset_kit' then
    v_id := (p_action #>> '{kit,id}')::uuid;
    v_json := p_action #> '{kit,assetIds}';
    if length(trim(coalesce(p_action #>> '{kit,name}', ''))) < 3
      or jsonb_typeof(v_json) <> 'array'
      or jsonb_array_length(v_json) not between 2 and 100
    then
      raise exception using errcode = '22023', message = 'invalid_asset_kit';
    end if;
    insert into public.patrimonio_asset_kits (
      id, owner_key, name, description, created_by
    ) values (
      v_id, p_owner_key, left(trim(p_action #>> '{kit,name}'), 180),
      left(trim(coalesce(p_action #>> '{kit,description}', '')), 500),
      left(trim(p_actor), 180)
    );
    for v_item in select value from jsonb_array_elements_text(v_json)
    loop
      if not exists (
        select 1 from public.patrimonio_assets
        where owner_key = p_owner_key and code = v_item and status <> 'retired'
      ) then
        raise exception using errcode = 'P0002', message = 'kit_asset_not_found';
      end if;
      insert into public.patrimonio_asset_kit_items (owner_key, kit_id, asset_code)
      values (p_owner_key, v_id, v_item);
    end loop;
    update public.patrimonio_asset_kits
    set item_count = (select count(*) from public.patrimonio_asset_kit_items where owner_key = p_owner_key and kit_id = v_id)
    where owner_key = p_owner_key and id = v_id;

  elsif v_action_type = 'dissolve_asset_kit' then
    v_id := (p_action ->> 'kitId')::uuid;
    update public.patrimonio_asset_kits
    set status = 'dissolved', dissolved_by = left(trim(p_actor), 180), dissolved_at = now()
    where owner_key = p_owner_key and id = v_id and status = 'active';
    if not found then
      raise exception using errcode = 'P0002', message = 'active_kit_not_found';
    end if;
    update public.patrimonio_asset_kit_items
    set released_at = now()
    where owner_key = p_owner_key and kit_id = v_id and released_at is null;

  elsif v_action_type = 'create_reservation' then
    v_id := (p_action #>> '{reservation,id}')::uuid;
    v_start := (p_action #>> '{reservation,startsAt}')::timestamptz;
    v_end := (p_action #>> '{reservation,endsAt}')::timestamptz;
    v_json := p_action #> '{reservation,assetIds}';
    if v_end <= v_start
      or length(trim(coalesce(p_action #>> '{reservation,purpose}', ''))) < 3
      or jsonb_typeof(v_json) <> 'array'
      or jsonb_array_length(v_json) not between 1 and 50
    then
      raise exception using errcode = '22023', message = 'invalid_reservation';
    end if;
    insert into public.patrimonio_reservations (
      id, owner_key, requester_name, requester_identifier, starts_at, ends_at,
      purpose, created_by, updated_by
    ) values (
      v_id, p_owner_key, left(trim(p_actor), 180), v_identifier, v_start, v_end,
      left(trim(p_action #>> '{reservation,purpose}'), 500),
      left(trim(p_actor), 180), left(trim(p_actor), 180)
    );
    for v_item in select value from jsonb_array_elements_text(v_json)
    loop
      if not exists (
        select 1 from public.patrimonio_assets
        where owner_key = p_owner_key and code = v_item and status in ('available', 'allocated')
      ) or exists (
        select 1
        from public.patrimonio_reservation_assets item
        join public.patrimonio_reservations reservation
          on reservation.owner_key = item.owner_key and reservation.id = item.reservation_id
        where item.owner_key = p_owner_key
          and item.asset_code = v_item
          and reservation.status in ('requested', 'approved', 'checked_out')
          and tstzrange(reservation.starts_at, reservation.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
      ) then
        raise exception using errcode = '22023', message = 'asset_unavailable_for_reservation';
      end if;
      insert into public.patrimonio_reservation_assets (owner_key, reservation_id, asset_code)
      values (p_owner_key, v_id, v_item);
    end loop;

  elsif v_action_type = 'update_reservation_status' then
    v_id := (p_action ->> 'reservationId')::uuid;
    v_status := trim(p_action ->> 'status');
    select status, requester_identifier into v_previous_status, v_name
    from public.patrimonio_reservations
    where owner_key = p_owner_key and id = v_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'reservation_not_found';
    end if;
    if (v_status in ('approved', 'rejected', 'checked_out', 'returned') and not coalesce(p_is_admin, false))
      or (v_status = 'cancelled' and not coalesce(p_is_admin, false) and v_name <> v_identifier)
      or not (
        (v_previous_status = 'requested' and v_status in ('approved', 'rejected', 'cancelled'))
        or (v_previous_status = 'approved' and v_status in ('checked_out', 'cancelled'))
        or (v_previous_status = 'checked_out' and v_status = 'returned')
      )
    then
      raise exception using errcode = '42501', message = 'reservation_transition_denied';
    end if;
    update public.patrimonio_reservations
    set status = v_status,
      approved_by = case when v_status = 'approved' then left(trim(p_actor), 180) else approved_by end,
      approved_at = case when v_status = 'approved' then now() else approved_at end,
      checked_out_at = case when v_status = 'checked_out' then now() else checked_out_at end,
      returned_at = case when v_status = 'returned' then now() else returned_at end,
      updated_by = left(trim(p_actor), 180), updated_at = now()
    where owner_key = p_owner_key and id = v_id;

  elsif v_action_type = 'create_offboarding_case' then
    v_id := (p_action #>> '{case,id}')::uuid;
    v_name := trim(p_action #>> '{case,collaboratorName}');
    if length(v_name) < 2
      or lower(trim(p_action #>> '{case,collaboratorIdentifier}')) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then
      raise exception using errcode = '22023', message = 'invalid_offboarding_case';
    end if;
    insert into public.patrimonio_offboarding_cases (
      id, owner_key, collaborator_name, collaborator_identifier, due_at,
      notes, created_by
    ) values (
      v_id, p_owner_key, left(v_name, 180),
      lower(trim(p_action #>> '{case,collaboratorIdentifier}')),
      nullif(p_action #>> '{case,dueAt}', '')::date,
      left(trim(coalesce(p_action #>> '{case,notes}', '')), 500),
      left(trim(p_actor), 180)
    );
    insert into public.patrimonio_offboarding_assets (owner_key, case_id, asset_code)
    select p_owner_key, v_id, asset.code
    from public.patrimonio_assets asset
    where asset.owner_key = p_owner_key
      and lower(trim(asset.assignee)) = lower(v_name)
      and asset.status <> 'retired';
    get diagnostics v_count = row_count;
    if v_count = 0 then
      raise exception using errcode = '22023', message = 'offboarding_without_assets';
    end if;

  elsif v_action_type = 'update_offboarding_asset' then
    v_id := (p_action ->> 'caseId')::uuid;
    v_asset_code := trim(p_action ->> 'assetId');
    v_result := trim(p_action ->> 'result');
    v_name := trim(coalesce(p_action ->> 'destinationAssignee', ''));
    if v_result not in ('returned', 'missing', 'reassigned')
      or (v_result = 'reassigned' and length(v_name) < 2)
    then
      raise exception using errcode = '22023', message = 'invalid_offboarding_result';
    end if;
    update public.patrimonio_offboarding_assets
    set result = v_result, destination_assignee = left(v_name, 180),
      note = left(trim(coalesce(p_action ->> 'note', '')), 500),
      checked_by = left(trim(p_actor), 180), checked_at = now()
    where owner_key = p_owner_key and case_id = v_id and asset_code = v_asset_code and result = 'pending';
    if not found then
      raise exception using errcode = 'P0002', message = 'offboarding_asset_not_found';
    end if;
    select status into v_previous_status from public.patrimonio_assets
    where owner_key = p_owner_key and code = v_asset_code for update;
    update public.patrimonio_assets
    set assignee = case when v_result = 'reassigned' then left(v_name, 180) else '' end,
      status = case when v_result = 'missing' then 'discrepancy' when v_result = 'reassigned' then 'allocated' else 'available' end,
      updated_at = now()
    where owner_key = p_owner_key and code = v_asset_code;
    insert into public.patrimonio_movements (
      owner_key, asset_code, type, actor, from_label, to_label, note
    ) values (
      p_owner_key, v_asset_code, 'transfer', left(trim(p_actor), 180),
      'Desligamento: ' || (select collaborator_name from public.patrimonio_offboarding_cases where owner_key = p_owner_key and id = v_id),
      case when v_result = 'returned' then 'Reserva' when v_result = 'missing' then 'Não localizado' else v_name end,
      left(trim(coalesce(p_action ->> 'note', 'Baixa de responsabilidade por desligamento.')), 500)
    );

  elsif v_action_type = 'complete_offboarding_case' then
    v_id := (p_action ->> 'caseId')::uuid;
    if exists (
      select 1 from public.patrimonio_offboarding_assets
      where owner_key = p_owner_key and case_id = v_id and result = 'pending'
    ) then
      raise exception using errcode = '22023', message = 'offboarding_has_pending_assets';
    end if;
    update public.patrimonio_offboarding_cases
    set status = 'completed', completed_by = left(trim(p_actor), 180), completed_at = now(), updated_at = now()
    where owner_key = p_owner_key and id = v_id and status = 'open';
    if not found then
      raise exception using errcode = 'P0002', message = 'open_offboarding_not_found';
    end if;

  elsif v_action_type = 'create_lifecycle_request' then
    v_id := (p_action #>> '{request,id}')::uuid;
    if p_action #>> '{request,requestType}' not in ('purchase', 'transfer', 'disposal', 'repair', 'replacement')
      or length(trim(coalesce(p_action #>> '{request,title}', ''))) < 3
      or length(trim(coalesce(p_action #>> '{request,reason}', ''))) < 3
    then
      raise exception using errcode = '22023', message = 'invalid_lifecycle_request';
    end if;
    insert into public.patrimonio_lifecycle_requests (
      id, owner_key, request_type, asset_code, title, reason, quantity,
      estimated_cost, requested_by
    ) values (
      v_id, p_owner_key, p_action #>> '{request,requestType}',
      nullif(p_action #>> '{request,assetId}', ''),
      left(trim(p_action #>> '{request,title}'), 180),
      left(trim(p_action #>> '{request,reason}'), 500),
      coalesce(nullif(p_action #>> '{request,quantity}', '')::integer, 1),
      coalesce(nullif(p_action #>> '{request,estimatedCost}', '')::numeric, 0),
      left(trim(p_actor), 180)
    );

  elsif v_action_type = 'decide_lifecycle_request' then
    if not coalesce(p_is_admin, false) then
      raise exception using errcode = '42501', message = 'admin_required';
    end if;
    v_id := (p_action ->> 'requestId')::uuid;
    v_status := trim(p_action ->> 'status');
    if v_status not in ('approved', 'rejected', 'completed', 'cancelled') then
      raise exception using errcode = '22023', message = 'invalid_request_status';
    end if;
    update public.patrimonio_lifecycle_requests
    set status = v_status, decided_by = left(trim(p_actor), 180), decided_at = now(),
      decision_note = left(trim(coalesce(p_action ->> 'note', '')), 500),
      completed_at = case when v_status = 'completed' then now() else completed_at end,
      updated_at = now()
    where owner_key = p_owner_key and id = v_id
      and status in ('pending_approval', 'approved');
    if not found then
      raise exception using errcode = 'P0002', message = 'request_not_changeable';
    end if;

  elsif v_action_type = 'create_custom_field' then
    if not coalesce(p_is_admin, false) then
      raise exception using errcode = '42501', message = 'admin_required';
    end if;
    v_id := (p_action #>> '{field,id}')::uuid;
    if p_action #>> '{field,fieldType}' not in ('text', 'number', 'date', 'boolean', 'select')
      or length(trim(coalesce(p_action #>> '{field,name}', ''))) < 2
    then
      raise exception using errcode = '22023', message = 'invalid_custom_field';
    end if;
    insert into public.patrimonio_custom_fields (
      id, owner_key, name, field_type, options, required, created_by
    ) values (
      v_id, p_owner_key, left(trim(p_action #>> '{field,name}'), 80),
      p_action #>> '{field,fieldType}',
      coalesce(p_action #> '{field,options}', '[]'::jsonb),
      coalesce((p_action #>> '{field,required}')::boolean, false),
      left(trim(p_actor), 180)
    );

  elsif v_action_type = 'set_asset_custom_value' then
    v_asset_code := trim(p_action ->> 'assetId');
    v_id := (p_action ->> 'fieldId')::uuid;
    v_json := p_action -> 'value';
    if v_json is null or not exists (
      select 1 from public.patrimonio_custom_fields
      where owner_key = p_owner_key and id = v_id and active
    ) or not exists (
      select 1 from public.patrimonio_assets
      where owner_key = p_owner_key and code = v_asset_code
    ) then
      raise exception using errcode = '22023', message = 'invalid_custom_value';
    end if;
    insert into public.patrimonio_asset_custom_values (
      owner_key, asset_code, field_id, value, updated_by
    ) values (
      p_owner_key, v_asset_code, v_id, v_json, left(trim(p_actor), 180)
    ) on conflict (owner_key, asset_code, field_id) do update set
      value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  elsif v_action_type = 'create_integration' then
    if not coalesce(p_is_admin, false) then
      raise exception using errcode = '42501', message = 'admin_required';
    end if;
    v_id := (p_action #>> '{integration,id}')::uuid;
    if p_action #>> '{integration,provider}' not in ('hr', 'erp', 'mdm', 'service_desk', 'iot', 'directory', 'custom')
      or p_action #>> '{integration,direction}' not in ('inbound', 'outbound', 'bidirectional')
      or length(trim(coalesce(p_action #>> '{integration,name}', ''))) < 2
    then
      raise exception using errcode = '22023', message = 'invalid_integration';
    end if;
    insert into public.patrimonio_integrations (
      id, owner_key, name, provider, direction, configuration, created_by, updated_by
    ) values (
      v_id, p_owner_key, left(trim(p_action #>> '{integration,name}'), 120),
      p_action #>> '{integration,provider}', p_action #>> '{integration,direction}',
      coalesce(p_action #> '{integration,configuration}', '{}'::jsonb),
      left(trim(p_actor), 180), left(trim(p_actor), 180)
    );

  elsif v_action_type = 'record_integration_event' then
    if not coalesce(p_is_admin, false) then
      raise exception using errcode = '42501', message = 'admin_required';
    end if;
    v_id := (p_action #>> '{event,id}')::uuid;
    v_related_id := (p_action #>> '{event,integrationId}')::uuid;
    insert into public.patrimonio_integration_events (
      id, owner_key, integration_id, external_id, event_type, entity_type,
      entity_id, payload, status, attempts, processed_at
    ) values (
      v_id, p_owner_key, v_related_id,
      left(trim(p_action #>> '{event,externalId}'), 180),
      left(trim(p_action #>> '{event,eventType}'), 120),
      left(trim(coalesce(p_action #>> '{event,entityType}', '')), 60),
      left(trim(coalesce(p_action #>> '{event,entityId}', '')), 180),
      coalesce(p_action #> '{event,payload}', '{}'::jsonb),
      'processed', 1, now()
    );
    update public.patrimonio_integrations
    set last_sync_at = now(), last_sync_status = 'success', updated_by = left(trim(p_actor), 180), updated_at = now()
    where owner_key = p_owner_key and id = v_related_id;

  elsif v_action_type = 'create_reconciliation_issue' then
    v_id := (p_action #>> '{issue,id}')::uuid;
    insert into public.patrimonio_reconciliation_issues (
      id, owner_key, integration_id, source, external_ref, entity_type,
      entity_id, issue_type, severity, details, assigned_to
    ) values (
      v_id, p_owner_key, nullif(p_action #>> '{issue,integrationId}', '')::uuid,
      left(trim(p_action #>> '{issue,source}'), 120),
      left(trim(coalesce(p_action #>> '{issue,externalRef}', '')), 180),
      left(trim(p_action #>> '{issue,entityType}'), 60),
      left(trim(coalesce(p_action #>> '{issue,entityId}', '')), 180),
      left(trim(p_action #>> '{issue,issueType}'), 120),
      coalesce(nullif(p_action #>> '{issue,severity}', ''), 'medium'),
      coalesce(p_action #> '{issue,details}', '{}'::jsonb),
      left(trim(coalesce(p_action #>> '{issue,assignedTo}', '')), 180)
    );

  elsif v_action_type = 'resolve_reconciliation_issue' then
    v_id := (p_action ->> 'issueId')::uuid;
    v_status := trim(p_action ->> 'status');
    if v_status not in ('resolved', 'ignored') then
      raise exception using errcode = '22023', message = 'invalid_reconciliation_status';
    end if;
    update public.patrimonio_reconciliation_issues
    set status = v_status, resolved_by = left(trim(p_actor), 180), resolved_at = now(),
      resolution_note = left(trim(coalesce(p_action ->> 'note', '')), 500)
    where owner_key = p_owner_key and id = v_id and status = 'open';
    if not found then
      raise exception using errcode = 'P0002', message = 'open_reconciliation_issue_not_found';
    end if;

  elsif v_action_type = 'create_asset_inspection' then
    v_id := (p_action #>> '{inspection,id}')::uuid;
    v_asset_code := trim(p_action #>> '{inspection,assetId}');
    if p_action #>> '{inspection,inspectionType}' not in ('condition', 'identification', 'count')
      or not exists (
        select 1 from public.patrimonio_assets
        where owner_key = p_owner_key and code = v_asset_code
      )
    then
      raise exception using errcode = '22023', message = 'invalid_asset_inspection';
    end if;
    insert into public.patrimonio_asset_inspections (
      id, owner_key, asset_code, document_id, inspection_type, requested_by
    ) values (
      v_id, p_owner_key, v_asset_code,
      nullif(p_action #>> '{inspection,documentId}', '')::uuid,
      p_action #>> '{inspection,inspectionType}', left(trim(p_actor), 180)
    );

  elsif v_action_type = 'record_asset_inspection_result' then
    if not coalesce(p_is_admin, false) then
      raise exception using errcode = '42501', message = 'admin_required';
    end if;
    v_id := (p_action ->> 'inspectionId')::uuid;
    v_status := trim(p_action ->> 'status');
    if v_status not in ('needs_review', 'failed') then
      raise exception using errcode = '22023', message = 'invalid_inspection_result_status';
    end if;
    update public.patrimonio_asset_inspections
    set status = v_status,
      provider = left(trim(coalesce(p_action ->> 'provider', 'manual')), 120),
      detected_asset_code = left(trim(coalesce(p_action ->> 'detectedAssetCode', '')), 24),
      confidence = nullif(p_action ->> 'confidence', '')::numeric,
      findings = coalesce(p_action -> 'findings', '{}'::jsonb),
      model_version = left(trim(coalesce(p_action ->> 'modelVersion', '')), 120),
      processed_at = now()
    where owner_key = p_owner_key and id = v_id and status in ('pending', 'processing');
    if not found then
      raise exception using errcode = 'P0002', message = 'inspection_not_processable';
    end if;

  elsif v_action_type = 'review_asset_inspection' then
    v_id := (p_action ->> 'inspectionId')::uuid;
    v_status := trim(p_action ->> 'status');
    if v_status not in ('approved', 'rejected') then
      raise exception using errcode = '22023', message = 'invalid_inspection_review';
    end if;
    update public.patrimonio_asset_inspections
    set status = v_status, reviewed_by = left(trim(p_actor), 180), reviewed_at = now(),
      review_note = left(trim(coalesce(p_action ->> 'note', '')), 500)
    where owner_key = p_owner_key and id = v_id and status = 'needs_review';
    if not found then
      raise exception using errcode = 'P0002', message = 'inspection_not_reviewable';
    end if;

  elsif v_action_type = 'record_inventory_checks_batch' then
    v_id := (p_action ->> 'campaignId')::uuid;
    v_json := p_action -> 'checks';
    if jsonb_typeof(v_json) <> 'array'
      or jsonb_array_length(v_json) not between 1 and 250
      or not exists (
        select 1 from public.patrimonio_inventory_campaigns
        where owner_key = p_owner_key and id = v_id and status = 'active'
      )
    then
      raise exception using errcode = '22023', message = 'invalid_inventory_batch';
    end if;
    for v_item_json in select value from jsonb_array_elements(v_json)
    loop
      v_asset_code := trim(v_item_json ->> 'assetId');
      v_result := trim(v_item_json ->> 'result');
      if v_result not in ('confirmed', 'missing', 'wrong_location', 'damaged') then
        raise exception using errcode = '22023', message = 'invalid_inventory_result';
      end if;
      update public.patrimonio_inventory_campaign_assets
      set result = v_result,
        observed_location = left(trim(coalesce(v_item_json ->> 'observedLocation', '')), 180),
        note = left(trim(coalesce(v_item_json ->> 'note', '')), 500),
        checked_by = left(trim(p_actor), 180), checked_at = now()
      where owner_key = p_owner_key and campaign_id = v_id and asset_code = v_asset_code;
      if not found then
        raise exception using errcode = 'P0002', message = 'campaign_asset_not_found';
      end if;
      if v_result in ('missing', 'wrong_location', 'damaged') then
        select status into v_previous_status from public.patrimonio_assets
        where owner_key = p_owner_key and code = v_asset_code for update;
        if v_previous_status not in ('discrepancy', 'retired') then
          update public.patrimonio_assets set status = 'discrepancy', updated_at = now()
          where owner_key = p_owner_key and code = v_asset_code;
          insert into public.patrimonio_movements (
            owner_key, asset_code, type, actor, from_label, to_label, note
          ) values (
            p_owner_key, v_asset_code, 'status_change', left(trim(p_actor), 180),
            v_previous_status, 'Divergência', 'Divergência registrada em inventário offline.'
          );
        end if;
      end if;
    end loop;
    update public.patrimonio_inventory_campaigns campaign
    set checked_count = summary.checked_count, issue_count = summary.issue_count, updated_at = now()
    from (
      select count(*) filter (where result <> 'pending')::integer as checked_count,
        count(*) filter (where result in ('missing', 'wrong_location', 'damaged'))::integer as issue_count
      from public.patrimonio_inventory_campaign_assets where campaign_id = v_id
    ) summary
    where campaign.owner_key = p_owner_key and campaign.id = v_id;

  else
    raise exception using errcode = '22023', message = 'unsupported_advanced_action';
  end if;

  update public.patrimonio_workspaces
  set revision = revision + 1, updated_at = now()
  where owner_key = p_owner_key
  returning revision into v_revision;

  return v_revision;
end;
$function$;

revoke all on function public.patrimonio_apply_advanced_action(
  text, text, text, boolean, bigint, jsonb
) from public, anon, authenticated;
grant execute on function public.patrimonio_apply_advanced_action(
  text, text, text, boolean, bigint, jsonb
) to service_role;

commit;
