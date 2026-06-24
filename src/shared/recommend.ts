import type {
  CatalogItem,
  ExplorationMode,
  RecommendationOptions,
  RecommendationResult,
  ScoreBreakdown,
  StoredState,
  TasteGraph
} from "./types";
import {
  buildSimpleEmbedding,
  cosineSimilarity,
  freshnessScore,
  normalizeRating
} from "./catalog";
import { tasteGraphScore } from "./taste";

// ─── Exploration mode config ──────────────────────────────────────────────────

const EXPLORATION_RATE: Record<ExplorationMode, number> = {
  comfort: 0.05,
  balanced: 0.15,
  surprise: 0.35
};

// ─── Hard filters ─────────────────────────────────────────────────────────────

export type HardFilterSets = {
  hiddenKeys: Set<string>;
  watchedKeys: Set<string>;
};

/**
 * Build sets of canonical keys for all hidden and watched items.
 * These are used to completely exclude items from recommendations.
 */
export function buildHardFilters(state: StoredState): HardFilterSets {
  const hiddenKeys = new Set<string>();
  const watchedKeys = new Set<string>();

  for (const item of Object.values(state.items)) {
    if (item.state === "hidden") {
      hiddenKeys.add(item.canonicalKey);
      if (item.title) {
        hiddenKeys.add(`title:${item.title.toLowerCase().trim()}`);
      }
    } else if (item.state === "watched") {
      watchedKeys.add(item.canonicalKey);
      if (item.title) {
        watchedKeys.add(`title:${item.title.toLowerCase().trim()}`);
      }
    }
  }

  return { hiddenKeys, watchedKeys };
}

/**
 * Returns true if the catalog item should be completely excluded.
 * Hidden items are always excluded. Watched items are excluded unless
 * rewatch mode is explicitly enabled.
 */
