# Dev Log

## Session 9 - 2026-07-02 (Repository cleanup and source tree refinement)

### Goal

Remove unrelated local/repo clutter so the project is easier to navigate and safer to hand off.

### Completed

- Removed tracked agent extraction artifacts under `.codex-analysis/`.
- Removed raw planning upload folder `initial ideas/`.
- Removed legacy/stale docs: `Docs/report.md`, `Docs/report (1).md`, `Docs/revised_architecture_blueprint.md`, and `Docs/comparison_analysis.png`.
- Removed duplicate root catalog folder `data/`; canonical app catalog assets remain under `public/data/catalog/`.
- Removed tracked generated artifact `vite.config.d.ts`; generated Vite/TypeScript outputs are ignored.
- Removed ignored local generated/scratch folders and files: `dist/`, `.agents/`, `.codex-analysis/`, `data/`, `initial ideas/`, `*.tsbuildinfo`, and `vite.config.js`.
- Updated `.gitignore` to block future agent scratch folders, root duplicate data output, generated TypeScript build artifacts, and local logs.
- Updated README repository map and catalog builder output comment to match the refined structure.
- Updated task tracker with the cleanup state.

### Kept Intentionally

- `node_modules/` remains local and ignored because it is the installed dependency cache needed for immediate test/build/dev commands.
- `.env` remains local and ignored because it may contain user-provided catalog/API credentials and should not be read, printed, or committed.
- `Docs/architecture_diagram.png` remains because README renders it as the architecture visual.

---

## Session 8 - 2026-07-02 (JioHotstar rail UX repair + production verification)

### Goal

Map the user-reported screenshot issues to the current codebase and repair the highest-impact live-extension problems:

- Hidden/watched cards left black blank spaces in JioHotstar rails.
- Controls sometimes felt too visible or attached to the wrong visual area.
- Side-panel/app actions did not always reflect on the JioHotstar page without refresh.
- Security scan needed to remain clean after v1.2.0 docs and account-linking work.

### Completed

- `src/extension/adapter.ts`: added rail-item resolution so nested poster shells resolve to the direct carousel/list item wrapper.
- `src/extension/content.ts`: changed collapse animation to remove horizontal footprint too (`width`, `max-width`, `flex-basis`, horizontal margins, horizontal padding).
- `src/extension/content.ts`: changed hover reveal selector to direct child hover/focus so one rail hover does not expose every nested control overlay.
- `src/extension/content.ts`: processed cards now reconcile against fresh `chrome.storage.local` state on every scan, so page state can update after side-panel actions without manual refresh.
- `src/extension/adapter.test.ts`: added a regression test for nested JioHotstar-style rail slots.
- `README.md`: changed the `.env` placeholder so the secret scanner does not flag documentation as a token.

### Tests and Checks

```text
npm.cmd test
# 40/40 tests passing

npm.cmd run build
# production build passes
# dist/extension/content.js rebuilt as standalone IIFE

npm.cmd run security:scan
# no secrets detected

npm.cmd audit --audit-level=low
# 0 vulnerabilities
```

### Screenshot Mapping

- Screenshot blank gaps after hiding: addressed by rail wrapper targeting plus horizontal collapse.
- Screenshot always-visible controls across cards: addressed by direct-child hover/focus selector and better root selection.
- Refresh needed for updates: addressed by state reconciliation for already-processed cards.
- Poster-less project UI: already addressed in v1.2.0 with `PosterCard`, poster grids, Watchlist, Library, and Swipe deck.
- Swipe not working: `SwipeDeck.tsx` has pointer gestures and fallback buttons; remaining work is browser E2E coverage to verify real pointer behavior across Chrome surfaces.

## Session 7 — 2026-07-02 (v1.2.0 · DB upgrade, backup/restore, background alarms)

### Goal

Complete the remaining items from the implementation plan: database schema migration, data export/import, periodic background alarms, and update all documentation.

### Completed

