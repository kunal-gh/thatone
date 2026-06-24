# Dev Log

## Session 3 — 2026-06-24 (Phase 3 Complete)

### Goal

Complete all remaining development tasks: Watch Later, Swipe Deck, Taste Controls, Catalog Health, Undo Toast, Rating Badges, GitHub Actions.

### Tasks Completed

**P2-01 — IndexedDB (Dexie)**
- `src/shared/db.ts` created: `CuratorDatabase` with `catalog` and `user_actions` tables.
- `src/shared/catalog.ts` updated: `syncCatalogToDb()` loads from bundled JSON on first run; `loadCatalog()` delegates to Dexie; `matchCatalogItemAsync()` queries DB directly.
- `package.json`: `dexie` added as dependency.
- `scripts/catalog/*.mjs`: output now goes to `public/data/catalog/` so Vite bundles it automatically.

**P2-02 / P2-03 — Background worker**
- `src/extension/background.ts` now handles two message types:
  - `UPDATE_TASTE_GRAPH`: matches catalog item by title/URL, recalculates taste graph.
  - `FETCH_CARD_META`: returns rating + genres for a card title/URL (used for content script badges).
- Daily alarm registered (`catalog-check`) for future remote catalog health check.

**P2-04 — Undo toast**
- 5-second auto-dismiss toast appears after any Hide / Watched / Watch Later action on a card.
- "Undo" button restores original state + card visibility.

**P2-05 — Watch Later**
- `ItemState` extended to `"hidden" | "watched" | "watch_later"`.
- Content script: added "Later" button on each card.
- Storage: `getWatchLaterItems()` helper added.
- App: new Watch Later tab with "Mark watched" and "Remove" actions.

**P2-06 — Swipe Deck**
- New Swipe tab in discovery app.
- Full-card view with TMDB poster image (or gradient fallback).
- Emoji action buttons: 👎 hide · ⏭ skip · 🕐 watch later · ✅ watched.
- Animated feedback overlay on action.
- Deck is seeded from recommendations for smart cold-start.

**P2-07 — Taste Controls**
- New Taste tab visualizes all taste graph edges grouped by node type (genre, actor, director, language, etc.).
- Signed weight bars (positive = green, negative = red).
- Shows taste centroid vector if computed.

**P2-08 — Catalog Health**
- New Catalog tab shows: total/movie/show counts, high confidence, JioHotstar URL coverage, embedding coverage, action log count.
- Last 10 user actions displayed.
- Force re-sync button clears Dexie catalog and reloads from bundle.

**P2-09 — User Action Log**
- `src/shared/types.ts`: `UserAction`, `UserActionType`, `ActionContext` types added.
- `src/shared/db.ts`: `user_actions` table added to Dexie.
- `src/shared/storage.ts`: `logUserAction()`, `getRecentActions()`, `getActionCount()` added.
- All Hide/Watched/Watch Later/Remove actions across app and content script now logged.

**P2-10 — Manifest v0.3.0**
- Added: `alarms`, `sidePanel` permissions.
- Added: `side_panel.default_path = "app.html"`.
- Added: `data/catalog/*` to `web_accessible_resources`.

**P2-11 — GitHub Actions**
- `.github/workflows/catalog-refresh.yml`: weekly (Sunday 02:00 UTC) catalog rebuild.
- Uses `TMDB_BEARER_TOKEN` from GitHub Secrets.
- Auto-commits updated JSON with `[skip ci]` tag.

**Popup**
- Now shows 4 stats: hidden, watched, watch later, taste signals.
- Added "Open side panel" button.

### Test Results

```
35/35 tests passing
npm run build ✓ (clean)
```

### Version

0.2.0 → 0.3.0

---

## Session 2 — 2026-06-24 (Phase 2 Complete)

### Tasks Completed

- P1-07: Adapter hardening (17 tests, 6 extraction fallbacks, 3 HTML fixtures)
- P1-09: TMDB catalog pipeline (`build-tmdb-catalog.mjs`, `catalog.ts`)
- P1-10: Recommendation V1 (7-weight scoring, diversity rerank, exploration modes)
- Docs synchronized
- Git initialized, pushed to `kunal-gh/thatone`

---

## Session 1 — 2026-06-24 (Phase 1 Complete)

### Tasks Completed

- P0-01 through P1-11: Full MVP scaffold, extension core, storage, adapter, popup, app, tests