export function isHardFiltered(
  item: CatalogItem,
  filters: HardFilterSets,
  includeWatched = false
): boolean {
  const titleKey = `title:${item.title.toLowerCase().trim()}`;

  if (filters.hiddenKeys.has(titleKey)) return true;

  if (!includeWatched && filters.watchedKeys.has(titleKey)) return true;

  if (item.jiohotstar_url) {
    try {
      const parsed = new URL(item.jiohotstar_url);
      const urlKey = `url:${parsed.pathname.toLowerCase().replace(/\/+$/, "")}`;
      if (filters.hiddenKeys.has(urlKey)) return true;
      if (!includeWatched && filters.watchedKeys.has(urlKey)) return true;
    } catch {
      // ignore malformed URLs
    }
  }

  return false;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Compute novelty: how different this item is from recently watched.
 * Uses inverse genre overlap as a proxy.
 */
function noveltyScore(
  item: CatalogItem,
  recentGenres: Set<string>
): number {
  if (recentGenres.size === 0) return 0.8;
  const overlap = item.genres.filter((g) => recentGenres.has(g.toLowerCase())).length;
  const total = Math.max(item.genres.length, 1);
  // More overlap = less novel
  return 1 - (overlap / total) * 0.7;
}

/**
 * Core scoring function implementing the blueprint weighted formula:
 *
 *   score =
 *     0.35 × embedding_relevance
 *   + 0.20 × taste_graph_match
 *   + 0.15 × quality_signal
 *   + 0.10 × mood_fit
 *   + 0.08 × novelty
 *   + 0.07 × diversity_score
 *   + 0.05 × freshness
 *   - penalties
 */
function scoreItem(
  item: CatalogItem,
  tasteCentroid: number[] | null,
  tasteGraph: TasteGraph,
  recentGenres: Set<string>,
  mood: string | undefined
): ScoreBreakdown {
  // 1. Embedding relevance (cosine similarity to taste centroid)
  let embedding_relevance = 0.5; // neutral default
  const itemEmbedding = item.embedding ?? buildSimpleEmbedding(item);

  if (tasteCentroid && tasteCentroid.length === itemEmbedding.length) {
    const sim = cosineSimilarity(tasteCentroid, itemEmbedding);
    // Map cosine [-1, 1] → [0, 1]
    embedding_relevance = (sim + 1) / 2;
  }

  // 2. Taste graph match
  const taste_graph_match = tasteGraphScore(tasteGraph, item);

  // 3. Quality signal (TMDB vote average)
  const quality_signal = normalizeRating(item.vote_average);

  // 4. Mood fit
  let mood_fit = 0.5; // neutral
  if (mood) {
    const moodLower = mood.toLowerCase();
    const genreMatch = item.genres.some((g) => g.toLowerCase().includes(moodLower));
    const keywordMatch = item.keywords.some((k) => k.toLowerCase().includes(moodLower));
    const moodMatch = item.moods.some((m) => m.toLowerCase().includes(moodLower));
    mood_fit = genreMatch || keywordMatch || moodMatch ? 0.9 : 0.2;
  }

  // 5. Novelty
  const novelty = noveltyScore(item, recentGenres);

  // 6. Diversity score (placeholder — reranking handles the actual diversity cap)
  const diversity_score = 0.6;

  // 7. Freshness
  const freshness = freshnessScore(item.release_date);

  // Penalties
  let penalties = 0;

  // Low confidence availability penalty
  if (item.availability_confidence === "low") {
    penalties += 0.15;
  } else if (item.availability_confidence === "medium") {
    penalties += 0.05;
  }

  // No JioHotstar URL penalty (can't easily play)
  if (!item.jiohotstar_url) {
    penalties += 0.1;
  }

  const raw =
    0.35 * embedding_relevance +
    0.20 * taste_graph_match +
    0.15 * quality_signal +
    0.10 * mood_fit +
    0.08 * novelty +
    0.07 * diversity_score +
    0.05 * freshness -
    penalties;

  const total = Math.min(1, Math.max(0, raw));

  return {
    embedding_relevance,
    taste_graph_match,
    quality_signal,
    mood_fit,
    novelty,
    diversity_score,
    freshness,
    penalties,
    total
  };
}

// ─── Diversity rerank ─────────────────────────────────────────────────────────

/**
 * Enforce diversity rules from the blueprint:
 * - No more than 30% of the feed from the same primary genre
 * - No more than 2 items from the same director per session
 * - No more than 3 items with the same lead actor per session
 */
export function diversityRerank(
  results: RecommendationResult[],
  totalCount: number
): RecommendationResult[] {
  const maxSameGenre = Math.ceil(totalCount * 0.3);
  const maxSameDirector = 2;
  const maxSameActor = 3;

  const genreCounts = new Map<string, number>();
  const directorCounts = new Map<string, number>();
  const actorCounts = new Map<string, number>();

  const final: RecommendationResult[] = [];
  const overflow: RecommendationResult[] = [];

  for (const result of results) {
    const item = result.item;
    const primaryGenre = item.genres[0]?.toLowerCase() ?? "";
    const leadActor = item.cast[0]?.toLowerCase() ?? "";

    const genreCount = genreCounts.get(primaryGenre) ?? 0;
    const actorCount = actorCounts.get(leadActor) ?? 0;
    const directorCap = item.directors.some(
      (d) => (directorCounts.get(d.toLowerCase()) ?? 0) >= maxSameDirector
    );

    if (
      genreCount < maxSameGenre &&
      actorCount < maxSameActor &&
      !directorCap
    ) {
      final.push(result);
      genreCounts.set(primaryGenre, genreCount + 1);
      if (leadActor) actorCounts.set(leadActor, actorCount + 1);
      for (const d of item.directors) {
        const key = d.toLowerCase();
        directorCounts.set(key, (directorCounts.get(key) ?? 0) + 1);
      }
    } else {
      overflow.push(result);
    }
  }

  // Fill remaining slots with overflow items that are best-scored
  const remaining = totalCount - final.length;
  final.push(...overflow.slice(0, remaining));

  return final.slice(0, totalCount);
}

// ─── Main recommendation entry ────────────────────────────────────────────────

/**
 * Full recommendation pipeline:
 *   candidates → hard filters → score → sort → diversity rerank → exploration inject
 */
export function getRecommendations(
  catalog: CatalogItem[],
  state: StoredState,
  tasteGraph: TasteGraph,
  options: RecommendationOptions = { exploration_mode: "balanced" }
): RecommendationResult[] {
  const {
    exploration_mode = "balanced",
    mood,
    max_results = 20,
    include_low_confidence = false
  } = options;

  // Step 1: Hard filters
  const filters = buildHardFilters(state);

  // Collect recent watched genres for novelty scoring
  const recentGenres = new Set<string>();
  for (const storedItem of Object.values(state.items)) {
    if (storedItem.state === "watched") {
      const matched = catalog.find(
        (c) =>
          c.title.toLowerCase().trim() === storedItem.title.toLowerCase().trim()
      );
      if (matched) {
        for (const g of matched.genres) {
          recentGenres.add(g.toLowerCase());
        }
      }
    }
  }

  const tasteCentroid = tasteGraph.taste_centroid;

  // Step 2: Filter + score all candidates
  const scored: RecommendationResult[] = [];
  const exploration: RecommendationResult[] = [];

  for (const item of catalog) {
    if (isHardFiltered(item, filters)) continue;
    if (!include_low_confidence && item.availability_confidence === "low") continue;

    const breakdown = scoreItem(item, tasteCentroid, tasteGraph, recentGenres, mood);

    scored.push({ item, score: breakdown.total, breakdown });
  }

  // Step 3: Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Step 4: Exploration injection
  const explorationRate = EXPLORATION_RATE[exploration_mode];
  const explorationCount = Math.floor(max_results * explorationRate);
  const mainCount = max_results - explorationCount;

  // Main results = top-scored after diversity rerank
  const mainResults = diversityRerank(scored.slice(0, Math.ceil(mainCount * 2)), mainCount);

  // Exploration results = random sample from the bottom half
  const bottomHalf = scored.slice(Math.floor(scored.length / 2));
  if (explorationCount > 0 && bottomHalf.length > 0) {
    // Fisher-Yates shuffle on bottom half
    for (let i = bottomHalf.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bottomHalf[i], bottomHalf[j]] = [bottomHalf[j]!, bottomHalf[i]!];
    }
    exploration.push(...bottomHalf.slice(0, explorationCount));
  }

  // Step 5: Interleave exploration into main results
  const final = [...mainResults];
  if (exploration.length > 0) {
    // Insert exploration items at ~every 5 positions
    const step = Math.floor(mainCount / (explorationCount + 1));
    exploration.forEach((item, idx) => {
      const pos = Math.min((idx + 1) * step, final.length);
      final.splice(pos, 0, item);
    });
  }

  return final.slice(0, max_results);
}
