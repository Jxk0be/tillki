# Buy Radar: plan

Buy Radar scores each manga series every night and says what to **buy more of**, what to **finish** (missing volumes), what to **hold**, and what to **avoid**. It is built on Tillki's existing sets, acquisitions and sales, plus AniList trend data. eBay prices come later.

This plan replaces Phase 0 of the "Tillki Buy Radar" guide. Where the guide conflicts with `CLAUDE.md`, `CLAUDE.md` wins. Those conflicts are listed at the end.

## 1. What exists today (hosted project `btqazxppnppmhenwmhmu`)

| Table / view                                                               | Relevant columns                                                                                                                                                                                              | Notes                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `item_templates` ("Sets")                                                  | `name`, `publisher`, `total_volumes`, `is_ongoing`, `category`, `default_condition`, `tags`, `archived_at`                                                                                                    | One set per series or edition: "JoJo Part 4", "MHA: Vigilantes", "Berserk Deluxe Edition". No AniList id yet. |
| `items`                                                                    | `template_id`, `volume_number`, `series` (copied from the set name by trigger), `isbn`, `condition`, `quantity`, `cost_cents` (weighted average), `list_price_cents`, `status`, `purchased_at`, `archived_at` | `quantity` and `cost_cents` are computed from acquisitions.                                                   |
| `item_acquisitions`                                                        | `item_id`, `lot_id`, `quantity`, `unit_cost_cents`, `purchase_source`, `purchased_at`                                                                                                                         | One row per batch of copies. This is where "acquired at" comes from.                                          |
| `sales`                                                                    | `item_id`, `quantity`, `sold_at`, `platform`, `sale_price_cents`, `shipping_charged_cents`, `shipping_cost_cents`, `platform_fee_cents`, `other_cost_cents`, `bundle_id`                                      | **0 rows today.** Fees are stored per sale, not recomputed.                                                   |
| `lots`                                                                     | `name`, `source`, `purchased_at`, `total_cost_cents`                                                                                                                                                          | Optional grouping of acquisitions.                                                                            |
| `app_settings`                                                             | `fee_rules`, `default_fee_percent`, `stale_days` (60), `target_margin_percent` (40)                                                                                                                           | Fee estimates use `src/lib/fees.ts` (`calculateMargin`).                                                      |
| `v_items`, `v_templates`, `v_sales`, `v_lots`                              | `units_sold`, `units_left`, `days_in_stock`, `missing_ranges`, `missing_count`, `completion_percent`, `net_profit_cents`                                                                                      | All `security_invoker`, so RLS applies. `v_templates` already computes set gaps.                              |
| `inventory_snapshots` + cron `kura-nightly-inventory-snapshot` (03:55 UTC) |                                                                                                                                                                                                               | The only scheduled job so far.                                                                                |

**Patterns to reuse**

- Money is integer cents everywhere. Format with `formatCents`, parse with `parseMoneyToCents`, and estimate fees with `calculateMargin` and `parseFeeRules` from `src/lib/fees.ts`.
- RLS: every table has one `admins full access` policy using `(select is_admin())`.
- Edge Functions share `_shared/server.ts`, which handles CORS, `requireAdmin` (user JWT plus `is_admin()`), `logUsage` and AI errors. Pure logic lives in `lib.ts` and is tested by Vitest from `src/lib/__tests__`.
- Existing features Radar plugs into:
  - `deal-check`: a Claude verdict on a deal, using your sales history.
  - `ask-kura`: the chat, which has tools.
  - The Stale stock tool.
  - Set gap ranges from `src/lib/volumes.ts`.
- Navigation lives in `src/layouts/navigation.ts`. Radar goes in `secondaryNav`, which also fills the More page on mobile and the desktop sidebar.
- Extensions: `pg_cron` and `pg_trgm` are installed. **`pg_net` is not** (see decision B).
- The CSP in `netlify.toml` only matters for calls from the browser. AniList and eBay are called from Edge Functions, so the CSP doesn't change.

## 2. How series are grouped

Today a set _is_ a series edition. AniList also lists most of the editions we split separately as their own entries: each JoJo part, Tokyo Ghoul vs. Tokyo Ghoul:re, MHA vs. Vigilantes. Omnibus and deluxe editions (Berserk Deluxe, NGE 3-in-1, Monster Perfect Edition) map to the base manga.

**Proposal: no separate `series` table.** Instead, add `anilist_id` (nullable, not unique) to `item_templates`. Several sets can share an id, e.g. Berserk and Berserk Deluxe. Scores are stored per set, and the trend data per AniList id. This avoids a second name list that would drift from the set names, and the guide's `series_aliases` table isn't needed.

