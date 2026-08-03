begin;

set local lock_timeout = '5s';

do $migration$
declare
  function_definition text;
  action_marker text := chr(10) || '  elsif v_action_type = ''update_collaborator'' then';
  action_branch text;
begin
  select pg_get_functiondef(
    'public.patrimonio_apply_action(text,text,bigint,jsonb)'::regprocedure
  ) into function_definition;

  if position('register_responsible' in function_definition) = 0 then
    action_branch := $branch$
  elsif v_action_type = 'register_responsible' then
    if coalesce(p_action #>> '{responsible,id}', '') !~ '^[a-z0-9-]{1,80}$' then
      raise exception using errcode = '22023', message = 'invalid_collaborator_id';
    end if;
    if length(trim(coalesce(p_action #>> '{responsible,name}', ''))) not between 1 and 180 then
      raise exception using errcode = '22023', message = 'invalid_collaborator_name';
    end if;
    if length(trim(coalesce(p_action #>> '{responsible,previousName}', ''))) not between 1 and 180 then
      raise exception using errcode = '22023', message = 'invalid_previous_responsible';
    end if;
    if not exists (
      select 1
      from public.patrimonio_nuclei
      where owner_key = p_owner_key
        and id = p_action #>> '{responsible,nucleusId}'
    ) then
      raise exception using errcode = '23503', message = 'nucleus_not_found';
    end if;
    if exists (
      select 1
      from public.patrimonio_collaborators
      where owner_key = p_owner_key
        and lower(trim(name)) = lower(trim(p_action #>> '{responsible,name}'))
    ) then
      raise exception using errcode = '23505', message = 'collaborator_exists';
    end if;

    update public.patrimonio_assets
    set assignee = trim(p_action #>> '{responsible,name}'),
        updated_at = now()
    where owner_key = p_owner_key
      and lower(trim(assignee)) = lower(trim(p_action #>> '{responsible,previousName}'));

    if not found then
      raise exception using errcode = 'P0002', message = 'responsible_not_found';
    end if;

    insert into public.patrimonio_collaborators (
      owner_key, id, name, nucleus_id
    ) values (
      p_owner_key,
      p_action #>> '{responsible,id}',
      trim(p_action #>> '{responsible,name}'),
      p_action #>> '{responsible,nucleusId}'
    );

  elsif v_action_type = 'update_collaborator' then$branch$;

    if position(action_marker in function_definition) = 0 then
      raise exception 'patrimonio_apply_action update_collaborator marker not found';
    end if;

    execute replace(function_definition, action_marker, action_branch);
  end if;
end;
$migration$;

revoke all on function public.patrimonio_apply_action(text, text, bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.patrimonio_apply_action(text, text, bigint,jsonb)
  to service_role;

commit;
