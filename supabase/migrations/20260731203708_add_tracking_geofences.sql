create table public.patrimonio_tracking_geofences (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  asset_code varchar(24) not null,
  name varchar(120) not null,
  rule text not null default 'inside_required',
  center_latitude numeric(9, 6) not null,
  center_longitude numeric(9, 6) not null,
  radius_meters numeric(10, 2) not null,
  severity text not null default 'high',
  active boolean not null default true,
  created_by varchar(180) not null,
  created_at timestamptz not null default now(),
  updated_by varchar(180) not null,
  updated_at timestamptz not null default now(),
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  constraint patrimonio_tracking_geofences_name_check
    check (length(trim(name)) between 2 and 120),
  constraint patrimonio_tracking_geofences_rule_check
    check (rule in ('inside_required', 'outside_forbidden')),
  constraint patrimonio_tracking_geofences_latitude_check
    check (center_latitude between -90 and 90),
  constraint patrimonio_tracking_geofences_longitude_check
    check (center_longitude between -180 and 180),
  constraint patrimonio_tracking_geofences_radius_check
    check (radius_meters between 5 and 100000),
  constraint patrimonio_tracking_geofences_severity_check
    check (severity in ('low', 'medium', 'high', 'critical')),
  unique (owner_key, id)
);

create index patrimonio_tracking_geofences_owner_asset_idx
  on public.patrimonio_tracking_geofences (owner_key, asset_code, active);

create table public.patrimonio_tracking_alerts (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  asset_code varchar(24) not null,
  event_id uuid not null,
  geofence_id uuid,
  alert_type text not null,
  severity text not null,
  status text not null default 'open',
  title varchar(180) not null,
  message varchar(500) not null,
  detected_at timestamptz not null default now(),
  responded_by varchar(180),
  responded_at timestamptz,
  response_note varchar(500) not null default '',
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  foreign key (owner_key, geofence_id)
    references public.patrimonio_tracking_geofences(owner_key, id) on delete restrict,
  foreign key (event_id)
    references public.patrimonio_tracking_events(id) on delete restrict,
  constraint patrimonio_tracking_alerts_type_check
    check (alert_type in ('geofence', 'low_battery')),
  constraint patrimonio_tracking_alerts_geofence_check
    check ((alert_type = 'geofence') = (geofence_id is not null)),
  constraint patrimonio_tracking_alerts_severity_check
    check (severity in ('low', 'medium', 'high', 'critical')),
  constraint patrimonio_tracking_alerts_status_check
    check (status in ('open', 'acknowledged', 'resolved')),
  constraint patrimonio_tracking_alerts_title_check
    check (length(trim(title)) between 2 and 180),
  constraint patrimonio_tracking_alerts_message_check
    check (length(trim(message)) between 2 and 500)
);

create index patrimonio_tracking_alerts_owner_status_idx
  on public.patrimonio_tracking_alerts (owner_key, status, detected_at desc);
create index patrimonio_tracking_alerts_owner_asset_idx
  on public.patrimonio_tracking_alerts (owner_key, asset_code, detected_at desc);
create index patrimonio_tracking_alerts_owner_geofence_idx
  on public.patrimonio_tracking_alerts (owner_key, geofence_id);
create index patrimonio_tracking_alerts_event_idx
  on public.patrimonio_tracking_alerts (event_id);
create unique index patrimonio_tracking_alerts_active_battery_idx
  on public.patrimonio_tracking_alerts (owner_key, asset_code)
  where alert_type = 'low_battery' and status in ('open', 'acknowledged');
create unique index patrimonio_tracking_alerts_active_geofence_idx
  on public.patrimonio_tracking_alerts (owner_key, geofence_id)
  where alert_type = 'geofence' and geofence_id is not null
    and status in ('open', 'acknowledged');

alter table public.patrimonio_tracking_geofences enable row level security;
alter table public.patrimonio_tracking_alerts enable row level security;

create policy patrimonio_tracking_geofences_no_direct_access
  on public.patrimonio_tracking_geofences for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_tracking_alerts_no_direct_access
  on public.patrimonio_tracking_alerts for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.patrimonio_tracking_geofences from public, anon, authenticated;
revoke all on table public.patrimonio_tracking_alerts from public, anon, authenticated;
grant all on table public.patrimonio_tracking_geofences to service_role;
grant all on table public.patrimonio_tracking_alerts to service_role;

create or replace function public.patrimonio_evaluate_tracking_event()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_geofence record;
  v_distance_meters double precision;
  v_inside boolean;
  v_violates boolean;
