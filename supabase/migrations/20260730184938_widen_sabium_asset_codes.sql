drop trigger if exists patrimonio_assets_validate_department on public.patrimonio_assets;
alter table public.patrimonio_movements drop constraint patrimonio_movements_owner_key_asset_code_fkey;
alter table public.patrimonio_asset_aliases drop constraint patrimonio_asset_aliases_owner_key_asset_code_fkey;
alter table public.patrimonio_assets alter column code type varchar(24);
alter table public.patrimonio_movements alter column asset_code type varchar(24);
alter table public.patrimonio_asset_aliases alter column asset_code type varchar(24);
alter table public.patrimonio_movements add constraint patrimonio_movements_owner_key_asset_code_fkey foreign key (owner_key, asset_code) references public.patrimonio_assets(owner_key, code) on update cascade on delete cascade;
alter table public.patrimonio_asset_aliases add constraint patrimonio_asset_aliases_owner_key_asset_code_fkey foreign key (owner_key, asset_code) references public.patrimonio_assets(owner_key, code) on update cascade on delete cascade;
create trigger patrimonio_assets_validate_department before insert or update of owner_key, code, type on public.patrimonio_assets for each row execute function public.patrimonio_validate_asset_department();
