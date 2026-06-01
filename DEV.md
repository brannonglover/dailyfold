# Local dev recovery

## Quick start (two terminals)

```bash
# Terminal 1 — API (binds 0.0.0.0:3001 for phone + simulator)
npm run api

# Terminal 2 — Metro (dev client; --host lan for physical devices)
npm start
# or: npx expo start --dev-client --host lan -c
```

### Native dev client (`npx expo run:ios`)

This project uses **expo-dev-client**, not Expo Go. After `run:ios`, open the **Current** app (your icon), not the separate **Expo Go** app.

1. Keep Metro running in terminal 2 (`npm start`).
2. If you see the Expo dev launcher (development servers list), tap your machine’s server (e.g. `http://192.168.x.x:8081`).
3. One-shot build + launch (starts Metro with dev client): `npx expo run:ios`

Physical device: Metro resolves the API from your LAN IP (`exp://YOUR_LAN_IP:8081` → `http://YOUR_LAN_IP:3001`). Override with `EXPO_PUBLIC_API_URL` in `.env` if needed.

## Verify the API

```bash
npm run api:check
curl -s http://127.0.0.1:3001/api/health | head
curl -s "http://127.0.0.1:3001/api/articles?limit=1" | head -c 200
```

Replace `127.0.0.1` with your LAN IP when testing from another device on Wi‑Fi.

## Common failures

### `EADDRINUSE` on port 3001

Another `npm run api` (or zombie Node) is already bound.

```bash
npm run api:stop
npm run api
```

Running `npm run api` again while a **healthy** API is up prints a message and exits — it does not crash with EADDRINUSE.

### `/api/articles` returns 404 while Next says “Ready”

Usually **Watchpack EMFILE** (too many file watchers). The dev script sets `WATCHPACK_POLLING=true` and `CHOKIDAR_USEPOLLING=true`. Fix:

```bash
npm run api:restart
```

If EMFILE persists, raise the file limit in the same shell before starting the API:

```bash
ulimit -n 10240
npm run api
```

### Expo: “Cannot reach the API at http://…”

1. Confirm API: `npm run api:check`
2. Phone and Mac on the same Wi‑Fi; macOS firewall allows Node incoming connections
3. Optional `.env`: `EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3001`
4. Restart Metro with cache clear: `npx expo start --dev-client -c`

### Empty feed with API up

Run ingest once:

```bash
npm run api:ingest
```

Pull to refresh in the app (`refresh=true` on the API).

### Expo red screen: `isTopicFilterActive`

Stale Metro bundle. Restart with `npx expo start --dev-client -c`. Current `PreferencesContext` no longer uses that symbol.

### App opens to Expo launcher instead of Current

You are in the **Current dev client** (correct app), but it is not connected to Metro yet.

1. Start Metro: `npm start` (runs `expo start --dev-client --host lan`).
2. In the launcher, tap the local development server for this project, **or** use manual URL (below).
3. Do **not** use Expo Go — use the **Current** app icon installed by `run:ios`.

### “No development servers found” (Metro is running)

Metro can be up while the dev launcher list stays empty — especially on a **physical iPhone**. The launcher only auto-probes `localhost` and your subnet’s `.1` address (often the router), not your Mac’s actual LAN IP.

1. Confirm Metro in a terminal: `npm start` — you should see `Metro waiting on exp+current://...` and port **8081**.
2. Get your Mac’s LAN IP (same Wi‑Fi as the phone):

   ```bash
   ipconfig getifaddr en0
   ```

   Example: `192.168.1.94`

3. On the phone, in the **Current** dev launcher → expand **Enter URL manually** → connect to:

   ```text
   http://YOUR_LAN_IP:8081
   ```

   Example: `http://192.168.1.94:8081`

   Or open the deep link Metro prints (scan the QR in the terminal, or paste in Safari):

   ```text
   exp+current://expo-development-client/?url=http%3A%2F%2F192.168.1.94%3A8081
   ```

4. iOS **Settings → Current → Local Network** must be **On** (otherwise the phone cannot reach your Mac).
5. Phone and Mac on the same Wi‑Fi; disable VPN; allow incoming connections for **Node** in **System Settings → Network → Firewall** if enabled.
6. If Metro was started before `npm start` (e.g. only from an old `expo run:ios` session that exited), run `npm start` again and retry.

### `expo run:ios --device`: `CommandError: InvalidHostID`

Build succeeded but install failed — iOS lockdown rejected the Mac’s pairing record (`InvalidHostID`). Not an app code bug.

1. Unlock the iPhone and keep it on the home screen.
2. In Xcode: **Window → Devices and Simulators** → select the device → confirm it shows as connected (re-trust if prompted).
3. Retry: `npx expo run:ios --device`

This repo applies a small `@expo/cli` postinstall patch (`scripts/patch-expo-cli.mjs`) to fall back to `xcrun devicectl` when lockdown pairing fails. Re-run `npm install` if you delete `node_modules`.

If it still fails, install from Xcode: open `ios/Current.xcworkspace`, select your device, press Run. Or use the simulator: `npx expo run:ios`.
