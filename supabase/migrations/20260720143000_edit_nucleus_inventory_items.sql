begin;

set local lock_timeout = '5s';

alter table public.patrimonio_movements
  drop constraint patrimonio_movements_type_check;

alter table public.patrimonio_movements
  add constraint patrimonio_movements_type_check
  check (type in ('registration', 'transfer', 'status_change', 'identifier_change', 'details_update', 'import'));

do $migration$
declare
  function_definition text;
  declaration_marker text := '  v_to_label text;';
  action_marker text := chr(10) || '  elsif v_action_type = ''update_collaborator'' then';
  action_branch text;
begin
  select pg_get_functiondef(
    'public.patrimonio_apply_action(text,text,bigint,jsonb)'::regprocedure
  ) into function_definition;

  if position('update_asset_details' in function_definition) = 0 then
    if position(declaration_marker in function_definition) = 0 then
      raise exception 'patrimonio_apply_action declaration marker not found';
    end if;

    function_definition := replace(
      function_definition,
      declaration_marker,
      declaration_marker || chr(10) ||
        '  v_current_asset jsonb;' || chr(10) ||
        '  v_next_asset jsonb;' || chr(10) ||
        '  v_changed_fields text[];'
    );

    action_branch := $branch$
  elsif v_action_type = 'update_asset_details' then
    v_asset_code := trim(p_action ->> 'assetId');

    if p_action -> 'asset' is null or jsonb_typeof(p_action -> 'asset') <> 'object' then
      raise exception using errcode = '22023', message = 'invalid_asset_details';
    end if;
    if p_action #>> '{asset,type}' not in ('cpu', 'monitor_1', 'monitor_2', 'chair', 'notebook') then
      raise exception using errcode = '22023', message = 'invalid_asset_type';
    end if;
    if length(trim(coalesce(p_action #>> '{asset,brandModel}', ''))) = 0
      or length(trim(p_action #>> '{asset,brandModel}')) > 180 then
      raise exception using errcode = '22023', message = 'invalid_brand_model';
    end if;
    if length(trim(coalesce(p_action #>> '{asset,location}', ''))) = 0
      or length(trim(p_action #>> '{asset,location}')) > 180 then
      raise exception using errcode = '22023', message = 'invalid_asset_location';
    end if;
    if length(trim(coalesce(p_action ->> 'note', ''))) = 0
      or length(trim(p_action ->> 'note')) > 500 then
      raise exception using errcode = '22023', message = 'invalid_asset_details_note';
    end if;
    if length(trim(coalesce(p_action #>> '{asset,serial}', ''))) > 500
      or length(trim(coalesce(p_action #>> '{asset,assignee}', ''))) > 500
      or length(trim(coalesce(p_action #>> '{asset,notes}', ''))) > 500 then
      raise exception using errcode = '22023', message = 'asset_details_too_long';
    end if;
    if coalesce(p_action #>> '{asset,acquiredAt}', '') <> ''
      and p_action #>> '{asset,acquiredAt}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception using errcode = '22023', message = 'invalid_acquired_at';
    end if;

    select to_jsonb(asset)
    into v_current_asset
    from public.patrimonio_assets asset
    where asset.owner_key = p_owner_key
      and asset.code = v_asset_code
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'asset_not_found';
    end if;

    v_next_asset := jsonb_build_object(
      'type', p_action #>> '{asset,type}',
      'brand_model', trim(p_action #>> '{asset,brandModel}'),
      'serial', trim(coalesce(p_action #>> '{asset,serial}', '')),
      'assignee', trim(coalesce(p_action #>> '{asset,assignee}', '')),
      'location', trim(p_action #>> '{asset,location}'),
      'acquired_at', nullif(p_action #>> '{asset,acquiredAt}', ''),
      'notes', trim(coalesce(p_action #>> '{asset,notes}', ''))
    );

    v_changed_fields := array_remove(array[
      case when v_current_asset ->> 'type' is distinct from v_next_asset ->> 'type' then 'tipo' end,
      case when v_current_asset ->> 'brand_model' is distinct from v_next_asset ->> 'brand_model' then 'marca e modelo' end,
      case when v_current_asset ->> 'serial' is distinct from v_next_asset ->> 'serial' then 'número de série' end,
      case when v_current_asset ->> 'assignee' is distinct from v_next_asset ->> 'assignee' then 'responsável' end,
      case when v_current_asset ->> 'location' is distinct from v_next_asset ->> 'location' then 'localização' end,
      case when v_current_asset ->> 'acquired_at' is distinct from v_next_asset ->> 'acquired_at' then 'data de aquisição' end,
      case when v_current_asset ->> 'notes' is distinct from v_next_asset ->> 'notes' then 'observações' end
    ], null);

    if cardinality(v_changed_fields) = 0 then
      raise exception using errcode = '22023', message = 'unchanged_asset_details';
    end if;

    update public.patrimonio_assets
    set type = v_next_asset ->> 'type',
        brand_model = v_next_asset ->> 'brand_model',
        serial = v_next_asset ->> 'serial',
        assignee = v_next_asset ->> 'assignee',
        location = v_next_asset ->> 'location',
        acquired_at = nullif(v_next_asset ->> 'acquired_at', '')::date,
        notes = v_next_asset ->> 'notes',
        updated_at = now()
    where owner_key = p_owner_key
      and code = v_asset_code;

    insert into public.patrimonio_movements (
      owner_key, asset_code, type, actor, from_label, to_label, note
    ) values (
      p_owner_key,
      v_asset_code,
      'details_update',
      p_actor,
      'Cadastro anterior',
      'Campos atualizados: ' || array_to_string(v_changed_fields, ', '),
      trim(p_action ->> 'note')
    );

  elsif v_action_type = 'update_collaborator' then$branch$;

    if position(action_marker in function_definition) = 0 then
      raise exception 'patrimonio_apply_action update_collaborator marker not found';
    end if;

    execute replace(function_definition, action_marker, action_branch);
  end if;
end;
$migration$;

revoke all on function public.patrimonio_apply_action(text, text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.patrimonio_apply_action(text, text, bigint, jsonb)
  to service_role;

commit;
