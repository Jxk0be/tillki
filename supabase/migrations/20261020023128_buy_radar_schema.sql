-- =============================================================================
-- Buy Radar, phase 1: AniList link on sets, plus the tables that hold nightly
-- snapshots, scores, the watchlist and the job log. See docs/buy-radar-plan.md.
--
-- Snapshots, scores and runs are written by the radar Edge Functions with the
-- service role, so admins can only read them. The watchlist and manual price
-- rows are edited in the app.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sets get an AniList id. Several sets can share one (Berserk and Berserk
-- Deluxe Edition are the same series on AniList), so it isn't unique.
-- -----------------------------------------------------------------------------
alter table public.item_templates
  add column anilist_id int check (anilist_id > 0),
  add column anilist_match text check (anilist_match in ('auto', 'confirmed', 'none')),
  add column anilist_candidates jsonb,
  add column demographic text;

comment on column public.item_templates.anilist_match is
  'auto: matched by the sync with high confidence. confirmed: set by hand. none: not on AniList (skip matching). Null: not tried yet.';
comment on column public.item_templates.anilist_candidates is
  'Top AniList search results when the sync could not match with confidence, for the match review screen.';

create index item_templates_anilist_id_idx on public.item_templates (anilist_id)
  where anilist_id is not null;

-- -----------------------------------------------------------------------------
-- One row per AniList series per day. Never overwritten after the day ends;
-- trends are computed from the history.
-- -----------------------------------------------------------------------------
create table public.anilist_snapshots (
  anilist_id int not null check (anilist_id > 0),
  captured_on date not null,
  trending int,
  popularity int,
  favourites int,
  mean_score smallint,
  status text,
  volumes int,
  has_upcoming_anime boolean not null default false,
  anime_airing boolean not null default false,
  next_episode_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (anilist_id, captured_on)
);

-- -----------------------------------------------------------------------------
-- Asking / sold price ranges per set. Empty until eBay is connected, apart
-- from any prices entered by hand (source 'manual').
-- -----------------------------------------------------------------------------
create table public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.item_templates (id) on delete cascade,
  item_scope text not null check (item_scope in ('single', 'set')),
  source text not null check (source in ('ebay_browse', 'ebay_sold', 'manual')),
  captured_on date not null default current_date,
  min_cents int check (min_cents >= 0),
  median_cents int check (median_cents >= 0),
  max_cents int check (max_cents >= 0),
  listing_count int check (listing_count >= 0),
  created_at timestamptz not null default now(),
  unique (template_id, item_scope, source, captured_on)
);

-- -----------------------------------------------------------------------------
-- The nightly score per set.
-- -----------------------------------------------------------------------------
create table public.buy_scores (
  template_id uuid not null references public.item_templates (id) on delete cascade,
  scored_on date not null,
  total smallint not null check (total between 0 and 100),
  components jsonb not null default '{}',
  action text not null check (action in ('buy', 'hold', 'finish_set', 'avoid')),
  reasons text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (template_id, scored_on)
);
create index buy_scores_scored_on_idx on public.buy_scores (scored_on desc, total desc);

-- -----------------------------------------------------------------------------
-- Series we're watching. A series we don't own yet is an empty set.
-- -----------------------------------------------------------------------------
create table public.radar_watchlist (
  template_id uuid primary key references public.item_templates (id) on delete cascade,
  note text,
  max_buy_cents int check (max_buy_cents >= 0),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index radar_watchlist_created_by_idx on public.radar_watchlist (created_by);

-- -----------------------------------------------------------------------------
-- Log of every radar job run, for the health line and match review.
-- -----------------------------------------------------------------------------
create table public.radar_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('anilist', 'ebay', 'score', 'digest')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  detail jsonb not null default '{}'
);
create index radar_runs_kind_started_idx on public.radar_runs (kind, started_at desc);

-- -----------------------------------------------------------------------------
-- Grants and RLS
-- -----------------------------------------------------------------------------
revoke all on public.anilist_snapshots, public.price_snapshots, public.buy_scores,
  public.radar_watchlist, public.radar_runs from anon;

grant select on public.anilist_snapshots, public.buy_scores, public.radar_runs to authenticated;
grant select, insert, update, delete on public.price_snapshots, public.radar_watchlist
  to authenticated;
grant all on public.anilist_snapshots, public.price_snapshots, public.buy_scores,
  public.radar_watchlist, public.radar_runs to service_role;

alter table public.anilist_snapshots enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.buy_scores enable row level security;
alter table public.radar_watchlist enable row level security;
alter table public.radar_runs enable row level security;

create policy "admins read snapshots" on public.anilist_snapshots
  for select to authenticated using ((select public.is_admin()));
create policy "admins read scores" on public.buy_scores
  for select to authenticated using ((select public.is_admin()));
create policy "admins read runs" on public.radar_runs
  for select to authenticated using ((select public.is_admin()));
create policy "admins full access" on public.price_snapshots
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins full access" on public.radar_watchlist
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