For series we don't own yet but want to track, the watchlist creates an empty set with 0 volumes. Empty sets already work in the app.

## 3. New tables (one migration per step, each shown for approval first)

All new tables get RLS with the admin policy, and an index on `(…_id, captured_on desc)`.

1. **`item_templates` additions:**
   - `anilist_id int null`
   - `anilist_match text check in ('auto','confirmed','none') default null`
   - `demographic text null`
   - Index on `anilist_id`.
2. **`anilist_snapshots`:**
   - `anilist_id`, `captured_on date`, `trending`, `popularity`, `favourites`, `mean_score`
   - `status`, `volumes`, `has_upcoming_anime bool`, `anime_airing bool`, `next_episode_at timestamptz null`
   - Unique `(anilist_id, captured_on)`.
3. **`price_snapshots`:**
   - `template_id`, `item_scope ('single'|'set')`, `source ('ebay_browse'|'ebay_sold'|'manual')`, `captured_on`
   - `min_cents`, `median_cents`, `max_cents`, `listing_count`
   - Unique `(template_id, item_scope, source, captured_on)`.
   - Created now so the scorer can read it. It stays empty until eBay is connected.
4. **`buy_scores`:**
   - `template_id`, `scored_on`, `total smallint (0-100)`, `components jsonb`
   - `action ('buy'|'hold'|'finish_set'|'avoid')`, `reasons text[]`
   - Unique `(template_id, scored_on)`.
5. **`radar_watchlist`:** `template_id` (primary key), `note`, `max_buy_cents`, `created_at`.
6. **`radar_runs`:** `id`, `kind ('anilist'|'ebay'|'score'|'digest')`, `started_at`, `finished_at`, `ok`, `detail jsonb`.
7. **`radar_digests`** (Phase 6): `id`, `run_id`, `created_at`, `content jsonb`, `raw_text`, `ok`.
8. **`series_performance` view** (Phase 3, `security_invoker`), per set:
   - Units bought, sold and on hand
   - Average cost, average sale and average net per unit, using the fees stored on each sale
   - Margin %, median days to sell, units sold in the last 30 and 90 days
   - `stale_count` (on hand longer than `stale_days`) and `sample_size`

   Plus a `series_platform_performance` view, per set and platform.

## 4. Phases, adjusted to this repo

| Phase | What                                                                                                                                                                                                                                                       | Notes                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Migrations 1-6 above. Regenerate types. Backfill script proposes AniList matches for review.                                                                                                                                                               | Matching uses the AniList search, so it runs in the Phase 2 function. Phase 1 only adds columns.                                 |
| 2     | `anilist-sync` Edge Function: match unmatched sets (save only high-confidence matches, store top 3 candidates otherwise), then batch-snapshot with `Page { media(id_in:) }` under 25 requests/min. Match-review screen in Settings (paste an AniList URL). | Pure title matcher in `lib.ts`, tested with messy titles ("One Punch Man Vol 3", "JJK", "Berserk Deluxe Edition", "NGE 3-in-1"). |
| 3     | `series_performance` views.                                                                                                                                                                                                                                | With 0 sales, every velocity and margin number shows `sample_size = 0`.                                                          |
| 4     | `src/lib/radar/score.ts`, a pure scorer. A `score-run` function imports the same file through a relative import, like `ask-kura` does with `lib.ts`.                                                                                                       | Weights in one exported config object. Velocity is shrunk toward 0.5 with k = 5.                                                 |
| 5     | Radar route: ranked list, filters, detail sheet with score breakdown, popularity chart, missing volumes, watchlist.                                                                                                                                        | 375px and 1280px, light and dark.                                                                                                |
| 6     | `radar-digest`, a weekly Claude list. Zod-validated, data-only prompt, reuses `_shared/server.ts`. "Ask about this series" opens Ask with that set's data.                                                                                                 |                                                                                                                                  |
| 7     | "Check a lot": extend the existing Deal check instead of building a second flow. Add per-set score, gaps filled and duplicates to its input, and pre-fill Add volumes.                                                                                     | Pure verdict math, tested.                                                                                                       |
| 8     | eBay Browse API, **later**, once you have a developer account.                                                                                                                                                                                             |                                                                                                                                  |
| 9     | Health line, advisors, `docs/buy-radar.md`.                                                                                                                                                                                                                |                                                                                                                                  |

## 5. Risks