**Database upgrade (v1 → v2)**
- `src/shared/db.ts`: Dexie schema migration to v2.
  - New `imdb_imports` table (tracks every IMDb CSV import with matched/unmatched counts).
  - New `sync_state` table (stores alarm timestamps, install time, last sync info).
  - Added `imdb_id` and `vote_average` indexes on `catalog` for faster lookup.
  - Helper functions: `getSyncState`, `setSyncState`, `recordImdbImport`, `getImdbImportHistory`.

**Data backup / restore**
- `src/shared/data-transfer.ts`: Versioned JSON backup system.
  - `exportAllData()` — collects StoredState + TasteGraph + TMDB username.
  - `downloadBackup()` — triggers browser file download.
  - `restoreBackup()` — validates `version: "1.0"`, validates structure, writes state atomically.
- `src/components/SettingsTab.tsx`: Data Management section now has Export and Import Backup buttons with success/error feedback.

**Background service worker**
- `src/extension/background.ts`: Upgraded with structured logging and DB state writes.
  - `catalog-check` daily alarm writes last-sync timestamp to `sync_state`.
  - `tmdb-watchlist-sync` every-6h alarm pings active JioHotstar tab for content refresh.
  - Extension icon click auto-opens side panel (`sidePanel.open`).

**Documentation**
- `Docs/HANDOFF.md`: Complete rewrite for v1.2.0.
- `Docs/CATALOG_PIPELINE.md`: Complete rewrite with v2 schema, poster URL construction, IMDb cross-reference.
- `Docs/BUILD_AND_LOAD.md`: Updated heartbeat text, added settings/backup instructions.
- `README.md`: Complete rewrite for v1.0.0+ with all features, architecture, setup.
- `logs/DEV_LOG.md`: Sessions 6 and 7 added.

### Tests and Checks

```text
npm run build
# ✓ 54 modules transformed, build passes
# ✓ content.js built as IIFE — Chrome-safe
```

### Version

`1.1.0 → 1.2.0`

---

## Session 6 — 2026-07-01 (v1.1.0 · TMDB account linking, radar chart)

### Goal

Complete Phase 3 integration: full TMDB OAuth account linking, taste profile radar chart visualization.

### Completed

- `src/shared/tmdb-account.ts`: Full TMDB OAuth flow — request token, user approval redirect, session creation, paginated watchlist + ratings fetch, catalog matching logic.
- `src/components/RadarChart.tsx`: Pure SVG radar/spider chart with concentric rings, gradient stroke, glow dots, and per-axis labels. Helper `tasteEdgesToRadarData` converts taste graph edges to chart input.
- `src/components/SettingsTab.tsx`: TMDB section upgraded with full account linking UI — "Link Account" opens TMDB approval page, "Confirm Link" creates session, shows @username + linked date, Unlink button.
- `src/app/App.tsx`: Genre Affinity Radar chart added at top of Taste Profile tab.
- `public/icons/`: 4 branded SVG icons (16/32/48/128px) with indigo→purple gradient 'C' lettermark.
- `public/manifest.json`: v1.0.0 with icons, CSP for Google Fonts.

### Tests and Checks

```text
npm run build
# ✓ 53 modules, clean build
```

### Version

`1.0.0 → 1.1.0`

---

## Session 5 — 2026-07-01 (v1.0.0 · Phase 3 + 4 complete)

### Goal

Phase 3: IMDb account integration, settings tab. Phase 4: professional hardening.

### Completed

**Phase 3 — Account Integration**
- `src/shared/imdb-import.ts`: IMDb CSV parser with auto-detection of ratings vs watchlist format, quoted-field handling, fuzzy catalog matching (imdb_id exact → title+year → title-only fallback).
- `src/components/SettingsTab.tsx`: Full Settings tab with IMDb import (drag-drop, preview, progress bar), TMDB API key test, data management, diagnostics panel.

**Phase 4 — Professional Hardening**
- `src/components/ErrorBoundary.tsx`: React class error boundary — dark fallback UI, expandable stack trace, one-click recovery.
- `src/shared/logger.ts`: Structured logger with color-coded levels, module scoping, 200-entry ring buffer, JSON export for bug reports.
- `src/app/App.tsx`: Settings tab wired in with ErrorBoundary wrapping all tab content.
- `src/styles/base.css`: Settings section CSS — import zone, progress bar, feedback states, settings rows.

