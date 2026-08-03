begin;

set local lock_timeout = '5s';

create table public.patrimonio_inventory_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null references public.patrimonio_workspaces(owner_key) on delete cascade,
  name varchar(180) not null,
  nucleus_id varchar(60),
  status text not null default 'active',
  due_at date,
  target_count integer not null default 0 check (target_count >= 0),
  checked_count integer not null default 0 check (checked_count >= 0),
  issue_count integer not null default 0 check (issue_count >= 0),
  created_by varchar(180) not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (owner_key, nucleus_id)
    references public.patrimonio_nuclei(owner_key, id),
  constraint patrimonio_inventory_campaigns_name_check check (length(trim(name)) between 3 and 180),
  constraint patrimonio_inventory_campaigns_status_check
    check (status in ('active', 'completed', 'cancelled')),
  constraint patrimonio_inventory_campaigns_counts_check
    check (checked_count <= target_count and issue_count <= checked_count),
  unique (owner_key, id)
);

create index patrimonio_inventory_campaigns_owner_nucleus_idx
  on public.patrimonio_inventory_campaigns (owner_key, nucleus_id);

create table public.patrimonio_inventory_campaign_assets (
  campaign_id uuid not null references public.patrimonio_inventory_campaigns(id) on delete cascade,
  owner_key text not null,
  asset_code varchar(24) not null,
  result text not null default 'pending',
  observed_location varchar(180) not null default '',
  note varchar(500) not null default '',
  checked_by varchar(180),
  checked_at timestamptz,
  primary key (campaign_id, asset_code),
  foreign key (owner_key, campaign_id)
    references public.patrimonio_inventory_campaigns(owner_key, id) on delete cascade,
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  constraint patrimonio_inventory_campaign_assets_result_check
    check (result in ('pending', 'confirmed', 'missing', 'wrong_location', 'damaged')),
  constraint patrimonio_inventory_campaign_assets_check_metadata check (
    (result = 'pending' and checked_by is null and checked_at is null)
    or (result <> 'pending' and checked_by is not null and checked_at is not null)
  )
);

create index patrimonio_inventory_campaign_assets_owner_campaign_idx
  on public.patrimonio_inventory_campaign_assets (owner_key, campaign_id);
create index patrimonio_inventory_campaign_assets_owner_asset_idx
  on public.patrimonio_inventory_campaign_assets (owner_key, asset_code);

