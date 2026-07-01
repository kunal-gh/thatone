/**
 * imdb-import.ts — Parse IMDb CSV exports and match against the local catalog.
 *
 * IMDb export format (ratings.csv):
 *   Const,Your Rating,Date Rated,Title,URL,Title Type,IMDb Rating,
 *   Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
 *
 * IMDb watchlist export (watchlist.csv):
 *   Position,Const,Created,Modified,Description,Title,URL,Title Type,
 *   IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
 */

import { canonicalKeyFromTitle } from "./normalize";
import type { CatalogItem, ItemState } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImdbRecord = {
  imdbId: string;           // e.g. "tt1234567"
  title: string;
  year: number | null;
  titleType: string;        // "movie", "tvSeries", "tvMiniSeries", "short", etc.
  imdbRating: number | null;
  userRating: number | null; // only present in ratings.csv
  genres: string[];
  directors: string[];
  runtimeMins: number | null;
  url: string;
};

export type ImdbImportResult = {
  /** Total records parsed from CSV */
  totalParsed: number;
  /** Records successfully matched to local catalog */
  matched: { record: ImdbRecord; catalogItem: CatalogItem; targetState: ItemState }[];
  /** Records that could not be matched */
  unmatched: ImdbRecord[];
  /** Parsing errors */
  errors: string[];
};

export type ImportMode = "ratings" | "watchlist";

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Robust CSV parser that handles quoted fields, embedded commas, and newlines.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

function parseCSV(csvText: string): { headers: string[]; rows: string[][] } {
  // Normalize line endings
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Filter out empty lines
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 2) return { headers: [], rows: [] };

  const headers = parseCSVLine(nonEmpty[0]).map((h) => h.toLowerCase().trim());
  const rows = nonEmpty.slice(1).map(parseCSVLine);

  return { headers, rows };
}

/**
 * Detect whether CSV is ratings or watchlist format.
 */
function detectImportMode(headers: string[]): ImportMode {
  // Ratings CSV has "Your Rating" column
  if (headers.some((h) => h.includes("your rating"))) return "ratings";
  // Watchlist CSV has "Position" column
  if (headers.some((h) => h.includes("position"))) return "watchlist";
  // Default to ratings
  return "ratings";
}