begin
  if new.battery_percent is not null and new.battery_percent < 20 then
    if not exists (
      select 1
      from public.patrimonio_tracking_alerts
      where owner_key = new.owner_key
        and asset_code = new.asset_code
        and alert_type = 'low_battery'
        and status in ('open', 'acknowledged')
    ) then
      insert into public.patrimonio_tracking_alerts (
        owner_key, asset_code, event_id, alert_type, severity, title, message, detected_at
      ) values (
        new.owner_key, new.asset_code, new.id, 'low_battery',
        case when new.battery_percent < 10 then 'high' else 'medium' end,
        'Bateria baixa no rastreador',
        'A leitura informou ' || new.battery_percent || '% de bateria.',
        new.observed_at
      ) on conflict do nothing;
    end if;
  elsif new.battery_percent is not null and new.battery_percent >= 20 then
    update public.patrimonio_tracking_alerts
    set status = 'resolved', responded_at = new.observed_at,
      response_note = 'Encerrado automaticamente após leitura com bateria normalizada.'
    where owner_key = new.owner_key
      and asset_code = new.asset_code
      and alert_type = 'low_battery'
      and status in ('open', 'acknowledged');
  end if;

  if new.latitude is null or new.longitude is null then
    return new;
  end if;

  for v_geofence in
    select *
    from public.patrimonio_tracking_geofences
    where owner_key = new.owner_key
      and asset_code = new.asset_code
      and active
  loop
    v_distance_meters := 6371000 * acos(least(1.0, greatest(-1.0,
      sin(radians(v_geofence.center_latitude::double precision))
        * sin(radians(new.latitude::double precision))
      + cos(radians(v_geofence.center_latitude::double precision))
        * cos(radians(new.latitude::double precision))
        * cos(radians(new.longitude::double precision - v_geofence.center_longitude::double precision))
    )));
    v_inside := v_distance_meters <= v_geofence.radius_meters;
    v_violates := (v_geofence.rule = 'inside_required' and not v_inside)
      or (v_geofence.rule = 'outside_forbidden' and v_inside);

    if v_violates and not exists (
      select 1
      from public.patrimonio_tracking_alerts
      where owner_key = new.owner_key
        and asset_code = new.asset_code
        and geofence_id = v_geofence.id
        and status in ('open', 'acknowledged')
    ) then
      insert into public.patrimonio_tracking_alerts (
        owner_key, asset_code, event_id, geofence_id, alert_type, severity,
        title, message, detected_at
      ) values (
        new.owner_key, new.asset_code, new.id, v_geofence.id, 'geofence',
        v_geofence.severity,
        case when v_geofence.rule = 'inside_required'
          then 'Ativo fora da área permitida'
          else 'Ativo entrou em área restrita'
        end,
        v_geofence.name || ' · leitura a ' || round(v_distance_meters::numeric) || ' m do centro.',
        new.observed_at
      ) on conflict do nothing;
    elsif not v_violates then
      update public.patrimonio_tracking_alerts
      set status = 'resolved', responded_at = new.observed_at,
        response_note = 'Encerrado automaticamente após retorno à condição permitida.'
      where owner_key = new.owner_key
        and asset_code = new.asset_code
        and geofence_id = v_geofence.id
        and status in ('open', 'acknowledged');
    end if;
  end loop;

  return new;
end;
$function$;

revoke all on function public.patrimonio_evaluate_tracking_event() from public, anon, authenticated;
grant execute on function public.patrimonio_evaluate_tracking_event() to service_role;

create trigger patrimonio_tracking_event_alerts
after insert on public.patrimonio_tracking_events
for each row execute function public.patrimonio_evaluate_tracking_event();

