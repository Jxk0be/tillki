# Kura

Private inventory and profit tracker for a two-person manga and merch resale business. Vue 3 + TypeScript + Tailwind on the front end, Supabase (Postgres, Google auth, storage) behind it. Only two allowlisted Google accounts can sign in.

See [CLAUDE.md](CLAUDE.md) for the inventory model, conventions and commands.

## Setup

```bash
npm install
cp .env.example .env   # fill in the Supabase URL and publishable key
npm run dev
```

The database lives in the hosted Supabase project; schema changes are migrations in `supabase/migrations`, applied with `npx supabase db push`.

## Checks

```bash
npm run type-check
npm run lint
npm run test      # unit tests
npm run test:db   # database tests (run against Supabase, always rolled back)
```
