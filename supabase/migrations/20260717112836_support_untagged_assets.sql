begin;

alter table public.patrimonio_assets
  drop constraint patrimonio_assets_code_check;

alter table public.patrimonio_assets
  add constraint patrimonio_assets_code_check
  check (code ~ '^([0-9]{6}|S[A-Z0-9]{5})$');

commit;
