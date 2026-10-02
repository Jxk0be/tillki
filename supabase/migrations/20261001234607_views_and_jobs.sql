-- =============================================================================
-- Kura schema, part 3 of 3: views, nightly inventory snapshots, and indexes on
-- the "who added it" foreign keys.
--
-- Views use security_invoker so the caller's RLS applies (admins only).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Indexes for created_by / actor / user_id foreign keys (flagged by the advisor)
-- -----------------------------------------------------------------------------
create index ai_usage_user_id_idx on public.ai_usage (user_id);
create index expenses_created_by_idx on public.expenses (created_by);
create index item_acquisitions_created_by_idx on public.item_acquisitions (created_by);
create index item_events_actor_idx on public.item_events (actor);
create index item_templates_created_by_idx on public.item_templates (created_by);
create index items_created_by_idx on public.items (created_by);
create index lots_created_by_idx on public.lots (created_by);
create index sales_created_by_idx on public.sales (created_by);

-- Default fee percent from app_settings (falls back to 13).
create function public.default_fee_percent()
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::numeric from public.app_settings s where s.key = 'default_fee_percent'),
    13
  );
$$;

-- -----------------------------------------------------------------------------
-- v_items: everything the inventory list and item detail need in one row.
-- -----------------------------------------------------------------------------
create view public.v_items with (security_invoker = true) as
select
  i.*,
  case when i.template_id is null then 'one_off' else 'set' end as kind,
  t.name as template_name,
  t.total_volumes,
  coalesce(i.description, t.description) as effective_description,
  coalesce(img.image_count, 0) as image_count,
  coalesce(img.cover_path, timg.cover_path) as cover_path,
  case
    when img.cover_path is not null then 'item'
    when timg.cover_path is not null then 'template'
  end as cover_source,
  coalesce(sold.units_sold, 0) as units_sold,
  i.quantity - coalesce(sold.units_sold, 0) as units_left,
  coalesce(acq.acquisition_count, 0) as acquisition_count,
  coalesce(acq.lot_names, '{}') as lot_names,
  (current_date - coalesce(i.purchased_at, i.created_at::date)) as days_in_stock,
  case
    when i.list_price_cents is null then null
    else round(i.list_price_cents * (1 - public.default_fee_percent() / 100) - i.cost_cents)::int
  end as est_profit_cents
from public.items i
left join public.item_templates t on t.id = i.template_id
left join lateral (
  select count(*)::int as image_count,
         max(ii.storage_path) filter (where ii.position = 0) as cover_path
  from public.item_images ii where ii.item_id = i.id
) img on true
left join lateral (
  select ti.storage_path as cover_path
  from public.template_images ti
  where ti.template_id = i.template_id and ti.position = 0
) timg on true
left join lateral (
  select sum(s.quantity)::int as units_sold from public.sales s where s.item_id = i.id
) sold on true
left join lateral (
  select count(*)::int as acquisition_count,
         array_agg(distinct l.name) filter (where l.name is not null) as lot_names
  from public.item_acquisitions a
  left join public.lots l on l.id = a.lot_id
  where a.item_id = i.id
) acq on true;

