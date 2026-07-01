/**
 * tmdb-account.ts — TMDB OAuth-style session management & account sync.
 *
 * TMDB Authentication Flow (v3 API):
 *   1. Create a request token          → GET /authentication/token/new
 *   2. User approves token on TMDB     → redirect to tmdb.org/authenticate/{token}
 *   3. Create a session from token     → POST /authentication/session/new
 *   4. Use session_id in subsequent API calls
 *
 * All data flows through the user's own TMDB API key (entered in settings).
 */

import { createLogger } from "./logger";
import { canonicalKeyFromTitle } from "./normalize";
import type { CatalogItem, ItemState } from "./types";

const log = createLogger("tmdb-account");

// ─── Types ────────────────────────────────────────────────────────────────────

export type TmdbSession = {
  apiKey: string;
  sessionId: string;
  accountId: number;
  username: string;
  avatarHash: string | null;
  linkedAt: string;
};

export type TmdbWatchlistItem = {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
  media_type: "movie" | "tv";
  overview: string;
};

export type TmdbRatedItem = TmdbWatchlistItem & {
  rating: number; // user's 0.5–10 rating
};

export type TmdbSyncResult = {
  watchlistImported: number;
  ratingsImported: number;
  errors: string[];
};

// ─── Storage Helpers ──────────────────────────────────────────────────────────

const SESSION_KEY = "curator_tmdb_session";

export function getStoredSession(): TmdbSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as TmdbSession) : null;
  } catch {
    return null;
  }
}