function findColumn(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parse the raw CSV text into structured ImdbRecord objects.
 */
export function parseImdbCSV(csvText: string): { records: ImdbRecord[]; mode: ImportMode; errors: string[] } {
  const { headers, rows } = parseCSV(csvText);
  const errors: string[] = [];

  if (headers.length === 0) {
    return { records: [], mode: "ratings", errors: ["Empty or invalid CSV file"] };
  }

  const mode = detectImportMode(headers);

  // Column indices
  const idxConst      = findColumn(headers, "const");
  const idxTitle      = findColumn(headers, "title");
  const idxYear       = findColumn(headers, "year");
  const idxType       = findColumn(headers, "title type");
  const idxImdbRating = findColumn(headers, "imdb rating");
  const idxUserRating = findColumn(headers, "your rating");
  const idxGenres     = findColumn(headers, "genres");
  const idxDirectors  = findColumn(headers, "directors");
  const idxRuntime    = findColumn(headers, "runtime");
  const idxUrl        = findColumn(headers, "url");

  if (idxTitle < 0) {
    return { records: [], mode, errors: ["CSV is missing required 'Title' column"] };
  }

  const records: ImdbRecord[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue; // skip malformed rows

    try {
      const title = row[idxTitle] ?? "";
      if (!title) continue;

      const record: ImdbRecord = {
        imdbId:      idxConst >= 0 ? row[idxConst] ?? "" : "",
        title,
        year:        idxYear >= 0 ? parseInt(row[idxYear]) || null : null,
        titleType:   idxType >= 0 ? (row[idxType] ?? "").toLowerCase() : "movie",
        imdbRating:  idxImdbRating >= 0 ? parseFloat(row[idxImdbRating]) || null : null,
        userRating:  idxUserRating >= 0 ? parseFloat(row[idxUserRating]) || null : null,
        genres:      idxGenres >= 0 ? (row[idxGenres] ?? "").split(",").map((g) => g.trim()).filter(Boolean) : [],
        directors:   idxDirectors >= 0 ? (row[idxDirectors] ?? "").split(",").map((d) => d.trim()).filter(Boolean) : [],
        runtimeMins: idxRuntime >= 0 ? parseInt(row[idxRuntime]) || null : null,
        url:         idxUrl >= 0 ? row[idxUrl] ?? "" : `https://www.imdb.com/title/${row[idxConst] ?? ""}/`
      };

      records.push(record);
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : "parse error"}`);
    }
  }

  return { records, mode, errors };
}

// ─── Catalog Matching ─────────────────────────────────────────────────────────

/**
 * Score how well an IMDb record matches a catalog item (0-100).
 * Uses imdb_id exact match, title+year fuzzy match, and title-only fallback.
 */
function matchScore(record: ImdbRecord, item: CatalogItem): number {
  // Exact IMDb ID match — perfect score
  if (record.imdbId && item.imdb_id && record.imdbId === item.imdb_id) return 100;

  // Exact TMDB → IMDb cross-reference
  if (record.imdbId && item.imdb_id && record.imdbId === item.imdb_id) return 100;

  // Title normalization
  const rKey = canonicalKeyFromTitle(record.title);
  const iKey = canonicalKeyFromTitle(item.title);
  const origKey = item.original_title ? canonicalKeyFromTitle(item.original_title) : null;

  // Title + year exact match
  if ((rKey === iKey || rKey === origKey) && record.year && item.year && record.year === item.year) return 90;

  // Title exact match, year close (±1 year)
  if ((rKey === iKey || rKey === origKey) && record.year && item.year && Math.abs(record.year - item.year) <= 1) return 80;

  // Title exact match, no year info
  if (rKey === iKey || rKey === origKey) return 60;

  // Substring match (for titles like "The Movie" vs "Movie, The")
  if (rKey.includes(iKey) || iKey.includes(rKey)) {
    if (record.year && item.year && Math.abs(record.year - item.year) <= 1) return 55;
    return 40;
  }

  return 0;
}

/**
 * Match IMDb records against the local catalog.
 * Returns matched and unmatched lists.
 */
export function matchImdbRecords(
  records: ImdbRecord[],
  catalog: CatalogItem[],
  mode: ImportMode
): ImdbImportResult {
  const matched: ImdbImportResult["matched"] = [];
  const unmatched: ImdbRecord[] = [];

  // Build a fast lookup by imdb_id
  const imdbIndex = new Map<string, CatalogItem>();
  for (const item of catalog) {
    if (item.imdb_id) imdbIndex.set(item.imdb_id, item);
  }

  for (const record of records) {
    let bestMatch: CatalogItem | null = null;
    let bestScore = 0;

    // Fast path: IMDb ID match
    if (record.imdbId && imdbIndex.has(record.imdbId)) {
      bestMatch = imdbIndex.get(record.imdbId)!;
      bestScore = 100;
    } else {
      // Fuzzy match against full catalog
      for (const item of catalog) {
        const score = matchScore(record, item);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }
    }

    if (bestMatch && bestScore >= 40) {
      // Determine target state based on import mode
      let targetState: ItemState;
      if (mode === "ratings") {
        // IMDb ratings = things user has watched
        targetState = "watched";
      } else {
        // IMDb watchlist = things user wants to watch
        targetState = "watch_later";
      }

      matched.push({ record, catalogItem: bestMatch, targetState });
    } else {
      unmatched.push(record);
    }
  }

  return {
    totalParsed: records.length,
    matched,
    unmatched,
    errors: []
  };
}

/**
 * Full pipeline: parse CSV text → match against catalog → return results.
 */
export function processImdbImport(csvText: string, catalog: CatalogItem[]): ImdbImportResult {
  const { records, mode, errors } = parseImdbCSV(csvText);

  if (records.length === 0) {
    return { totalParsed: 0, matched: [], unmatched: [], errors };
  }

  const result = matchImdbRecords(records, catalog, mode);
  result.errors.push(...errors);
  return result;
}