-- -----------------------------------------------------------------------------
-- v_templates: one row per set with what we own and what's missing.
-- -----------------------------------------------------------------------------
create view public.v_templates with (security_invoker = true) as
with vols as (
  select
    i.template_id,
    i.volume_number,
    i.cost_cents,
    i.list_price_cents,
    i.created_at,
    i.quantity - coalesce(s.units_sold, 0) as units_left,
    coalesce(s.units_sold, 0) as units_sold
  from public.items i
  left join lateral (
    select sum(x.quantity)::int as units_sold from public.sales x where x.item_id = i.id
  ) s on true
  where i.template_id is not null and i.archived_at is null
),
agg as (
  select
    v.template_id,
    count(*) filter (where v.units_left > 0)::int as volumes_owned,
    coalesce(sum(v.units_left), 0)::int as units_in_stock,
    count(*) filter (where v.units_sold > 0)::int as volumes_sold,
    array_agg(v.volume_number order by v.volume_number) filter (where v.units_left > 0) as owned,
    max(v.volume_number) filter (where v.units_left > 0) as max_owned,
    coalesce(sum(v.units_left::bigint * v.cost_cents), 0)::bigint as cost_basis_cents,
    coalesce(sum(v.units_left::bigint * coalesce(v.list_price_cents, 0)), 0)::bigint as list_value_cents,
    round(sum(
      case when v.list_price_cents is not null and v.units_left > 0
        then v.units_left * (v.list_price_cents * (1 - public.default_fee_percent() / 100) - v.cost_cents)
      end
    ))::bigint as est_profit_cents,
    max(v.created_at) as last_added_at
  from vols v
  group by v.template_id
)
select
  t.*,
  cover.cover_path,
  coalesce(a.volumes_owned, 0) as volumes_owned,
  coalesce(a.units_in_stock, 0) as units_in_stock,
  coalesce(a.units_in_stock, 0) - coalesce(a.volumes_owned, 0) as extra_copies,
  coalesce(a.volumes_sold, 0) as volumes_sold,
  t.total_volumes is not null as total_known,
  public.format_volume_ranges(a.owned) as owned_ranges,
  public.format_volume_ranges(m.missing) as missing_ranges,
  coalesce(array_length(m.missing, 1), 0) as missing_count,
  case
    when t.total_volumes is not null
      then round(100.0 * coalesce(a.volumes_owned, 0) / t.total_volumes)::int
  end as completion_percent,
  coalesce(a.cost_basis_cents, 0) as cost_basis_cents,
  coalesce(a.list_value_cents, 0) as list_value_cents,
  coalesce(a.est_profit_cents, 0) as est_profit_cents,
  a.last_added_at
from public.item_templates t
left join agg a on a.template_id = t.id
left join lateral (
  select ti.storage_path as cover_path
  from public.template_images ti
  where ti.template_id = t.id and ti.position = 0
) cover on true
left join lateral (
  -- 1..total minus owned; when the total is unknown, the gaps below the highest owned volume.
  select array_agg(n order by n) as missing
  from generate_series(1, coalesce(t.total_volumes, a.max_owned, 0)) as n
  where not (n = any (coalesce(a.owned, '{}')))
) m on true;

-- -----------------------------------------------------------------------------
-- v_sales: sales with item details and net profit.
-- -----------------------------------------------------------------------------
create view public.v_sales with (security_invoker = true) as
select
  s.*,
  i.name as item_name,
  i.category,
  i.series,
  i.template_id,
  t.name as template_name,
  i.volume_number,
  i.cost_cents as unit_cost_cents,
  s.sale_price_cents + s.shipping_charged_cents - s.platform_fee_cents
    - s.shipping_cost_cents - s.other_cost_cents - i.cost_cents * s.quantity as net_profit_cents
from public.sales s
join public.items i on i.id = s.item_id
left join public.item_templates t on t.id = i.template_id;

