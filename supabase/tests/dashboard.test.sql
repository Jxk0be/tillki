-- pgTAP tests for the dashboard report functions.
-- Run with:  npm run test:db   (hosted project, always rolled back)
-- The data lives in early 2020, before any real or demo data, so the totals
-- for 2020 ranges come only from what these tests create.
begin;

create extension if not exists pgtap with schema extensions;
create schema kura_dash_tests;

-- Two one-offs bought in January 2020 and three sales, plus one expense:
--   A "Test Series X": 2 copies at $5, list $15
--     sale 1  2020-02-10 eBay   $12 + $3 shipping charged, $1.50 fee, $2.50 shipping paid
--     sale 2  2020-03-31 23:30 New York (April 1 in UTC), eBay $10
--   B no series: 1 copy at $10, sold 2020-03-01 on Mercari for $20, $2 fee
--   expense 2020-02-15 $4
create function kura_dash_tests.make_data()
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  a uuid;
  b uuid;
begin
  a := (create_item(
    jsonb_build_object('name', 'Dash A', 'category', 'figure', 'series', 'Test Series X', 'list_price_cents', 1500),
    jsonb_build_object('quantity', 2, 'unit_cost_cents', 500, 'purchased_at', '2020-01-05'))).id;
  b := (create_item(
    jsonb_build_object('name', 'Dash B', 'category', 'merch'),
    jsonb_build_object('quantity', 1, 'unit_cost_cents', 1000, 'purchased_at', '2020-01-20'))).id;
  update items set created_at = '2020-01-05 12:00 America/New_York' where id = a;
  update items set created_at = '2020-01-20 12:00 America/New_York' where id = b;

  insert into sales (item_id, platform, sold_at, sale_price_cents, shipping_charged_cents, platform_fee_cents, shipping_cost_cents)
  values (a, 'ebay', '2020-02-10 12:00 America/New_York', 1200, 300, 150, 250);
  insert into sales (item_id, platform, sold_at, sale_price_cents)
  values (a, 'ebay', '2020-03-31 23:30 America/New_York', 1000);
  insert into sales (item_id, platform, sold_at, sale_price_cents, platform_fee_cents)
  values (b, 'mercari', '2020-03-01 12:00 America/New_York', 2000, 200);
  insert into expenses (incurred_at, category, amount_cents) values ('2020-02-15', 'supplies', 400);
end;
$$;

create function kura_dash_tests.test_sales_summary()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  r record;
begin
  perform kura_dash_tests.make_data();
  select * into r from rpc_sales_summary('2020-01-01', '2020-03-31', 'America/New_York');
  return next is(r.sale_count, 3, 'three sales in Q1 2020 (New York time)');
  return next is(r.units_sold, 3, 'three units');
  return next is(r.revenue_cents, 4500::bigint, 'revenue is price + shipping charged');
  return next is(r.sales_profit_cents, 1900::bigint, 'sales profit matches v_sales');
  return next is(r.expenses_cents, 400::bigint, 'expenses in range');
  return next is(r.net_profit_cents, 1500::bigint, 'net profit = sales profit - expenses');
  return next is(r.avg_days_to_sell, 54.3, 'average days to sell (36, 41, 86)');

  select * into r from rpc_sales_summary('2020-01-01', '2020-03-31', 'UTC');
  return next is(r.sale_count, 2, 'in UTC the late-night sale falls in April');
end;
$$;

create function kura_dash_tests.test_monthly_pnl()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
begin
  perform kura_dash_tests.make_data();
  return next results_eq(
    $q$select month, revenue_cents, sales_profit_cents, expenses_cents, net_profit_cents, units_sold
       from rpc_monthly_pnl('2020-01-01', '2020-03-31')$q$,
    $q$values ('2020-01-01'::date, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0),
              ('2020-02-01', 1500, 600, 400, 200, 1),
              ('2020-03-01', 3000, 1300, 0, 1300, 2)$q$,
    'one row per month, empty months included');
  return next is(
    (select sum(fees_cents) from rpc_monthly_pnl('2020-01-01', '2020-03-31')), 350::numeric,
    'fees add up');
  return next is(
    (select sum(cogs_cents) from rpc_monthly_pnl('2020-01-01', '2020-03-31')), 2000::numeric,
    'cost of goods sold adds up');
  return next is(
    (select count(*)::int from rpc_monthly_pnl('2020-03-01', '2020-02-01')), 0,
    'a backwards range is empty');
