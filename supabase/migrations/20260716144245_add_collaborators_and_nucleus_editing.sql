begin;

create table if not exists public.patrimonio_collaborators (
  owner_key text not null references public.patrimonio_workspaces(owner_key) on delete cascade,
  id varchar(80) not null,
  name varchar(180) not null,
  nucleus_id varchar(60) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_key, id),
  foreign key (owner_key, nucleus_id)
    references public.patrimonio_nuclei(owner_key, id),
  constraint patrimonio_collaborators_id_check check (id ~ '^[a-z0-9-]+$'),
  constraint patrimonio_collaborators_name_check check (length(trim(name)) between 1 and 180)
);

create index if not exists patrimonio_collaborators_owner_nucleus_idx
  on public.patrimonio_collaborators (owner_key, nucleus_id);
create index if not exists patrimonio_collaborators_owner_name_idx
  on public.patrimonio_collaborators (owner_key, lower(name));

alter table public.patrimonio_collaborators enable row level security;
revoke all on table public.patrimonio_collaborators from public, anon, authenticated;
grant all on table public.patrimonio_collaborators to service_role;

do $migration$
declare
  function_definition text;
  marker text;
  replacement text;
begin
  select pg_get_functiondef(
    'public.patrimonio_apply_action(text,text,bigint,jsonb)'::regprocedure
  ) into function_definition;

  if position('update_nucleus' in function_definition) = 0 then
    marker := chr(10) || '  elsif v_action_type = ''create_asset'' then';
    replacement := chr(10) || '  elsif v_action_type = ''update_nucleus'' then' || chr(10) ||
      '    update public.patrimonio_nuclei' || chr(10) ||
      '    set' || chr(10) ||
      '      code = upper(p_action #>> ''{nucleus,code}''),' || chr(10) ||
      '      name = p_action #>> ''{nucleus,name}'',' || chr(10) ||
      '      location = p_action #>> ''{nucleus,location}'',' || chr(10) ||
      '      manager = p_action #>> ''{nucleus,manager}'',' || chr(10) ||
      '      updated_at = now()' || chr(10) ||
      '    where owner_key = p_owner_key' || chr(10) ||
      '      and id = p_action #>> ''{nucleus,id}'';' || chr(10) || chr(10) ||
      '    if not found then' || chr(10) ||
      '      raise exception using errcode = ''P0002'', message = ''nucleus_not_found'';' || chr(10) ||
      '    end if;' || chr(10) || chr(10) ||
      '  elsif v_action_type = ''create_asset'' then';

    if position(marker in function_definition) = 0 then
      raise exception 'patrimonio_apply_action marker not found';
    end if;
    execute replace(function_definition, marker, replacement);
  end if;

  select pg_get_functiondef(
    'public.patrimonio_import_assets(text,text,bigint,text,jsonb,jsonb,integer,jsonb)'::regprocedure
  ) into function_definition;
  function_definition := replace(
    function_definition,
    'if v_row_count = 0 or v_row_count > 2000 then',
    'if v_row_count > 2000 then'
  );
  execute function_definition;
end;
$migration$;

create or replace function public.patrimonio_import_workspace(
  p_owner_key text,
  p_actor text,
  p_expected_revision bigint,
  p_file_name text,
  p_nuclei jsonb,
  p_assets jsonb,
  p_rejected_count integer,
  p_warnings jsonb,
  p_collaborators jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_collaborator_count integer;
begin
  if jsonb_typeof(p_collaborators) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_collaborators_payload';
  end if;

  v_result := public.patrimonio_import_assets(
    p_owner_key,
    p_actor,
    p_expected_revision,
    p_file_name,
    p_nuclei,
    p_assets,
    p_rejected_count,
    p_warnings
  );

  insert into public.patrimonio_collaborators (
    owner_key, id, name, nucleus_id
  )
  select
    p_owner_key,
    row.id,
    row.name,
    row."nucleusId"
  from jsonb_to_recordset(p_collaborators) as row(
    id text,
    name text,
    "nucleusId" text
  )
  on conflict (owner_key, id) do update
  set
    name = excluded.name,
    nucleus_id = excluded.nucleus_id,
    updated_at = now();

  v_collaborator_count := jsonb_array_length(p_collaborators);
  return v_result || jsonb_build_object('collaborators', v_collaborator_count);
end;
$function$;

revoke all on function public.patrimonio_import_workspace(
  text, text, bigint, text, jsonb, jsonb, integer, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.patrimonio_import_workspace(
  text, text, bigint, text, jsonb, jsonb, integer, jsonb, jsonb
) to service_role;

commit;
