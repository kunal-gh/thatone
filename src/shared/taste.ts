import type {
  CatalogItem,
  ItemState,
  TasteEdge,
  TasteGraph,
  TasteNodeType
} from "./types";

// ─── Temporal decay ───────────────────────────────────────────────────────────

/**
 * Returns a decay multiplier based on how old the action is.
 * Permanent blocks (hidden) do not decay — only watched/liked actions do.
 */
export function temporalDecayWeight(updatedAt: string, state: ItemState): number {
  if (state === "hidden") {
    // Blocks are permanent — no decay
    return 1.0;
  }

  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= 7) return 1.0;
  if (ageDays <= 30) return 0.8;
  if (ageDays <= 180) return 0.55;
  return 0.35;
}

// ─── Taste graph management ───────────────────────────────────────────────────

function edgeKey(nodeType: TasteNodeType, value: string): string {
  const safe = value.toLowerCase().trim().replace(/\s+/g, "-");
  return `${nodeType}:${safe}`;
}

function updateEdge(
  graph: TasteGraph,
  nodeType: TasteNodeType,
  value: string,
  delta: number,
  updatedAt: string
): void {
  if (!value.trim()) return;

  const key = edgeKey(nodeType, value);
  const existing = graph.edges[key];

  if (existing) {
    existing.weight = Math.max(-1, Math.min(1, existing.weight + delta));
    existing.updated_at = updatedAt;
    existing.action_count += 1;
  } else {
    const edge: TasteEdge = {
      node_type: nodeType,
      node_id: key,
      weight: Math.max(-1, Math.min(1, delta)),
      updated_at: updatedAt,
      action_count: 1
    };
    graph.edges[key] = edge;
  }
}

/**
 * Update the taste graph after a user action.
 *
 * "watched" → mild positive signal for genres, actors, directors, language
 * "hidden"  → negative signal (strong block)
 */
export function updateTasteGraph(
  graph: TasteGraph,
  action: ItemState,
  item: CatalogItem
): TasteGraph {
  const updated = structuredClone(graph);
  const now = new Date().toISOString();

  // Positive: watched = +0.15 per attribute, hidden = -0.3 per attribute
  const genreDelta = action === "watched" ? 0.15 : -0.3;
  const actorDelta = action === "watched" ? 0.1 : -0.2;
  const directorDelta = action === "watched" ? 0.12 : -0.25;
  const langDelta = action === "watched" ? 0.08 : -0.1;
  const typeDelta = action === "watched" ? 0.08 : -0.1;

  for (const genre of item.genres) {
    updateEdge(updated, "genre", genre, genreDelta, now);
  }

  for (const actor of item.cast.slice(0, 5)) {
    // Only top 5 cast to avoid diluting signal
    updateEdge(updated, "actor", actor, actorDelta, now);
  }

  for (const director of item.directors) {
    updateEdge(updated, "director", director, directorDelta, now);
  }

  if (item.language) {
    updateEdge(updated, "language", item.language, langDelta, now);
  }

  updateEdge(updated, "content_type", item.type, typeDelta, now);

  if (item.release_date) {
    const year = new Date(item.release_date).getFullYear();
    const decade = `${Math.floor(year / 10) * 10}s`;
    updateEdge(updated, "decade", decade, action === "watched" ? 0.06 : -0.08, now);
  }

  return updated;
}

/** Get the taste graph edge weight for a specific node, defaulting to 0 */
export function getEdgeWeight(graph: TasteGraph, nodeType: TasteNodeType, value: string): number {
  const key = edgeKey(nodeType, value);
  return graph.edges[key]?.weight ?? 0;
}

/**
 * Compute taste graph match score for a catalog item.
 * Averages genre + cast + director + language signals, weighted by action_count.
 * Returns 0-1 clamped.
 */
export function tasteGraphScore(graph: TasteGraph, item: CatalogItem): number {
  const signals: number[] = [];

  for (const genre of item.genres) {
    signals.push(getEdgeWeight(graph, "genre", genre));
  }

  for (const actor of item.cast.slice(0, 5)) {
    signals.push(getEdgeWeight(graph, "actor", actor) * 0.8); // slightly less than genre
  }

  for (const director of item.directors) {
    signals.push(getEdgeWeight(graph, "director", director) * 1.2); // directors matter more
  }

  if (item.language) {
    signals.push(getEdgeWeight(graph, "language", item.language) * 0.6);
  }

  if (signals.length === 0) return 0.5; // neutral when no data

  const avg = signals.reduce((s, v) => s + v, 0) / signals.length;

  // Map from [-1, 1] → [0, 1]
  return Math.min(1, Math.max(0, (avg + 1) / 2));
}

/**
 * Compute the taste centroid: average feature vector of all watched items.
 * Returns null if no watched items have embeddings.
 */
export function computeTasteCentroid(
  watchedItems: CatalogItem[]
): number[] | null {
  const embeddings = watchedItems
    .map((item) => item.embedding)
    .filter((e): e is number[] => e !== null && e.length > 0);

  if (embeddings.length === 0) return null;

  const dim = embeddings[0]!.length;
  const centroid = new Array<number>(dim).fill(0);

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] = (centroid[i] ?? 0) + (emb[i] ?? 0);
    }
  }

  for (let i = 0; i < dim; i++) {
    centroid[i] = (centroid[i] ?? 0) / embeddings.length;
  }

  return centroid;
}

export function emptyTasteGraph(): TasteGraph {
  return {
    edges: {},
    taste_centroid: null,
    centroid_updated_at: null
  };
}
