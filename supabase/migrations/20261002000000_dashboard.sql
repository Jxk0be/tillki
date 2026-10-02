-- =============================================================================
-- Dashboard: read-only report functions (also used by Ask Kura later) and a
-- one-time backfill for inventory_snapshots.
--
-- Every rpc_* function is SECURITY INVOKER, so the caller's RLS applies (admins
-- only). Money is cents. Date ranges are inclusive local dates: p_start..p_end
-- in p_tz (the browser sends its own time zone so months match the Sales page).
-- Revenue = sale price + shipping charged, and sales profit = v_sales.net_profit_cents,
-- the same definitions the Sales page uses. Net profit = sales profit - expenses.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- sales_between: every sale in a local date range, with its money and how many
-- days the item sat before it sold. The building block for the reports below.
-- -----------------------------------------------------------------------------
create function public.sales_between(
  p_start date,
  p_end date,
  p_tz text default 'America/New_York'
)
returns table (
  sale_id uuid,
  item_id uuid,
  template_id uuid,
  template_name text,
  series text,
  category public.item_category,
  platform public.sales_platform,
  quantity int,
  sold_on date,
  sale_price_cents int,
  shipping_charged_cents int,
  shipping_cost_cents int,
  platform_fee_cents int,
  other_cost_cents int,
  revenue_cents bigint,
  cogs_cents bigint,
  net_profit_cents bigint,
  days_to_sell int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.id,
    s.item_id,
    s.template_id,
    s.template_name,
    s.series,
    s.category,
    s.platform,
    s.quantity,
    (s.sold_at at time zone p_tz)::date,
    s.sale_price_cents,
    s.shipping_charged_cents,
    s.shipping_cost_cents,
    s.platform_fee_cents,
    s.other_cost_cents,
    (s.sale_price_cents + s.shipping_charged_cents)::bigint,
    s.unit_cost_cents::bigint * s.quantity,
    s.net_profit_cents::bigint,
    greatest(0, (s.sold_at at time zone p_tz)::date
      - coalesce(i.purchased_at, (i.created_at at time zone p_tz)::date))
  from public.v_sales s
  join public.items i on i.id = s.item_id
  where s.sold_at >= (p_start::timestamp at time zone p_tz)
    and s.sold_at < ((p_end + 1)::timestamp at time zone p_tz);
$$;

-- -----------------------------------------------------------------------------
-- rpc_overview: the whole business right now.
-- -----------------------------------------------------------------------------
create function public.rpc_overview(p_tz text default 'America/New_York')
returns table (
  status_counts jsonb,
  category_counts jsonb,
  set_count int,
  one_off_count int,
  set_volume_count int,
  missing_volumes int,
  units_in_stock int,
  cost_basis_cents bigint,
  list_value_cents bigint,
  potential_profit_cents bigint,
  revenue_cents bigint,
  sales_profit_cents bigint,
  expenses_cents bigint,
  net_profit_cents bigint,
  items_added_this_month int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with live as (
    select * from public.v_items where archived_at is null
  ),
  stock as (
    select * from live where status in ('in_stock', 'listed', 'reserved') and units_left > 0
  ),
  money as (
    select
      coalesce((select sum(s.sale_price_cents + s.shipping_charged_cents) from public.sales s), 0)::bigint as revenue,
      coalesce((select sum(v.net_profit_cents) from public.v_sales v), 0)::bigint as profit,
      coalesce((select sum(e.amount_cents) from public.expenses e), 0)::bigint as expenses
  )
  select
    (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb)
       from (select l.status::text as status, count(*) as n from live l group by l.status) x),
    (select coalesce(jsonb_object_agg(x.category, x.n), '{}'::jsonb)
       from (select l.category::text as category, count(*) as n from live l group by l.category) x),
    (select count(*)::int from public.item_templates t where t.archived_at is null),
    (select count(*)::int from live l where l.template_id is null),
    (select count(*)::int from live l where l.template_id is not null),
    (select coalesce(sum(t.missing_count), 0)::int
       from public.v_templates t where t.archived_at is null and t.total_known),
    (select coalesce(sum(s.units_left), 0)::int from stock s),
    (select coalesce(sum(s.units_left::bigint * s.cost_cents), 0)::bigint from stock s),
    (select coalesce(sum(s.units_left::bigint * coalesce(s.list_price_cents, 0)), 0)::bigint from stock s),
    (select coalesce(sum(s.units_left::bigint * s.est_profit_cents), 0)::bigint
       from stock s where s.est_profit_cents is not null),
    m.revenue,
    m.profit,
    m.expenses,
    m.profit - m.expenses,
    (select count(*)::int from live l
       where l.created_at >= (date_trunc('month', now() at time zone p_tz) at time zone p_tz))
  from money m;
$$;

-- -----------------------------------------------------------------------------
-- rpc_sales_summary: totals for one range (the dashboard's KPI tiles compare
-- this range with the one before it).
-- -----------------------------------------------------------------------------
create function public.rpc_sales_summary(
  p_start date,
  p_end date,
  p_tz text default 'America/New_York'
)
returns table (
  sale_count int,
  units_sold int,
  revenue_cents bigint,
  sales_profit_cents bigint,
  expenses_cents bigint,
  net_profit_cents bigint,
  avg_days_to_sell numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select * from public.sales_between(p_start, p_end, p_tz)
  ),
  e as (
    select coalesce(sum(x.amount_cents), 0)::bigint as total
    from public.expenses x
    where x.incurred_at between p_start and p_end
  )
  select
    (select count(*)::int from s),
    (select coalesce(sum(s.quantity), 0)::int from s),
    (select coalesce(sum(s.revenue_cents), 0)::bigint from s),
    (select coalesce(sum(s.net_profit_cents), 0)::bigint from s),
    e.total,
    (select coalesce(sum(s.net_profit_cents), 0)::bigint from s) - e.total,
    (select round(sum(s.days_to_sell::numeric * s.quantity) / nullif(sum(s.quantity), 0), 1) from s)
  from e;
$$;

-- Months from the first month with any activity (or p_start, if later) to p_end.
create function public.report_months(p_start date, p_end date, p_tz text)
returns table (month date)
language sql
stable
security invoker
set search_path = ''
as $$
  with first_day as (
    select least(
      (select min((s.sold_at at time zone p_tz)::date) from public.sales s),
      (select min(e.incurred_at) from public.expenses e),
      (select min(a.purchased_at) from public.item_acquisitions a)
    ) as d
  )
  select g::date
  from first_day f,
       generate_series(
         date_trunc('month', greatest(p_start, coalesce(f.d, p_end)))::date,
         date_trunc('month', p_end)::date,
         interval '1 month'
       ) g
  where p_start <= p_end;
$$;

-- -----------------------------------------------------------------------------
-- rpc_monthly_pnl: profit and loss per month.
-- -----------------------------------------------------------------------------
create function public.rpc_monthly_pnl(
  p_start date,
  p_end date,
  p_tz text default 'America/New_York'
)
returns table (
  month date,
  revenue_cents bigint,
  shipping_charged_cents bigint,
  fees_cents bigint,
  shipping_paid_cents bigint,
  other_costs_cents bigint,
  cogs_cents bigint,
  sales_profit_cents bigint,
  expenses_cents bigint,
  net_profit_cents bigint,
  units_sold int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select
      date_trunc('month', x.sold_on)::date as month,
      sum(x.revenue_cents) as revenue,
      sum(x.shipping_charged_cents) as charged,
      sum(x.platform_fee_cents) as fees,
      sum(x.shipping_cost_cents) as shipping,
      sum(x.other_cost_cents) as other,
      sum(x.cogs_cents) as cogs,
      sum(x.net_profit_cents) as profit,
      sum(x.quantity) as units
    from public.sales_between(p_start, p_end, p_tz) x
    group by 1
  ),
  e as (
    select date_trunc('month', x.incurred_at)::date as month, sum(x.amount_cents) as total
    from public.expenses x
    where x.incurred_at between p_start and p_end
    group by 1
  )
  select
    m.month,
    coalesce(s.revenue, 0)::bigint,
    coalesce(s.charged, 0)::bigint,
    coalesce(s.fees, 0)::bigint,
    coalesce(s.shipping, 0)::bigint,
    coalesce(s.other, 0)::bigint,
    coalesce(s.cogs, 0)::bigint,
    coalesce(s.profit, 0)::bigint,
    coalesce(e.total, 0)::bigint,
    (coalesce(s.profit, 0) - coalesce(e.total, 0))::bigint,
    coalesce(s.units, 0)::int
  from public.report_months(p_start, p_end, p_tz) m
  left join s on s.month = m.month
  left join e on e.month = m.month
  order by m.month;
$$;

-- -----------------------------------------------------------------------------
-- rpc_monthly_spend: money in (revenue) vs money out (stock bought, expenses).
-- -----------------------------------------------------------------------------
create function public.rpc_monthly_spend(
  p_start date,
  p_end date,
  p_tz text default 'America/New_York'
)
returns table (
  month date,
  purchased_cents bigint,
  expenses_cents bigint,
  revenue_cents bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with a as (
    select date_trunc('month', x.purchased_at)::date as month,
           sum(x.quantity::bigint * x.unit_cost_cents) as total
    from public.item_acquisitions x
    where x.purchased_at between p_start and p_end
    group by 1
  ),
  e as (
    select date_trunc('month', x.incurred_at)::date as month, sum(x.amount_cents) as total
    from public.expenses x
    where x.incurred_at between p_start and p_end
    group by 1
  ),
  s as (
    select date_trunc('month', x.sold_on)::date as month, sum(x.revenue_cents) as total
    from public.sales_between(p_start, p_end, p_tz) x
    group by 1
  )
  select
    m.month,
    coalesce(a.total, 0)::bigint,
    coalesce(e.total, 0)::bigint,
    coalesce(s.total, 0)::bigint
  from public.report_months(p_start, p_end, p_tz) m
  left join a on a.month = m.month
  left join e on e.month = m.month
  left join s on s.month = m.month
  order by m.month;
$$;

-- -----------------------------------------------------------------------------
-- rpc_platform_breakdown: where things sell and how well.
-- -----------------------------------------------------------------------------
create function public.rpc_platform_breakdown(
  p_start date,
  p_end date,
  p_tz text default 'America/New_York'
)
returns table (
  platform public.sales_platform,
  sale_count int,
  units_sold int,
  revenue_cents bigint,
  fees_cents bigint,
  net_profit_cents bigint,
  avg_days_to_sell numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    x.platform,
    count(*)::int,
    sum(x.quantity)::int,
    sum(x.revenue_cents)::bigint,
    sum(x.platform_fee_cents)::bigint,
    sum(x.net_profit_cents)::bigint,
    round(sum(x.days_to_sell::numeric * x.quantity) / nullif(sum(x.quantity), 0), 1)
  from public.sales_between(p_start, p_end, p_tz) x
  group by x.platform
  order by sum(x.revenue_cents) desc;
$$;

-- -----------------------------------------------------------------------------
-- rpc_set_breakdown: per set; one-offs grouped by series; the rest as
-- "Other one-offs". Stock is current; sales are within the range.
-- -----------------------------------------------------------------------------
create function public.rpc_set_breakdown(
  p_start date,
  p_end date,
  p_limit int default 10,
  p_tz text default 'America/New_York'
)
returns table (
  group_key text,
  group_kind text,
  label text,
  template_id uuid,
  units_in_stock int,
  units_sold int,
  revenue_cents bigint,
  net_profit_cents bigint,
  avg_days_to_sell numeric,
  volumes_owned int,
  total_volumes int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with stock as (
    select
      case
        when i.template_id is not null then 't:' || i.template_id
        when nullif(btrim(i.series), '') is not null then 's:' || lower(btrim(i.series))
        else 'other'
      end as key,
      min(btrim(i.series)) as series,
      sum(i.units_left)::int as units
    from public.v_items i
    where i.archived_at is null
      and i.status in ('in_stock', 'listed', 'reserved')
      and i.units_left > 0
    group by 1
  ),
  sold as (
    select
      case
        when x.template_id is not null then 't:' || x.template_id
        when nullif(btrim(x.series), '') is not null then 's:' || lower(btrim(x.series))
        else 'other'
      end as key,
      min(btrim(x.series)) as series,
      sum(x.quantity)::int as units,
      sum(x.revenue_cents)::bigint as revenue,
      sum(x.net_profit_cents)::bigint as profit,
      round(sum(x.days_to_sell::numeric * x.quantity) / nullif(sum(x.quantity), 0), 1) as days
    from public.sales_between(p_start, p_end, p_tz) x
    group by 1
  ),
  joined as (
    select
      coalesce(st.key, so.key) as key,
      coalesce(so.series, st.series) as series,
      coalesce(st.units, 0) as in_stock,
      coalesce(so.units, 0) as sold,
      coalesce(so.revenue, 0) as revenue,
      coalesce(so.profit, 0) as profit,
      so.days
    from stock st
    full join sold so on so.key = st.key
  )
  select
    j.key,
    case when j.key like 't:%' then 'set' when j.key = 'other' then 'other' else 'series' end,
    case
      when j.key like 't:%' then t.name
      when j.key = 'other' then 'Other one-offs'
      else j.series
    end,
    t.id,
    j.in_stock,
    j.sold,
    j.revenue,
    j.profit,
    j.days,
    t.volumes_owned,
    t.total_volumes
  from joined j
  left join public.v_templates t on j.key = 't:' || t.id::text
  order by j.profit desc, j.revenue desc, j.in_stock desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

-- -----------------------------------------------------------------------------
-- rpc_aging_buckets: how long in-stock and listed items have been sitting.
-- Always four rows. min_days/max_days match v_items.days_in_stock so the
-- inventory list can filter to a bucket.
-- -----------------------------------------------------------------------------
create function public.rpc_aging_buckets()
returns table (
  bucket text,
  min_days int,
  max_days int,
  item_count int,
  units int,
  cost_cents bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with b (bucket, min_days, max_days, ord) as (
    values ('0-30', 0, 30, 1), ('31-60', 31, 60, 2), ('61-90', 61, 90, 3), ('90+', 91, null::int, 4)
  )
  select
    b.bucket,
    b.min_days,
    b.max_days,
    count(i.id)::int,
    coalesce(sum(i.units_left), 0)::int,
    coalesce(sum(i.units_left::bigint * i.cost_cents), 0)::bigint
  from b
  left join public.v_items i
    on i.archived_at is null
   and i.status in ('in_stock', 'listed')
   and i.units_left > 0
   and i.days_in_stock >= b.min_days
   and (b.max_days is null or i.days_in_stock <= b.max_days)
  group by b.bucket, b.min_days, b.max_days, b.ord
  order by b.ord;
$$;

-- -----------------------------------------------------------------------------
-- rpc_items_added: items entered per week or month, per person. Every period
-- in the range appears for everyone who added something, with zeros.
-- -----------------------------------------------------------------------------
create function public.rpc_items_added(
  p_start date,
  p_end date,
  p_grain text default 'week',
  p_tz text default 'America/New_York'
)
returns table (
  period date,
  added_by text,
  item_count int
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_grain not in ('week', 'month') then
    raise exception 'p_grain must be week or month' using errcode = 'invalid_parameter_value';
  end if;

  return query
  with added as (
    select
      date_trunc(p_grain, (i.created_at at time zone p_tz)::date)::date as period,
      coalesce(nullif(btrim(p.display_name), ''), split_part(p.email::text, '@', 1), 'Unknown') as who
    from public.items i
    left join public.profiles p on p.id = i.created_by
    where i.created_at >= (p_start::timestamp at time zone p_tz)
      and i.created_at < ((p_end + 1)::timestamp at time zone p_tz)
  ),
  periods as (
    select g::date as period
    from generate_series(
      date_trunc(p_grain, greatest(p_start, coalesce((select min(a.period) from added a), p_end)))::date,
      date_trunc(p_grain, p_end)::date,
      ('1 ' || p_grain)::interval
    ) g
  ),
  people as (
    select distinct a.who from added a
  )
  select pr.period, pe.who, count(a.period)::int
  from periods pr
  cross join people pe
  left join added a on a.period = pr.period and a.who = pe.who
  group by pr.period, pe.who
  order by pr.period, pe.who;
end;
$$;

-- -----------------------------------------------------------------------------
-- backfill_inventory_snapshots: rebuilds daily snapshots from p_start up to
-- yesterday so the value chart isn't empty on day one, then takes today's.
-- Never overwrites a snapshot that already exists. History is approximate:
-- copies count from their acquisition date until the day they sold, at today's
-- average cost and asking price; drafts, kept and written-off items are left out.
-- SECURITY DEFINER because snapshots are read-only to the app; admins only.
-- -----------------------------------------------------------------------------
create function public.backfill_inventory_snapshots(p_start date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_inserted int;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can rebuild snapshots.' using errcode = 'insufficient_privilege';
  end if;

  with ins as (
    insert into public.inventory_snapshots
      (snapshot_date, items_in_stock, units_in_stock, cost_basis_cents, list_value_cents)
    select
      d.day,
      count(*) filter (where x.units_left > 0)::int,
      coalesce(sum(x.units_left) filter (where x.units_left > 0), 0)::int,
      coalesce(sum(x.units_left::bigint * x.cost_cents) filter (where x.units_left > 0), 0),
      coalesce(sum(x.units_left::bigint * coalesce(x.list_price_cents, 0)) filter (where x.units_left > 0), 0)
    from generate_series(p_start, v_today - 1, interval '1 day') g
    cross join lateral (select g::date as day) d
    left join lateral (
      select
        i.cost_cents,
        i.list_price_cents,
        coalesce((select sum(a.quantity) from public.item_acquisitions a
                  where a.item_id = i.id and a.purchased_at <= d.day), 0)
        - coalesce((select sum(s.quantity) from public.sales s
                    where s.item_id = i.id
                      and (s.sold_at at time zone 'America/New_York')::date <= d.day), 0) as units_left
      from public.items i
      where i.archived_at is null
        and i.status not in ('draft', 'kept', 'written_off')
    ) x on true
    group by d.day
    on conflict (snapshot_date) do nothing
    returning 1
  )
  select count(*)::int into v_inserted from ins;

  if not exists (select 1 from public.inventory_snapshots where snapshot_date = v_today) then
    perform public.take_inventory_snapshot();
    v_inserted := v_inserted + 1;
  end if;

  return v_inserted;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants: authenticated (RLS still limits rows to admins), never anon.
-- -----------------------------------------------------------------------------
revoke execute on function
  public.sales_between(date, date, text),
  public.rpc_overview(text),
  public.rpc_sales_summary(date, date, text),
  public.report_months(date, date, text),
  public.rpc_monthly_pnl(date, date, text),
  public.rpc_monthly_spend(date, date, text),
  public.rpc_platform_breakdown(date, date, text),
  public.rpc_set_breakdown(date, date, int, text),
  public.rpc_aging_buckets(),
  public.rpc_items_added(date, date, text, text),
  public.backfill_inventory_snapshots(date)
from public, anon;

grant execute on function
  public.sales_between(date, date, text),
  public.rpc_overview(text),
  public.rpc_sales_summary(date, date, text),
  public.report_months(date, date, text),
  public.rpc_monthly_pnl(date, date, text),
  public.rpc_monthly_spend(date, date, text),
  public.rpc_platform_breakdown(date, date, text),
  public.rpc_set_breakdown(date, date, int, text),
  public.rpc_aging_buckets(),
  public.rpc_items_added(date, date, text, text),
  public.backfill_inventory_snapshots(date)
to authenticated, service_role;