create or replace function public.patrimonio_apply_tracking_action(
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
  v_revision bigint;
  v_action_type text := trim(coalesce(p_action ->> 'type', ''));
  v_id uuid;
  v_asset_code varchar(24);
  v_status text;
  v_latitude numeric;
  v_longitude numeric;
  v_radius_meters numeric;
  v_active boolean;
begin
  if p_owner_key !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_owner_key';
  end if;
  if length(trim(coalesce(p_actor, ''))) < 1
    or lower(trim(coalesce(p_actor_identifier, ''))) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using errcode = '22023', message = 'invalid_actor';
  end if;

  select revision into v_revision
  from public.patrimonio_workspaces
  where owner_key = p_owner_key
  for update;

  if v_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'revision_conflict';
  end if;

  if v_action_type = 'create_tracking_geofence' then
    if not coalesce(p_is_admin, false) then
      raise exception using errcode = '42501', message = 'admin_required';
    end if;
    begin
      v_id := (p_action #>> '{geofence,id}')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_tracking_geofence';
    end;
    if v_id is null then
      raise exception using errcode = '22023', message = 'invalid_tracking_geofence';
    end if;
    v_asset_code := trim(p_action #>> '{geofence,assetId}');
    if length(trim(coalesce(p_action #>> '{geofence,name}', ''))) < 2
      or coalesce(p_action #>> '{geofence,rule}', '') not in ('inside_required', 'outside_forbidden')
      or coalesce(p_action #>> '{geofence,severity}', '') not in ('low', 'medium', 'high', 'critical')
      or not exists (
        select 1 from public.patrimonio_assets
        where owner_key = p_owner_key and code = v_asset_code and status <> 'retired'
      )
    then
      raise exception using errcode = '22023', message = 'invalid_tracking_geofence';
    end if;

    begin
      v_latitude := (p_action #>> '{geofence,latitude}')::numeric;
      v_longitude := (p_action #>> '{geofence,longitude}')::numeric;
      v_radius_meters := (p_action #>> '{geofence,radiusMeters}')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'invalid_tracking_geofence';
    end;
    if v_latitude is null or v_latitude not between -90 and 90
      or v_longitude is null or v_longitude not between -180 and 180
      or v_radius_meters is null or v_radius_meters not between 5 and 100000
    then
      raise exception using errcode = '22023', message = 'invalid_tracking_geofence';
    end if;

    insert into public.patrimonio_tracking_geofences (
      id, owner_key, asset_code, name, rule, center_latitude, center_longitude,
      radius_meters, severity, created_by, updated_by
    ) values (
      v_id, p_owner_key, v_asset_code,
      left(trim(p_action #>> '{geofence,name}'), 120),
      p_action #>> '{geofence,rule}',
      v_latitude, v_longitude, v_radius_meters,
      p_action #>> '{geofence,severity}', left(trim(p_actor), 180), left(trim(p_actor), 180)
    );

  elsif v_action_type = 'set_tracking_geofence_status' then
    if not coalesce(p_is_admin, false) then
      raise exception using errcode = '42501', message = 'admin_required';
    end if;
    if coalesce(p_action ->> 'active', '') not in ('true', 'false') then
      raise exception using errcode = '22023', message = 'invalid_tracking_geofence';
    end if;
    begin
      v_id := (p_action ->> 'geofenceId')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_tracking_geofence';
    end;
    if v_id is null then
      raise exception using errcode = '22023', message = 'invalid_tracking_geofence';
    end if;
    v_active := (p_action ->> 'active')::boolean;
    update public.patrimonio_tracking_geofences
    set active = v_active, updated_by = left(trim(p_actor), 180), updated_at = now()
    where owner_key = p_owner_key and id = v_id and active <> v_active;
    if not found then
      raise exception using errcode = 'P0002', message = 'tracking_geofence_not_changeable';
    end if;
    if not v_active then
      update public.patrimonio_tracking_alerts
      set status = 'resolved', responded_by = left(trim(p_actor), 180), responded_at = now(),
        response_note = 'Encerrado automaticamente após desativação da geofence.'
      where owner_key = p_owner_key and geofence_id = v_id
        and status in ('open', 'acknowledged');
    end if;

  elsif v_action_type = 'update_tracking_alert' then
    begin
      v_id := (p_action ->> 'alertId')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_tracking_alert';
    end;
    if v_id is null then
      raise exception using errcode = '22023', message = 'invalid_tracking_alert';
    end if;
    v_status := trim(p_action ->> 'status');
    if v_status not in ('acknowledged', 'resolved') then
      raise exception using errcode = '22023', message = 'invalid_tracking_alert_status';
    end if;
    update public.patrimonio_tracking_alerts
    set status = v_status, responded_by = left(trim(p_actor), 180), responded_at = now(),
      response_note = left(trim(coalesce(p_action ->> 'note', '')), 500)
    where owner_key = p_owner_key and id = v_id
      and status in ('open', 'acknowledged') and status <> v_status;
    if not found then
      raise exception using errcode = 'P0002', message = 'tracking_alert_not_changeable';
    end if;

  else
    raise exception using errcode = '22023', message = 'unsupported_tracking_action';
  end if;

  update public.patrimonio_workspaces
  set revision = revision + 1, updated_at = now()
  where owner_key = p_owner_key
  returning revision into v_revision;

  return v_revision;
end;
$function$;

revoke all on function public.patrimonio_apply_tracking_action(
  text, text, text, boolean, bigint, jsonb
) from public, anon, authenticated;
grant execute on function public.patrimonio_apply_tracking_action(
  text, text, text, boolean, bigint, jsonb
) to service_role;
