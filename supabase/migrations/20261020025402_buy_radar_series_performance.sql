-- =============================================================================
-- Buy Radar, phase 3: our own sell-through per set (and per set and platform).
--
-- Same money and day math as sales_between() on the dashboard:
--   revenue    = sale price + shipping charged
--   net profit = v_sales.net_profit_cents (after fees, shipping paid, other costs, item cost)
--   days to sell = New York sale date minus the item's first purchase date
-- Every row carries sample_size (units sold) so thin data is visible.
-- =============================================================================

create view public.series_performance with (security_invoker = true) as
with sold as (
  select
    s.template_id,
    s.quantity,
    s.sold_at,
    (s.sale_price_cents + s.shipping_charged_cents)::bigint as revenue_cents,
    (s.sale_price_cents + s.shipping_charged_cents - s.platform_fee_cents
      - s.shipping_cost_cents - s.other_cost_cents)::bigint as kept_cents,
    s.net_profit_cents::bigint as net_profit_cents,
    greatest(0, (s.sold_at at time zone 'America/New_York')::date
      - coalesce(i.purchased_at, (i.created_at at time zone 'America/New_York')::date)) as days_to_sell
  from public.v_sales s
  join public.items i on i.id = s.item_id
  where s.template_id is not null
),
sales_agg as (
  select
    template_id,
    sum(quantity)::int as units_sold,
    sum(revenue_cents) as revenue_cents,
    sum(kept_cents) as kept_cents,
    sum(net_profit_cents) as net_profit_cents,
    percentile_cont(0.5) within group (order by days_to_sell) as median_days_to_sell,
    coalesce(sum(quantity) filter (where sold_at >= now() - interval '30 days'), 0)::int as sold_last_30d,
    coalesce(sum(quantity) filter (where sold_at >= now() - interval '90 days'), 0)::int as sold_last_90d
  from sold
  group by template_id
),
stock as (
  select
    i.template_id,
    sum(i.quantity)::int as units_bought,
    sum(i.units_left) filter (where i.status in ('in_stock', 'listed', 'reserved'))::int as units_on_hand,
    sum(i.units_left) filter (
      where i.status in ('in_stock', 'listed', 'reserved')
        and i.units_left > 0
        and i.days_in_stock > coalesce(
          (select (value #>> '{}')::int from public.app_settings where key = 'stale_days'), 60)
    )::int as stale_count
  from public.v_items i
  where i.template_id is not null and i.archived_at is null
  group by i.template_id
),
costs as (
  select i.template_id,
         sum(a.quantity::bigint * a.unit_cost_cents) as cost_total_cents,
         sum(a.quantity)::int as cost_units
  from public.item_acquisitions a
  join public.items i on i.id = a.item_id
  where i.template_id is not null and i.archived_at is null
  group by i.template_id
)
select
  t.id as template_id,
  t.name,
  t.category,
  coalesce(st.units_bought, 0) as units_bought,
  coalesce(sa.units_sold, 0) as units_sold,
  coalesce(st.units_on_hand, 0) as units_on_hand,
  case when c.cost_units > 0 then round(c.cost_total_cents::numeric / c.cost_units)::int end
    as avg_cost_cents,
  case when sa.units_sold > 0 then round(sa.revenue_cents::numeric / sa.units_sold)::int end
    as avg_sale_cents,
  case when sa.units_sold > 0 then round(sa.kept_cents::numeric / sa.units_sold)::int end
    as avg_net_cents,
  case when sa.revenue_cents > 0 then round(100.0 * sa.net_profit_cents / sa.revenue_cents, 1) end
    as margin_pct,
  sa.median_days_to_sell,
  coalesce(sa.sold_last_30d, 0) as sold_last_30d,
  coalesce(sa.sold_last_90d, 0) as sold_last_90d,
  coalesce(st.stale_count, 0) as stale_count,
  coalesce(sa.units_sold, 0) as sample_size
from public.item_templates t
left join sales_agg sa on sa.template_id = t.id
left join stock st on st.template_id = t.id
left join costs c on c.template_id = t.id
where t.archived_at is null;

comment on view public.series_performance is
  'Buy Radar: sell-through per set. avg_net_cents is kept per unit after fees and shipping, before item cost. sample_size = units sold.';

-- Which platform sells each set best.
create view public.series_platform_performance with (security_invoker = true) as
select
  s.template_id,
  s.platform,
  sum(s.quantity)::int as units_sold,
  round(sum(s.sale_price_cents + s.shipping_charged_cents - s.platform_fee_cents
    - s.shipping_cost_cents - s.other_cost_cents)::numeric / nullif(sum(s.quantity), 0))::int
    as avg_net_cents,
  round(100.0 * sum(s.net_profit_cents)
    / nullif(sum(s.sale_price_cents + s.shipping_charged_cents), 0), 1) as margin_pct,
  percentile_cont(0.5) within group (order by greatest(0,
    (s.sold_at at time zone 'America/New_York')::date
      - coalesce(i.purchased_at, (i.created_at at time zone 'America/New_York')::date)))
    as median_days_to_sell,
  sum(s.quantity)::int as sample_size
from public.v_sales s
join public.items i on i.id = s.item_id
where s.template_id is not null
group by s.template_id, s.platform;

revoke all on public.series_performance, public.series_platform_performance from anon;
grant select on public.series_performance, public.series_platform_performance
  to authenticated, service_role;
