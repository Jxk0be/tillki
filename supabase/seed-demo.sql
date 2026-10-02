-- =============================================================================
-- Demo data for trying out the screens and charts.
--
-- Everything here is marked so supabase/demo-wipe.sql can remove exactly this
-- and nothing else: sets and items carry the tag 'demo', lots and expenses have
-- the note 'Demo data'. Don't add real copies to the demo sets (they'd inherit
-- the tag and be wiped too).
--
-- Built through the real functions (add_template_volumes, create_item,
-- allocate_lot_cost, record_bundle_sale) so it exercises the actual logic.
-- Dates are backdated across the last ~10 months so the charts have history.
-- Running it twice does nothing the second time.
-- =============================================================================
do $$
declare
  v_sk uuid;   -- Shaman King: 32 volumes, we own 3-20 -> missing "1-2, 21-32"
  v_dn uuid;   -- Death Note: complete run of 12, a few sold
  v_csm uuid;  -- Chainsaw Man: ongoing, unknown total, gap at 9
  v_lot_a uuid;
  v_lot_b uuid;
  v_lot_c uuid;
begin
  if exists (select 1 from public.item_templates where 'demo' = any (tags)) then
    raise notice 'Demo data is already loaded; nothing to do.';
    return;
  end if;

  -- ---------------------------------------------------------------- lots
  insert into public.lots (name, source, purchased_at, total_cost_cents, notes)
  values ('Library sale box', 'Library book sale', '2025-12-06', 2000, 'Demo data')
  returning id into v_lot_c;
  insert into public.lots (name, source, purchased_at, total_cost_cents, notes)
  values ('Half Price Books clearance haul', 'Half Price Books', '2026-01-10', 4500, 'Demo data')
  returning id into v_lot_a;
  insert into public.lots (name, source, purchased_at, total_cost_cents, notes)
  values ('Facebook Marketplace manga bundle', 'Facebook Marketplace', '2026-04-18', 6000, 'Demo data')
  returning id into v_lot_b;

  -- ---------------------------------------------------------------- sets
  insert into public.item_templates
    (name, description, category, publisher, total_volumes, is_ongoing, default_condition, default_list_price_cents, tags)
  values
    ('Shaman King',
     'Yoh Asakura can see spirits, and he''s training to become the Shaman King. VIZ Media English edition.',
     'manga', 'VIZ Media', 32, false, 'very_good', 800, '{demo}')
  returning id into v_sk;

  insert into public.item_templates
    (name, description, category, publisher, total_volumes, is_ongoing, default_condition, default_list_price_cents, tags)
  values
    ('Death Note',
     'Light Yagami finds a notebook that kills anyone whose name is written in it. VIZ Media English edition, complete in 12 volumes.',
     'manga', 'VIZ Media', 12, false, 'good', 900, '{demo}')
  returning id into v_dn;

  insert into public.item_templates
    (name, description, category, publisher, total_volumes, is_ongoing, default_condition, default_list_price_cents, tags)
  values
    ('Chainsaw Man',
     'Denji merges with his chainsaw devil dog Pochita and becomes a devil hunter. VIZ Media English edition, still running.',
     'manga', 'VIZ Media', null, true, 'like_new', 1000, '{demo}')
  returning id into v_csm;

  -- Death Note 1-12 from the library sale box ($20 for the lot).
  perform public.add_template_volumes(v_dn, array(select generate_series(1, 12)),
    p_cost_mode => 'split_total', p_cost_cents => 2000, p_lot_id => v_lot_c,
    p_purchase_source => 'Library book sale', p_purchased_at => '2025-12-06');

  -- Shaman King 3-12 from Half Price Books ($45), then 10-20 from Facebook ($60):
  -- volumes 10-12 end up with 2 copies from two lots at different costs.
  perform public.add_template_volumes(v_sk, array(select generate_series(3, 12)),
    p_condition => 'very_good', p_cost_mode => 'split_total', p_cost_cents => 4500, p_lot_id => v_lot_a,
    p_purchase_source => 'Half Price Books', p_purchased_at => '2026-01-10');
  perform public.add_template_volumes(v_sk, array(select generate_series(10, 20)),
    p_condition => 'good', p_cost_mode => 'split_total', p_cost_cents => 6000, p_lot_id => v_lot_b,
    p_purchase_source => 'Facebook Marketplace', p_purchased_at => '2026-04-18');
  perform public.allocate_lot_cost(v_lot_a, 'even');
  perform public.allocate_lot_cost(v_lot_b, 'even');

  -- Chainsaw Man 1-8 and 10-12 at $6 each (volume 9 is the gap).
  perform public.add_template_volumes(v_csm, array[1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12],
    p_cost_cents => 600, p_purchase_source => 'Barnes & Noble clearance', p_purchased_at => '2026-06-14');

  -- ---------------------------------------------------------------- one-offs
  perform public.create_item(
    jsonb_build_object('name', x.name, 'category', x.category, 'condition', x.condition,
                       'list_price_cents', x.list_price, 'storage_location', x.bin, 'tags', array['demo']),
    jsonb_build_object('quantity', 1, 'unit_cost_cents', x.cost, 'purchase_source', x.source,
                       'purchased_at', x.bought))
  from (values
    ('Nendoroid Gojo Satoru',                       'figure', 'new',       2800, 5500, 'Mercari',             date '2025-12-12', 'Shelf A'),
    ('figma Link (Breath of the Wild)',             'figure', 'like_new',  4500, 8900, 'Local card shop',     date '2026-01-22', 'Shelf A'),
    ('Banpresto Luffy Gear 5 prize figure',         'figure', 'new',       1500, 3200, 'Anime Expo',          date '2026-01-05', 'Shelf A'),
    ('POP UP PARADE Frieren',                       'figure', 'new',       2200, 4200, 'AmiAmi preorder',     date '2026-03-02', 'Shelf B'),
    ('Hatsune Miku 15th Anniversary scale figure',  'figure', 'like_new',  6000, 11000, 'Facebook Marketplace', date '2026-05-09', 'Shelf B'),
    ('Ichiban Kuji Goku prize figure',              'figure', 'new',       2500, 5000, 'Ichiban Kuji lottery', date '2026-07-11', 'Shelf B'),
    ('Spy x Family Anya acrylic stand',             'merch',  'new',        300, 1200, 'Anime Expo',          date '2026-01-05', 'Bin 1'),
    ('Totoro plush (medium)',                       'merch',  'like_new',   900, 2400, 'Thrift store',        date '2026-02-14', 'Bin 1'),
    ('Jujutsu Kaisen keychain set',                 'merch',  'new',        400, 1500, 'Crunchyroll Store',   date '2026-04-03', 'Bin 1'),
    ('Demon Slayer wall scroll',                    'merch',  'very_good',  700, 1800, 'Garage sale',         date '2026-05-23', 'Bin 2'),
    ('Sailor Moon compact replica',                 'merch',  'like_new',  3000, 6500, 'eBay lot',            date '2026-03-28', 'Bin 2'),
    ('Studio Ghibli tote bag',                      'merch',  'new',        500, 1600, 'Kinokuniya',          date '2026-08-02', 'Bin 2'),
    ('Custom Frieren enamel pin',                   'custom', 'new',        600, 1400, 'Etsy',                date '2026-06-01', 'Bin 3'),
    ('Hand-painted Jolly Roger tumbler',            'custom', 'new',       1200, 2800, 'Etsy',                date '2026-07-19', 'Bin 3'),
    ('Custom Chainsaw Man sticker pack',            'custom', 'new',        250,  900, 'Etsy',                date '2026-08-21', 'Bin 3'),
    ('Akira Vol. 1 (35th Anniversary Edition)',     'manga',  'very_good', 1200, 2800, 'Half Price Books',    date '2026-02-08', 'Bin 4'),
    ('Your Name. (single volume)',                  'manga',  'good',       500, 1100, 'Library book sale',   date '2025-12-06', 'Bin 4'),
    ('Goodnight Punpun Vol. 1',                     'manga',  'like_new',   900, 1800, 'Half Price Books',    date '2026-04-26', 'Bin 4'),
    ('Berserk Deluxe Edition Vol. 1',               'manga',  'very_good', 2500, 4500, 'Facebook Marketplace', date '2026-08-15', 'Bin 4'),
    ('Uzumaki (3-in-1 Deluxe Edition)',             'manga',  'like_new',  1500, 2600, 'Kinokuniya',          date '2026-09-06', 'Bin 4')
  ) as x(name, category, condition, cost, list_price, source, bought, bin);

  -- Backdate "date entered" to the purchase date, and the history entries with it.
  update public.items i
  set created_at = ((coalesce(i.purchased_at, current_date) + time '12:00') at time zone 'America/New_York')
  where 'demo' = any (i.tags);
  update public.item_acquisitions a
  set created_at = ((a.purchased_at + time '12:00') at time zone 'America/New_York')
  from public.items i
  where i.id = a.item_id and 'demo' = any (i.tags);
  update public.item_events e
  set created_at = i.created_at
  from public.items i
  where i.id = e.item_id and 'demo' = any (i.tags) and e.event_type in ('created', 'copies_added');

  -- A few things listed a few days after purchase, one draft, one kept.
  update public.items set status = 'listed', listed_at = created_at + interval '3 days'
  where 'demo' = any (tags) and (
    template_id = v_sk and volume_number between 3 and 12
    or name in ('Nendoroid Gojo Satoru', 'Banpresto Luffy Gear 5 prize figure', 'figma Link (Breath of the Wild)',
                'Totoro plush (medium)', 'Sailor Moon compact replica', 'Akira Vol. 1 (35th Anniversary Edition)',
                'Ichiban Kuji Goku prize figure', 'Goodnight Punpun Vol. 1', 'Hatsune Miku 15th Anniversary scale figure')
  );
  update public.items set status = 'draft' where 'demo' = any (tags) and name = 'Uzumaki (3-in-1 Deluxe Edition)';
  update public.items set status = 'kept' where 'demo' = any (tags) and name = 'Custom Frieren enamel pin';

  -- ---------------------------------------------------------------- sales
  -- Fees use the default fee rules: eBay 13.6% + 40c, Mercari 10% + 50c, Facebook 10%.
  insert into public.sales
    (item_id, quantity, sold_at, platform, sale_price_cents, shipping_charged_cents, shipping_cost_cents,
     platform_fee_cents, notes)
  select
    i.id, 1, (x.sold_on + time '19:30') at time zone 'America/New_York', x.platform::public.sales_platform,
    x.price, x.ship_charged, x.ship_cost,
    case x.platform
      when 'ebay' then round((x.price + x.ship_charged) * 0.136)::int + 40
      when 'mercari' then round(x.price * 0.10)::int + 50
      when 'fb_marketplace' then round(x.price * 0.10)::int
      else 0
    end,
    'Demo data'
  from (values
    ('Nendoroid Gojo Satoru',                    null::int, 'ebay',           5500, 600, 520, date '2026-01-09'),
    ('Your Name. (single volume)',               null,      'mercari',        1000, 0,   450, date '2025-12-29'),
    ('Banpresto Luffy Gear 5 prize figure',      null,      'mercari',        3000, 0,   650, date '2026-02-20'),
    ('Spy x Family Anya acrylic stand',          null,      'event',          1200, 0,   0,   date '2026-03-14'),
    ('Totoro plush (medium)',                    null,      'fb_marketplace', 2200, 0,   0,   date '2026-04-11'),
    ('Akira Vol. 1 (35th Anniversary Edition)',  null,      'ebay',           2800, 500, 480, date '2026-05-02'),
    ('Sailor Moon compact replica',              null,      'ebay',           6200, 700, 640, date '2026-07-05'),
    ('Goodnight Punpun Vol. 1',                  null,      'ebay',           1800, 450, 430, date '2026-08-08'),
    ('Ichiban Kuji Goku prize figure',           null,      'ebay',           4800, 800, 760, date '2026-09-12'),
    ('Studio Ghibli tote bag',                   null,      'in_person',      1500, 0,   0,   date '2026-09-20'),
    ('Jujutsu Kaisen keychain set',              null,      'event',          1500, 0,   0,   date '2026-06-20'),
    ('Death Note',                               2,         'mercari',         700, 0,   400, date '2025-12-20'),
    ('Death Note',                               5,         'ebay',            850, 400, 410, date '2026-02-03'),
    ('Shaman King',                              10,        'mercari',         900, 0,   410, date '2026-05-16'),
    ('Chainsaw Man',                             1,         'ebay',           1200, 450, 430, date '2026-08-24'),
    ('Chainsaw Man',                             2,         'event',          1000, 0,   0,   date '2026-09-26')
  ) as x(name, vol, platform, price, ship_charged, ship_cost, sold_on)
  join public.items i on 'demo' = any (i.tags) and (
    (x.vol is null and i.name = x.name and i.template_id is null)
    or (x.vol is not null and i.series = x.name and i.volume_number = x.vol)
  );

  -- One bundle: Death Note 9-12 as a single eBay listing for $36 + $6 shipping.
  perform public.record_bundle_sale(
    (select jsonb_agg(jsonb_build_object('item_id', i.id) order by i.volume_number)
     from public.items i where i.template_id = v_dn and i.volume_number between 9 and 12),
    'ebay', 3600, 600, 590, round(4200 * 0.136)::int + 40,
    ('2026-03-21'::date + time '18:00') at time zone 'America/New_York', 'even', 'Demo data');

  -- ---------------------------------------------------------------- expenses
  insert into public.expenses (incurred_at, category, amount_cents, vendor, note) values
    ('2025-12-15', 'supplies',      2499, 'Uline',             'Demo data'),
    ('2026-01-31', 'software',      2795, 'eBay',              'Demo data'),
    ('2026-03-14', 'event_fees',    7500, 'Local anime con',   'Demo data'),
    ('2026-03-14', 'travel',        1840, 'Mileage',           'Demo data'),
    ('2026-05-20', 'shipping',      1299, 'Pirate Ship',       'Demo data'),
    ('2026-06-20', 'event_fees',    5000, 'Summer swap meet',  'Demo data'),
    ('2026-08-05', 'supplies',      1650, 'Amazon',            'Demo data');

  perform public.take_inventory_snapshot();
end
$$;