### Tests and Checks

```text
npm run build
# ✓ 52 modules, clean build
```

### Version

`0.4.0 → 1.0.0`

---

## Session 4 — 2026-07-01 (v0.4.0 · Complete UI/UX overhaul)

### Goal

Phase 1: fix the three most visible bugs in the extension. Phase 2: complete UI/UX rewrite.

### Completed

**Phase 1 — Bug Fixes (content script)**
- `src/extension/content.ts`: Smooth card collapse animation (max-height/opacity/margin transition → no blank gaps). Controls default to `opacity: 0`, revealed on hover. `chrome.storage.onChanged` listener for real-time sync. Undo toast with 5s timer. Dark glass styled controls with Inter font.

**Phase 2 — UI/UX Overhaul**
- `src/styles/base.css`: 2300-line dark glassmorphism design system — Inter font, CSS custom properties, BEM component classes, animations (fadeIn, slideUp, shimmer, gradientShift), responsive breakpoints.
- `src/components/PosterCard.tsx`: TMDB poster images with lazy load, SVG score ring, skeleton shimmer, hover action overlay, multiple size variants.
- `src/components/SwipeDeck.tsx`: Pointer drag gestures, spring-back physics, throw-away animation, left/right/up direction indicators.
- `src/app/App.tsx`: Full rewrite of all 7 tabs with poster grids, dark glass panels, animated counters.
- `src/popup/App.tsx`: Redesigned popup with gradient header, dark stats grid.

### Version

`0.3.0 → 0.4.0` (then bumped to `1.0.0` in Session 5)

---

## Session 3 — 2026-06-27 (Session 5 in old numbering: Live Connection Repair)

### Goal

Fix the live usability failure: side panel opened on JioHotstar but no card controls appeared.

### Root Cause

- Manifest only declared wildcard subdomain patterns, not bare `hotstar.com` / `jiohotstar.com`.
- Adapter depended on ideal content anchors; missed modern poster/click-handler layouts.
- No page-level connection indicator — injection failures were invisible.

### Completed

- Added explicit bare-domain manifest coverage for `https://hotstar.com/*` and `https://jiohotstar.com/*`.
- Broadened adapter to detect poster-image cards and live click-handler layouts.
- Added `CURATOR CONNECTED / {n} CARDS / {n} CONTROLS / {n} HIDDEN` heartbeat.
- Added warmup rescans, SPA URL-change rescans, mutation debouncing.
- Added `CURATOR_PAGE_PING` message for side panel connectivity proof.
- Added `Page Bridge` and `Active Tab` health strip indicators.

### Version

`0.3.0 → 0.4.0`

---

## Session 2 — 2026-06-24 (Localhost App + Hardening)

- `index.html` loads the full app.
- Added `src/shared/runtime.ts` for capability detection.
- Rewrote `src/shared/storage.ts` for chrome/web dual mode.
- Background worker handles `SYNC_TASTE_GRAPH`, daily catalog alarm.
- Fixed TMDB content ID collision bug (`tmdb:movie:{id}` format).
- Added `vercel.json`, CSP headers, `scripts/security/scan-secrets.mjs`.
- Version: `0.2.0 → 0.3.0`

---

## Session 1 — 2026-06-24 (Phase 2 Complete — Adapter + TMDB Catalog)

- Adapter hardening: 17 adapter tests.
- TMDB catalog pipeline — 5,752 items.
- Recommendation engine v1 with hard filters, scoring, diversity, exploration.
- Repository initialized and pushed to `kunal-gh/thatone`.
- Version: `0.1.0 → 0.2.0`

---

## Session 0 — 2026-06-24 (Phase 1 Complete — MVP)

- MVP scaffold, extension core, storage, adapter, popup, app, tests, initial docs.
- Version: `0.0.0 → 0.1.0`
