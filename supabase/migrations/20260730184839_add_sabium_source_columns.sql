alter table public.patrimonio_assets
  add column source_system varchar(30),
  add column source_fingerprint varchar(64),
  add column base_code varchar(40),
  add column incorporation integer,
  add column source_identifier varchar(80),
  add column source_description varchar(500),
  add column asset_group varchar(160),
  add column branch_code varchar(80),
  add column disposed_at date,
  add column operation_value numeric(14, 2),
  add column invoice_number varchar(80),
  add column source_row integer;
