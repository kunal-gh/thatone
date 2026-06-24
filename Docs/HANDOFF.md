# Handoff

Last updated: 2026-06-24 (Session 4)

## Current State

The project is now a local-first JioHotstar curation product with two working surfaces:

- **Web app/PWA mode:** open `http://127.0.0.1:4173/` while the dev server is running. This is the easiest way to test and is the path toward Vercel deployment.
- **Chrome extension mode:** build `dist/` and load it unpacked in Chrome. The extension injects controls into JioHotstar pages and can open the side panel/full app.

The app is intentionally local-first. There is no backend requirement for the current product. The health indicator says `Backend: Not required` because catalog, state, taste graph, and action log all run in the browser.

## What Is Built

### App Tabs

| Tab | Purpose |
| --- | --- |
| Recommendations | Ranked catalog recommendations with mode, type, mood, actions, and score breakdown |
| Swipe Deck | Fast training deck seeded from recommendations |
| Manage | Hidden/watched list, remove, export, import |
| Watch Later | Queue with open, mark watched, and remove |
| Taste Graph | Signed taste-edge weights plus centroid view |
| System Health | Runtime/storage/catalog/DB/action-log indicators and catalog rebuild |

### Extension Surfaces

- `popup.html`: compact extension popup with stats and launch buttons.
- `app.html`: extension side panel/full app entry.
- `index.html`: localhost/Vercel full app entry.
- `src/extension/content.ts`: detects cards, injects Hide/Watched/Later controls, rating badge, undo toast.
- `src/extension/background.ts`: handles `SYNC_TASTE_GRAPH`, `FETCH_CARD_META`, and daily catalog alarm.

### Data and Storage

- `public/data/catalog/tmdb-jiohotstar-catalog.json`: full generated catalog, 5,752 unique items.
- `public/data/catalog/91mobiles-jiohotstar-seed.json`: 23-item fallback/validator catalog.
- `src/shared/db.ts`: Dexie database with `catalog` and `user_actions`.
- `src/shared/storage.ts`: Chrome storage in extension mode, localStorage fallback in web mode.
- `src/shared/curation.ts`: shared action mutations and graph syncing.
- `src/shared/catalog.ts`: no-store catalog fetch, Dexie sync, URL/title matching.

### Recommendation Engine

- `src/shared/recommend.ts`: hard filters, scoring, diversity rerank, exploration injection.
- Score formula remains:

```
0.35*embedding
+ 0.20*taste
+ 0.15*quality
+ 0.10*mood
+ 0.08*novelty
+ 0.07*diversity
+ 0.05*freshness
- penalties
```

## Security State

- `.env` is ignored and was not committed.
- `npm run security:scan` scans tracked and untracked non-ignored files.
- `npm audit` is clean after pinning `esbuild` with an override.
- `vercel.json` includes CSP, referrer policy, content type, and permissions headers.
- Playback stays on official JioHotstar URLs. No DRM, stream, cookie, or account-token bypass exists in this implementation.

## How To Run

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

## How To Verify

```bash
npm run verify
npm audit
```

Expected:

- 38 tests passing.
- Production build passes.
- Secret scan passes.
- Audit reports 0 vulnerabilities.

## How To Build Extension

```bash
npm run build
```

Then open `chrome://extensions`, enable Developer mode, click `Load unpacked`, and select `dist/`.

## Important Notes For Next MCP

1. Do not read or print `.env`; secrets may exist locally.
2. Keep `public/data/catalog/tmdb-jiohotstar-catalog.json` content IDs in the `tmdb:movie:{id}` / `tmdb:show:{id}` format. Plain `tmdb:{id}` causes movie/show collisions in IndexedDB.
3. If catalog count is below 5,752 in the app, use System Health -> `REBUILD LOCAL CATALOG` or clear IndexedDB.
4. Do not reintroduce extension-only storage assumptions into the app. Web mode must work without `chrome.*` APIs.
5. Keep the design monochrome/minimal unless the user requests another redesign.

## Remaining Work

- Push this Session 4 state to GitHub after final verification.
- Optional Vercel deploy setup.
- Optional extension-to-hosted-app bridge with `externally_connectable`.
- Optional Playwright browser smoke tests for tabs.
- Optional smarter learning from `user_actions`.
