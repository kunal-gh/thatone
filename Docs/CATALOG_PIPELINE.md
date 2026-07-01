# Catalog Pipeline

Last updated: 2026-07-02 (v1.0.0)

## Overview

The catalog is a static JSON file (`public/data/catalog/tmdb-jiohotstar-catalog.json`) containing 5,752 curated titles available on JioHotstar. It is bundled into the extension at build time and loaded into IndexedDB (Dexie) on first launch.

The catalog schema is defined in `src/shared/types.ts` as `CatalogItem`.

## Data Sources

| Source | File | Purpose |
|--------|------|---------|
| TMDB API | `scripts/catalog/fetch-tmdb.mjs` | Primary catalog — 5,752 titles with poster paths, genres, cast, ratings |
| 91mobiles scrape | `scripts/catalog/fetch-91mobiles.mjs` | 23-item fallback/seed catalog for offline testing |

## Catalog Item Schema

```typescript
type CatalogItem = {
  content_id: string;       // "tmdb:movie:{id}" or "tmdb:show:{id}"
  source: "tmdb" | "91mobiles" | "omdb" | "manual";
  scraped_at: string;       // ISO timestamp

  // Identification
  tmdb_id: number | null;
  imdb_id: string | null;   // "tt1234567" — used for IMDb CSV import matching
  jiohotstar_url: string | null;

  // Display
  title: string;
  original_title: string | null;
  year: number | null;
  type: "movie" | "show" | "episode" | "special";
  overview: string | null;
  poster_path: string | null;  // TMDB path → full URL: https://image.tmdb.org/t/p/w342{poster_path}

  // Features for matching & recommendations
  language: string | null;
  genres: string[];
  keywords: string[];
  moods: string[];
  cast: string[];
  directors: string[];

  // Quality signals
  vote_average: number | null;  // 0–10
  vote_count: number | null;
  imdb_rating: number | null;
  runtime_minutes: number | null;

  // Freshness
  release_date: string | null;  // "YYYY-MM-DD"

  // Availability
  availability_confidence: "high" | "medium" | "low";
  stream_providers: { provider: string; url: string | null }[];

  // Precomputed embedding for recommendation engine
  embedding: number[] | null;
};
```

## Poster Images

TMDB poster images are constructed at runtime from `poster_path`:

```
https://image.tmdb.org/t/p/w342{poster_path}
```

Available size variants: `w92`, `w154`, `w185`, `w342`, `w500`, `w780`, `original`

The `PosterCard` component in `src/components/PosterCard.tsx` handles:
- URL construction from `poster_path`
- Lazy loading with `loading="lazy"`
- Skeleton shimmer placeholder
- Error fallback showing title text

## Content ID Format

> ⚠️ **Critical:** Always use `tmdb:movie:{id}` or `tmdb:show:{id}` (not bare `tmdb:{id}`). Bare IDs cause movie/show collisions in the Dexie `catalog` table since TMDB assigns the same numeric ID to both a movie and a TV show.

```
✓ tmdb:movie:550     (Fight Club)
✓ tmdb:show:1396     (Breaking Bad)
✗ tmdb:550           (ambiguous — collision risk)
```

## IMDb ID Cross-Reference

The `imdb_id` field (e.g. `"tt0137523"`) is used by the IMDb CSV import pipeline to match IMDb ratings/watchlist entries against the local catalog. It is the most reliable matching key — title+year fuzzy matching is only used as a fallback when `imdb_id` is null.

## Dexie Indexes

Schema v2 (see `src/shared/db.ts`) indexes:

| Table | Indexed Fields |
|-------|---------------|
| `catalog` | `content_id` (PK), `tmdb_id`, `imdb_id`, `title`, `jiohotstar_url`, `type`, `vote_average` |
| `user_actions` | `action_id` (PK), `content_id`, `action_type`, `created_at` |
| `imdb_imports` | `id` (auto PK), `imported_at`, `source` |
| `sync_state` | `key` (PK), `updated_at` |

## How To Rebuild The Catalog

```bash
# Requires TMDB_BEARER_TOKEN and OMDB_API_KEY in .env
npm run catalog:tmdb

# 91mobiles fallback (no API key needed)
npm run catalog:seed
```

After rebuilding, restart the dev server or rebuild the extension. The app loads the catalog from the static file on first launch. If the catalog count in System Health shows fewer than 5,752 titles, click **REBUILD LOCAL CATALOG** in the System Health tab to reload from the bundled file.

## Catalog Staleness

The background service worker runs a daily alarm (`catalog-check`) that:
1. Checks when the catalog was last synced (stored in `sync_state` table)
2. Logs a notice — the static catalog build is the current approach
3. Records the check time for future freshness tracking

For live catalog updates from TMDB (beyond the current static build), the flow would be:
1. Fetch updated manifest from a hosted endpoint or re-run `npm run catalog:tmdb`
2. The `syncCatalogToDb()` function in `src/shared/catalog.ts` detects count mismatches and refreshes Dexie automatically

## Recommendation Engine Integration

The catalog is the data source for:
- **Recommendation scoring** (`src/shared/recommend.ts`) — uses `vote_average`, `genres`, `embedding`, `release_date`
- **IMDb CSV import matching** (`src/shared/imdb-import.ts`) — uses `imdb_id`, `title`, `year`
- **TMDB account sync** (`src/shared/tmdb-account.ts`) — uses `tmdb_id`, `title`
- **Taste graph construction** (`src/shared/taste.ts`) — extracts genre/actor/director nodes from matched items