end;
$$;

create function kura_dash_tests.test_monthly_spend()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
begin
  perform kura_dash_tests.make_data();
  return next results_eq(
    $q$select month, purchased_cents, expenses_cents, revenue_cents
       from rpc_monthly_spend('2020-01-01', '2020-03-31')$q$,
    $q$values ('2020-01-01'::date, 2000::bigint, 0::bigint, 0::bigint),
              ('2020-02-01', 0, 400, 1500),
              ('2020-03-01', 0, 0, 3000)$q$,
    'purchases by acquisition date, revenue by sale month');
end;
$$;

create function kura_dash_tests.test_platform_breakdown()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
begin
  perform kura_dash_tests.make_data();
  return next results_eq(
    $q$select platform::text, units_sold, revenue_cents, fees_cents, net_profit_cents
       from rpc_platform_breakdown('2020-01-01', '2020-03-31')$q$,
    $q$values ('ebay', 2, 2500::bigint, 150::bigint, 1100::bigint),
              ('mercari', 1, 2000, 200, 800)$q$,
    'per platform, biggest revenue first');
end;
$$;

create function kura_dash_tests.test_set_breakdown_groups_one_offs()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  r record;
begin
  perform kura_dash_tests.make_data();
  select * into r from rpc_set_breakdown('2020-01-01', '2020-03-31', 1000)
  where group_key = 's:test series x';
  return next is(r.label, 'Test Series X', 'one-offs grouped by series');
  return next is(r.group_kind, 'series', 'kind is series');
  return next is(r.units_sold, 2, 'both copies sold');
  return next is(r.net_profit_cents, 1100::bigint, 'series profit');
  return next is(r.units_in_stock, 0, 'none left');

  select * into r from rpc_set_breakdown('2020-01-01', '2020-03-31', 1000) where group_key = 'other';
  return next is(r.label, 'Other one-offs', 'one-offs without a series are grouped together');
  return next is(r.net_profit_cents, 800::bigint, 'other one-offs profit in range');
  return next is(
    (select count(*)::int from rpc_set_breakdown('2020-01-01', '2020-03-31', 1)), 1, 'limit applies');
end;
$$;

create function kura_dash_tests.test_aging_buckets()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
begin
  return next results_eq(
    $q$select bucket, min_days, max_days from rpc_aging_buckets()$q$,
    $q$values ('0-30', 0, 30), ('31-60', 31, 60), ('61-90', 61, 90), ('90+', 91, null::int)$q$,
    'always four buckets in order');
  return next is(
    (select sum(item_count)::int from rpc_aging_buckets()),
    (select count(*)::int from v_items
      where archived_at is null and status in ('in_stock', 'listed') and units_left > 0),
    'every in-stock or listed item lands in exactly one bucket');
end;
$$;

create function kura_dash_tests.test_items_added()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
begin
  perform kura_dash_tests.make_data();
  return next is(
    (select count(*)::int from rpc_items_added('2020-01-01', '2020-01-31', 'week')), 5,
    'every week of January appears (weeks start on Monday)');
  return next is(
    (select sum(item_count)::int from rpc_items_added('2020-01-01', '2020-01-31', 'week')), 2,
    'two items added');
  return next is(
    (select item_count from rpc_items_added('2020-01-01', '2020-03-31', 'month') where period = '2020-01-01'), 2,
    'monthly grain');
  return next throws_ok(
    $q$select * from rpc_items_added('2020-01-01', '2020-01-31', 'day')$q$,
    '22023', null, 'only week or month');
end;
$$;

create function kura_dash_tests.test_backfill_snapshots()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  n int;
begin
  delete from inventory_snapshots where snapshot_date >= current_date - 10;
  n := backfill_inventory_snapshots(current_date - 5);
  return next ok(n >= 5, 'fills the missing days');
  return next is(backfill_inventory_snapshots(current_date - 5), 0, 'never overwrites existing days');
  return next ok(
    exists (select 1 from inventory_snapshots where snapshot_date = current_date - 3),
    'a past day has a snapshot');

  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  return next throws_ok(
    $q$select backfill_inventory_snapshots(current_date - 1)$q$,
    '42501', null, 'non-admins cannot rebuild snapshots');
  reset role;
end;
$$;

select * from runtests('kura_dash_tests'::name);

rollback;
