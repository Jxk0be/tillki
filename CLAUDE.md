# Kura

Kura (蔵, "storehouse") is a private inventory and profit tracker for a two-person anime/manga resale business. Manga comes first, then figures, merch, and custom merch bought from Etsy sellers and resold. Sales happen on eBay, Mercari, Facebook Marketplace and at events, and a physical storefront is planned in about a year, so keep fields like SKU, quantity and storage location storefront-ready.

There are exactly two users. Both are admins and sign in with Google. Nobody else should ever see data: access is enforced by an email allowlist plus row-level security on every table, not only by the UI.

## Inventory model

An item is either a **one-off** or a **volume of a set**.

- A set is an `item_template`: a name like "One Piece", a shared description, up to 5 example photos, an optional total volume count, and a title pattern like `{name} Volume {n}`. In the UI, templates are called **"Sets"**.
- Each volume is its own `items` row with `template_id` and `volume_number`, named from the pattern ("One Piece Volume 3"). It inherits the set's description and photos unless it has its own.
- Volume lists are always shown as compact ranges ("1-2, 21-32") using the one shared helper in `src/lib/volumes.ts`.

**Quantity:** a set never has two rows for the same volume. Buying another copy raises that row's quantity. Every time copies come in, an `item_acquisitions` row records the lot, quantity and unit cost; the item's `quantity`, average `cost_cents` and first `purchased_at` are calculated from those rows by the database, never written by the client. Units left = quantity - units sold.

## Environments

