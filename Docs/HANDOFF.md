# Handoff

Last updated: 2026-07-02 (Session 7 — v1.2.0)

---

## Current State

**Session 8 correction:** JioHotstar rail hiding now targets the outer rail/list item and collapses width/flex-basis as well as height, so hidden/watched cards should no longer leave black horizontal slots. Already-processed cards also reconcile against storage on every scan, so side-panel/app actions can reflect on the live page without manual refresh.

**Version:** 1.2.0 · **Commits:** `b48d662` (main)

The project is a fully-functional, professional Chrome MV3 extension with a dark glassmorphism UI. It works in two modes:

- **Chrome Extension mode:** Build `dist/` and load it unpacked. The extension injects hover controls into JioHotstar and opens an interactive side panel app.
- **Web App / PWA mode:** Run `npm run dev` and open `http://127.0.0.1:4173/`. Same app, no extension APIs needed — falls back to `localStorage`.

The product is **local-first** — no backend required. All data lives in `chrome.storage.local` (extension) or `localStorage + IndexedDB` (web mode).

---

## What Is Built

### App Tabs (7)

| Tab | Purpose |
|-----|---------|
| **Discover** | Poster-grid of ranked recommendations. Lazy-loaded TMDB images, score ring badge, hover action overlay. |
| **Swipe** | Tinder-style card deck with pointer drag gestures and spring-back physics. Swipe to hide/watch/later. |
| **Watchlist** | Poster grid of saved "Watch Later" items. Sort by date/rating/title. |
| **Library** | Hidden + Watched items. Search filter, bulk actions, poster thumbnails. |
| **Profile** | Taste graph: genre affinity radar chart (SVG) + horizontal bar charts for genre/actor/director weights. |
| **System** | Health dashboard: runtime, storage, catalog count, DB status, alarm state, catalog rebuild button. |
| **Settings** | IMDb import, TMDB account linking, backup/restore, diagnostics, log export. |

### Extension Surfaces

| File | Purpose |
|------|---------|
| `popup.html` | Compact popup: dark gradient header, stats grid, launch buttons |
| `app.html` | Side panel / full app entry |
| `index.html` | Localhost / Vercel web app entry |
| `src/extension/content.ts` | Injects hover controls into JioHotstar cards. Shows CURATOR CONNECTED heartbeat. |
| `src/extension/background.ts` | Service worker: taste graph sync, card meta fetch, catalog alarm, TMDB sync alarm |

### Content Script Behavior (`content.ts`)

- **Controls:** Hidden by default (`opacity: 0`), revealed on hover with 0.2s fade. No permanent overlay.
- **Card hiding:** Smooth CSS collapse animation (`max-height`, `opacity`, `margin` transitions). No blank gaps.
- **Storage sync:** `chrome.storage.onChanged` listener — side panel actions immediately reflected on page.
- **Undo toast:** 5-second glass toast with click-to-undo after every action.
- **Heartbeat:** Small dark glass pill at bottom-left: `✓ CURATOR · {n} cards · {n} controls · {n} hidden`.

### Components

| Component | Purpose |
|-----------|---------|
| `PosterCard.tsx` | TMDB image, lazy load, skeleton shimmer, SVG score ring, hover action overlay |
| `SwipeDeck.tsx` | Pointer drag deck with spring physics, direction indicators |
| `RadarChart.tsx` | Pure SVG spider chart for taste profile visualization |
| `SettingsTab.tsx` | IMDb import, TMDB OAuth account linking, backup/restore, diagnostics |
| `ErrorBoundary.tsx` | React class boundary with dark fallback UI, one-click recovery |

### Shared Modules

| Module | Purpose |
|--------|---------|
| `storage.ts` | Chrome storage (extension) / localStorage (web) adapter with subscriptions |
| `db.ts` | Dexie v2 schema — `catalog`, `user_actions`, `imdb_imports`, `sync_state` |
| `catalog.ts` | Static catalog load → Dexie sync, URL/title matching, recommendation helpers |
| `recommend.ts` | Scoring engine (embedding + taste + quality + mood + novelty + diversity + freshness) |
| `curation.ts` | Action application, taste graph sync |
| `taste.ts` | Taste graph edge weights, centroid computation |
| `imdb-import.ts` | IMDb CSV parser, auto-detect, fuzzy matching against catalog |
| `tmdb-account.ts` | TMDB OAuth: request token → approval → session, watchlist/ratings fetch |
| `data-transfer.ts` | Backup/restore — versioned JSON export/import of all user data |
| `logger.ts` | Structured logger, ring buffer, JSON export for bug reports |
| `runtime.ts` | Runtime capability detection (chrome vs. web) |

