-- =============================================================================
-- Removes the demo data loaded by supabase/seed-demo.sql, and nothing else:
-- sets/items tagged 'demo', lots and expenses noted 'Demo data', and their sales.
-- Inventory snapshots are cleared too (they were built from demo stock; the
-- nightly job starts fresh), and the SKU counter continues after any real items.
--
-- Run it with:  npx supabase db query --linked -f supabase/demo-wipe.sql
-- =============================================================================
begin;

delete from public.sales s
using public.items i
where i.id = s.item_id and 'demo' = any (i.tags);

-- Cascades to acquisitions, item photos rows and history.
delete from public.items where 'demo' = any (tags);
delete from public.item_templates where 'demo' = any (tags);
delete from public.lots where notes = 'Demo data';
delete from public.expenses where note = 'Demo data';
delete from public.inventory_snapshots;

select setval(
  'public.item_sku_seq',
  coalesce((select max(substring(sku from 4)::int) from public.items where sku ~ '^[A-Z]{2}-\d+$'), 0) + 1,
  false
);

commit;

select
  (select count(*) from public.items) as items_left,
  (select count(*) from public.item_templates) as sets_left,
  (select count(*) from public.sales) as sales_left;