- There is **one environment: the hosted Supabase project** (ref `btqazxppnppmhenwmhmu`). No Docker, no local Supabase. The repo is linked to it (`npx supabase link`), and the app reads its URL and publishable key from `.env`.
- Because this is the real database, migrations are permanent once pushed: show the SQL and get a yes before `npx supabase db push`, and never edit a migration that has been pushed. Fix forward with a new migration.
- Google sign-in, redirect URLs and the before-user-created auth hook are configured in the Supabase dashboard, not `config.toml`.
- **Prefer the Supabase MCP** (project id `btqazxppnppmhenwmhmu`) for database work: `execute_sql` for queries, `list_tables` / `list_migrations`, `get_advisors` after every schema change. For schema changes: write the migration file in `supabase/migrations`, show the SQL, apply it with `apply_migration` after approval, then rename the local file's timestamp prefix to the version `list_migrations` reports so the repo and the database agree. The CLI (`npx supabase ...`) remains the fallback.
- Never run `supabase db reset` against the hosted project (it wipes everything).
- **Demo data is currently loaded** (from `supabase/seed-demo.sql`): sets/items tagged `demo`, lots and expenses noted `Demo data`. Wipe it before real use with `npx supabase db query --linked -f supabase/demo-wipe.sql`. Never add real copies to a demo set (they inherit the tag). The admin allowlist is `supabase/seed.sql`, applied with the same `db query -f` command.
- **Edge Functions** can't run locally (`supabase functions serve` needs Docker). Check them with `npx -y deno@2 check index.ts` in the function's folder, then deploy straight to the hosted project with `npx supabase functions deploy <name> --use-api` and test there. Secrets (`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `ALLOWED_ORIGIN`) are set by the user with `npx supabase secrets set` or in the dashboard; never ask for or handle the key. `ask-kura` has `verify_jwt = false` and checks the token and `is_admin()` itself.
- **Database tests** run against the hosted project with `npm run test:db` (`scripts/test-db.mjs`), always inside a rolled-back transaction; `supabase test db` needs Docker, so don't use it. Test an unapplied migration first with `npm run test:db -- --prelude supabase/migrations/<file>.sql`.

## Stack

- Vue 3 with the Composition API. `<script setup lang="ts">` only, no Options API.
- TypeScript in strict mode, built with Vite.
- Tailwind CSS v4 via `@tailwindcss/vite`.
- Pinia with setup-style stores, and Vue Router.
- `@vueuse/core`, `vue-chartjs` + `chart.js`, `lucide-vue-next` icons, `zod` for form validation.
- Supabase: Postgres, Auth with Google, Storage, and Edge Functions (Deno).
- Anthropic SDK used ONLY inside Supabase Edge Functions, never in the browser bundle.
- Hosted on Netlify.

## Conventions

- **Money** is integer cents in the DB and in TS. Field names end in `_cents`.
  - Format with the one shared helper (`formatCents` in `src/lib/money.ts`) using `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.
  - Parse user input like `"12"`, `"12.5"`, `"$12.50"` into cents with the one shared helper (`parseMoneyToCents`), which has unit tests. Never parse money ad hoc in a component.
- **Dates**: `timestamptz` in UTC in the DB, displayed in the browser's local time. Date-only fields use the `date` type.
- **Supabase migrations**: every schema change is a new SQL file in `supabase/migrations`. Never edit a migration that has already been applied. RLS is enabled on every table.
- **Types**: regenerate `src/types/database.ts` after each migration with `npm run db:types` (runs `supabase gen types typescript --local` and formats the output).
- **Data access** lives in Pinia stores or composables in `src/composables`, never inline in components.
- No `any`. No secrets in the client. The Anthropic key exists only as a Supabase secret.
- **Components**: PascalCase, one per file, props and emits fully typed.

## Mobile first (non-negotiable)

- Design at 375px wide first, then add `sm`/`md`/`lg`. Must also work at 320px.
- Tap targets are at least 44px. Inputs use a 16px font so iOS doesn't zoom. Money inputs use `inputmode="decimal"`.
- Use `dvh` units and `env(safe-area-inset-*)` padding for the bottom tab bar and top bar.
- Bottom sheets for actions on mobile, centered dialogs on desktop.
- No hover-only interactions. Everything is reachable by keyboard with a visible focus style.
- Dark mode via Tailwind's `dark` variant, following the system setting with a manual override.
- This is a regular website used in mobile Safari and Chrome on Android. It is NOT a PWA: no service worker, no web app manifest, no install prompts, no `vite-plugin-pwa`, no offline caching. Don't add any of these even if they seem helpful.
- Must work with the browser's own address bar and toolbars visible: no layouts that assume standalone mode, and nothing hidden behind Safari's bottom toolbar.

## Folder structure

```
src/
  assets/
  components/
    ui/
    inventory/
    templates/    sets (item_templates) UI
    charts/
    chat/
  composables/
  layouts/
  lib/          supabase client, money, volumes, dates
  router/
  stores/
  types/
  views/
supabase/
  migrations/
  functions/
  tests/        pgTAP tests (npm run test:db)
  seed.sql      admin emails
  seed-demo.sql demo data (tagged 'demo')
  demo-wipe.sql removes the demo data
scripts/
  test-db.mjs   runs supabase/tests on the hosted project without Docker
```

## Commands

The Supabase CLI is a dev dependency, so run it through `npx supabase`. Every database command targets the linked hosted project.

```bash
npm run dev                       # Vite dev server (add -- --host to test on a phone over LAN)
npm run build
npm run type-check
npm run lint
npm run test                      # Vitest
npm run db:types                  # regenerate src/types/database.ts from the hosted schema
npx supabase migration new <name> # create a new migration file
npx supabase db push --dry-run    # see which migrations would be applied
npx supabase db push              # apply new migrations (after the SQL has been approved)
npx supabase db query --linked "select ..."   # run a query against the hosted database
npx supabase db advisors --linked # security and performance checks
npm run test:db                   # run pgTAP tests in supabase/tests (rolled back)
npx supabase functions deploy <name> --use-api   # no Docker needed
```

## Definition of done for any task

- `npm run type-check` and `npm run lint` pass.
- Tests for any pure logic exist and pass.
- The feature has been checked at 375px and 1280px wide with no horizontal page scroll.
