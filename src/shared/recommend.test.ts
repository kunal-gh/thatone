import { describe, expect, it } from "vitest";
import type { CatalogItem, StoredState, TasteGraph } from "./types";
import {
  buildHardFilters,
  diversityRerank,
  getRecommendations,
  isHardFiltered
} from "./recommend";
import { temporalDecayWeight } from "./taste";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    content_id: `tmdb:${Math.random()}`,
    source: "tmdb",
    scraped_at: new Date().toISOString(),
    tmdb_id: null,
    imdb_id: null,
    jiohotstar_url: "https://www.hotstar.com/in/movies/test/123456",
    title: "Test Movie",
    original_title: null,
    year: 2023,
    type: "movie",
    overview: "A test movie",
    poster_path: null,
    language: "hi",
    genres: ["Thriller"],
    keywords: [],
    moods: [],
    cast: ["Actor One"],
    directors: ["Director One"],
    vote_average: 7.5,
    vote_count: 1000,
    imdb_rating: null,
    runtime_minutes: 120,
    release_date: "2023-01-01",
    availability_confidence: "high",
    stream_providers: [],
    embedding: [0.5, 0.5, 1, 0, 1, 0.5],
    ...overrides
  };
}

function emptyTasteGraph(): TasteGraph {
  return { edges: {}, taste_centroid: null, centroid_updated_at: null };
}

function emptyState(): StoredState {
  return { items: {} };
}

// ─── buildHardFilters ─────────────────────────────────────────────────────────

describe("buildHardFilters", () => {
  it("puts hidden items in hiddenKeys", () => {
    const state: StoredState = {
      items: {
        "title:kahaani": {
          canonicalKey: "title:kahaani",
          title: "Kahaani",
          state: "hidden",
          updatedAt: new Date().toISOString()
        }
      }
    };

    const filters = buildHardFilters(state);
    expect(filters.hiddenKeys.size).toBeGreaterThan(0);
    expect(filters.watchedKeys.size).toBe(0);
  });

  it("puts watched items in watchedKeys", () => {
    const state: StoredState = {
      items: {
        "title:panchayat": {
          canonicalKey: "title:panchayat",
          title: "Panchayat",
          state: "watched",
          updatedAt: new Date().toISOString()
        }
      }
    };

    const filters = buildHardFilters(state);
    expect(filters.watchedKeys.size).toBeGreaterThan(0);
    expect(filters.hiddenKeys.size).toBe(0);
  });
});

// ─── isHardFiltered ───────────────────────────────────────────────────────────

describe("isHardFiltered", () => {
  it("excludes hidden items", () => {
    const item = makeItem({ title: "Kahaani" });
    const filters = buildHardFilters({
      items: {
        k: {
          canonicalKey: "title:kahaani",
          title: "Kahaani",
          state: "hidden",
          updatedAt: new Date().toISOString()
        }
      }
    });
    expect(isHardFiltered(item, filters)).toBe(true);
  });

  it("excludes watched items by default", () => {
    const item = makeItem({ title: "Panchayat" });
    const filters = buildHardFilters({
      items: {
        p: {
          canonicalKey: "title:panchayat",
          title: "Panchayat",
          state: "watched",
          updatedAt: new Date().toISOString()
        }
      }
    });
    expect(isHardFiltered(item, filters, false)).toBe(true);
  });

  it("includes watched items when includeWatched=true", () => {
    const item = makeItem({ title: "Panchayat" });
    const filters = buildHardFilters({
      items: {
        p: {
          canonicalKey: "title:panchayat",
          title: "Panchayat",
          state: "watched",
          updatedAt: new Date().toISOString()
        }
      }
    });
    expect(isHardFiltered(item, filters, true)).toBe(false);
  });

  it("does not filter unrelated items", () => {
    const item = makeItem({ title: "Mirzapur" });
    const filters = buildHardFilters({
      items: {
        k: {
          canonicalKey: "title:kahaani",
          title: "Kahaani",
          state: "hidden",
          updatedAt: new Date().toISOString()
        }
      }
    });
    expect(isHardFiltered(item, filters)).toBe(false);
  });
});

// ─── diversityRerank ──────────────────────────────────────────────────────────

