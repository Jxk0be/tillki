# Buy Radar: how it runs

Buy Radar scores every manga set each night and says **Buy**, **Finish set**, **Hold** or **Avoid**. Each score comes with the reasons behind it. The design and its history are in `buy-radar-plan.md`; this page covers running and fixing it.

## Where things are in the app

| Where                                  | What                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **More → Buy Radar** (`/radar`)        | Health line, weekly buy list, filters and sort, the ranked list. Tap a set to open its detail sheet.                                                                                                                                                                                                |
| Detail sheet                           | Score breakdown, AniList popularity chart, our sales (with the platform split), market prices, missing volumes, watchlist, and "Ask about this series".                                                                                                                                             |
| **Check a lot** (`/radar/lot`)         | Scan or type the volumes in a lot and enter the asking price. You get Good buy / Fair / Pass and the most you should pay. "Buy and add these volumes" opens Add volumes already filled in.                                                                                                          |
| **Discover** (`/radar/discover`)       | AniList's trending, new-and-rising and most-popular manga, including series you don't stock, from the `radar-discover` function (live, cached 30 minutes, nothing stored). **Watch** creates an empty set linked to AniList and adds it to the watchlist, so the nightly sync tracks and scores it. |
| **AniList matches** (`/radar/matches`) | Confirm or fix which AniList series each set is.                                                                                                                                                                                                                                                    |

## The jobs

All jobs are pg_cron entries that call an Edge Function through `public.radar_call_function('<name>')`.

- **How they authenticate:** the call sends a token stored in Vault, and each function checks it with `radar_cron_token_ok()`. No key is ever copied by hand.
- **Running one by hand:** the Radar page buttons call the same functions as the signed-in admin.
- **Every run is logged** in `radar_runs`.

| Cron job                     | When (UTC)                                | Function       | What it does                                                                                                                                                           |
| ---------------------------- | ----------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `radar-nightly-ebay-sync`    | 06:40 daily                               | `ebay-sync`    | Asking-price range and listing count for the watchlist plus the top 50 sets, as singles and as lots, into `price_snapshots`. Does nothing until the eBay keys are set. |
| `radar-nightly-anilist-sync` | 07:10 daily (3:10am New York in summer)   | `anilist-sync` | Matches up to 40 new sets to AniList, snapshots every matched series into `anilist_snapshots`, then scores every manga set into `buy_scores`.                          |
| `radar-weekly-digest`        | 12:10 Sundays (8:10am New York in summer) | `radar-digest` | Sends the top 25 scores, every Finish set and Avoid, and the watchlist to Claude, which writes a short cited buy list into `radar_digests`.                            |

**Health line.** The top of the Radar page shows each job's last run. An amber icon means it failed or is old: over 36 hours for AniList and eBay, over 8 days for the buy list. A grey icon means the job isn't set up yet.

**Checking runs:**

```bash
npx supabase db query --linked "select kind, started_at, finished_at, ok, detail from radar_runs order by started_at desc limit 10"
```

## Fixing a wrong AniList match

Open **AniList matches** and use one of these:

- **Use this** on one of the suggested results.
- Paste a link like `anilist.co/manga/30002/Berserk` and save it.
- **Not on AniList** for books AniList doesn't have.
- **Change** on a matched set to clear the match. The next sync searches for it again.

A match you set by hand is never overwritten. Deluxe and omnibus editions should use the original series' AniList entry.

## Tuning the score

All weights and thresholds are in `SCORE_CONFIG` in `supabase/functions/anilist-sync/score.ts`.

| Component  | What it measures                                                                                  | Neutral when    |
| ---------- | ------------------------------------------------------------------------------------------------- | --------------- |
| momentum   | AniList trending, plus 7- and 30-day popularity growth, ranked against all your sets              | no AniList data |
| adaptation | 1 if an anime is announced, 0.8 if airing, 0.4 if a season just ended                             | —               |
| velocity   | units sold in 30 days and median days to sell, pulled toward 0.5 when there are few sales (k = 5) | no sales        |
| margin     | our margin %, pulled toward 0.5 the same way                                                      | no sales        |
| supply     | fewer eBay listings scores higher                                                                 | no eBay data    |
| set_gap    | high when 1-3 volumes are missing and half the set is owned                                       | —               |

**Actions**

- **Finish set:** 1-3 volumes missing and a high set_gap.
- **Avoid:** 3 or more stale copies and low momentum.
- **Buy:** a score of 70 or more.
- **Hold:** everything else.

Edit `SCORE_CONFIG`, run `npm run test` (the scorer tests show what moved), then deploy:

```bash
npx supabase functions deploy anilist-sync --use-api
```

Then press **Refresh now** on the Radar page.

## Setting up eBay prices

1. Create an eBay developer account and a production keyset (App ID and Cert ID).
2. Set the secrets. Run these yourself, since the keys never go through Claude:
   ```bash
   npx supabase secrets set EBAY_CLIENT_ID=<App ID> EBAY_CLIENT_SECRET=<Cert ID>
   ```
3. Optional: narrow searches to one eBay category with `npx supabase secrets set EBAY_CATEGORY_ID=<id>`. Look up the manga category ID with eBay's Taxonomy API, because category IDs aren't published. Without it, searches use "<title> manga" plus a title matcher.
4. Optional: once eBay approves Marketplace Insights, also add `npx supabase secrets set EBAY_SOLD_ENABLED=true`. That adds sold prices as source `ebay_sold`. Asking prices are always labelled "asking, not sold" in the app.

## The weekly buy list

- **Model:** it uses the same `ANTHROPIC_API_KEY` and `CLAUDE_MODEL` secrets as Ask Tillki.
- **Data only:** Claude sees only the numbers Tillki computed, and it must cite them.
- **Validation:** its reply is checked against a schema and retried once if it doesn't fit.
- **Prices:** a suggested price is removed unless our sales or eBay data support it.
- **Failures:** a failed reply is stored as `raw_text` with `ok = false`.
- **Usage:** token use goes to `ai_usage` like the other AI features.

## Deploying changes

```bash
npx supabase functions deploy anilist-sync --use-api
npx supabase functions deploy radar-digest --use-api
npx supabase functions deploy ebay-sync --use-api
```

Every radar function has `verify_jwt = false` in `config.toml` and checks the caller itself.

**Migrations:** every Buy Radar migration is listed in `buy-radar-plan.md`. Write new ones as files, test them with `npm run test:db -- --prelude <file>`, and apply them only after the SQL is approved.