### Data & Storage

- `public/data/catalog/tmdb-jiohotstar-catalog.json` — 5,752 items with poster paths, genres, embeddings
- `public/data/catalog/91mobiles-jiohotstar-seed.json` — 23-item fallback
- `public/icons/` — SVG icons at 16/32/48/128px (indigo→purple gradient, "C" lettermark)
- **Dexie v2** tables: `catalog`, `user_actions`, `imdb_imports`, `sync_state`
- TMDB session stored in `localStorage` key `curator_tmdb_session`
- TMDB API key stored in `localStorage` key `curator_tmdb_key`

### Recommendation Engine Score Formula

```
score = 0.35 × embedding_similarity
      + 0.20 × taste_alignment
      + 0.15 × quality_signal
      + 0.10 × mood_match
      + 0.08 × novelty
      + 0.07 × diversity
      + 0.05 × freshness
      - penalties (hidden, already_watched)
```

---

## Security State

- `.env` is git-ignored and never committed.
- TMDB API key is **user-provided** — never hardcoded in source.
- TMDB session_id stored in `localStorage` (scoped to the extension page, not exposed to JioHotstar).
- `npm run security:scan` scans tracked + untracked non-ignored files for secrets.
- `npm audit` — 0 vulnerabilities (`esbuild` pinned via override).
- `vercel.json` includes CSP, referrer policy, content-type, and permissions headers.
- Extension CSP in `manifest.json`: `script-src 'self'`, allows Google Fonts for Inter font.
- No DRM bypass, no stream/cookie interception, no account token access.

---

## How To Run (Development)

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

Open: `http://127.0.0.1:4173/`

## How To Build Extension

```bash
npm run build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `dist/`
4. After each rebuild: click the **reload icon** on the extension card, then reload the JioHotstar tab.

Extension is connected when the bottom-left pill shows:
```
✓ CURATOR · 24 cards · 24 controls · 0 hidden
```

## How To Verify

```bash
npm run verify   # Vitest suite + build + secret scan
npm audit        # 0 vulnerabilities expected
```

Expected: 40 tests passing, build passes, secret scan passes, 0 audit vulns.

---

## Important Notes For The Next Developer

1. **Do not read/print `.env`** — local secrets may exist.
2. **Content ID format is mandatory:** use `tmdb:movie:{id}` / `tmdb:show:{id}`. Plain `tmdb:{id}` causes IndexedDB primary key collisions between movies and shows sharing the same TMDB numeric ID.
3. **Catalog count below 5,752?** Use System Health → `REBUILD LOCAL CATALOG` or clear IndexedDB in DevTools → Application.
4. **Web mode must work without `chrome.*` APIs.** `storage.ts` has a localStorage fallback. Never add chrome-only calls outside `runtime.ts`-gated blocks.
5. **Content script imports are restricted.** `content.ts` is built as a standalone IIFE via esbuild. It can only import from `./content-storage`, `./adapter`, `../shared/normalize`, and `../shared/types` (type-only). No Dexie, no npm packages.
6. **Google Fonts (Inter) are loaded via CSS `@import`** — covered by the manifest CSP. Do not add other external font sources without updating the CSP.
7. **TMDB session = `localStorage` only** — not available in the service worker background script. The background alarm only pings the active tab; the actual sync happens in the side panel.
8. **Backup format is versioned.** `data-transfer.ts` validates `version: "1.0"`. If you add new fields to `StoredState`, bump the version and add a migration in `restoreBackup`.
9. **Dexie schema migration:** incrementing `version()` in `db.ts` requires providing all previous table definitions too. Never skip version numbers.
10. **Side panel auto-opens** on extension icon click (background.ts `action.onClicked`). If the popup is needed instead, remove that handler.

---

## Remaining / Optional Work

| Item | Priority | Notes |
|------|----------|-------|
| Trakt.tv OAuth integration | Medium | Industry-standard media tracker API — would complement TMDB account sync |
| Cloudflare Worker API proxy | Low | Optional: hides user's TMDB key from network inspector. Simple `fetch` relay worker. |
| Playwright browser smoke tests | Low | E2E: load extension in Chrome, navigate to JioHotstar, verify heartbeat appears |
| Vercel deployment | Low | `vercel.json` is ready, just needs a deploy trigger |
| Chrome Web Store packaging | Medium | Needs: privacy policy, screenshots, store description. Icons already done. |
| Live TMDB catalog refresh | Low | Replace static JSON build with periodic `fetch` from a hosted catalog endpoint |
| `externally_connectable` bridge | Low | Let the hosted web app communicate directly with the extension via message passing |
| Visual regression snapshots | Low | Lock in UI appearance with Playwright screenshots |
