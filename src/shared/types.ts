// ─── Extension state types ────────────────────────────────────────────────────

export type ItemState = "hidden" | "watched" | "watch_later";

export type StoredItem = {
  canonicalKey: string;
  title: string;
  sourceUrl?: string;
  state: ItemState;
  updatedAt: string;
};

export type StoredState = {
  items: Record<string, StoredItem>;
};

// ─── User action log types ────────────────────────────────────────────────────

export type UserActionType =
  | "hide"
  | "watched"
  | "watch_later"
  | "unhide"
  | "unwatched"
  | "remove_watch_later"
  | "like"
  | "dislike"
  | "skipped";

export type ActionContext = "homepage" | "search" | "detail" | "swipe_deck" | "manage_app" | "recommendations";

export type UserAction = {
  action_id: string;
  content_id: string | null;
  title: string;
  source_url: string | null;
  action_type: UserActionType;
  context: ActionContext;
  created_at: string;
};

export type CandidateCard = {
  canonicalKey: string;
  title: string;
  url?: string;
  element: HTMLElement;
};

// ─── Catalog types ────────────────────────────────────────────────────────────

export type CatalogItemType = "movie" | "show" | "episode" | "special";

export type AvailabilityConfidence = "high" | "medium" | "low";

export type StreamProvider = {
  provider: string;
  url: string | null;
};

export type TmdbMeta = {
  id: number | null;
  media_type: string | null;
  popularity: number | null;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  vote_count: number | null;
  overview: string | null;
  original_language: string | null;
  origin_country: string[] | null;
  genre_ids: number[] | null;
};

export type CatalogItem = {
  content_id: string;           // internal stable ID: "tmdb:{id}" or "title:{key}"
  source: "tmdb" | "91mobiles" | "omdb" | "manual";
  scraped_at: string;

  // Identification
  tmdb_id: number | null;
  imdb_id: string | null;
  jiohotstar_url: string | null;

  // Display
  title: string;
  original_title: string | null;
  year: number | null;
  type: CatalogItemType;
  overview: string | null;
  poster_path: string | null;

  // Matching features
  language: string | null;
  genres: string[];
  keywords: string[];
  moods: string[];
  cast: string[];
  directors: string[];

  // Quality signals
  vote_average: number | null;
  vote_count: number | null;
  imdb_rating: number | null;
  runtime_minutes: number | null;

  // Freshness
  release_date: string | null;

  // Availability
  availability_confidence: AvailabilityConfidence;
  stream_providers: StreamProvider[];

  // Recommendation features (computed at catalog build time)
  embedding: number[] | null;   // precomputed simple feature vector
};

export type CatalogManifest = {
  generated_at: string;
  catalog_version: string;
  source_url: string;
  item_count: number;
  items: CatalogItem[];
};

// ─── Taste graph types ────────────────────────────────────────────────────────

export type TasteNodeType =
  | "actor"
  | "director"
  | "genre"
  | "language"
  | "mood"
  | "franchise"
  | "theme"
  | "runtime_bucket"    // "short" | "medium" | "long"
  | "decade"            // "2020s" | "2010s" etc.
  | "content_type";     // "movie" | "show"

export type TasteEdge = {
  node_type: TasteNodeType;
  node_id: string;      // e.g. "actor:vidya-balan", "genre:thriller"
  weight: number;       // positive = liked, negative = disliked
  updated_at: string;
  action_count: number; // how many actions contributed to this weight
};

export type TasteGraph = {
  edges: Record<string, TasteEdge>; // keyed by node_id
  taste_centroid: number[] | null;  // average embedding of liked items
  centroid_updated_at: string | null;
};

// ─── Recommendation types ─────────────────────────────────────────────────────

export type ExplorationMode = "comfort" | "balanced" | "surprise";

export type ScoreBreakdown = {
  embedding_relevance: number;
  taste_graph_match: number;
  quality_signal: number;
  mood_fit: number;
  novelty: number;
  diversity_score: number;
  freshness: number;
  penalties: number;
  total: number;
};

export type RecommendationResult = {
  item: CatalogItem;
  score: number;
  breakdown: ScoreBreakdown;
};

export type RecommendationOptions = {
  exploration_mode: ExplorationMode;
  mood?: string;
  max_results?: number;
  include_low_confidence?: boolean;
};
