begin;

create unique index if not exists patrimonio_collaborators_owner_nucleus_name_uidx
  on public.patrimonio_collaborators (owner_key, nucleus_id, lower(trim(name)));

do $migration$
declare
  function_definition text;
  marker text;
  replacement text;
begin
  select pg_get_functiondef(
    'public.patrimonio_apply_action(text,text,bigint,jsonb)'::regprocedure
  ) into function_definition;

  if position('update_collaborator' in function_definition) = 0 then
    marker := chr(10) || '  elsif v_action_type = ''update_nucleus'' then';
    replacement := chr(10) || '  elsif v_action_type = ''update_collaborator'' then' || chr(10) ||
      '    update public.patrimonio_assets asset' || chr(10) ||
      '    set assignee = p_action #>> ''{collaborator,name}'',' || chr(10) ||
      '        updated_at = now()' || chr(10) ||
      '    where asset.owner_key = p_owner_key' || chr(10) ||
      '      and lower(trim(asset.assignee)) = lower(trim((' || chr(10) ||
      '        select collaborator.name' || chr(10) ||
      '        from public.patrimonio_collaborators collaborator' || chr(10) ||
      '        where collaborator.owner_key = p_owner_key' || chr(10) ||
      '          and collaborator.id = p_action #>> ''{collaborator,id}''' || chr(10) ||
      '      )));' || chr(10) || chr(10) ||
      '    update public.patrimonio_collaborators' || chr(10) ||
      '    set' || chr(10) ||
      '      name = p_action #>> ''{collaborator,name}'',' || chr(10) ||
      '      nucleus_id = p_action #>> ''{collaborator,nucleusId}'',' || chr(10) ||
      '      updated_at = now()' || chr(10) ||
      '    where owner_key = p_owner_key' || chr(10) ||
      '      and id = p_action #>> ''{collaborator,id}'';' || chr(10) || chr(10) ||
      '    if not found then' || chr(10) ||
      '      raise exception using errcode = ''P0002'', message = ''collaborator_not_found'';' || chr(10) ||
      '    end if;' || chr(10) || chr(10) ||
      '  elsif v_action_type = ''update_nucleus'' then';

    if position(marker in function_definition) = 0 then
      raise exception 'patrimonio_apply_action update_nucleus marker not found';
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
