# Dev Log

## Session 4 - 2026-06-24 (Localhost App + Hardening Complete)

### Goal

Finish the project into a clean, testable state: run it as a local URL, redesign the frontend, add runtime health indicators, harden security, verify the full catalog, and leave documentation current for another MCP.

### Completed

**Localhost-first app**
- `index.html` now loads the full discovery app.
- `popup.html` is the dedicated Chrome extension popup.
- Vite builds `index.html`, `app.html`, `popup.html`, background worker, and content script.
- Local dev server runs at `http://127.0.0.1:4173/`.

**Runtime/storage robustness**
- Added `src/shared/runtime.ts` for runtime/storage capability detection.
- Rewrote `src/shared/storage.ts` so the same app works with `chrome.storage.local` in extension mode and `localStorage` in normal web mode.
- Added deduped state views so mirrored title/url records no longer double-count.
- Added `src/shared/curation.ts` for shared action application and taste graph syncing.

**Taste graph and catalog integrity**
- Background worker now handles `SYNC_TASTE_GRAPH`, rebuilding from current state to avoid drift.
- Added `buildTasteGraph()` to recompute edge weights and centroid.
- Fixed the TMDB catalog primary key bug: content IDs now include media type (`tmdb:movie:{id}`, `tmdb:show:{id}`), so movie/show ID collisions no longer overwrite rows in Dexie.
- Verified the bundled catalog has 5,752 unique items.

**Frontend redesign**
- Rewrote `src/app/App.tsx` around the existing product flows: Recommendations, Swipe Deck, Manage, Watch Later, Taste Graph, System Health.
- Rewrote `src/styles/base.css` as a monochrome brutalist UI with large typography, square borders, and no RGB/gradient glass styling.
- Rewrote `src/popup/App.tsx` to match the new design language.
- Rewrote content-script injected controls to the same minimal monochrome style.

**Health and production readiness**
- Added health strip: runtime, storage provider, catalog count, DB status, action log, backend status.
- Added System Health tab with catalog stats and rebuild control.
- Added `vercel.json` with CSP, referrer, content type, and permissions headers.
- Added `scripts/security/scan-secrets.mjs`.
- Added `npm run security:scan` and `npm run verify`.
- Added `.gitignore` protection for runtime logs.
- Removed tracked generated build artifacts: `tsconfig*.tsbuildinfo`, `vite.config.js`.
- Added `esbuild` override to fixed `^0.28.1`; `npm audit` is clean.

### Tests and Checks

```
npm test
# 38/38 tests passing

npm run build
# production build passes

npm run security:scan
# no secrets detected in tracked/untracked project files

npm audit
# 0 vulnerabilities
```

### Browser Verification

- Opened `http://127.0.0.1:4173/` in the in-app browser.
- Confirmed headline and full app render.
- Confirmed 24 recommendation cards render.
- Confirmed health strip shows web/local-storage mode and 5,752 catalog titles.
- Confirmed System Health tab opens and shows rebuild control.
- Confirmed no horizontal overflow at desktop width.
- Confirmed no horizontal overflow at 390px mobile viewport.

### Version

0.3.0 -> 0.4.0

---

## Session 3 - 2026-06-24 (Phase 3 Complete)

- Added IndexedDB (Dexie) catalog and action log.
- Added background metadata/taste graph handlers.
- Added Watch Later, Swipe Deck, Taste Graph, Catalog Health.
- Added side panel and weekly catalog-refresh workflow.
- Added full TMDB catalog output.

---

## Session 2 - 2026-06-24 (Phase 2 Complete)

- Adapter hardening with fixtures and 17 adapter tests.
- TMDB catalog pipeline.
- Recommendation V1 with hard filters, scoring, diversity, exploration.
- Repository initialized and pushed to `kunal-gh/thatone`.

---

## Session 1 - 2026-06-24 (Phase 1 Complete)

- MVP scaffold, extension core, storage, adapter, popup, app, tests, and initial docs.
