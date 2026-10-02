# Deploying Kura

Kura is a plain website on Netlify with the hosted Supabase project behind it
(ref `btqazxppnppmhenwmhmu`). There's no PWA, no service worker and nothing to
install: open the link in Safari or Chrome.

## 1. Before the first real use: remove the demo data

The demo sets, items, lots and expenses are still in the database. Wipe them once
you're done testing (this can't be undone, and it removes only things tagged
`demo` / noted `Demo data`):

```bash
npx supabase db query --linked -f supabase/demo-wipe.sql
```

The admin allowlist (`supabase/seed.sql`) is already applied, so both of you can
sign in. To check it in the Supabase SQL editor:

```sql
select email, role from public.allowed_emails;
```

If it's ever empty, add the two of you back:

```sql
insert into public.allowed_emails (email, display_name, role) values
  ('jakeshoffner27@gmail.com', 'Jake', 'admin'),
  ('kat.prouty@gmail.com', 'Kat', 'admin')
on conflict (email) do update set role = 'admin';
```

## 2. Netlify

1. In Netlify: **Add new site → Import an existing project → GitHub →
   Jxk0be/tillki**. Netlify reads `netlify.toml` (build `npm run build`, publish
   `dist`, the SPA fallback, cache and security headers), so leave those fields as
   they are.
2. **Site configuration → Environment variables**, add:

   | Key | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://btqazxppnppmhenwmhmu.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_...` key from your `.env` |
   | `VITE_GOOGLE_BOOKS_API_KEY` | optional; a browser key restricted to your Netlify URL |

   These are public by design (they end up in the browser); the database is
   protected by the allowlist and row-level security. Never add the Anthropic key
   or any `sb_secret_...` key to Netlify.
3. Deploy, and note the site URL, e.g. `https://kura-shop.netlify.app`.

## 3. Point everything at the new URL

Replace `https://YOUR-SITE.netlify.app` with the real URL.

**Supabase dashboard → Authentication → URL Configuration**
- Site URL: `https://YOUR-SITE.netlify.app`
- Redirect URLs: add `https://YOUR-SITE.netlify.app/auth/callback` (keep
  `http://localhost:5173/auth/callback` for development).

**Google Cloud Console → APIs & Services → Credentials → your OAuth client**
- Authorized JavaScript origins: add `https://YOUR-SITE.netlify.app`.
- Authorized redirect URIs: leave the Supabase one
  (`https://btqazxppnppmhenwmhmu.supabase.co/auth/v1/callback`) as it is.
- Simplest lock at Google's end: keep the OAuth app in **Testing** with your two
  emails as test users. The real lock is still the allowlist plus RLS.

**Edge Function secrets** (CORS: lets the site call Ask Kura, Draft listing and Deal
checker):

```bash
npx supabase secrets set ALLOWED_ORIGIN=https://YOUR-SITE.netlify.app
```

`ANTHROPIC_API_KEY` is already set. To choose a model other than Sonnet 5.5:
`npx supabase secrets set CLAUDE_MODEL=<model id>`. Secrets apply right away; no
redeploy needed.

**Auth hook:** the before-user-created hook is already enabled in the dashboard
(Authentication → Hooks). Leave it on; it's what stops strangers from getting an
account.

## 4. Deploying changes later

- Website: push to GitHub; Netlify rebuilds. `index.html` is never cached, so the
  next visit gets the new version (an open tab that hits a stale file shows a
  "Kura was updated, reload" message).
- Database: new migration file, `npx supabase db push`, then `npm run db:types`.
- Edge Functions (no Docker needed):

  ```bash
  npx supabase functions deploy ask-kura --use-api
  npx supabase functions deploy draft-listing --use-api
  npx supabase functions deploy deal-check --use-api
  ```

- To check a production build locally with the real Netlify headers (including
  the Content Security Policy): `npm run build`, then `node scripts/serve-dist.mjs`
  and open http://localhost:4173.

## 5. Backups

**Monthly, from the app:** Settings → Backup → **Export everything**. It downloads
`kura-export-YYYY-MM-DD.zip` with a CSV and a JSON file per table (photos and
receipts are referenced by their storage paths). The dashboard reminds you after
30 days. Keep the zips somewhere that isn't just your laptop (a cloud drive).

**Second copy, the whole database:** `supabase db dump` needs Docker, so use
PostgreSQL's own `pg_dump` instead (install "PostgreSQL command line tools" from
postgresql.org; version 17). Get the **Session pooler** connection string from the
Supabase dashboard (Connect button) and type your database password yourself:

```bash
pg_dump "postgresql://postgres.btqazxppnppmhenwmhmu:YOUR-DB-PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres" --schema=public --no-owner --file="kura-db-$(date +%F).sql"
```

(Copy the host from your own connection string if it differs.) Restoring is a job
for `psql` into a fresh project; keep the file safe since it contains everything.

## 6. Real-device test script

Run this on **iPhone Safari** and **Android Chrome**, each of you. Tick each line.

1. Open the Netlify URL (not from a home-screen icon; it's just a website).
2. Sign in with Google. You land back on the site, signed in, on Inventory.
3. Add a one-off item and take **5 photos with the camera**. They upload with
   progress, and the item shows all 5.
4. Bulk-add **30 volumes** of a set ("1-30"). The summary and the volume strip are
   right, and nothing hides under Safari's bottom toolbar.
5. **Scan an ISBN** from a real manga with the scanner; the title fills in.
6. **Mark it sold.** The fee estimate fills in, and the item shows as sold.
7. Go to **Ask**, tap the box: the keyboard opens and the message box stays right
   above it. Ask "Which volumes of my sets am I missing?" and watch it stream in.
   Tap a SKU in the answer to open the item.
8. Scroll a long list so the browser's toolbar collapses, then scroll up so it
   expands again. Nothing jumps or hides behind it, including the tab bar.
9. Rotate to **landscape** and back. Layout holds, no sideways scrolling.
10. Turn on airplane mode: the "You're offline" banner shows and Save buttons are
    disabled. Turn it off: they come back.
11. **Close the tab**, open the link again: still signed in.
12. Switch the phone to dark mode: the app and the browser toolbar follow.
