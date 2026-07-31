begin;

alter function public.patrimonio_apply_advanced_action(
  text, text, text, boolean, bigint, jsonb
) rename to patrimonio_apply_advanced_action_internal;

create function public.patrimonio_apply_advanced_action(
  p_owner_key text,
  p_actor text,
  p_actor_identifier text,
  p_is_admin boolean,
  p_expected_revision bigint,
  p_action jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_action jsonb := coalesce(p_action, '{}'::jsonb);
  v_action_type text := trim(coalesce(p_action ->> 'type', ''));
begin
  if v_action_type = 'upsert_asset_accounting' and not coalesce(p_is_admin, false) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if v_action_type = 'create_asset_contract' and not coalesce(p_is_admin, false) then
    v_action := jsonb_set(v_action, '{contract,monthlyCost}', '0'::jsonb, true);
  end if;

  return public.patrimonio_apply_advanced_action_internal(
    p_owner_key,
    p_actor,
    p_actor_identifier,
    p_is_admin,
    p_expected_revision,
    v_action
  );
end;
$function$;

revoke all on function public.patrimonio_apply_advanced_action(
  text, text, text, boolean, bigint, jsonb
) from public, anon, authenticated;
grant execute on function public.patrimonio_apply_advanced_action(
  text, text, text, boolean, bigint, jsonb
) to service_role;

revoke all on function public.patrimonio_apply_advanced_action_internal(
  text, text, text, boolean, bigint, jsonb
) from public, anon, authenticated;
grant execute on function public.patrimonio_apply_advanced_action_internal(
  text, text, text, boolean, bigint, jsonb
) to service_role;

commit;
