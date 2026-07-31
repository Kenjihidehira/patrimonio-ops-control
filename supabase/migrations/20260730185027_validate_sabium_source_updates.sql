drop trigger if exists patrimonio_assets_validate_department on public.patrimonio_assets;
create trigger patrimonio_assets_validate_department before insert or update of owner_key, code, type, source_system on public.patrimonio_assets for each row execute function public.patrimonio_validate_asset_department();
