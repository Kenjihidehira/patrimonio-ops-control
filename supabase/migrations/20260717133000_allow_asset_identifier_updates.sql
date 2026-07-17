begin;

set local lock_timeout = '5s';

alter table public.patrimonio_movements
  drop constraint patrimonio_movements_owner_key_asset_code_fkey;

alter table public.patrimonio_movements
  add constraint patrimonio_movements_owner_key_asset_code_fkey
  foreign key (owner_key, asset_code)
  references public.patrimonio_assets(owner_key, code)
  on update cascade
  on delete cascade;

alter table public.patrimonio_movements
  drop constraint patrimonio_movements_type_check;

alter table public.patrimonio_movements
  add constraint patrimonio_movements_type_check
  check (type in ('registration', 'transfer', 'status_change', 'identifier_change', 'import'));

do $migration$
declare
  function_definition text;
  marker text;
  replacement text;
begin
  select pg_get_functiondef(
    'public.patrimonio_apply_action(text,text,bigint,jsonb)'::regprocedure
  ) into function_definition;

  if position('update_asset_identifier' in function_definition) = 0 then
    marker := chr(10) || '  elsif v_action_type = ''update_collaborator'' then';
    replacement := $branch$
  elsif v_action_type = 'update_asset_identifier' then
    v_asset_code := trim(p_action ->> 'assetId');
    v_to_label := trim(p_action ->> 'newAssetId');

    if v_to_label !~ '^[0-9]{6}$' then
      raise exception using errcode = '22023', message = 'invalid_asset_code';
    end if;
    if v_asset_code = v_to_label then
      raise exception using errcode = '22023', message = 'asset_code_unchanged';
    end if;
    if length(trim(coalesce(p_action ->> 'note', ''))) = 0
      or length(trim(p_action ->> 'note')) > 500 then
      raise exception using errcode = '22023', message = 'invalid_identifier_change_note';
    end if;

    select code, status, assignee
    into v_asset_code, v_previous_status, v_previous_assignee
    from public.patrimonio_assets
    where owner_key = p_owner_key
      and code = v_asset_code
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'asset_not_found';
    end if;
    if exists (
      select 1
      from public.patrimonio_assets
      where owner_key = p_owner_key
        and code = v_to_label
    ) then
      raise exception using errcode = '23505', message = 'asset_code_exists';
    end if;

    v_next_status := case
      when v_asset_code ~ '^S[A-Z0-9]{5}$' and v_previous_status = 'discrepancy'
        then case when length(trim(v_previous_assignee)) > 0 then 'allocated' else 'available' end
      else v_previous_status
    end;
    v_from_label := case
      when v_asset_code ~ '^S[A-Z0-9]{5}$'
        then 'Sem patrimônio · Referência interna ' || v_asset_code
      else '#' || v_asset_code
    end;

    update public.patrimonio_assets
    set code = v_to_label,
        status = v_next_status,
        updated_at = now()
    where owner_key = p_owner_key
      and code = v_asset_code;

    insert into public.patrimonio_movements (
      owner_key, asset_code, type, actor, from_label, to_label, note
    ) values (
      p_owner_key,
      v_to_label,
      'identifier_change',
      p_actor,
      v_from_label,
      '#' || v_to_label || case
        when v_asset_code ~ '^S[A-Z0-9]{5}$'
          then ' · ' || case v_next_status
            when 'allocated' then 'Em uso'
            when 'available' then 'Disponível'
            else 'Divergência'
          end
        else ''
      end,
      trim(p_action ->> 'note')
    );

  elsif v_action_type = 'update_collaborator' then$branch$;

    if position(marker in function_definition) = 0 then
      raise exception 'patrimonio_apply_action update_collaborator marker not found';
    end if;
    execute replace(function_definition, marker, replacement);
  end if;
end;
$migration$;

revoke all on function public.patrimonio_apply_action(text, text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.patrimonio_apply_action(text, text, bigint, jsonb)
  to service_role;

commit;
