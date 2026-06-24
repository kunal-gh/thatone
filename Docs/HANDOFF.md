# Handoff

Last updated: 2026-06-24 (Session 3)

## What This Project Is

A local-first Chrome extension called "Personal JioHotstar Curator". The extension:
1. Hides unwanted JioHotstar titles permanently across refreshes
2. Tracks watched content
3. Saves Watch Later items
4. Builds a personal taste graph from user actions (Hide/Watched/Watch Later/Swipe)
5. Recommends unseen, unblocked titles using deterministic scoring
6. Provides a full 6-tab discovery app and a side panel

## What Has Been Built (Complete as of Session 3)

### Extension Surfaces
- **Popup**: 4 stats (hidden, watched, watch later, taste signals) + open app + open side panel buttons
- **Content script**: Detects cards, injects Hide / Watched / Watch Later buttons + rating badge + undo toast
- **Background worker**: `UPDATE_TASTE_GRAPH` and `FETCH_CARD_META` message handlers, daily alarm
- **Side panel**: Full 6-tab app served from `app.html`

### 6-Tab Discovery App (`app.html`)
| Tab | What it does |
| --- | --- |
| ⚙️ Manage | Lists hidden/watched items, filter, remove, export/import backup |
| 🕐 Watch Later | Saved items with Open / Mark Watched / Remove actions |
| 🃏 Swipe | Full-card deck with TMDB poster, emoji actions, animated feedback |
| ⭐ Recommendations | 7-weight scored recs with mood/type/exploration filters + score debug bars |
| 🎭 Taste | Signed weight visualization per node type + centroid vector |
| 📊 Catalog | DB stats, last 10 actions, force re-sync |

### Storage
- **chrome.storage.local**: `curatorState` (items), `curatorTaste` (taste graph), settings
- **IndexedDB (Dexie)**: `catalog` table (thousands of TMDB items), `user_actions` log table

### Catalog Pipeline
- `scripts/catalog/build-tmdb-catalog.mjs`: TMDB-first, auto-discovers JioHotstar provider IDs, paginates, enriches, outputs to `public/data/catalog/`
- `scripts/catalog/build-catalog.mjs`: 91mobiles seed builder
- `src/shared/catalog.ts`: `syncCatalogToDb()`, `loadCatalog()`, `matchCatalogItem()`, `matchCatalogItemAsync()`

### Recommendation Engine
- `src/shared/taste.ts`: taste graph, temporal decay, scoring, centroid
- `src/shared/recommend.ts`: hard filters, 7-weight formula, diversity rerank, exploration injection
- Score formula: `0.35*embedding + 0.20*taste + 0.15*quality + 0.10*mood + 0.08*novelty + 0.07*diversity + 0.05*freshness - penalties`

### CI/Automation
- `.github/workflows/catalog-refresh.yml`: weekly TMDB pull, auto-commit
- Requires `TMDB_BEARER_TOKEN` secret in GitHub repo settings

### Tests
- 35 tests passing (`npm test`)
- Adapter: 17 tests (URL patterns, title extraction, fixtures)
- Recommend: 18 tests (hard filters, scoring, diversity, pipeline)

## File Map

```
src/
  shared/
    types.ts         ← ItemState (hidden|watched|watch_later), UserAction, CatalogItem, TasteGraph
    normalize.ts     ← title/URL normalization
    storage.ts       ← chrome.storage CRUD + logUserAction + getRecentActions
    db.ts            ← Dexie: catalog + user_actions tables
    catalog.ts       ← syncCatalogToDb, loadCatalog, matchCatalogItem(Async)
    taste.ts         ← taste graph, temporal decay, scoring, centroid
    recommend.ts     ← full recommendation pipeline
    recommend.test.ts
  extension/
    adapter.ts       ← DOM extraction (testable, no chrome deps)
    adapter.test.ts
    content.ts       ← cards: Hide/Watched/Later buttons + toast + badge + undo
    background.ts    ← UPDATE_TASTE_GRAPH + FETCH_CARD_META + alarm
    fixtures/        ← HTML fixtures for adapter tests
  app/
    App.tsx          ← 6-tab app
    main.tsx
  popup/
    App.tsx          ← popup: 4 stats + open app + side panel
    main.tsx
  styles/
    base.css

scripts/catalog/
  build-catalog.mjs        ← 91mobiles seed
  build-tmdb-catalog.mjs   ← TMDB full catalog

public/
  manifest.json    ← v0.3.0 with sidePanel + alarms
  data/catalog/    ← generated JSON lands here, bundled by Vite

.github/workflows/
  catalog-refresh.yml      ← weekly CI catalog rebuild

tasks/TASKS.md · logs/DEV_LOG.md · Docs/HANDOFF.md
```

## How To Continue

1. **Set GitHub secret**: Add `TMDB_BEARER_TOKEN` in repo Settings → Secrets → Actions.
2. **Test extension**: `npm run build` → load `dist/` as unpacked extension in Chrome.
3. **Next milestone (Phase 4)**: Add a logistic regression classifier using the `user_actions` log as training data.
4. **Phase 5**: Hosted PWA with `externally_connectable` bridge.
5. **Phase 6**: Natural language search / LLM explanations.

## Assumptions & Constraints

- Local-first; no backend until sync is needed.
- Adapter uses layered heuristics; avoids single CSS class dependency.
- Hard filters always execute before scoring.
- LLM/AI deferred to Phase 6.
- `chrome.storage.sync` is not used for catalog (too small).
- Rating badges are best-effort; gracefully hidden if catalog item not found.
