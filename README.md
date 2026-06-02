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

The Expo app lives at the repo root; the API is **`backend/`** only. The API imports shared modules from **`catalog/`** at the repo root (`../../catalog/…` from `backend/`).

**Root Directory (required):** In Vercel → Project → Settings → General → **Root Directory**, set **`backend`**. Vercel detects Next.js from `backend/package.json`. Git clones the **full repo**, so `catalog/` is still on disk during build; `backend/next.config.ts` sets `outputFileTracingRoot` to the monorepo root so serverless bundles include `catalog/`.

Do **not** leave Root Directory empty — the repo root `package.json` is Expo-only (no `next`), and Git builds fail with “No Next.js version detected” even if install runs `cd backend && npm ci`.

| Setting | Value |
|---------|--------|
| Root Directory | **`backend`** |
| Framework Preset | Next.js (auto-detected) |
| Install Command | *(default or repo)* `npm ci` in `backend/` — set in **`backend/vercel.json`** |
| Build Command | *(default or repo)* `npm run build` in `backend/` — set in **`backend/vercel.json`** |
| Output Directory | *(default)* **`.next`** — **not** `backend/.next` |

Config lives in **`backend/vercel.json`** (ingest cron + explicit `npm ci` / `npm run build`). Repo-root **`vercel.json`** fails fast if Root Directory is left empty (Expo root has no Next.js). **`backend/.vercelignore`** trims Expo/native paths for CLI uploads.

### Healthy build log (Git deploy)

A successful **`current-backend`** Git deploy on `main` should take **1–3 minutes**, not milliseconds. You should see lines like:

```
Cloning github.com/brannonglover/current (Branch: main, Commit: …)
Running "install" command: npm ci …
added … packages
Detected Next.js version: 15.x
Running "build" command: npm run build …
▲ Next.js 15.x
Creating an optimized production build …
Compiled successfully
Build Completed in /vercel/output [1m–3m typical]
Deployment completed
```

If the log shows **`Build Completed in /vercel/output [69ms]`** (or any sub-second time) with **no** `npm ci` / `npm install` and **no** `next build`, the deployment is empty — API routes were never compiled. Fix dashboard settings below, then push to `main` (do not **Redeploy** a bad snapshot).

### Fix: instant build (~69ms, no npm install / no next build)

**Root cause:** Vercel is **not** running the Next.js builder. Common dashboard misconfigurations:

| Symptom in log | Likely cause | Dashboard fix |
|----------------|--------------|---------------|
| ~69ms, no install, no Next.js lines | **Root Directory empty** (builds Expo root) or **Framework Preset = Other** | Root Directory → **`backend`**; Framework → **Next.js** (auto) |
| `Build Completed in /vercel/output [69ms]` after clone | **Output Directory** = `backend/.next` while Root Directory is already **`backend`** | **Reset** Output Directory to default (empty → **`.next`**) |
| No `Detected Next.js` | Root Directory empty or wrong project linked | Confirm project **`current-backend`**, not Expo **`current`** |

**Dashboard (`current-backend`) checklist:**

1. **Settings → General → Root Directory:** **`backend`**
2. **Settings → Build and Deployment → Framework Preset:** **Next.js** (or auto-detected from `backend/package.json`)
3. **Install Command:** **Reset** to default (repo sets `npm ci` in `backend/vercel.json`; do **not** use `cd backend && …`)
4. **Build Command:** **Reset** to default (repo sets `npm run build` in `backend/vercel.json`)
5. **Output Directory:** **Reset** to default — empty field → **`.next`**, **not** `backend/.next`
6. **Settings → Git:** repo **`brannonglover/current`**, production branch **`main`**
7. Trigger a fresh deploy: **push to `main`** or `npm run vercel:backend:prod` from repo root — **not** **Redeploy** on a broken deployment

### Fix: `Command "cd backend && npm ci" exited with 1`