create table public.patrimonio_custody_terms (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  asset_code varchar(24) not null,
  assignee varchar(180) not null,
  assignee_identifier varchar(254) not null,
  status text not null default 'pending',
  note varchar(500) not null default '',
  issued_by varchar(180) not null,
  issued_at timestamptz not null default now(),
  responded_by varchar(254),
  responded_at timestamptz,
  response_note varchar(500) not null default '',
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  constraint patrimonio_custody_terms_assignee_check check (length(trim(assignee)) between 2 and 180),
  constraint patrimonio_custody_terms_identifier_check
    check (assignee_identifier = lower(assignee_identifier) and assignee_identifier ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint patrimonio_custody_terms_status_check
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  constraint patrimonio_custody_terms_response_check check (
    (status = 'pending' and responded_by is null and responded_at is null)
    or (status <> 'pending' and responded_by is not null and responded_at is not null)
  )
);

create unique index patrimonio_custody_terms_pending_asset_uidx
  on public.patrimonio_custody_terms (owner_key, asset_code)
  where status = 'pending';

create table public.patrimonio_maintenance_orders (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  asset_code varchar(24) not null,
  kind text not null,
  priority text not null default 'normal',
  status text not null default 'open',
  title varchar(180) not null,
  notes varchar(500) not null default '',
  due_at date,
  created_by varchar(180) not null,
  created_at timestamptz not null default now(),
  updated_by varchar(180) not null,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  constraint patrimonio_maintenance_orders_kind_check
    check (kind in ('preventive', 'corrective', 'inspection')),
  constraint patrimonio_maintenance_orders_priority_check
    check (priority in ('low', 'normal', 'high', 'critical')),
  constraint patrimonio_maintenance_orders_status_check
    check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  constraint patrimonio_maintenance_orders_title_check check (length(trim(title)) between 3 and 180)
);

create index patrimonio_maintenance_orders_owner_status_idx
  on public.patrimonio_maintenance_orders (owner_key, status, updated_at desc);
create index patrimonio_maintenance_orders_owner_asset_idx
  on public.patrimonio_maintenance_orders (owner_key, asset_code);

create table public.patrimonio_tracking_tags (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  asset_code varchar(24) not null,
  technology text not null,
  tag_id varchar(180) not null,
  active boolean not null default true,
  installed_by varchar(180) not null,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  constraint patrimonio_tracking_tags_technology_check
    check (technology in ('qr', 'barcode', 'rfid_uhf', 'ble', 'uwb', 'gps', 'mdm')),
  constraint patrimonio_tracking_tags_id_check check (length(trim(tag_id)) between 1 and 180),
  unique (owner_key, asset_code, technology),
  unique (owner_key, technology, tag_id)
);

create table public.patrimonio_tracking_events (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  asset_code varchar(24) not null,
  technology text not null,
  tag_id varchar(180) not null,
  reader_id varchar(180) not null default '',
  location varchar(180) not null,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  accuracy_meters numeric(10, 2),
  confidence numeric(5, 4),
  battery_percent integer,
  note varchar(500) not null default '',
  observed_by varchar(180) not null,
  observed_at timestamptz not null default now(),
  foreign key (owner_key, asset_code)
    references public.patrimonio_assets(owner_key, code) on update cascade on delete restrict,
  constraint patrimonio_tracking_events_technology_check
    check (technology in ('qr', 'barcode', 'rfid_uhf', 'ble', 'uwb', 'gps', 'mdm', 'manual')),
  constraint patrimonio_tracking_events_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint patrimonio_tracking_events_longitude_check
    check (longitude is null or longitude between -180 and 180),
  constraint patrimonio_tracking_events_accuracy_check
    check (accuracy_meters is null or accuracy_meters between 0 and 100000),
  constraint patrimonio_tracking_events_confidence_check
    check (confidence is null or confidence between 0 and 1),
  constraint patrimonio_tracking_events_battery_check
    check (battery_percent is null or battery_percent between 0 and 100)
);

create index patrimonio_tracking_events_owner_asset_idx
  on public.patrimonio_tracking_events (owner_key, asset_code, observed_at desc);
create index patrimonio_tracking_events_owner_observed_idx
  on public.patrimonio_tracking_events (owner_key, observed_at desc);

alter table public.patrimonio_inventory_campaigns enable row level security;
alter table public.patrimonio_inventory_campaign_assets enable row level security;
alter table public.patrimonio_custody_terms enable row level security;
alter table public.patrimonio_maintenance_orders enable row level security;
alter table public.patrimonio_tracking_tags enable row level security;
alter table public.patrimonio_tracking_events enable row level security;

create policy patrimonio_inventory_campaigns_no_direct_access
  on public.patrimonio_inventory_campaigns for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_inventory_campaign_assets_no_direct_access
  on public.patrimonio_inventory_campaign_assets for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_custody_terms_no_direct_access
  on public.patrimonio_custody_terms for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_maintenance_orders_no_direct_access
  on public.patrimonio_maintenance_orders for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_tracking_tags_no_direct_access
  on public.patrimonio_tracking_tags for all to anon, authenticated
  using (false) with check (false);
create policy patrimonio_tracking_events_no_direct_access
  on public.patrimonio_tracking_events for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.patrimonio_inventory_campaigns from public, anon, authenticated;
revoke all on table public.patrimonio_inventory_campaign_assets from public, anon, authenticated;
revoke all on table public.patrimonio_custody_terms from public, anon, authenticated;
revoke all on table public.patrimonio_maintenance_orders from public, anon, authenticated;
revoke all on table public.patrimonio_tracking_tags from public, anon, authenticated;
revoke all on table public.patrimonio_tracking_events from public, anon, authenticated;

grant all on table public.patrimonio_inventory_campaigns to service_role;
grant all on table public.patrimonio_inventory_campaign_assets to service_role;
grant all on table public.patrimonio_custody_terms to service_role;
grant all on table public.patrimonio_maintenance_orders to service_role;
grant all on table public.patrimonio_tracking_tags to service_role;
grant all on table public.patrimonio_tracking_events to service_role;

create or replace function public.patrimonio_apply_operational_action(
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
  v_asset_code varchar(24);
  v_campaign_id uuid;
  v_term_id uuid;
  v_order_id uuid;
  v_result text;
  v_previous_result text;
  v_previous_status text;
  v_next_status text;
  v_assignee text;
  v_assignee_identifier text;
  v_technology text;
  v_tag_id text;
  v_count integer;
begin
  if p_owner_key !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_owner_key';
  end if;
  if length(trim(coalesce(p_actor, ''))) < 1
    or lower(trim(coalesce(p_actor_identifier, ''))) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using errcode = '22023', message = 'invalid_actor';
  end if;

  insert into public.patrimonio_workspaces (owner_key)
  values (p_owner_key)
  on conflict (owner_key) do nothing;

  select revision into v_revision
  from public.patrimonio_workspaces
  where owner_key = p_owner_key
  for update;

  if v_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'revision_conflict';
  end if;

  if v_action_type = 'create_inventory_campaign' then
    v_campaign_id := (p_action #>> '{campaign,id}')::uuid;

    if length(trim(coalesce(p_action #>> '{campaign,name}', ''))) < 3 then
      raise exception using errcode = '22023', message = 'invalid_campaign_name';
    end if;
    if nullif(p_action #>> '{campaign,nucleusId}', '') is not null and not exists (
      select 1 from public.patrimonio_nuclei
      where owner_key = p_owner_key and id = p_action #>> '{campaign,nucleusId}'
    ) then
      raise exception using errcode = '23503', message = 'nucleus_not_found';
    end if;

    insert into public.patrimonio_inventory_campaigns (
      id, owner_key, name, nucleus_id, due_at, created_by
    ) values (
      v_campaign_id,
      p_owner_key,
      left(trim(p_action #>> '{campaign,name}'), 180),
      nullif(p_action #>> '{campaign,nucleusId}', ''),
      nullif(p_action #>> '{campaign,dueAt}', '')::date,
      left(trim(p_actor), 180)
    );

    insert into public.patrimonio_inventory_campaign_assets (
      campaign_id, owner_key, asset_code
    )
    select v_campaign_id, p_owner_key, asset.code
    from public.patrimonio_assets asset
    where asset.owner_key = p_owner_key
      and asset.status <> 'retired'
      and (
        nullif(p_action #>> '{campaign,nucleusId}', '') is null
        or asset.nucleus_id = p_action #>> '{campaign,nucleusId}'
      );

    get diagnostics v_count = row_count;
    if v_count = 0 then
      raise exception using errcode = '22023', message = 'campaign_without_assets';
    end if;

    update public.patrimonio_inventory_campaigns
    set target_count = v_count
    where id = v_campaign_id;

  elsif v_action_type = 'record_inventory_check' then
    v_campaign_id := (p_action ->> 'campaignId')::uuid;
    v_asset_code := trim(p_action ->> 'assetId');
    v_result := trim(p_action ->> 'result');

    if v_result not in ('confirmed', 'missing', 'wrong_location', 'damaged') then
      raise exception using errcode = '22023', message = 'invalid_inventory_result';
    end if;
    if not exists (
      select 1 from public.patrimonio_inventory_campaigns
      where id = v_campaign_id and owner_key = p_owner_key and status = 'active'
    ) then
      raise exception using errcode = '22023', message = 'inactive_inventory_campaign';
    end if;

    select result into v_previous_result
    from public.patrimonio_inventory_campaign_assets
    where campaign_id = v_campaign_id
      and owner_key = p_owner_key
      and asset_code = v_asset_code
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'campaign_asset_not_found';
    end if;

    update public.patrimonio_inventory_campaign_assets
    set
      result = v_result,
      observed_location = left(trim(coalesce(p_action ->> 'observedLocation', '')), 180),
      note = left(trim(coalesce(p_action ->> 'note', '')), 500),
      checked_by = left(trim(p_actor), 180),
      checked_at = now()
    where campaign_id = v_campaign_id and asset_code = v_asset_code;

    update public.patrimonio_inventory_campaigns campaign
    set
      checked_count = summary.checked_count,
      issue_count = summary.issue_count,
      updated_at = now()
    from (
      select
        count(*) filter (where result <> 'pending')::integer as checked_count,
        count(*) filter (where result in ('missing', 'wrong_location', 'damaged'))::integer as issue_count
      from public.patrimonio_inventory_campaign_assets
      where campaign_id = v_campaign_id
    ) summary
    where campaign.id = v_campaign_id;

    if v_result in ('missing', 'wrong_location', 'damaged') then
      select status into v_previous_status
      from public.patrimonio_assets
      where owner_key = p_owner_key and code = v_asset_code
      for update;

      if v_previous_status <> 'discrepancy' and v_previous_status <> 'retired' then
        update public.patrimonio_assets
        set status = 'discrepancy', updated_at = now()
        where owner_key = p_owner_key and code = v_asset_code;

        insert into public.patrimonio_movements (
          owner_key, asset_code, type, actor, from_label, to_label, note
        ) values (
          p_owner_key,
          v_asset_code,
          'status_change',
          left(trim(p_actor), 180),
          case v_previous_status
            when 'available' then 'Disponível'
            when 'allocated' then 'Em uso'
            when 'maintenance' then 'Manutenção'
            else v_previous_status
          end,
          'Divergência',
          'Divergência registrada durante campanha de inventário.'
        );
      end if;
    end if;

  elsif v_action_type = 'complete_inventory_campaign' then
    v_campaign_id := (p_action ->> 'campaignId')::uuid;

    update public.patrimonio_inventory_campaigns
    set status = 'completed', completed_at = now(), updated_at = now()
    where id = v_campaign_id
      and owner_key = p_owner_key
      and status = 'active'
      and checked_count = target_count;

    if not found then
      raise exception using errcode = '22023', message = 'campaign_has_pending_assets';
    end if;

  elsif v_action_type = 'create_custody_term' then
    v_term_id := (p_action #>> '{term,id}')::uuid;
    v_asset_code := trim(p_action #>> '{term,assetId}');
    v_assignee_identifier := lower(trim(p_action #>> '{term,assigneeIdentifier}'));

    if v_assignee_identifier !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception using errcode = '22023', message = 'invalid_assignee_identifier';
    end if;

    select assignee into v_assignee
    from public.patrimonio_assets
    where owner_key = p_owner_key and code = v_asset_code and status <> 'retired'
    for update;

    if not found or length(trim(coalesce(v_assignee, ''))) < 2 or lower(trim(v_assignee)) = 'reserva' then
      raise exception using errcode = '22023', message = 'asset_without_eligible_assignee';
    end if;

    insert into public.patrimonio_custody_terms (
      id, owner_key, asset_code, assignee, assignee_identifier, note, issued_by
    ) values (
      v_term_id,
      p_owner_key,
      v_asset_code,
      v_assignee,
      v_assignee_identifier,
      left(trim(coalesce(p_action #>> '{term,note}', '')), 500),
      left(trim(p_actor), 180)
    );

  elsif v_action_type = 'respond_custody_term' then
    v_term_id := (p_action ->> 'termId')::uuid;
    v_result := trim(p_action ->> 'response');

    if v_result not in ('accepted', 'rejected', 'cancelled') then
      raise exception using errcode = '22023', message = 'invalid_custody_response';
    end if;

    select assignee_identifier, issued_by
      into v_assignee_identifier, v_assignee
    from public.patrimonio_custody_terms
    where id = v_term_id and owner_key = p_owner_key and status = 'pending'
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'pending_custody_term_not_found';
    end if;
    if v_result in ('accepted', 'rejected')
      and lower(trim(p_actor_identifier)) <> v_assignee_identifier
    then
      raise exception using errcode = '42501', message = 'custody_term_identity_mismatch';
    end if;
    if v_result = 'cancelled' and not coalesce(p_is_admin, false) and v_assignee <> trim(p_actor) then
      raise exception using errcode = '42501', message = 'custody_term_cancel_denied';
    end if;

    update public.patrimonio_custody_terms
    set
      status = v_result,
      responded_by = lower(trim(p_actor_identifier)),
      responded_at = now(),
      response_note = left(trim(coalesce(p_action ->> 'note', '')), 500)
    where id = v_term_id;

  elsif v_action_type = 'create_maintenance_order' then
    v_order_id := (p_action #>> '{order,id}')::uuid;
    v_asset_code := trim(p_action #>> '{order,assetId}');

    select status into v_previous_status
    from public.patrimonio_assets
    where owner_key = p_owner_key and code = v_asset_code and status <> 'retired'
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'active_asset_not_found';
    end if;
    if p_action #>> '{order,kind}' not in ('preventive', 'corrective', 'inspection')
      or p_action #>> '{order,priority}' not in ('low', 'normal', 'high', 'critical')
      or length(trim(coalesce(p_action #>> '{order,title}', ''))) < 3
    then
      raise exception using errcode = '22023', message = 'invalid_maintenance_order';
    end if;

    insert into public.patrimonio_maintenance_orders (
      id, owner_key, asset_code, kind, priority, title, notes, due_at,
      created_by, updated_by
    ) values (
      v_order_id,
      p_owner_key,
      v_asset_code,
      p_action #>> '{order,kind}',
      p_action #>> '{order,priority}',
      left(trim(p_action #>> '{order,title}'), 180),
      left(trim(coalesce(p_action #>> '{order,notes}', '')), 500),
      nullif(p_action #>> '{order,dueAt}', '')::date,
      left(trim(p_actor), 180),
      left(trim(p_actor), 180)
    );

    if v_previous_status <> 'maintenance' then
      update public.patrimonio_assets
      set status = 'maintenance', updated_at = now()
      where owner_key = p_owner_key and code = v_asset_code;

      insert into public.patrimonio_movements (
        owner_key, asset_code, type, actor, from_label, to_label, note
      ) values (
        p_owner_key,
        v_asset_code,
        'status_change',
        left(trim(p_actor), 180),
        case v_previous_status
          when 'available' then 'Disponível'
          when 'allocated' then 'Em uso'
          when 'discrepancy' then 'Divergência'
          else v_previous_status
        end,
        'Manutenção',
        'Ordem de manutenção aberta: ' || left(trim(p_action #>> '{order,title}'), 180)
      );
    end if;

  elsif v_action_type = 'update_maintenance_order' then
    v_order_id := (p_action ->> 'orderId')::uuid;
    v_next_status := trim(p_action ->> 'status');

    if v_next_status not in ('in_progress', 'completed', 'cancelled') then
      raise exception using errcode = '22023', message = 'invalid_maintenance_status';
    end if;

    select asset_code, status into v_asset_code, v_result
    from public.patrimonio_maintenance_orders
    where id = v_order_id and owner_key = p_owner_key and status in ('open', 'in_progress')
    for update;

    if not found or v_result = v_next_status then
      raise exception using errcode = '22023', message = 'maintenance_order_not_changeable';
    end if;

    update public.patrimonio_maintenance_orders
    set
      status = v_next_status,
      notes = case
        when length(trim(coalesce(p_action ->> 'note', ''))) > 0
          then left(trim(p_action ->> 'note'), 500)
        else notes
      end,
      updated_by = left(trim(p_actor), 180),
      updated_at = now(),
      completed_at = case when v_next_status in ('completed', 'cancelled') then now() else null end
    where id = v_order_id;

    if v_next_status in ('completed', 'cancelled') and not exists (
      select 1 from public.patrimonio_maintenance_orders
      where owner_key = p_owner_key
        and asset_code = v_asset_code
        and id <> v_order_id
        and status in ('open', 'in_progress')
    ) then
      select status, assignee into v_previous_status, v_assignee
      from public.patrimonio_assets
      where owner_key = p_owner_key and code = v_asset_code
      for update;

      v_next_status := case when length(trim(coalesce(v_assignee, ''))) > 0 then 'allocated' else 'available' end;
      if v_previous_status = 'maintenance' then
        update public.patrimonio_assets
        set status = v_next_status, updated_at = now()
        where owner_key = p_owner_key and code = v_asset_code;

        insert into public.patrimonio_movements (
          owner_key, asset_code, type, actor, from_label, to_label, note
        ) values (
          p_owner_key,
          v_asset_code,
          'status_change',
          left(trim(p_actor), 180),
          'Manutenção',
          case when v_next_status = 'allocated' then 'Em uso' else 'Disponível' end,
          case when p_action ->> 'status' = 'cancelled' then 'Ordem de manutenção cancelada.' else 'Ordem de manutenção concluída.' end
        );
      end if;
    end if;

  elsif v_action_type = 'assign_tracking_tag' then
    v_asset_code := trim(p_action #>> '{tag,assetId}');
    v_technology := trim(p_action #>> '{tag,technology}');
    v_tag_id := trim(p_action #>> '{tag,tagId}');

    if v_technology not in ('qr', 'barcode', 'rfid_uhf', 'ble', 'uwb', 'gps', 'mdm')
      or length(v_tag_id) < 1
      or not exists (
        select 1 from public.patrimonio_assets
        where owner_key = p_owner_key and code = v_asset_code and status <> 'retired'
      )
    then
      raise exception using errcode = '22023', message = 'invalid_tracking_tag';
    end if;

    insert into public.patrimonio_tracking_tags (
      id, owner_key, asset_code, technology, tag_id, installed_by
    ) values (
      (p_action #>> '{tag,id}')::uuid,
      p_owner_key,
      v_asset_code,
      v_technology,
      left(v_tag_id, 180),
      left(trim(p_actor), 180)
    )
    on conflict (owner_key, asset_code, technology) do update set
      tag_id = excluded.tag_id,
      active = true,
      installed_by = excluded.installed_by,
      installed_at = now(),
      updated_at = now();

  elsif v_action_type = 'record_tracking_event' then
    v_asset_code := trim(p_action #>> '{event,assetId}');
    v_technology := trim(p_action #>> '{event,technology}');
    v_tag_id := trim(coalesce(p_action #>> '{event,tagId}', ''));

    if v_technology not in ('qr', 'barcode', 'rfid_uhf', 'ble', 'uwb', 'gps', 'mdm', 'manual')
      or length(trim(coalesce(p_action #>> '{event,location}', ''))) < 1
      or not exists (
        select 1 from public.patrimonio_assets
        where owner_key = p_owner_key and code = v_asset_code
      )
    then
      raise exception using errcode = '22023', message = 'invalid_tracking_event';
    end if;

    if v_technology in ('rfid_uhf', 'ble', 'uwb', 'gps', 'mdm') and not exists (
      select 1 from public.patrimonio_tracking_tags
      where owner_key = p_owner_key
        and asset_code = v_asset_code
        and technology = v_technology
        and tag_id = v_tag_id
        and active
    ) then
      raise exception using errcode = '22023', message = 'tracking_tag_not_configured';
    end if;

    insert into public.patrimonio_tracking_events (
      id, owner_key, asset_code, technology, tag_id, reader_id, location,
      latitude, longitude, accuracy_meters, confidence, battery_percent,
      note, observed_by
    ) values (
      (p_action #>> '{event,id}')::uuid,
      p_owner_key,
      v_asset_code,
      v_technology,
      left(v_tag_id, 180),
      left(trim(coalesce(p_action #>> '{event,readerId}', '')), 180),
      left(trim(p_action #>> '{event,location}'), 180),
      nullif(p_action #>> '{event,latitude}', '')::numeric,
      nullif(p_action #>> '{event,longitude}', '')::numeric,
      nullif(p_action #>> '{event,accuracyMeters}', '')::numeric,
      nullif(p_action #>> '{event,confidence}', '')::numeric,
      nullif(p_action #>> '{event,batteryPercent}', '')::integer,
      left(trim(coalesce(p_action #>> '{event,note}', '')), 500),
      left(trim(p_actor), 180)
    );

  else
    raise exception using errcode = '22023', message = 'unsupported_operational_action';
  end if;

  update public.patrimonio_workspaces
  set revision = revision + 1, updated_at = now()
  where owner_key = p_owner_key
  returning revision into v_revision;

  return v_revision;
end;
$function$;

revoke all on function public.patrimonio_apply_operational_action(
  text, text, text, boolean, bigint, jsonb
) from public, anon, authenticated;
grant execute on function public.patrimonio_apply_operational_action(
  text, text, text, boolean, bigint, jsonb
) to service_role;

commit;
