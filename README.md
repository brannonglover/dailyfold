# Current

A clean, modern reading app built with Expo. Scroll through curated articles from magazines and news sources, like what resonates, and get personalized recommendations.

## Features

- **Vertical article feed** — scroll up through full-screen story cards
- **Like & share** — save favorites and share via the native share sheet
- **Personalization** — likes build topic preferences that power the "For You" feed
- **Account registration** — sign up to persist your reading taste across sessions
- **RSS ingestion** — real articles from The Atlantic, Ars Technica, MIT Technology Review, Dezeen, and BBC News

## Quick start

You need **two terminals**: the API backend and the Expo app.

### 1. Backend (article ingestion)

```bash
cd backend
npm install
npm run ingest    # fetch RSS feeds into SQLite (first time)
npm run dev       # API at http://localhost:3001 (listens on all interfaces for physical devices)
```

Or from the project root:

```bash
npm run api:ingest
npm run api
```

Troubleshooting (EADDRINUSE, 404 on `/api/articles`, Expo cannot reach API): see [DEV.md](./DEV.md).


### 2. Mobile app

```bash
cp .env.example .env
npm install
npm start
```

- **iOS Simulator:** `EXPO_PUBLIC_API_URL=http://localhost:3001` works as-is.
- **Physical device:** omit `EXPO_PUBLIC_API_URL` in Expo Go (auto-detects your LAN IP from Metro), or set it explicitly, e.g. `http://192.168.1.94:3001` (same Wi‑Fi as your phone). The API must be running (`npm run api`).

If the API is down during development, the app falls back to bundled demo articles so feeds stay usable.

Pull down on a feed tab to refresh articles from the API.

## How ingestion works

SQLite here is a **rolling cache**, not a fixed article list. New stories are fetched from RSS continuously; old ones are pruned after 30 days.

```
RSS feeds ──► ingest worker ──► SQLite cache ──► GET /api/articles ──► app
                    ▲
     cron / app open / pull-to-refresh / every 30 min
```

**When feeds refresh automatically:**

| Trigger | Behavior |
|---------|----------|
| API server starts | Background ingest if cache is empty or stale |
| App opens `/api/articles` | Stale cache refreshes in background (30 min default) |
| Pull-to-refresh | Forces immediate ingest (`?refresh=true`) |
| App foreground / 15 min timer | Re-fetches from API |
| Cron (production) | Every 30 minutes via Vercel |
| `npm run api:watch` | Local poller, same interval |

Each ingest **upserts by URL** — new articles are inserted, existing ones updated. Articles older than 30 days are removed.

### Local continuous ingest

For development, run the API with the watch poller in a third terminal:

```bash
npm run api:watch
```

Or rely on the API's built-in stale check when the app loads articles.

## Project structure

```
app/                 Expo Router screens
backend/             Next.js API + RSS ingestion
  lib/feeds.ts       Source configuration
  lib/ingest.ts      RSS fetch + normalize
  data/current.db    SQLite (local, gitignored)
catalog/             Shared sources, sports tags, HTML decode (app + API)
components/          UI
services/            API client, recommendations
```

## Deploy backend (Vercel)

The Expo app lives at the repo root; the API is **`backend/`** only. The API imports shared modules from **`catalog/`** at the repo root, so Vercel must upload the full repository — not only `backend/`.

**Root Directory:** In Vercel → Project → Settings → General, leave **Root Directory empty** (`.` / repository root). Do **not** set it to `backend`; that uploads ~35 files and the build fails resolving `../../catalog/…`.

Repo-root `vercel.json` runs install/build inside `backend/` and keeps the ingest cron. `backend/next.config.ts` sets `outputFileTracingRoot` to the monorepo root so serverless bundles include `catalog/`.

| Setting | Value |
|---------|--------|
| Root Directory | **empty** (`.` ) |
| Framework Preset | Next.js |
| Install Command | `cd backend && npm ci` (default from `vercel.json`) |
| Build Command | `cd backend && npm ci && npm run build` (default from `vercel.json`) |

**CLI:** run `vercel` from the **repository root** (not `cd backend`). Link the **`current-backend`** project (not `current` — that is the Expo app and uploads too many files).

Root `.vercelignore` keeps `node_modules`, `.expo`, and native folders out of the upload. If you still hit a file-count limit, use `vercel --archive=tgz`.

1. Log in (fixes `The specified token is not valid`):

   ```bash
   vercel login
   ```

2. Link and deploy:

   ```bash
   cd /path/to/current   # repo root
   vercel link           # choose existing project: current-backend
   vercel                # or: vercel --archive=tgz
   ```

   Do **not** link at repo root to the **`current`** Vercel project (Expo). Wrong link → `files should NOT have more than 15000 items`.

3. In the Vercel project → **Settings → Environment Variables** (Production and Preview), set:

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET` (must match what Vercel Cron sends as `Authorization: Bearer …`)

4. After deploy, set `EXPO_PUBLIC_API_URL` in EAS to your production API URL (e.g. `https://your-project.vercel.app`).

SQLite (`better-sqlite3`) is configured for Vercel via `serverExternalPackages` in `backend/next.config.ts`; the DB file is ephemeral under `/tmp` on serverless unless you set `DATABASE_PATH`.

## Next steps

- Point `EXPO_PUBLIC_API_URL` at the Vercel API URL (see **Deploy backend** above)
- Move auth + likes to the API for cross-device sync
- Add more feeds in `backend/lib/feeds.ts`
- Optional: full-text extraction or in-app browser for publisher URLs
