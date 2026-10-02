-- pgTAP tests for sets, copies, lots and sales.
-- Run with:  npm run test:db   (hosted project, always rolled back)
-- Each test function runs in its own rolled-back transaction and builds the
-- data it needs, so the tests don't depend on seed or demo data.
begin;

create extension if not exists pgtap with schema extensions;
create schema kura_tests;

-- A 32-volume set where we own volumes 3-20 at $3.00 each. Returns the set id.
create function kura_tests.make_set()
returns uuid
language plpgsql
set search_path = public, extensions
as $$
declare
  t uuid;
begin
  insert into item_templates (name, total_volumes)
  values ('pgTAP set ' || gen_random_uuid(), 32)
  returning id into t;
  perform add_template_volumes(t, array(select generate_series(3, 20)), p_cost_cents => 300);
  return t;
end;
$$;

create function kura_tests.test_format_volume_ranges()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
begin
  return next is(format_volume_ranges('{}'), '', 'empty list gives an empty string');
  return next is(format_volume_ranges('{7}'), '7', 'single volume');
  return next is(format_volume_ranges('{5,1,1,3,2}'), '1-3, 5', 'sorts, dedupes and collapses runs');
  return next is(
    format_volume_ranges(array[1, 2] || array(select generate_series(21, 32))),
    '1-2, 21-32', 'two runs');
end;
$$;

create function kura_tests.test_missing_ranges_for_3_to_20_of_32()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  t uuid := kura_tests.make_set();
begin
  return next is((select owned_ranges from v_templates where id = t), '3-20', 'owned 3-20');
  return next is((select missing_ranges from v_templates where id = t), '1-2, 21-32', 'missing 1-2, 21-32');
  return next is((select missing_count from v_templates where id = t), 14, '14 volumes missing');
  return next is((select completion_percent from v_templates where id = t), 56, '18 of 32 is 56%');
end;
$$;

create function kura_tests.test_adding_18_to_25_merges_and_creates()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  t uuid := kura_tests.make_set();
begin
  -- 8 copies for $10.00 in total: $1.25 each.
  create temp table added on commit drop as
    select * from add_template_volumes(t, array(select generate_series(18, 25)),
      p_cost_mode => 'split_total', p_cost_cents => 1000);

  return next results_eq(
    'select volume_number, action, new_quantity from added where volume_number <= 20 order by 1',
    $q$values (18, 'merged', 2), (19, 'merged', 2), (20, 'merged', 2)$q$,
    '18-20 merge into the existing rows with quantity 2');
  return next results_eq(
    'select volume_number, action from added where volume_number > 20 order by 1',
    $q$values (21, 'created'), (22, 'created'), (23, 'created'), (24, 'created'), (25, 'created')$q$,
    '21-25 are created');
  return next is(
    (select count(*)::int from items where template_id = t and volume_number between 18 and 20),
    3, 'still one row per volume for 18-20');
  return next is(
    (select cost_cents from items where template_id = t and volume_number = 18),
    213, 'average cost of $3.00 and $1.25 rounds to $2.13');
  return next is((select count(*)::int from items where template_id = t), 23, '23 volume rows in the set');
end;
$$;

create function kura_tests.test_allocate_lot_cost_sums_exactly()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  t uuid := kura_tests.make_set();
  lot uuid;
begin
  insert into lots (name, total_cost_cents) values ('pgTAP lot', 1000) returning id into lot;
  -- 3 copies: $10.00 doesn't divide evenly.
  perform add_template_volumes(t, '{30,31}', p_cost_cents => 0, p_lot_id => lot,
    p_overrides => '{"30": {"quantity": 2}}');

  perform allocate_lot_cost(lot, 'even');
  return next is(
    (select sum(quantity * unit_cost_cents)::int from item_acquisitions where lot_id = lot),
    1000, 'even split sums exactly to the lot total');

  update items set list_price_cents = 1500 where template_id = t and volume_number = 30;
  update items set list_price_cents = 500 where template_id = t and volume_number = 31;
  perform allocate_lot_cost(lot, 'by_list_price');
  return next is(
    (select sum(quantity * unit_cost_cents)::int from item_acquisitions where lot_id = lot),
    1000, 'split by asking price sums exactly to the lot total');

  return next is(
    (select sum(p.total_cents)::int from allocate_lot_cost(lot, 'even', true) as p),
    1000, 'the preview (dry run) also adds up to the lot total');
end;
$$;

create function kura_tests.test_selling_last_copy_and_restocking()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  t uuid := kura_tests.make_set();
  item uuid;
begin
  select id into item from items where template_id = t and volume_number = 3;

  insert into sales (item_id, platform, sale_price_cents) values (item, 'ebay', 900);
  return next is((select status::text from items where id = item), 'sold', 'selling the last copy marks it sold');

  return next throws_ok(
    format('insert into sales (item_id, platform, sale_price_cents) values (%L, ''ebay'', 900)', item),
    '23514', null, 'selling more than is left is rejected');

  perform add_copies(item, 1, 250);
  return next is((select status::text from items where id = item), 'in_stock', 'a new copy brings it back in stock');
  return next is((select quantity from items where id = item), 2, 'quantity is now 2');
end;
$$;

create function kura_tests.test_non_admin_cannot_read_or_write()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  t uuid := kura_tests.make_set();
begin
  -- A signed-in user who isn't on the allowlist (no admin profile).
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;

  return next is(is_admin(), false, 'is_admin() is false');
  return next is((select count(*)::int from items), 0, 'sees no items');
  return next is((select count(*)::int from v_templates), 0, 'sees no sets');
  return next is((select count(*)::int from app_settings), 0, 'sees no settings');
  return next throws_ok(
    $q$insert into items (name, category) values ('sneaky', 'other')$q$,
    '42501', null, 'cannot insert items');
  return next throws_ok('select * from allowed_emails', '42501', null, 'cannot read the allowlist');

  reset role;
end;
$$;

select * from runtests('kura_tests'::name);

rollback;
