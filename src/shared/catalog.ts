import type { CatalogItem, CatalogManifest } from "./types";
import { normalizeTitle } from "./normalize";

import { db } from "./db";

// ─── Catalog syncing & loading ───────────────────────────────────────────────

const CATALOG_URL = typeof chrome !== "undefined" && chrome.runtime?.getURL
  ? chrome.runtime.getURL("/data/catalog/tmdb-jiohotstar-catalog.json")
  : "/data/catalog/tmdb-jiohotstar-catalog.json";

const SEED_URL = typeof chrome !== "undefined" && chrome.runtime?.getURL
  ? chrome.runtime.getURL("/data/catalog/91mobiles-jiohotstar-seed.json")
  : "/data/catalog/91mobiles-jiohotstar-seed.json";

export async function syncCatalogToDb(): Promise<void> {
  // Only sync if DB is empty for now (Phase 2 optimization)
  const count = await db.catalog.count();
  if (count > 0) return;

  try {
    let response = await fetch(CATALOG_URL);
    if (!response.ok) {
      response = await fetch(SEED_URL);
      if (!response.ok) return;
    }

    const manifest = (await response.json()) as CatalogManifest;
    if (Array.isArray(manifest.items) && manifest.items.length > 0) {
      await db.catalog.bulkPut(manifest.items);
      console.log(`Synced ${manifest.items.length} items to Dexie catalog.`);
    }
  } catch (err) {
    console.warn("Failed to sync catalog to DB", err);
  }
}

export async function loadCatalog(): Promise<CatalogItem[]> {
  await syncCatalogToDb();
  return db.catalog.toArray();
}

export function clearCatalogCache(): void {
  // No-op for now, but could clear DB if needed
}

// ─── Catalog lookup ───────────────────────────────────────────────────────────

/**
 * Build a normalized lookup key from a JioHotstar URL path.
 * Strips query params and trailing slashes.
 */
function urlToLookupKey(url: string): string {
  try {
    const parsed = new URL(url, "https://www.hotstar.com");
    return parsed.pathname.toLowerCase().replace(/\/+$/, "");
  } catch {
    return url.toLowerCase().trim();
  }
}

/**
 * Match a catalog item by JioHotstar URL or normalized title.
 * URL match wins over title match (more specific).
 */
export function matchCatalogItem(
  catalog: CatalogItem[],
  title: string,
  url?: string
): CatalogItem | null {
  if (url) {
    const urlKey = urlToLookupKey(url);
    const byUrl = catalog.find((item) => {
      if (!item.jiohotstar_url) return false;
      return urlToLookupKey(item.jiohotstar_url) === urlKey;
    });
    if (byUrl) return byUrl;
  }

  // Normalized title match
  const normalizedInput = normalizeTitle(title);
  const byTitle = catalog.find(
    (item) => normalizeTitle(item.title) === normalizedInput
  );
  if (byTitle) return byTitle;

  // Partial title match fallback (original_title)
  const byOriginal = catalog.find(
    (item) =>
      item.original_title && normalizeTitle(item.original_title) === normalizedInput
  );

  return byOriginal ?? null;
}

export async function matchCatalogItemAsync(
  title: string,
  url?: string
): Promise<CatalogItem | null> {
  await syncCatalogToDb();
  
  if (url) {
    const urlKey = urlToLookupKey(url);
    // Linear scan of URLs is required if we just index jiohotstar_url because we need urlToLookupKey
    // But since dexie is fast, we can use a filter
    const byUrl = await db.catalog.filter((item) => {
      if (!item.jiohotstar_url) return false;
      return urlToLookupKey(item.jiohotstar_url) === urlKey;
    }).first();
    if (byUrl) return byUrl;
  }

  const normalizedInput = normalizeTitle(title);
  
  // Normalized title match
  const byTitle = await db.catalog.filter(
    (item) => normalizeTitle(item.title) === normalizedInput
  ).first();
  if (byTitle) return byTitle;

  // Partial title match fallback
  const byOriginal = await db.catalog.filter(
    (item) => item.original_title ? normalizeTitle(item.original_title) === normalizedInput : false
  ).first();

  return byOriginal ?? null;
}

// ─── Catalog helpers ──────────────────────────────────────────────────────────

/** Convert a TMDB vote_average (0-10) to a 0-1 normalized quality signal */
export function normalizeRating(voteAverage: number | null): number {
  if (voteAverage === null) return 0.5; // neutral if unknown
  return Math.min(1, Math.max(0, voteAverage / 10));
}

/** Compute days since release for freshness scoring */
export function daysSinceRelease(releaseDate: string | null): number | null {
  if (!releaseDate) return null;
  const release = new Date(releaseDate).getTime();
  if (isNaN(release)) return null;
  return (Date.now() - release) / (1000 * 60 * 60 * 24);
}

/** Compute freshness score: 1.0 for new releases, decays over 5 years */
export function freshnessScore(releaseDate: string | null): number {
  const days = daysSinceRelease(releaseDate);
  if (days === null) return 0.4; // neutral
  if (days < 30) return 1.0;
  if (days < 180) return 0.85;
  if (days < 365) return 0.70;
  if (days < 730) return 0.55;
  if (days < 1825) return 0.40;
  return 0.25;
}

/**
 * Build a simple feature vector from a catalog item.
 * Used when precomputed embeddings are not available.
 *
 * Dimensions:
 *  [0]  vote_average normalized (0-1)
 *  [1]  freshness (0-1)
 *  [2]  is_movie (1 or 0)
 *  [3]  is_show (1 or 0)
 *  [4]  language_in (1 if language === "hi" or "en")
 *  [5]  popularity_signal (0-1, clamped at 1000)
 */
export function buildSimpleEmbedding(item: CatalogItem): number[] {
  return [
    normalizeRating(item.vote_average),
    freshnessScore(item.release_date),
    item.type === "movie" ? 1 : 0,
    item.type === "show" ? 1 : 0,
    item.language === "hi" || item.language === "en" ? 1 : 0,
    0.5 // popularity placeholder when no TMDB popularity available
  ];
}

/** Cosine similarity between two equal-length vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
