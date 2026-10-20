-- =============================================================================
-- Buy Radar, phases 6 and 8: the weekly Claude digest and the nightly eBay
-- price sync. See docs/buy-radar-plan.md.
-- =============================================================================

-- One row per digest run. content is the validated JSON (buy, finish_sets,
-- stop_buying, watch, notes); raw_text is kept when validation fails.
create table public.radar_digests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.radar_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  ok boolean not null,
  content jsonb,
  raw_text text,
  model text
);
create index radar_digests_created_idx on public.radar_digests (created_at desc);
create index radar_digests_run_id_idx on public.radar_digests (run_id);

revoke all on public.radar_digests from anon;
grant select on public.radar_digests to authenticated;
grant all on public.radar_digests to service_role;
alter table public.radar_digests enable row level security;
create policy "admins read digests" on public.radar_digests
  for select to authenticated using ((select public.is_admin()));

-- eBay prices first (06:40 UTC), so the AniList sync's scoring at 07:10 sees
-- them. The function exits quietly until the eBay keys are set as secrets.
select cron.schedule(
  'radar-nightly-ebay-sync',
  '40 6 * * *',
  $$select public.radar_call_function('ebay-sync')$$
);

-- Sundays 12:10 UTC: 8:10am in New York during daylight time, 7:10am in winter.
select cron.schedule(
  'radar-weekly-digest',
  '10 12 * * 0',
  $$select public.radar_call_function('radar-digest')$$
);