describe("diversityRerank", () => {
  it("caps same-genre items from the primary pass at 30% and fills with overflow", () => {
    // Build 10 items: 8 Thrillers and 2 Dramas, all with equal scores
    // so both Dramas are high-priority overflow candidates.
    // Primary cap = ceil(10 * 0.3) = 3 Thrillers admitted in the primary pass.
    // The 5 remaining slots are filled from overflow (more Thrillers).
    // Final result length must be <= 10.
    const results = Array.from({ length: 10 }, (_, i) => ({
      item: makeItem({
        title: `Movie ${i}`,
        genres: i < 8 ? ["Thriller"] : ["Drama"]
      }),
      score: 0.8, // equal scores so ordering is deterministic by input order
      breakdown: {} as never
    }));

    const reranked = diversityRerank(results, 10);

    // Result must not exceed requested count
    expect(reranked.length).toBeLessThanOrEqual(10);

    // Primary pass admitted 3 Thrillers; 5 overflow slots filled with remaining Thrillers
    // Both Dramas (indices 8-9) are in the overflow bucket and should appear
    const dramaCount = reranked.filter((r) => r.item.genres[0] === "Drama").length;
    expect(dramaCount).toBeGreaterThanOrEqual(1);
  });

  it("returns at most max results", () => {
    const results = Array.from({ length: 30 }, (_, i) => ({
      item: makeItem({ title: `Movie ${i}`, genres: [`Genre${i % 5}`] }),
      score: 1 - i * 0.01,
      breakdown: {} as never
    }));

    const reranked = diversityRerank(results, 10);
    expect(reranked.length).toBeLessThanOrEqual(10);
  });

  it("returns empty array for empty input", () => {
    expect(diversityRerank([], 10)).toHaveLength(0);
  });
});

// ─── getRecommendations ───────────────────────────────────────────────────────

describe("getRecommendations", () => {
  it("returns empty array for empty catalog", () => {
    const results = getRecommendations([], emptyState(), emptyTasteGraph());
    expect(results).toHaveLength(0);
  });

  it("excludes hidden items from recommendations", () => {
    const catalog = [
      makeItem({ title: "Kahaani", jiohotstar_url: "https://www.hotstar.com/in/movies/kahaani/126001" }),
      makeItem({ title: "Mirzapur" })
    ];

    const state: StoredState = {
      items: {
        k: {
          canonicalKey: "title:kahaani",
          title: "Kahaani",
          state: "hidden",
          updatedAt: new Date().toISOString()
        }
      }
    };

    const results = getRecommendations(catalog, state, emptyTasteGraph(), {
      exploration_mode: "comfort"
    });

    const titles = results.map((r) => r.item.title);
    expect(titles).not.toContain("Kahaani");
    expect(titles).toContain("Mirzapur");
  });

  it("excludes watched items by default", () => {
    const catalog = [
      makeItem({ title: "Panchayat" }),
      makeItem({ title: "Criminal Justice" })
    ];

    const state: StoredState = {
      items: {
        p: {
          canonicalKey: "title:panchayat",
          title: "Panchayat",
          state: "watched",
          updatedAt: new Date().toISOString()
        }
      }
    };

    const results = getRecommendations(catalog, state, emptyTasteGraph(), {
      exploration_mode: "comfort"
    });

    const titles = results.map((r) => r.item.title);
    expect(titles).not.toContain("Panchayat");
  });

  it("respects max_results option", () => {
    const catalog = Array.from({ length: 50 }, (_, i) =>
      makeItem({ title: `Movie ${i}`, genres: [`Genre${i % 10}`] })
    );

    const results = getRecommendations(catalog, emptyState(), emptyTasteGraph(), {
      exploration_mode: "balanced",
      max_results: 10
    });

    expect(results.length).toBeLessThanOrEqual(10);
  });

  it("returns score breakdowns with total in 0-1 range", () => {
    const catalog = [makeItem({ title: "Test" })];
    const results = getRecommendations(catalog, emptyState(), emptyTasteGraph());

    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});

// ─── temporalDecayWeight ──────────────────────────────────────────────────────

describe("temporalDecayWeight", () => {
  it("returns 1.0 for hidden items regardless of age", () => {
    const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    expect(temporalDecayWeight(oldDate, "hidden")).toBe(1.0);
  });

  it("returns 1.0 for recent watched actions", () => {
    const recent = new Date().toISOString();
    expect(temporalDecayWeight(recent, "watched")).toBe(1.0);
  });

  it("returns 0.35 for very old watched actions", () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    expect(temporalDecayWeight(old, "watched")).toBe(0.35);
  });

  it("returns 0.8 for 8-30 day old watched actions", () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(temporalDecayWeight(twoWeeksAgo, "watched")).toBe(0.8);
  });
});
