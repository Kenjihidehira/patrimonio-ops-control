alter table public.patrimonio_movements
  drop constraint patrimonio_movements_owner_key_asset_code_fkey;

alter table public.patrimonio_movements
  add constraint patrimonio_movements_owner_key_asset_code_fkey
  foreign key (owner_key, asset_code)
  references public.patrimonio_assets(owner_key, code)
  on delete cascade;

create index patrimonio_movements_owner_asset_idx
  on public.patrimonio_movements (owner_key, asset_code);

create policy patrimonio_workspaces_no_direct_access
  on public.patrimonio_workspaces for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_nuclei_no_direct_access
  on public.patrimonio_nuclei for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_assets_no_direct_access
  on public.patrimonio_assets for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_movements_no_direct_access
  on public.patrimonio_movements for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_import_runs_no_direct_access
  on public.patrimonio_import_runs for all to anon, authenticated
  using (false) with check (false);