- **No sales yet.** Velocity, margin and stale signals all start neutral. Early scores are driven almost entirely by AniList momentum, anime adaptations and set gaps. The UI must say so on every series.
- **AniList matching.** Old Tokyopop titles (Pilgrim Jager, Kohime Soushi, Rising Stars of Manga) may be missing or ambiguous. Anthologies and one-shots get `anilist_match = 'none'` and are scored on our own data only.
- **Momentum normalisation.** `popularity` is cumulative, so we score its 7- and 30-day _change_. That needs at least 7 nights of snapshots before momentum means anything, so the first week shows "Collecting trend data".
- **Rate limits.** AniList documents 90 requests/min but sometimes drops to 30. About 100 sets is roughly 3 batched requests a night, plus about 1 search per newly matched set.
- **Edition vs. series demand.** AniList measures the series, not a specific printing. A deluxe edition and the paperback get the same momentum, which is fine for deciding whether to buy.

## 6. Where the guide conflicts with `CLAUDE.md`

- The guide says "local Supabase via Docker" and "apply locally first". There is no Docker here. Migrations are written, shown for approval, applied with `apply_migration`, and tested with `npm run test:db -- --prelude <file>` inside a rolled-back transaction.
- The guide says "Run the chain locally on demo data". Functions are deployed with `--use-api` and tested on the hosted project. The demo data has already been wiped, so the real inventory is the test data.
- The guide says "Schedule with pg_cron + pg_net". `pg_net` must be enabled first, and the cron call needs a way to authenticate (decision B).
- Every new function keeps `verify_jwt = false` and checks access itself, like the existing three.

## 7. Open questions

A. Is the series model in section 2 OK: AniList id on each set, scores per set, and the watchlist as empty sets?

B. **How nightly jobs authenticate.** The existing functions only accept a signed-in admin. A cron job has no user. Two options:

1.  A `RADAR_CRON_SECRET` function secret. Cron sends it in a header, and the function accepts either an admin JWT or that header. Cron reads the secret from Supabase Vault, which is installed.
2.  A "Refresh now" button on the Radar page. No cron at all; refreshes happen when you open it.

I recommend 1, with the button kept as a manual fallback.

C. Should Radar consider only manga, or also figures and merch? AniList only covers manga and anime, so other categories would get our own sales data only.

D. Build order: Phases 1-5 first, then 6-7, then stop until eBay. Or do you want a smaller first slice, e.g. Phases 1-2 plus a plain ranked list, to see real data sooner?

## 8. Decisions and progress

Decided on 2026-10-19: AniList id on each set (section 2), cron with a Vault-checked token plus a manual "Refresh now" button, manga only, and Phases 1-2 plus a simple ranked list first. On 2026-10-19 the go-ahead was given for Phases 3-4 and every migration.

**Live on the hosted project**

| Migration                                     | What                                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `20261020023128_buy_radar_schema`             | AniList columns on sets, and the snapshot, score, watchlist and run tables                                                        |
| `20261020023914_buy_radar_nightly_sync`       | pg_net, the Vault token, `radar_cron_token_ok`, `radar_call_function`, and the cron job `radar-nightly-anilist-sync` at 07:10 UTC |
| `20261020025336_pg_net_extensions_schema`     | pg_net moved from `public` to `extensions` (advisor 0014)                                                                         |
| `20261020025402_buy_radar_series_performance` | `series_performance` and `series_platform_performance` views                                                                      |

**One nightly job does everything.** `anilist-sync` runs these steps in order:

1. Matches up to 40 new sets to AniList.
2. Snapshots every matched series.
3. Scores every manga set into `buy_scores`.

"Refresh now" on `/radar` runs the same steps.

**Scoring** lives in `supabase/functions/anilist-sync/score.ts`. It is pure code, and Vitest tests it from `src/lib/__tests__/radarScore.spec.ts`.

- **Weights and thresholds:** all in `SCORE_CONFIG`. Edit them there and redeploy the function.
- **Momentum:** the trending percentile plus the 7- and 30-day popularity growth percentiles, each ranked against all sets.
- **Sales signals:** velocity and margin are pulled toward neutral when there are few sales, using k = 5.
- **Without eBay:** supply is neutral.
- **Set gaps:** set_gap is high when 1-3 volumes are missing and at least half the set is owned.

**Matching rules**

- Searches use the readable title, then the part before a colon.
- Light novels and one-shots are skipped.
- A tie between manga entries is broken only when one has at least 3× the popularity of the other.

**Next**

- **Phase 5:** filters by publisher and watchlist, a detail sheet with the component breakdown and a popularity chart, and watchlist editing.
- **Phase 6:** the weekly Claude digest.
- **Phase 7:** a lot checker built into Deal check.
- **Phase 8:** eBay prices, once you have a developer account.