This almost always means a **stale dashboard override** left over from when Root Directory was empty. With Root Directory = **`backend`**, Vercel already runs install/build inside `backend/`; a custom **`cd backend && npm ci`** tries `backend/backend` or fails because `package-lock.json` is not in that cwd.

1. Vercel dashboard → your API project (e.g. **current-backend**) → **Settings** → **Build and Deployment** (or **General** → scroll to Build).
2. **Root Directory**: confirm **`backend`** (Edit → enter `backend` → Save if needed).
3. **Install Command**: open the override → click **Reset** / clear the field so it shows the default (empty = platform default, typically `npm install` or `npm ci` in the root directory).
4. **Build Command**: same — **Reset** to default (`npm run build`).
5. **Deployments** → latest failed deployment → **⋯** → **Redeploy** (or push an empty commit).

Do **not** set Install Command to `cd backend && npm ci` when Root Directory is `backend`. **`backend/vercel.json`** pins `npm ci` and `npm run build` (no `cd backend`). Repo-root **`vercel.json`** only runs when Root Directory is wrongly left empty — it exits with an error instead of a silent 69ms deploy.


### Fix: `The specified Root Directory "backend" does not exist` (35 deployment files)

**Root cause:** This is **not** caused by repo-root `.vercelignore` (it does **not** ignore `backend/`; Git builds normally download **~160+** files). The failure happens when the upload root is already the **`backend/`** tree (~**35** files) **and** the dashboard still has Root Directory = **`backend`**. Vercel then looks for `backend/backend/`, which does not exist.

Common triggers:

| Trigger | What went wrong |
|---------|------------------|
| `cd backend && vercel --prod` | CLI cwd is `backend/`; upload has no `backend/` prefix |
| **Redeploy** on a failed production deploy | Reuses the same **35-file** CLI snapshot (`gitDirty: 1` in deployment meta) |
| **Output Directory** = `backend/.next` | Wrong when Root Directory is already `backend`; reset to default **`.next`** |

**Verify in deployment logs:** `Downloading 35 deployment files…` → CLI-from-`backend/` or redeploy of that upload. Healthy Git/CLI-from-repo-root: **`Downloading 163 deployment files…`** (approx.).

**Dashboard (`current-backend`):**

1. **Settings → General → Root Directory:** **`backend`** (unchanged).
2. **Settings → Build and Deployment → Output Directory:** **Reset** to platform default (empty → **`.next`**). Remove **`backend/.next`**.
3. **Settings → Git:** Connect **`brannonglover/current`**, production branch **`main`**, if not linked (deployments with only CLI + `gitDirty` often mean production was never promoted from a full-repo build).
4. **Deployments:** Do **not** use **Redeploy** on failed production builds. Either **push to `main`** (Git) or from repo root: `npm run vercel:backend:prod`.
5. **Settings → Build and Deployment:** Install/Build commands **Reset** to defaults (no `cd backend && …`).

**Monorepo + `catalog/`:** Root Directory **`backend`** is correct. Vercel must clone the **full** repo (Git or `vercel` from repo root) so `catalog/` exists beside `backend/`. `backend/next.config.ts` sets `outputFileTracingRoot` to the repo root for serverless tracing.

**Repo-root `.vercelignore`:** Keeps Expo/native paths off CLI uploads from the **repo root** only. It does **not** remove the `backend/` directory from Git deployments.


### Git vs CLI

| Method | Where to run | Notes |
|--------|----------------|-------|
| **Git** (push / PR) | — | Set Root Directory to **`backend`** in the dashboard, then redeploy. Full repo is cloned; no `cd backend` overrides needed. |
| **CLI** | **Repository root** | `vercel link` → **`current-backend`**. Run `npm run vercel:backend` / `npm run vercel:backend:prod` from the repo root — **not** `cd backend && vercel` (→ **35 files**, Root Directory error). Use `vercel --archive=tgz` if you hit the 15k file limit. |

Repo-root `.vercelignore` is only for legacy CLI deploys before Root Directory was set to `backend`; prefer **`backend/.vercelignore`**.

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