-- -----------------------------------------------------------------------------
-- v_lots: how much of each lot has sold and whether it has paid for itself.
-- Copies of the same volume are interchangeable, so each item's sales are
-- shared out to its lots in proportion to the copies each lot contributed.
-- -----------------------------------------------------------------------------
create view public.v_lots with (security_invoker = true) as
with lot_items as (
  select a.lot_id, a.item_id, sum(a.quantity)::int as lot_units
  from public.item_acquisitions a
  where a.lot_id is not null
  group by a.lot_id, a.item_id
),
item_sales as (
  select s.item_id,
         sum(s.quantity)::int as units_sold,
         sum(s.sale_price_cents + s.shipping_charged_cents - s.platform_fee_cents
             - s.shipping_cost_cents - s.other_cost_cents)::bigint as net_revenue_cents
  from public.sales s
  group by s.item_id
),
per_lot as (
  select
    li.lot_id,
    count(distinct li.item_id)::int as item_count,
    sum(li.lot_units)::int as units_bought,
    sum(coalesce(isl.units_sold, 0) * li.lot_units::numeric / nullif(i.quantity, 0)) as units_sold,
    sum(coalesce(isl.net_revenue_cents, 0) * li.lot_units::numeric / nullif(i.quantity, 0)) as net_revenue
  from lot_items li
  join public.items i on i.id = li.item_id
  left join item_sales isl on isl.item_id = li.item_id
  group by li.lot_id
)
select
  l.*,
  coalesce(p.item_count, 0) as item_count,
  coalesce(p.units_bought, 0) as units_bought,
  round(coalesce(p.units_sold, 0), 1) as units_sold,
  round(coalesce(p.net_revenue, 0))::bigint as net_revenue_cents,
  case
    when l.total_cost_cents > 0 then round(100 * coalesce(p.net_revenue, 0) / l.total_cost_cents)::int
  end as paid_back_percent
from public.lots l
left join per_lot p on p.lot_id = l.id;

-- -----------------------------------------------------------------------------
-- Nightly inventory snapshots
-- -----------------------------------------------------------------------------
create table public.inventory_snapshots (
  snapshot_date date primary key,
  items_in_stock int not null default 0,
  units_in_stock int not null default 0,
  cost_basis_cents bigint not null default 0,
  list_value_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

-- Upserts today's row (New York date): units left x average cost and units left
-- x asking price, for items with copies left that are in stock, listed or reserved.
create function public.take_inventory_snapshot()
returns void
language sql
set search_path = ''
as $$
  insert into public.inventory_snapshots
    (snapshot_date, items_in_stock, units_in_stock, cost_basis_cents, list_value_cents)
  select
    (now() at time zone 'America/New_York')::date,
    count(*)::int,
    coalesce(sum(x.units_left), 0)::int,
    coalesce(sum(x.units_left::bigint * x.cost_cents), 0),
    coalesce(sum(x.units_left::bigint * coalesce(x.list_price_cents, 0)), 0)
  from (
    select i.cost_cents, i.list_price_cents,
           i.quantity - coalesce((select sum(s.quantity) from public.sales s where s.item_id = i.id), 0) as units_left
    from public.items i
    where i.status in ('in_stock', 'listed', 'reserved') and i.archived_at is null
  ) x
  where x.units_left > 0
  on conflict (snapshot_date) do update set
    items_in_stock = excluded.items_in_stock,
    units_in_stock = excluded.units_in_stock,
    cost_basis_cents = excluded.cost_basis_cents,
    list_value_cents = excluded.list_value_cents,
    created_at = now();
$$;

-- 03:55 UTC is 23:55 in New York during daylight time and 22:55 in winter, so
-- the snapshot always lands on the same New York day.
select cron.schedule(
  'kura-nightly-inventory-snapshot',
  '55 3 * * *',
  $$select public.take_inventory_snapshot()$$
);

-- -----------------------------------------------------------------------------
-- Grants and RLS
-- -----------------------------------------------------------------------------
alter table public.inventory_snapshots enable row level security;
create policy "admins read snapshots" on public.inventory_snapshots
  for select to authenticated using ((select public.is_admin()));

revoke all on public.v_items, public.v_templates, public.v_sales, public.v_lots, public.inventory_snapshots from anon;
grant select on public.v_items, public.v_templates, public.v_sales, public.v_lots, public.inventory_snapshots to authenticated;
grant all on public.v_items, public.v_templates, public.v_sales, public.v_lots, public.inventory_snapshots to service_role;

revoke execute on function public.default_fee_percent(), public.take_inventory_snapshot() from public, anon;
grant execute on function public.default_fee_percent() to authenticated, service_role;
grant execute on function public.take_inventory_snapshot() to service_role;
