# Catalog Pipeline

## Goal

Build a versioned metadata catalog that powers:

- JioHotstar card matching in the extension
- the local discovery app
- recommendations, swipe deck, health checks, and taste graph enrichment

## Current Catalog Files

| File | Purpose | Current count |
| --- | --- | --- |
| `public/data/catalog/tmdb-jiohotstar-catalog.json` | Primary full catalog | 5,752 items |
| `public/data/catalog/91mobiles-jiohotstar-seed.json` | Fallback/validator seed | 23 items |
| `data/catalog/91mobiles-jiohotstar-seed.json` | Source seed copy | 23 items |

## TMDB Full Catalog Builder

Script:

```text
scripts/catalog/build-tmdb-catalog.mjs
```

Run:

```bash
npm run catalog:tmdb
```

Required environment:

```text
TMDB_BEARER_TOKEN=
```

Optional:

```text
OMDB_API_KEY=
```

Pipeline:

1. Discover JioHotstar/Hotstar watch-provider IDs for India from TMDB.
2. Paginate TMDB discover movie and TV endpoints filtered by those providers.
3. Enrich each title with details, credits, keywords, and watch providers.
4. Optionally enrich with OMDb IMDb ratings.
5. Build a small deterministic feature vector.
6. Write `public/data/catalog/tmdb-jiohotstar-catalog.json`.

## Important Data Integrity Detail

TMDB movie IDs and TV IDs can collide. The stable `content_id` must include media type:

```text
tmdb:movie:{tmdb_id}
tmdb:show:{tmdb_id}
```

Do not revert this to `tmdb:{id}`. The old format caused Dexie primary-key collisions and reduced the app catalog from 5,752 rows to 5,740 rows.

## 91mobiles Seed Builder

Script:

```text
scripts/catalog/build-catalog.mjs
```

Run:

```bash
npm run catalog:seed
```

This is a small fallback/validator path, not the primary catalog source.

## App Loading

`src/shared/catalog.ts` loads the primary public TMDB catalog first and falls back to the public 91mobiles seed. It uses `fetch(..., { cache: "no-store" })` and syncs into Dexie.

If the IndexedDB row count differs from the bundled JSON item count, `syncCatalogToDb()` clears and reloads the catalog.

## Verification

Current verified primary catalog:

```text
items: 5752
unique content_id values: 5752
duplicates: 0
movies: 4020
shows: 1732
```
