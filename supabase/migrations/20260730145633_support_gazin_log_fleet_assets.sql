begin;

set local lock_timeout = '5s';

alter table public.patrimonio_movements
  drop constraint patrimonio_movements_owner_key_asset_code_fkey;

alter table public.patrimonio_asset_aliases
  drop constraint patrimonio_asset_aliases_owner_key_asset_code_fkey;

alter table public.patrimonio_assets
  drop constraint patrimonio_assets_code_check,
  drop constraint patrimonio_assets_type_check;

alter table public.patrimonio_asset_aliases
  drop constraint patrimonio_asset_aliases_source_code_check;

alter table public.patrimonio_assets
  alter column code type varchar(16) using trim(code::text);

alter table public.patrimonio_movements
  alter column asset_code type varchar(16) using trim(asset_code::text);

alter table public.patrimonio_asset_aliases
  alter column source_code type varchar(16) using trim(source_code::text),
  alter column asset_code type varchar(16) using trim(asset_code::text);

alter table public.patrimonio_assets
  add constraint patrimonio_assets_code_check
  check (
    (
      type = 'fleet'
      and code ~ '^[0-9]{1,10}\.0$'
    )
    or (
      type <> 'fleet'
      and code ~ '^([0-9]{6}|S[A-Z0-9]{5})$'
    )
  ),
  add constraint patrimonio_assets_type_check
  check (type in ('cpu', 'monitor_1', 'monitor_2', 'chair', 'notebook', 'fleet'));

alter table public.patrimonio_asset_aliases
  add constraint patrimonio_asset_aliases_source_code_check
  check (source_code ~ '^([0-9]{6}|[0-9]{1,10}\.0|S[A-Z0-9]{5})$');

alter table public.patrimonio_movements
  add constraint patrimonio_movements_owner_key_asset_code_fkey
  foreign key (owner_key, asset_code)
  references public.patrimonio_assets(owner_key, code)
  on update cascade
  on delete cascade;

alter table public.patrimonio_asset_aliases
  add constraint patrimonio_asset_aliases_owner_key_asset_code_fkey
  foreign key (owner_key, asset_code)
  references public.patrimonio_assets(owner_key, code)
  on update cascade
  on delete cascade;

create or replace function public.patrimonio_validate_asset_department()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if new.type = 'fleet'
    and not exists (
      select 1
      from public.patrimonio_departments department
      where department.owner_key = new.owner_key
        and department.slug = 'gazin-log'
        and department.active
    )
  then
    raise exception using errcode = '22023', message = 'fleet_department_required';
  end if;

  return new;
end;
$function$;

drop trigger if exists patrimonio_assets_validate_department
  on public.patrimonio_assets;

create trigger patrimonio_assets_validate_department
before insert or update of owner_key, code, type
on public.patrimonio_assets
for each row execute function public.patrimonio_validate_asset_department();

revoke all on function public.patrimonio_validate_asset_department()
  from public, anon, authenticated;
grant execute on function public.patrimonio_validate_asset_department()
  to service_role;

do $migration$
declare
  function_definition text;
  old_validation text := $old$    if v_to_label !~ '^[0-9]{6}$' then
      raise exception using errcode = '22023', message = 'invalid_asset_code';
    end if;$old$;
  new_validation text := $new$    if v_to_label !~ '^([0-9]{6}|[0-9]{1,10}\.0)$' then
      raise exception using errcode = '22023', message = 'invalid_asset_code';
    end if;$new$;
begin
  select pg_get_functiondef(
    'public.patrimonio_apply_action(text,text,bigint,jsonb)'::regprocedure
  ) into function_definition;

  if position(new_validation in function_definition) = 0 then
    if position(old_validation in function_definition) = 0 then
      raise exception 'patrimonio_apply_action asset validation marker not found';
    end if;

    execute replace(function_definition, old_validation, new_validation);
  end if;
end;
$migration$;

revoke all on function public.patrimonio_apply_action(text, text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.patrimonio_apply_action(text, text, bigint, jsonb)
  to service_role;

commit;
