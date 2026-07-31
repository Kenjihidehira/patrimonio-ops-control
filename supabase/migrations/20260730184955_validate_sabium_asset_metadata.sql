alter table public.patrimonio_assets
  drop constraint patrimonio_assets_code_check,
  drop constraint patrimonio_assets_type_check;

alter table public.patrimonio_assets
  add constraint patrimonio_assets_code_check check (code ~ '^([0-9]{6}|[0-9]{1,10}\.0|S[A-Z0-9]{5}|G[A-F0-9]{20})$'),
  add constraint patrimonio_assets_type_check check (type in ('cpu','monitor_1','monitor_2','chair','notebook','fleet','car','trailer','vehicle_component','equipment','furniture','extinguisher','software','other')),
  add constraint patrimonio_assets_source_system_check check (source_system is null or source_system = 'sabium'),
  add constraint patrimonio_assets_source_fields_check check ((source_system is null and source_fingerprint is null and source_row is null) or (source_system = 'sabium' and code ~ '^G[A-F0-9]{20}$' and source_fingerprint ~ '^[a-f0-9]{64}$' and length(trim(base_code)) > 0 and incorporation >= 0 and length(trim(source_identifier)) > 0 and length(trim(source_description)) > 0 and source_row > 1)),
  add constraint patrimonio_assets_operation_value_check check (operation_value is null or (operation_value >= 0 and operation_value <= 100000000));

create unique index patrimonio_assets_owner_source_fingerprint_uidx on public.patrimonio_assets (owner_key, source_system, source_fingerprint) where source_system is not null;
create index patrimonio_assets_owner_source_identifier_idx on public.patrimonio_assets (owner_key, source_identifier) where source_identifier is not null;
create index patrimonio_assets_owner_base_code_idx on public.patrimonio_assets (owner_key, base_code, incorporation) where base_code is not null;

create or replace function public.patrimonio_validate_asset_department()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if (new.type = 'fleet' or new.source_system = 'sabium') and not exists (
    select 1 from public.patrimonio_departments department
    where department.owner_key = new.owner_key and department.slug = 'gazin-log' and department.active
  ) then
    if new.source_system = 'sabium' then
      raise exception using errcode = '22023', message = 'sabium_department_required';
    end if;
    raise exception using errcode = '22023', message = 'fleet_department_required';
  end if;
  return new;
end;
$function$;

revoke all on function public.patrimonio_validate_asset_department() from public, anon, authenticated;
grant execute on function public.patrimonio_validate_asset_department() to service_role;
