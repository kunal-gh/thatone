# Development Log

## 2026-06-24 — Session 2: P1-07, P1-09, P1-10 completion

### Summary

Completed all remaining Phase 1 tasks:

**P1-07: Adapter coverage**
- Expanded `CONTENT_URL_PATTERN` to include `/originals/`, `/episodes/`, `/series/`, `/detail/`
- Added 5 new `extractTitle` fallbacks: `data-title`, `title` attr, inner `[aria-label]`, `data-*` on images, nearby heading via class patterns
- Expanded `resolveCardElement` with `[data-item]`, `[data-card]`, `[class*='card']`, `[class*='item']`, `[class*='tile']` selectors
- Created 3 HTML fixture files: `homepage-rail.html`, `search-results.html`, `detail-page-rail.html`
- Expanded `adapter.test.ts` from 3 to 10+ test cases covering all layouts
- Exported `CONTENT_URL_PATTERN` constant for reuse

**P1-09: Catalog pipeline**
- Created `scripts/catalog/build-tmdb-catalog.mjs`: TMDB-first catalog builder
  - Auto-discovers JioHotstar provider IDs for India from TMDB watch-provider endpoint
  - Paginates `/discover/movie` and `/discover/tv` (up to 500 pages each)
  - Enriches each item: credits, keywords, genres, runtime, watch providers
  - Optional OMDb enrichment for IMDb ratings
  - Builds simple 6-dim feature embedding per item
  - Writes versioned output to `data/catalog/tmdb-jiohotstar-catalog.json`
- Created `src/shared/catalog.ts`:
  - `loadCatalog()`: tries TMDB catalog, falls back to 91mobiles seed
  - `matchCatalogItem()`: URL-first, then normalized-title matching
  - `normalizeRating()`, `freshnessScore()`, `daysSinceRelease()`, `buildSimpleEmbedding()`, `cosineSimilarity()`
- Added `catalog:seed` and `catalog:tmdb` npm scripts

**P1-10: Recommendation V1**
- Created `src/shared/taste.ts`:
  - `temporalDecayWeight()`: 1.0 / 0.8 / 0.55 / 0.35 bucket decay
  - `updateTasteGraph()`: propagates watched/hidden signal to genre/actor/director/language/type edges
  - `tasteGraphScore()`: weighted average of taste graph edge matches → 0-1
  - `computeTasteCentroid()`: average embedding of liked items
- Created `src/shared/recommend.ts`:
  - `buildHardFilters()`: extracts hidden/watched canonical keys from state
  - `isHardFiltered()`: checks item against hard filter sets (URL + title keys)
  - `scoreItem()`: 7-weight formula (embedding 35%, taste 20%, quality 15%, mood 10%, novelty 8%, diversity 7%, freshness 5%) - penalties
  - `diversityRerank()`: caps same-genre at 30%, same director at 2, same lead actor at 3
  - `getRecommendations()`: full pipeline — filter → score → sort → diversity rerank → exploration inject
- Created `src/shared/recommend.test.ts`: 12 test cases
- Updated `src/shared/storage.ts`: added `getTasteGraph()`, `setTasteGraph()`, `subscribeToTasteGraph()`
- Updated `src/app/App.tsx`:
  - Two tabs: Manage + Recommendations
  - Recommendations tab: exploration mode switcher (Comfort/Balanced/Surprise), mood text filter, 20 results with score bars, collapsible debug breakdown, JioHotstar links
  - Manage tab: updated backup format (v2, includes tasteGraph), remove item updates taste graph
- Extended `src/shared/types.ts` with: `CatalogItem`, `CatalogManifest`, `TasteGraph`, `TasteEdge`, `TasteNodeType`, `ExplorationMode`, `ScoreBreakdown`, `RecommendationResult`, `RecommendationOptions`
- Version bumped to 0.2.0

**Git**
- Initialized git repository
- Pushed to `github.com/kunal-gh/thatone`

### Decisions

- Simple 6-dim embedding for cold-start — can be replaced with TMDB/text embeddings later.
- Taste graph updates only from the app for now; content script integration is next.
- Catalog loadCatalog() prefers TMDB output, silently falls back to seed.

### Files added this session

- `src/extension/fixtures/homepage-rail.html`
- `src/extension/fixtures/search-results.html`
- `src/extension/fixtures/detail-page-rail.html`
- `src/shared/catalog.ts`
- `src/shared/taste.ts`
- `src/shared/recommend.ts`
- `src/shared/recommend.test.ts`
- `scripts/catalog/build-tmdb-catalog.mjs`

### Open issues

- Taste graph is not yet updated from the content script (only from the app).
- Catalog is still the 23-item 91mobiles seed until `catalog:tmdb` is run with a token.
- IndexedDB not yet integrated — still using chrome.storage.local for all state.
- Two-tower model, LangGraph, hosted sync all deferred.

---

## 2026-06-24 — Session 1: project bootstrap

### Summary

- Reviewed all planning documents and produced a corrected architecture blueprint.
- Established project-memory files for recovery across MCP sessions.
- Chose extension-first architecture with an extension-owned discovery app.
- Started implementation with a buildable MV3 scaffold.
- Added direct on-page `Hide` and `Watched` controls.
- Added import/export backup support for extension state.
- Refactored DOM extraction into a dedicated adapter module.
- Added baseline adapter tests with Vitest and jsdom.
- Added a first working catalog seed builder with curl fallback for 91mobiles anti-bot behavior.
- Generated `data/catalog/91mobiles-jiohotstar-seed.json` with 23 visible-page items.
- Verified a successful production build in `dist/`.

### Decisions

- Use local-first storage first; no backend dependency in MVP.
- Keep the hosted PWA as a later phase.
- Treat TMDB as primary catalog source and 91mobiles as validation.
- Keep LLM features out of the hot recommendation path.
