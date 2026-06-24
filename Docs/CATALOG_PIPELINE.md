# Catalog Pipeline

## Goal

Build a versioned external catalog that powers:

- matching and enrichment for JioHotstar cards detected by the extension
- the extension-owned discovery app
- the recommendation engine

## Current State

Two catalog builders exist:

### 1. 91mobiles Seed Builder (no API key required)

```
scripts/catalog/build-catalog.mjs
```

- Fetches the public 91mobiles JioHotstar page with a browser-like user agent
- Falls back to curl.exe for anti-bot protection
- Parses visible result cards with Cheerio
- Extracts: title, age rating, cast, genres, stream providers, JioHotstar URL
- Optionally enriches with TMDB search if `TMDB_BEARER_TOKEN` is set
- Writes to `data/catalog/91mobiles-jiohotstar-seed.json`

**Current output:** 23 visible-page items (seed/validator, not full catalog)

**Run:**
```bash
npm run catalog:seed
```

### 2. TMDB-First Full Catalog Builder (TMDB_BEARER_TOKEN required)

```
scripts/catalog/build-tmdb-catalog.mjs
```

- Auto-discovers JioHotstar watch-provider IDs for India from TMDB
- Paginates `/discover/movie` and `/discover/tv` with JioHotstar provider filter
- For each item, fetches: full details, credits (cast/director/crew), keywords, watch providers
- Optional OMDb enrichment for IMDb ratings (`OMDB_API_KEY`)
- Builds a 6-dimension feature embedding per item for similarity scoring
- Writes versioned output to `data/catalog/tmdb-jiohotstar-catalog.json`
- Respects TMDB rate limits (~40 req/sec): uses 100–150ms delay between calls, retries on 429

**Expected output:** thousands of high-confidence JioHotstar titles

**Run:**
```bash
TMDB_BEARER_TOKEN=<your_token> npm run catalog:tmdb

# With OMDb enrichment
TMDB_BEARER_TOKEN=<your_token> OMDB_API_KEY=<your_key> npm run catalog:tmdb
```

## CatalogItem Schema

Each item in the output follows the `CatalogItem` type (see `src/shared/types.ts`):

| Field | Source |
|---|---|
| `content_id` | `tmdb:{tmdb_id}` |
| `tmdb_id` | TMDB |
| `imdb_id` | TMDB details or OMDb |
| `jiohotstar_url` | TMDB watch-providers (India) |
| `title`, `original_title`, `year` | TMDB |
| `type` | movie or show |
| `genres`, `keywords`, `moods` | TMDB genres + keywords |
| `cast`, `directors` | TMDB credits |
| `vote_average`, `vote_count` | TMDB |
| `imdb_rating` | OMDb (optional) |
| `runtime_minutes` | TMDB |
| `release_date` | TMDB |
| `availability_confidence` | high (JioHotstar URL found) / medium |
| `embedding` | 6-dim: [rating, freshness, isMovie, isShow, isIndianLang, popularity] |

## Catalog Loading in the Extension

`src/shared/catalog.ts` → `loadCatalog()`:

1. First tries `/data/catalog/tmdb-jiohotstar-catalog.json`
2. Falls back to `/data/catalog/91mobiles-jiohotstar-seed.json`
3. Caches the result in memory

`matchCatalogItem(catalog, title, url?)`:
- URL path match first (most specific)
- Normalized title match second
- original_title match third

## Planned Next Steps

1. Copy generated catalog to `dist/data/catalog/` as part of the build (or serve statically).
2. Add Dexie (IndexedDB) for local catalog storage to bypass the 10MB chrome.storage.local cap.
3. Add pagination/diff logic: only fetch new titles since last run using TMDB change tracking.
4. Add source confidence scoring: mark items where JioHotstar URL is generic or missing.
5. Add OMDb enrichment for remaining items without IMDb ratings.
6. Add GitHub Actions schedule to auto-rebuild catalog weekly.
7. Add catalog version checking in the extension: auto-refresh if newer version is available.
