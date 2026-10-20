-- pgTAP tests for the Buy Radar tables.
-- Run with:  npm run test:db   (hosted project, always rolled back)
begin;

create extension if not exists pgtap with schema extensions;
create schema kura_radar_tests;

create function kura_radar_tests.make_data()
returns uuid
language plpgsql
set search_path = public, extensions
as $$
declare
  t uuid;
begin
  insert into item_templates (name, anilist_id, anilist_match)
  values ('Radar Test Series', 999999, 'confirmed') returning id into t;
  insert into anilist_snapshots (anilist_id, captured_on, popularity) values (999999, '2020-01-01', 10);
  insert into buy_scores (template_id, scored_on, total, action) values (t, '2020-01-01', 50, 'hold');
  insert into radar_runs (kind, ok) values ('anilist', true);
  insert into radar_watchlist (template_id, max_buy_cents) values (t, 500);
  return t;
end;
$$;

create function kura_radar_tests.test_rls_enabled()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
begin
  return next ok(
    (select bool_and(relrowsecurity) from pg_class
     where oid in ('public.anilist_snapshots'::regclass, 'public.price_snapshots'::regclass,
                   'public.buy_scores'::regclass, 'public.radar_watchlist'::regclass,
                   'public.radar_runs'::regclass)),
    'RLS is on for every radar table');
end;
$$;

create function kura_radar_tests.test_constraints()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  t uuid := kura_radar_tests.make_data();
begin
  return next throws_ok(
    format($q$insert into buy_scores (template_id, scored_on, total, action) values (%L, '2020-01-02', 101, 'buy')$q$, t),
    '23514', null, 'score above 100 is rejected');
  return next throws_ok(
    format($q$insert into buy_scores (template_id, scored_on, total, action) values (%L, '2020-01-02', 50, 'maybe')$q$, t),
    '23514', null, 'unknown action is rejected');
  return next throws_ok(
    $q$insert into anilist_snapshots (anilist_id, captured_on) values (999999, '2020-01-01')$q$,
    '23505', null, 'one snapshot per series per day');
  return next throws_ok(
    format($q$update item_templates set anilist_match = 'maybe' where id = %L$q$, t),
    '23514', null, 'unknown match state is rejected');
end;
$$;

create function kura_radar_tests.test_non_admin_sees_nothing()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  t uuid := kura_radar_tests.make_data();
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;

  return next is((select count(*)::int from anilist_snapshots), 0, 'sees no snapshots');
  return next is((select count(*)::int from buy_scores), 0, 'sees no scores');
  return next is((select count(*)::int from radar_runs), 0, 'sees no runs');
  return next is((select count(*)::int from radar_watchlist), 0, 'sees no watchlist');
  return next throws_ok(
    format($q$insert into radar_watchlist (template_id) values (%L)$q$, t),
    '42501', null, 'cannot add to the watchlist');
  return next throws_ok(
    $q$insert into buy_scores (template_id, scored_on, total, action)
       values (gen_random_uuid(), '2020-01-03', 1, 'buy')$q$,
    '42501', null, 'cannot write scores');

  reset role;
end;
$$;

create function kura_radar_tests.test_anon_has_no_access()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
begin
  perform kura_radar_tests.make_data();
  set local role anon;
  return next throws_ok('select * from buy_scores', '42501', null, 'anon cannot read scores');
  return next throws_ok('select * from anilist_snapshots', '42501', null, 'anon cannot read snapshots');
  reset role;
end;
$$;

create function kura_radar_tests.test_cron_token()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
begin
  -- Skipped until the nightly-sync migration is applied.
  if to_regprocedure('public.radar_cron_token_ok(text)') is null then
    return next skip('radar_cron_token_ok not installed yet', 4);
    return;
  end if;
  return next ok(
    radar_cron_token_ok((select decrypted_secret from vault.decrypted_secrets where name = 'radar_cron_token')),
    'the Vault token is accepted');
  return next ok(not radar_cron_token_ok('wrong'), 'a wrong token is rejected');
  return next ok(not coalesce(radar_cron_token_ok(null), false), 'no token is rejected');
  return next ok(
    not has_function_privilege('authenticated', 'public.radar_cron_token_ok(text)', 'execute'),
    'signed-in users cannot call the token check');
end;
$$;

create function kura_radar_tests.test_series_performance()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  t uuid;
  v1 uuid;
  v2 uuid;
  r record;
begin
  -- Skipped until the series_performance migration is applied.
  if to_regclass('public.series_performance') is null then
    return next skip('series_performance not installed yet', 9);
    return;
  end if;

  -- A set with two volumes:
  --   vol 1: 2 copies at $4 bought 2020-01-01; one sold 2020-01-11 for $10 + $4 shipping
  --          charged, $1.50 fee, $3 shipping paid  -> revenue $14, kept $9.50, profit $5.50, 10 days
  --   vol 2: 1 copy at $6 bought 2020-01-01; sold 2020-01-31 for $12, $1.20 fee
  --          -> revenue $12, kept $10.80, profit $4.80, 30 days
  insert into item_templates (name, category) values ('Radar Perf Set', 'manga') returning id into t;
  insert into items (name, category, template_id, volume_number) values ('', 'manga', t, 1) returning id into v1;
  insert into items (name, category, template_id, volume_number) values ('', 'manga', t, 2) returning id into v2;
  insert into item_acquisitions (item_id, quantity, unit_cost_cents, purchased_at) values (v1, 2, 400, '2020-01-01');
  insert into item_acquisitions (item_id, quantity, unit_cost_cents, purchased_at) values (v2, 1, 600, '2020-01-01');
  insert into sales (item_id, platform, sold_at, sale_price_cents, shipping_charged_cents, platform_fee_cents, shipping_cost_cents)
  values (v1, 'ebay', '2020-01-11 12:00 America/New_York', 1000, 400, 150, 300);
  insert into sales (item_id, platform, sold_at, sale_price_cents, platform_fee_cents)
  values (v2, 'mercari', '2020-01-31 12:00 America/New_York', 1200, 120);

  select * into r from series_performance where template_id = t;
  return next is(r.units_bought, 3, 'units bought');
  return next is(r.units_sold, 2, 'units sold');
  return next is(r.units_on_hand, 1, 'units on hand');
  return next is(r.avg_cost_cents, 467, 'average cost over all copies bought ($14 / 3)');
  return next is(r.avg_sale_cents, 1300, 'average revenue per unit ($26 / 2)');
  return next is(r.avg_net_cents, 1015, 'average kept per unit after fees and shipping ($20.30 / 2)');
  return next is(r.margin_pct, 39.6, 'margin = profit / revenue ($10.30 / $26)');
  return next is(r.median_days_to_sell, 20::float8, 'median of 10 and 30 days');
  return next is(r.sample_size, 2, 'sample size is units sold');
end;
$$;

select * from runtests('kura_radar_tests'::name);

rollback;