export function storeSession(session: TmdbSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

function getApiKey(): string | null {
  try {
    return localStorage.getItem("curator_tmdb_key");
  } catch {
    return null;
  }
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

const BASE = "https://api.themoviedb.org/3";

async function tmdbGet<T>(path: string, apiKey: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TMDB API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function tmdbPost<T>(path: string, apiKey: string, body: Record<string, unknown>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TMDB API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Authentication Flow ──────────────────────────────────────────────────────

/**
 * Step 1: Create a request token.
 */
export async function createRequestToken(apiKey: string): Promise<string> {
  log.info("Creating TMDB request token");

  const data = await tmdbGet<{ request_token: string; success: boolean }>(
    "/authentication/token/new",
    apiKey
  );

  if (!data.success) throw new Error("Failed to create request token");

  log.info("Request token created", { token: data.request_token.substring(0, 8) + "..." });
  return data.request_token;
}

/**
 * Step 2: Returns the URL the user must visit to approve the token.
 */
export function getApprovalUrl(requestToken: string, callbackUrl?: string): string {
  const base = `https://www.themoviedb.org/authenticate/${requestToken}`;
  return callbackUrl ? `${base}?redirect_to=${encodeURIComponent(callbackUrl)}` : base;
}

/**
 * Step 3: Create a session from an approved token.
 */
export async function createSession(apiKey: string, requestToken: string): Promise<TmdbSession> {
  log.info("Creating TMDB session from approved token");

  const sessionData = await tmdbPost<{ session_id: string; success: boolean }>(
    "/authentication/session/new",
    apiKey,
    { request_token: requestToken }
  );

  if (!sessionData.success) throw new Error("Failed to create session — token may not be approved");

  // Fetch account details
  const account = await tmdbGet<{
    id: number;
    username: string;
    avatar: { gravatar: { hash: string } };
  }>("/account", apiKey, { session_id: sessionData.session_id });

  const session: TmdbSession = {
    apiKey,
    sessionId: sessionData.session_id,
    accountId: account.id,
    username: account.username,
    avatarHash: account.avatar?.gravatar?.hash ?? null,
    linkedAt: new Date().toISOString()
  };

  storeSession(session);
  log.info("Session created successfully", { username: session.username, accountId: session.accountId });
  return session;
}

/**
 * Delete the current session (logout).
 */
export async function deleteSession(): Promise<void> {
  const session = getStoredSession();
  if (!session) return;

  try {
    await tmdbPost("/authentication/session", session.apiKey, {
      session_id: session.sessionId
    });
  } catch {
    // Ignore errors — just clear local session
  }

  clearSession();
  log.info("TMDB session deleted");
}

// ─── Watchlist & Ratings Fetch ────────────────────────────────────────────────

type TmdbListResponse<T> = {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
};

/**
 * Fetch all pages of a paginated TMDB endpoint.
 */
async function fetchAllPages<T>(
  path: string,
  apiKey: string,
  sessionId: string,
  maxPages = 10
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;

  while (page <= maxPages) {
    const data = await tmdbGet<TmdbListResponse<T>>(path, apiKey, {
      session_id: sessionId,
      page: String(page),
      sort_by: "created_at.desc"
    });

    items.push(...data.results);

    if (page >= data.total_pages) break;
    page++;
  }

  return items;
}

/**
 * Fetch the user's TMDB movie watchlist.
 */
export async function fetchWatchlist(session: TmdbSession): Promise<TmdbWatchlistItem[]> {
  log.info("Fetching TMDB watchlist");

  const movies = await fetchAllPages<TmdbWatchlistItem>(
    `/account/${session.accountId}/watchlist/movies`,
    session.apiKey,
    session.sessionId
  );

  const tv = await fetchAllPages<TmdbWatchlistItem>(
    `/account/${session.accountId}/watchlist/tv`,
    session.apiKey,
    session.sessionId
  );

  // Normalize TV items
  const normalized = tv.map((item) => ({
    ...item,
    title: (item as unknown as { name: string }).name ?? item.title,
    release_date: (item as unknown as { first_air_date: string }).first_air_date ?? item.release_date,
    media_type: "tv" as const
  }));

  const all = [...movies.map((m) => ({ ...m, media_type: "movie" as const })), ...normalized];
  log.info(`Fetched ${all.length} watchlist items (${movies.length} movies, ${tv.length} TV)`);
  return all;
}

/**
 * Fetch the user's TMDB rated movies/TV.
 */
export async function fetchRated(session: TmdbSession): Promise<TmdbRatedItem[]> {
  log.info("Fetching TMDB ratings");

  const movies = await fetchAllPages<TmdbRatedItem>(
    `/account/${session.accountId}/rated/movies`,
    session.apiKey,
    session.sessionId
  );

  const tv = await fetchAllPages<TmdbRatedItem>(
    `/account/${session.accountId}/rated/tv`,
    session.apiKey,
    session.sessionId
  );

  const normalized = tv.map((item) => ({
    ...item,
    title: (item as unknown as { name: string }).name ?? item.title,
    release_date: (item as unknown as { first_air_date: string }).first_air_date ?? item.release_date,
    media_type: "tv" as const
  }));

  const all = [...movies.map((m) => ({ ...m, media_type: "movie" as const })), ...normalized];
  log.info(`Fetched ${all.length} rated items (${movies.length} movies, ${tv.length} TV)`);
  return all;
}

// ─── Catalog Matching ─────────────────────────────────────────────────────────

/**
 * Match a TMDB item to the local catalog by tmdb_id or title.
 */
function matchTmdbToCatalog(
  tmdbItem: TmdbWatchlistItem,
  catalog: CatalogItem[]
): CatalogItem | null {
  // Exact tmdb_id match
  const byId = catalog.find((c) => c.tmdb_id === tmdbItem.id);
  if (byId) return byId;

  // Fallback: title match
  const key = canonicalKeyFromTitle(tmdbItem.title);
  const byTitle = catalog.find((c) => canonicalKeyFromTitle(c.title) === key);
  return byTitle ?? null;
}

/**
 * Process watchlist + ratings and return import actions.
 */
export function buildImportActions(
  watchlist: TmdbWatchlistItem[],
  rated: TmdbRatedItem[],
  catalog: CatalogItem[]
): { catalogItem: CatalogItem; targetState: ItemState; source: "watchlist" | "ratings" }[] {
  const actions: { catalogItem: CatalogItem; targetState: ItemState; source: "watchlist" | "ratings" }[] = [];
  const seen = new Set<string>();

  // Rated items → "watched"
  for (const item of rated) {
    const match = matchTmdbToCatalog(item, catalog);
    if (match && !seen.has(match.content_id)) {
      actions.push({ catalogItem: match, targetState: "watched", source: "ratings" });
      seen.add(match.content_id);
    }
  }

  // Watchlist items → "watch_later"
  for (const item of watchlist) {
    const match = matchTmdbToCatalog(item, catalog);
    if (match && !seen.has(match.content_id)) {
      actions.push({ catalogItem: match, targetState: "watch_later", source: "watchlist" });
      seen.add(match.content_id);
    }
  }

  log.info(`Built ${actions.length} import actions from TMDB account`);
  return actions;
}
