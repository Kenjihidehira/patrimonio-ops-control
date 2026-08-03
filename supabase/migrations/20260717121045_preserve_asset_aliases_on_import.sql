begin;

set local lock_timeout = '5s';

create table public.patrimonio_asset_aliases (
  owner_key text not null references public.patrimonio_workspaces(owner_key) on delete cascade,
  source_code char(6) not null,
  asset_code char(6) not null,
  created_at timestamptz not null default now(),
  primary key (owner_key, source_code),
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code)
    on update cascade
    on delete cascade,
  constraint patrimonio_asset_aliases_source_code_check
    check (source_code ~ '^([0-9]{6}|S[A-Z0-9]{5})$')
);

alter table public.patrimonio_asset_aliases enable row level security;

create policy patrimonio_asset_aliases_no_direct_access
  on public.patrimonio_asset_aliases for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.patrimonio_asset_aliases from anon, authenticated;
grant all on table public.patrimonio_asset_aliases to service_role;

do $migration$
declare
  function_definition text;
  duplicate_marker text;
  duplicate_replacement text;
  movement_marker text;
  movement_replacement text;
begin
  select pg_get_functiondef(
    'public.patrimonio_apply_action(text,text,bigint,jsonb)'::regprocedure
  ) into function_definition;

  if position('insert into public.patrimonio_asset_aliases' in function_definition) = 0 then
    duplicate_marker := $marker$    if exists (
      select 1
      from public.patrimonio_assets
      where owner_key = p_owner_key
        and code = v_to_label
    ) then
      raise exception using errcode = '23505', message = 'asset_code_exists';
    end if;$marker$;
    duplicate_replacement := $replacement$    if exists (
      select 1
      from public.patrimonio_assets
      where owner_key = p_owner_key
        and code = v_to_label
    ) or exists (
      select 1
      from public.patrimonio_asset_aliases
      where owner_key = p_owner_key
        and source_code = v_to_label
        and asset_code <> v_asset_code
    ) then
      raise exception using errcode = '23505', message = 'asset_code_exists';
    end if;$replacement$;

    movement_marker := $marker$    update public.patrimonio_assets
    set code = v_to_label,
        status = v_next_status,
        updated_at = now()
    where owner_key = p_owner_key
      and code = v_asset_code;

    insert into public.patrimonio_movements ($marker$;
    movement_replacement := $replacement$    update public.patrimonio_assets
    set code = v_to_label,
        status = v_next_status,
        updated_at = now()
    where owner_key = p_owner_key
      and code = v_asset_code;

    insert into public.patrimonio_asset_aliases (owner_key, source_code, asset_code)
    values (p_owner_key, v_asset_code, v_to_label)
    on conflict (owner_key, source_code) do update
    set asset_code = excluded.asset_code;

    insert into public.patrimonio_movements ($replacement$;

    if position(duplicate_marker in function_definition) = 0 then
      raise exception 'patrimonio_apply_action duplicate marker not found';
    end if;
    if position(movement_marker in function_definition) = 0 then
      raise exception 'patrimonio_apply_action movement marker not found';
    end if;

    function_definition := replace(function_definition, duplicate_marker, duplicate_replacement);
    function_definition := replace(function_definition, movement_marker, movement_replacement);
    execute function_definition;
  end if;
end;
$migration$;

alter function public.patrimonio_import_assets(
  text, text, bigint, text, jsonb, jsonb, integer, jsonb
) rename to patrimonio_import_assets_without_aliases;

create function public.patrimonio_import_assets(
  p_owner_key text,
  p_actor text,
  p_expected_revision bigint,
  p_file_name text,
  p_nuclei jsonb,
  p_assets jsonb,
  p_rejected_count integer,
  p_warnings jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_assets jsonb;
begin
  if jsonb_typeof(p_assets) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_import_payload';
  end if;

  select coalesce(
    jsonb_agg(
      case
        when alias.asset_code is null then source.item
        else jsonb_set(
          jsonb_set(source.item, '{code}', to_jsonb(trim(alias.asset_code::text))),
          '{status}',
          to_jsonb(asset.status)
        )
      end
      order by source.position
    ),
    '[]'::jsonb
  )
  into v_assets
  from jsonb_array_elements(p_assets) with ordinality as source(item, position)
  left join public.patrimonio_asset_aliases alias
    on alias.owner_key = p_owner_key
    and alias.source_code = trim(source.item ->> 'code')
  left join public.patrimonio_assets asset
    on asset.owner_key = alias.owner_key
    and asset.code = alias.asset_code;

  return public.patrimonio_import_assets_without_aliases(
    p_owner_key,
    p_actor,
    p_expected_revision,
    p_file_name,
    p_nuclei,
    v_assets,
    p_rejected_count,
    p_warnings
  );
end;
$function$;

revoke all on function public.patrimonio_import_assets(
  text, text, bigint, text, jsonb, jsonb, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.patrimonio_import_assets(
  text, text, bigint, text, jsonb, jsonb, integer, jsonb
) to service_role;

revoke all on function public.patrimonio_import_assets_without_aliases(
  text, text, bigint, text, jsonb, jsonb, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.patrimonio_import_assets_without_aliases(
  text, text, bigint, text, jsonb, jsonb, integer, jsonb
) to service_role;

revoke all on function public.patrimonio_apply_action(text, text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.patrimonio_apply_action(text, text, bigint, jsonb)
  to service_role;

commit;
