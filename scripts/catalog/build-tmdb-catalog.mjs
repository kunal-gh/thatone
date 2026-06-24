/**
 * TMDB-first JioHotstar Catalog Builder
 *
 * Usage:
 *   TMDB_BEARER_TOKEN=<token> node ./scripts/catalog/build-tmdb-catalog.mjs
 *
 * Optional:
 *   OMDB_API_KEY=<key>    Enables IMDb rating enrichment via OMDb
 *
 * Output:
 *   data/catalog/tmdb-jiohotstar-catalog.json
 *
 * Strategy:
 *   1. Discover JioHotstar watch-provider ID from TMDB (India region)
 *   2. Paginate /discover/movie + /discover/tv filtered to JioHotstar
 *   3. Enrich each item with full credits, keywords, genres
 *   4. Optionally enrich with OMDb for IMDb rating
 *   5. Build simple embedding vector
 *   6. Write versioned output file
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const TMDB_BASE = "https://api.themoviedb.org/3";
const OMDB_BASE = "https://www.omdbapi.com";
const OUTPUT_FILE = resolve(process.cwd(), "public", "data", "catalog", "tmdb-jiohotstar-catalog.json");
const CATALOG_VERSION = "2.0.0";

// JioHotstar provider IDs on TMDB (India region)
// Verified IDs as of 2026: 122 = Hotstar, 1207 = JioHotstar
// The script auto-discovers these but we keep fallbacks
const KNOWN_JIOHOTSTAR_PROVIDER_IDS = [122, 1207, 3003];

const TMDB_TOKEN = process.env.TMDB_BEARER_TOKEN;
const OMDB_KEY = process.env.OMDB_API_KEY;

if (!TMDB_TOKEN) {
  console.error("❌  TMDB_BEARER_TOKEN is required. Add it to .env and re-run.");
  process.exit(1);
}

// ─── TMDB fetch with rate-limit aware retry ───────────────────────────────────

async function tmdbFetch(path, params = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${TMDB_TOKEN}`,
          Accept: "application/json"
        }
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") ?? "2", 10);
        console.warn(`  ⏳ Rate limited — waiting ${retryAfter}s…`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!res.ok) {
        throw new Error(`TMDB ${path} → HTTP ${res.status}`);
      }

      return res.json();
    } catch (err) {
      if (attempt === 4) throw err;
      console.warn(`  ⏳ Network error on attempt ${attempt + 1}: ${err.message} — retrying…`);
      await sleep(2000);
    }
  }

  throw new Error(`TMDB ${path} → failed after 5 attempts`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Provider discovery ───────────────────────────────────────────────────────

async function discoverJioHotstarProviderIds() {
  console.log("🔍  Discovering JioHotstar provider IDs for India…");

  try {
    const data = await tmdbFetch("/watch/providers/movie", { watch_region: "IN" });
    const providers = data.results ?? [];

    const jioProviders = providers.filter((p) => {
      const name = (p.provider_name ?? "").toLowerCase();
      return name.includes("hotstar") || name.includes("jiohotstar");
    });

    if (jioProviders.length > 0) {
      console.log(`  Found providers: ${jioProviders.map((p) => `${p.provider_name}(${p.provider_id})`).join(", ")}`);
      return jioProviders.map((p) => p.provider_id);
    }
  } catch (err) {
    console.warn(`  Provider discovery failed: ${err.message}`);
  }

  console.log(`  Using known fallback IDs: ${KNOWN_JIOHOTSTAR_PROVIDER_IDS.join(", ")}`);
  return KNOWN_JIOHOTSTAR_PROVIDER_IDS;
}

// ─── Paginated discover ───────────────────────────────────────────────────────

async function discoverAllPages(mediaType, providerIds) {
  const items = [];
  const providerParam = providerIds.join("|");

  console.log(`  Fetching ${mediaType} pages…`);

  // Fetch first page to get total_pages
  const firstPage = await tmdbFetch(`/discover/${mediaType}`, {
    watch_region: "IN",
    with_watch_providers: providerParam,
    sort_by: "popularity.desc",
    page: 1
  });

  const totalPages = Math.min(firstPage.total_pages ?? 1, 500); // TMDB caps at 500
  items.push(...(firstPage.results ?? []));

  console.log(`    Page 1/${totalPages} (${firstPage.results?.length ?? 0} items)`);

  // Paginate with small delay to be a good API citizen
  for (let page = 2; page <= totalPages; page++) {
    const pageData = await tmdbFetch(`/discover/${mediaType}`, {
      watch_region: "IN",
      with_watch_providers: providerParam,
      sort_by: "popularity.desc",
      page
    });

    const results = pageData.results ?? [];
    items.push(...results);

    if (page % 10 === 0 || page === totalPages) {
      console.log(`    Page ${page}/${totalPages} (total so far: ${items.length})`);
    }

    // ~40 requests/sec limit — be conservative at 100ms between calls
    await sleep(100);
  }

  return items;
}

// ─── Item enrichment ──────────────────────────────────────────────────────────

async function enrichMovieDetails(tmdbId) {
  try {
    const [details, credits, keywords, providers] = await Promise.all([
      tmdbFetch(`/movie/${tmdbId}`, { language: "en-US" }),
      tmdbFetch(`/movie/${tmdbId}/credits`),
      tmdbFetch(`/movie/${tmdbId}/keywords`),
      tmdbFetch(`/movie/${tmdbId}/watch/providers`)
    ]);

    return { details, credits, keywords, providers };
  } catch {
    return null;
  }
}

async function enrichTvDetails(tmdbId) {
  try {
    const [details, credits, keywords, providers] = await Promise.all([
      tmdbFetch(`/tv/${tmdbId}`, { language: "en-US" }),
      tmdbFetch(`/tv/${tmdbId}/credits`),
      tmdbFetch(`/tv/${tmdbId}/keywords`),
      tmdbFetch(`/tv/${tmdbId}/watch/providers`)
    ]);

    return { details, credits, keywords, providers };
  } catch {
    return null;
  }
}

async function enrichWithOmdb(imdbId, title, year) {
  if (!OMDB_KEY) return null;
  if (!imdbId && !title) return null;

  try {
    const url = new URL(OMDB_BASE);
    if (imdbId) {
      url.searchParams.set("i", imdbId);
    } else {
      url.searchParams.set("t", title);
      if (year) url.searchParams.set("y", String(year));
    }
    url.searchParams.set("apikey", OMDB_KEY);

    const res = await fetch(url.toString());
    if (!res.ok) return null;

    const data = await res.json();
    if (data.Response === "False") return null;

    return {
      imdb_rating: parseFloat(data.imdbRating) || null,
      metascore: parseInt(data.Metascore, 10) || null,
      imdb_id: data.imdbID ?? null
    };
  } catch {
    return null;
  }
}

// ─── Embedding builder ────────────────────────────────────────────────────────

const GENRE_IDS = {
  28: "action", 12: "adventure", 16: "animation", 35: "comedy", 80: "crime",
  99: "documentary", 18: "drama", 10751: "family", 14: "fantasy", 36: "history",
  27: "horror", 10402: "music", 9648: "mystery", 10749: "romance",
  878: "sci-fi", 10770: "tv-movie", 53: "thriller", 10752: "war", 37: "western"
};

function buildEmbedding(item, details) {
  const voteAvg = (details?.vote_average ?? 5) / 10;
  const isMovie = item.media_type === "movie" ? 1 : 0;
  const isShow = item.media_type === "tv" ? 1 : 0;
  const langIn = ["hi", "en", "ta", "te", "ml", "kn"].includes(details?.original_language ?? "") ? 1 : 0;
  const popularity = Math.min(1, (details?.popularity ?? 0) / 1000);
  const freshness = (() => {
    const dateStr = details?.release_date ?? details?.first_air_date;
    if (!dateStr) return 0.5;
    const days = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - days / 1825);
  })();

  return [voteAvg, freshness, isMovie, isShow, langIn, popularity];
}

// ─── Normalize to CatalogItem ─────────────────────────────────────────────────

function extractJioHotstarUrl(providers, providerIds) {
  const indiaProviders = providers?.results?.IN;
  if (!indiaProviders) return null;

  const streamList = [
    ...(indiaProviders.flatrate ?? []),
    ...(indiaProviders.free ?? [])
  ];

  const match = streamList.find((p) => providerIds.includes(p.provider_id));
  return match ? `https://www.hotstar.com/in` : null;
}

function normalizeItem(raw, enriched, omdb, mediaType, providerIds) {
  const { details, credits, keywords, providers } = enriched ?? {};

  const genres = (details?.genres ?? []).map((g) => g.name ?? "").filter(Boolean);
  const genreIds = raw.genre_ids ?? [];
  const fallbackGenres = genreIds.map((id) => GENRE_IDS[id]).filter(Boolean);

  const cast = (credits?.cast ?? []).slice(0, 10).map((c) => c.name ?? "").filter(Boolean);
  const crew = credits?.crew ?? [];
  const directors = crew
    .filter((c) => c.job === "Director" || c.job === "Creator")
    .slice(0, 3)
    .map((c) => c.name ?? "")
    .filter(Boolean);

  const keywordList = [
    ...(keywords?.keywords ?? []),
    ...(keywords?.results ?? [])
  ].map((k) => k.name ?? "").filter(Boolean);

  const title = details?.title ?? details?.name ?? raw.title ?? raw.name ?? "";
  const originalTitle = details?.original_title ?? details?.original_name ?? null;
  const releaseDate = details?.release_date ?? details?.first_air_date ?? null;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
  const imdbId = details?.imdb_id ?? omdb?.imdb_id ?? null;
  const voteAverage = details?.vote_average ?? raw.vote_average ?? null;
  const voteCount = details?.vote_count ?? raw.vote_count ?? null;
  const runtime = details?.runtime ?? (details?.episode_run_time?.[0]) ?? null;
  const language = details?.original_language ?? raw.original_language ?? null;
  const overview = details?.overview ?? raw.overview ?? null;
  const posterPath = details?.poster_path ?? raw.poster_path ?? null;

  const jiohotstarUrl = extractJioHotstarUrl(providers, providerIds);
  const tmdbId = raw.id;
  const contentId = `tmdb:${mediaType === "movie" ? "movie" : "show"}:${tmdbId}`;

  const embedding = buildEmbedding(raw, details);

  return {
    content_id: contentId,
    source: "tmdb",
    scraped_at: new Date().toISOString(),
    tmdb_id: tmdbId,
    imdb_id: imdbId,
    jiohotstar_url: jiohotstarUrl,
    title,
    original_title: originalTitle,
    year,
    type: mediaType === "movie" ? "movie" : "show",
    overview,
    poster_path: posterPath,
    language,
    genres: genres.length > 0 ? genres : fallbackGenres,
    keywords: keywordList.slice(0, 20),
    moods: [],
    cast,
    directors,
    vote_average: voteAverage,
    vote_count: voteCount,
    imdb_rating: omdb?.imdb_rating ?? null,
    runtime_minutes: runtime,
    release_date: releaseDate,
    availability_confidence: jiohotstarUrl ? "high" : "medium",
    stream_providers: [],
    embedding
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🎬  Personal JioHotstar Curator — TMDB Catalog Builder\n");

  const providerIds = await discoverJioHotstarProviderIds();

  console.log("\n📦  Fetching movies…");
  const rawMovies = await discoverAllPages("movie", providerIds);

  console.log("\n📺  Fetching TV shows…");
  const rawShows = await discoverAllPages("tv", providerIds);

  // Deduplicate by TMDB ID
  const movieMap = new Map(rawMovies.map((m) => [m.id, { ...m, media_type: "movie" }]));
  const showMap = new Map(rawShows.map((s) => [s.id, { ...s, media_type: "tv" }]));

  const allRaw = [
    ...Array.from(movieMap.values()),
    ...Array.from(showMap.values())
  ];

  console.log(`\n✨  Enriching ${allRaw.length} items (this may take a while)…`);

  const catalog = [];
  let processed = 0;

  for (const raw of allRaw) {
    const mediaType = raw.media_type;

    const enriched = mediaType === "movie"
      ? await enrichMovieDetails(raw.id)
      : await enrichTvDetails(raw.id);

    const imdbId = enriched?.details?.imdb_id ?? null;
    const title = raw.title ?? raw.name ?? "";
    const year = (() => {
      const d = raw.release_date ?? raw.first_air_date;
      return d ? new Date(d).getFullYear() : null;
    })();

    const omdb = await enrichWithOmdb(imdbId, title, year);

    const item = normalizeItem(raw, enriched, omdb, mediaType, providerIds);
    catalog.push(item);

    processed++;
    if (processed % 50 === 0) {
      console.log(`  ${processed}/${allRaw.length} enriched…`);
    }

    // Small delay between enrichment calls
    await sleep(150);
  }

  await mkdir(resolve(process.cwd(), "public", "data", "catalog"), { recursive: true });

  const output = {
    generated_at: new Date().toISOString(),
    catalog_version: CATALOG_VERSION,
    source_url: "https://api.themoviedb.org/3",
    provider_ids: providerIds,
    item_count: catalog.length,
    items: catalog
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

  console.log(`\n✅  Wrote ${catalog.length} items to ${OUTPUT_FILE}`);
  console.log(`    Movies: ${catalog.filter((i) => i.type === "movie").length}`);
  console.log(`    Shows:  ${catalog.filter((i) => i.type === "show").length}`);
}

await main();
