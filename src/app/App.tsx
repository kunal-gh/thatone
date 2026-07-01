import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadCatalog, matchCatalogItem, syncCatalogToDb } from "../shared/catalog";
import {
  applyCatalogAction,
  applyStoredAction,
  removeStoredSelection,
  syncTasteGraphFromState
} from "../shared/curation";
import { db } from "../shared/db";
import { getRecommendations } from "../shared/recommend";
import { getAppUrl, getRuntimeMode, getStorageProvider } from "../shared/runtime";
import {
  getActionCount,
  getRecentActions,
  getStoredState,
  getTasteGraph,
  getUniqueStoredItems,
  logUserAction,
  setStoredState,
  subscribeToStoredState,
  subscribeToTasteGraph
} from "../shared/storage";
import { emptyTasteGraph } from "../shared/taste";
import { PosterCard, PosterCardActions } from "../components/PosterCard";
import { SwipeDeck } from "../components/SwipeDeck";
import type {
  CatalogItem,
  ExplorationMode,
  ItemState,
  RecommendationResult,
  StoredItem,
  StoredState,
  TasteEdge,
  TasteGraph,
  UserAction
} from "../shared/types";

// ─── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "recommendations", label: "Discover", icon: "✦" },
  { id: "swipe", label: "Swipe", icon: "◈" },
  { id: "watch-later", label: "Watchlist", icon: "▸" },
  { id: "manage", label: "Library", icon: "▣" },
  { id: "taste", label: "Profile", icon: "◎" },
  { id: "catalog", label: "System", icon: "⚙" }
] as const;

type TabId = (typeof TABS)[number]["id"];

type AppHealth = {
  actionCount: number;
  catalogCount: number;
  dbStatus: "loading" | "ready" | "degraded";
  lastRefreshLabel: string;
};

type PageBridgeState = {
  activeTabLabel: string;
  status: "connected" | "disconnected" | "not-applicable" | "loading";
  details: string;
};

// ─── Utility helpers ───────────────────────────────────────────────────────────

function sortByUpdatedAt(items: StoredItem[]): StoredItem[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "never";
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return dateStr;
  }
}

function edgeMagnitude(edge: TasteEdge): number {
  return Math.min(100, Math.round(Math.abs(edge.weight) * 100));
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function EmptyState({ children, icon = "🎬" }: { children: React.ReactNode; icon?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <p className="empty-state__text">{children}</p>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  hint,
  variant
}: {
  label: string;
  value: string | number;
  icon?: string;
  hint?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className={`stat-tile ${variant ? `stat-tile--${variant}` : ""}`}>
      {icon && <span className="stat-tile__icon">{icon}</span>}
      <strong className="stat-tile__value">{value}</strong>
      <span className="stat-tile__label">{label}</span>
      {hint && <span className="stat-tile__hint">{hint}</span>}
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="score-row">
      <span className="score-row__label">{label}</span>
      <div className="score-row__track">
        <div
          className="score-row__fill"
          style={{
            width: `${pct}%`,
            background: pct > 70 ? "var(--success)" : pct > 40 ? "var(--accent)" : "var(--text-muted)"
          }}
        />
      </div>
      <strong className="score-row__value">{pct}%</strong>
    </div>
  );
}

function HealthStrip({
  actionCount,
  catalogCount,
  dbStatus,
  pageBridge,
  runtime,
  storageProvider
}: {
  actionCount: number;
  catalogCount: number;
  dbStatus: AppHealth["dbStatus"];
  pageBridge: PageBridgeState;
  runtime: string;
  storageProvider: string;
}) {
  const items = [
    { label: "Runtime", value: runtime, status: "ok" as const },
    { label: "Storage", value: storageProvider, status: "ok" as const },
    { label: "Catalog", value: `${catalogCount.toLocaleString()}`, status: catalogCount > 0 ? "ok" as const : "warn" as const },
    { label: "Database", value: dbStatus, status: dbStatus === "ready" ? "ok" as const : "warn" as const },
    { label: "Bridge", value: pageBridge.status, status: pageBridge.status === "connected" ? "ok" as const : "off" as const },
    { label: "Actions", value: actionCount.toLocaleString(), status: "ok" as const }
  ];

  return (
    <div className="health-strip">
      {items.map((item) => (
        <div key={item.label} className={`health-chip health-chip--${item.status}`}>
          <span className="health-chip__dot" />
          <span className="health-chip__label">{item.label}</span>
          <strong className="health-chip__value">{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

// ─── Recommendations Tab ───────────────────────────────────────────────────────

function RecommendationsTab({
  catalog,
  onAction,
  state,
  tasteGraph
}: {
  catalog: CatalogItem[];
  onAction: (item: CatalogItem, state: ItemState) => Promise<void>;
  state: StoredState;
  tasteGraph: TasteGraph;
}) {
  const [mode, setMode] = useState<ExplorationMode>("balanced");
  const [mood, setMood] = useState("");
  const [contentType, setContentType] = useState<"all" | "movie" | "show">("all");
  const uniqueItems = useMemo(() => getUniqueStoredItems(state), [state]);

  const results = useMemo(() => {
    const scopedCatalog =
      contentType === "all" ? catalog : catalog.filter((item) => item.type === contentType);

    return getRecommendations(scopedCatalog, state, tasteGraph, {
      exploration_mode: mode,
      max_results: 24,
      mood: mood.trim() || undefined
    });
  }, [catalog, contentType, mode, mood, state, tasteGraph]);

  return (
    <section className="tab-content animate-fadeIn">
      {/* Filters toolbar */}
      <div className="toolbar">
        <div className="toolbar__group">
          {(["comfort", "balanced", "surprise"] as ExplorationMode[]).map((option) => (
            <button
              key={option}
              className={`btn ${mode === option ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setMode(option)}
              type="button"
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>

        <div className="toolbar__group">
          {(["all", "movie", "show"] as const).map((option) => (
            <button
              key={option}
              className={`btn ${contentType === option ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setContentType(option)}
              type="button"
            >
              {option === "all" ? "All" : option === "movie" ? "Movies" : "Shows"}
            </button>
          ))}
        </div>

        <input
          className="text-input"
          onChange={(event) => setMood(event.target.value)}
          placeholder="Search by mood or theme..."
          type="text"
          value={mood}
        />
      </div>

      {/* Stats summary */}
      <div className="section-meta">
        <span>{results.length} titles</span>
        <span className="section-meta__divider">·</span>
        <span>{uniqueItems.filter((i) => i.state === "hidden").length} hidden</span>
        <span className="section-meta__divider">·</span>
        <span>{uniqueItems.filter((i) => i.state === "watched").length} watched</span>
      </div>

      {results.length === 0 ? (
        <EmptyState icon="🎯">
          No recommendations yet. Use Hide or Watched on JioHotstar to build your taste profile.
        </EmptyState>
      ) : (
        <div className="poster-grid">
          {results.map((result) => (
            <RecommendationPosterCard
              key={result.item.content_id}
              onAction={onAction}
              result={result}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RecommendationPosterCard({
  onAction,
  result
}: {
  onAction: (item: CatalogItem, state: ItemState) => Promise<void>;
  result: RecommendationResult;
}) {
  const { item, score, breakdown } = result;
  const [showDetails, setShowDetails] = useState(false);
  const scorePercent = Math.round(score * 100);

  return (
    <div className="poster-card-wrap">
      <PosterCard
        item={item}
        score={scorePercent}
        actions={
          <PosterCardActions
            onOpen={item.jiohotstar_url ? () => window.open(item.jiohotstar_url!, "_blank") : undefined}
            onLater={() => void onAction(item, "watch_later")}
            onWatched={() => void onAction(item, "watched")}
            onHide={() => void onAction(item, "hidden")}
          />
        }
      />
      <button
        className="btn btn-ghost btn-xs poster-detail-toggle"
        onClick={() => setShowDetails((v) => !v)}
        type="button"
      >
        {showDetails ? "Hide Score" : "Score Details"}
      </button>
      {showDetails && (
        <div className="detail-panel animate-fadeIn">
          <ScoreRow label="Embedding" value={breakdown.embedding_relevance} />
          <ScoreRow label="Taste Graph" value={breakdown.taste_graph_match} />
          <ScoreRow label="Quality" value={breakdown.quality_signal} />
          <ScoreRow label="Mood" value={breakdown.mood_fit} />
          <ScoreRow label="Novelty" value={breakdown.novelty} />
          <ScoreRow label="Freshness" value={breakdown.freshness} />
          <ScoreRow label="Diversity" value={breakdown.diversity_score} />
          <div className="detail-panel__footer">
            <span>Penalty</span>
            <strong>{Math.round(breakdown.penalties * 100)}%</strong>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Swipe Deck Tab ────────────────────────────────────────────────────────────

function SwipeDeckTab({
  catalog,
  onMutation,
  state,
  tasteGraph
}: {
  catalog: CatalogItem[];
  onMutation: (state: StoredState, tasteGraph: TasteGraph) => Promise<void>;
  state: StoredState;
  tasteGraph: TasteGraph;
}) {
  const deck = useMemo(
    () =>
      getRecommendations(catalog, state, tasteGraph, {
        exploration_mode: "balanced",
        max_results: 40
      }).map((entry) => entry.item),
    [catalog, state, tasteGraph]
  );

  const handleAction = useCallback(async (item: CatalogItem, action: ItemState) => {
    const result = await applyCatalogAction(item, action, "swipe_deck");
    await onMutation(result.state, result.tasteGraph);
  }, [onMutation]);

  const handleSkip = useCallback(async (item: CatalogItem) => {
    await logUserAction("skipped", item.title, {
      content_id: item.content_id,
      source_url: item.jiohotstar_url,
      context: "swipe_deck"
    });
  }, []);

  return (
    <section className="tab-content animate-fadeIn">
      <SwipeDeck items={deck} onAction={handleAction} onSkip={handleSkip} />
    </section>
  );
}

// ─── Watch Later Tab ───────────────────────────────────────────────────────────

function WatchLaterTab({
  catalog,
  items,
  onMutation
}: {
  catalog: CatalogItem[];
  items: StoredItem[];
  onMutation: (state: StoredState, tasteGraph: TasteGraph) => Promise<void>;
}) {
  const [sortBy, setSortBy] = useState<"date" | "title">("date");
  const queue = useMemo(() => {
    const filtered = items.filter((item) => item.state === "watch_later");
    if (sortBy === "title") return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    return sortByUpdatedAt(filtered);
  }, [items, sortBy]);

  const handleWatch = async (item: StoredItem) => {
    const result = await applyStoredAction(
      { sourceUrl: item.sourceUrl, title: item.title },
      "watched",
      "manage_app"
    );
    await onMutation(result.state, result.tasteGraph);
  };

  const handleRemove = async (item: StoredItem) => {
    const result = await removeStoredSelection(item, "manage_app");
    await onMutation(result.state, result.tasteGraph);
  };

  if (queue.length === 0) {
    return (
      <section className="tab-content animate-fadeIn">
        <EmptyState icon="📋">
          Your watchlist is empty. Save movies and shows for later from the Discover tab or from JioHotstar.
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="tab-content animate-fadeIn">
      <div className="toolbar">
        <h2 className="toolbar__title">Watchlist <span className="toolbar__count">{queue.length}</span></h2>
        <div className="toolbar__group">
          <button className={`btn ${sortBy === "date" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSortBy("date")} type="button">
            Recent
          </button>
          <button className={`btn ${sortBy === "title" ? "btn-primary" : "btn-ghost"}`} onClick={() => setSortBy("title")} type="button">
            A–Z
          </button>
        </div>
      </div>

      <div className="poster-grid">
        {queue.map((item) => {
          const catalogItem = matchCatalogItem(catalog, item.title, item.sourceUrl);
          if (catalogItem) {
            return (
              <PosterCard
                key={item.canonicalKey}
                item={catalogItem}
                actions={
                  <PosterCardActions
                    onOpen={item.sourceUrl ? () => window.open(item.sourceUrl!, "_blank") : undefined}
                    onWatched={() => void handleWatch(item)}
                    onHide={() => void handleRemove(item)}
                    showOpen={Boolean(item.sourceUrl)}
                  />
                }
              />
            );
          }

          // Fallback for items without catalog match
          return (
            <div key={item.canonicalKey} className="poster-card poster-card--text-only">
              <div className="poster-card__fallback">
                <span className="poster-card__fallback-icon">🎬</span>
                <span className="poster-card__fallback-title">{item.title}</span>
              </div>
              <div className="poster-card__info">
                <h3 className="poster-card__title">{item.title}</h3>
                <div className="poster-card__meta">
                  <span>Saved {relativeTime(item.updatedAt)}</span>
                </div>
              </div>
              <div className="poster-card__actions poster-card__actions--visible">
                <PosterCardActions
                  onOpen={item.sourceUrl ? () => window.open(item.sourceUrl!, "_blank") : undefined}
                  onWatched={() => void handleWatch(item)}
                  onHide={() => void handleRemove(item)}
                  showOpen={Boolean(item.sourceUrl)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Manage Tab ────────────────────────────────────────────────────────────────

function ManageTab({
  catalog,
  onMutation,
  state,
  tasteGraph
}: {
  catalog: CatalogItem[];
  onMutation: (state: StoredState, tasteGraph: TasteGraph) => Promise<void>;
  state: StoredState;
  tasteGraph: TasteGraph;
}) {
  const [filter, setFilter] = useState<"all" | "hidden" | "watched">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const filtered = getUniqueStoredItems(state).filter((item) => item.state !== "watch_later");
    return sortByUpdatedAt(
      filtered.filter((item) => (filter === "all" ? true : item.state === filter))
    );
  }, [filter, state]);

  const exportState = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      state,
      tasteGraph,
      version: 3
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `curator-backup-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importState = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const parsed = JSON.parse(await file.text()) as { state?: StoredState };
    if (!parsed.state?.items) {
      throw new Error("Invalid backup payload.");
    }

    await setStoredState(parsed.state);
    const recomputedGraph = await syncTasteGraphFromState(parsed.state);
    await onMutation(parsed.state, recomputedGraph);
    event.target.value = "";
  };

  const handleRemove = async (item: StoredItem) => {
    const result = await removeStoredSelection(item, "manage_app");
    await onMutation(result.state, result.tasteGraph);
  };

  return (
    <section className="tab-content animate-fadeIn">
      <div className="toolbar">
        <div className="toolbar__group">
          {(["all", "hidden", "watched"] as const).map((option) => (
            <button
              key={option}
              className={`btn ${filter === option ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setFilter(option)}
              type="button"
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>

        <div className="toolbar__group">
          <button className="btn btn-ghost" onClick={exportState} type="button">
            ↓ Export
          </button>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} type="button">
            ↑ Import
          </button>
          <input
            accept="application/json"
            hidden
            onChange={(event) => void importState(event)}
            ref={fileInputRef}
            type="file"
          />
        </div>
      </div>

      <div className="section-meta">
        <span>{items.length} items</span>
      </div>

      {items.length === 0 ? (
        <EmptyState icon="📦">No items in this filter.</EmptyState>
      ) : (
        <div className="poster-grid poster-grid--compact">
          {items.map((item) => {
            const catalogItem = matchCatalogItem(catalog, item.title, item.sourceUrl);

            if (catalogItem) {
              return (
                <PosterCard
                  key={item.canonicalKey}
                  item={catalogItem}
                  compact
                  className={`poster-card--${item.state}`}
                  actions={
                    <PosterCardActions
                      onOpen={item.sourceUrl ? () => window.open(item.sourceUrl!, "_blank") : undefined}
                      onHide={() => void handleRemove(item)}
                      showOpen={Boolean(item.sourceUrl)}
                    />
                  }
                />
              );
            }

            return (
              <div key={item.canonicalKey} className="poster-card poster-card--text-only poster-card--compact">
                <div className="poster-card__fallback">
                  <span className="poster-card__fallback-icon">🎬</span>
                  <span className="poster-card__fallback-title">{item.title}</span>
                </div>
                <div className="poster-card__info">
                  <h3 className="poster-card__title">{item.title}</h3>
                  <div className="poster-card__meta">
                    <span>{item.state.toUpperCase()}</span>
                    <span>{relativeTime(item.updatedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Taste Profile Tab ─────────────────────────────────────────────────────────

function TasteTab({ tasteGraph }: { tasteGraph: TasteGraph }) {
  const grouped = useMemo(() => {
    const entries = Object.values(tasteGraph.edges).sort(
      (left, right) => Math.abs(right.weight) - Math.abs(left.weight)
    );

    return entries.reduce<Record<string, TasteEdge[]>>((accumulator, edge) => {
      const key = edge.node_type;
      accumulator[key] ??= [];
      accumulator[key].push(edge);
      return accumulator;
    }, {});
  }, [tasteGraph]);

  const groups = Object.entries(grouped);

  if (groups.length === 0) {
    return (
      <section className="tab-content animate-fadeIn">
        <EmptyState icon="◎">
          No taste signals yet. Hide and mark titles as watched to train your profile.
        </EmptyState>
      </section>
    );
  }

  const groupIcons: Record<string, string> = {
    genre: "🎭",
    actor: "🎬",
    director: "🎥",
    language: "🌐",
    keyword: "🔑"
  };

  return (
    <section className="tab-content animate-fadeIn">
      <div className="section-meta">
        <span>{Object.keys(tasteGraph.edges).length} active signals</span>
        <span className="section-meta__divider">·</span>
        <span>
          {tasteGraph.centroid_updated_at
            ? `Updated ${relativeTime(tasteGraph.centroid_updated_at)}`
            : "Centroid not computed"}
        </span>
      </div>

      <div className="taste-grid">
        {groups.map(([group, edges]) => (
          <article key={group} className="taste-group">
            <h3 className="taste-group__title">
              <span>{groupIcons[group] ?? "📊"}</span>
              {group.replace(/_/g, " ")}
            </h3>
            <div className="taste-group__list">
              {edges.slice(0, 12).map((edge) => (
                <div key={edge.node_id} className="taste-bar">
                  <span className="taste-bar__label">
                    {edge.node_id.split(":")[1] ?? edge.node_id}
                  </span>
                  <div className="taste-bar__track">
                    <div
                      className={`taste-bar__fill ${edge.weight >= 0 ? "taste-bar__fill--positive" : "taste-bar__fill--negative"}`}
                      style={{ width: `${edgeMagnitude(edge)}%` }}
                    />
                  </div>
                  <strong className="taste-bar__value">
                    {edge.weight > 0 ? "+" : ""}{edge.weight.toFixed(2)}
                  </strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      {tasteGraph.taste_centroid && (
        <article className="glass-panel">
          <h3 className="glass-panel__title">Embedding Centroid</h3>
          <p className="glass-panel__subtitle">{tasteGraph.taste_centroid.length} dimensions</p>
          <div className="centroid-chips">
            {tasteGraph.taste_centroid.map((value, index) => (
              <span key={index} className="genre-tag genre-tag--mono">
                d{index}: {value.toFixed(3)}
              </span>
            ))}
          </div>
        </article>
      )}
    </section>
  );
}

// ─── System Health Tab ─────────────────────────────────────────────────────────

function CatalogTab({
  catalog,
  health,
  onResync,
  recentActions
}: {
  catalog: CatalogItem[];
  health: AppHealth;
  onResync: () => Promise<void>;
  recentActions: UserAction[];
}) {
  const stats = useMemo(
    () => [
      { label: "Total Titles", value: catalog.length.toLocaleString(), icon: "📀", variant: "info" as const },
      { label: "Movies", value: catalog.filter((i) => i.type === "movie").length.toLocaleString(), icon: "🎬" },
      { label: "Shows", value: catalog.filter((i) => i.type === "show").length.toLocaleString(), icon: "📺" },
      { label: "High Confidence", value: catalog.filter((i) => i.availability_confidence === "high").length.toLocaleString(), icon: "✓", variant: "success" as const },
      { label: "With URL", value: catalog.filter((i) => Boolean(i.jiohotstar_url)).length.toLocaleString(), icon: "🔗" },
      { label: "With Embedding", value: catalog.filter((i) => Array.isArray(i.embedding)).length.toLocaleString(), icon: "🧬" }
    ],
    [catalog]
  );

  return (
    <section className="tab-content animate-fadeIn">
      {/* Stats grid */}
      <div className="stat-grid">
        {stats.map((stat) => (
          <StatTile key={stat.label} {...stat} />
        ))}
      </div>

      {/* System state */}
      <article className="glass-panel">
        <div className="glass-panel__header">
          <h3 className="glass-panel__title">System State</h3>
          <span className="glass-panel__subtitle">Last refresh {health.lastRefreshLabel}</span>
        </div>
        <div className="stat-grid stat-grid--compact">
          <StatTile label="Database" value={health.dbStatus} icon="💾" variant={health.dbStatus === "ready" ? "success" : "warning"} />
          <StatTile label="Action Log" value={health.actionCount} icon="📝" />
          <StatTile label="Catalog Cache" value={health.catalogCount} icon="📦" />
        </div>
        <div className="glass-panel__actions">
          <button className="btn btn-primary" onClick={() => void onResync()} type="button">
            Rebuild Local Catalog
          </button>
        </div>
      </article>

      {/* Recent actions */}
      <article className="glass-panel">
        <div className="glass-panel__header">
          <h3 className="glass-panel__title">Recent Actions</h3>
          <span className="glass-panel__subtitle">{recentActions.length} shown</span>
        </div>

        {recentActions.length === 0 ? (
          <EmptyState icon="📋">No action history yet.</EmptyState>
        ) : (
          <div className="action-log">
            {recentActions.map((action) => (
              <div key={action.action_id} className="action-log__row">
                <div className="action-log__info">
                  <strong>{action.title}</strong>
                  <span className="action-log__meta">{action.action_type} · {action.context}</span>
                </div>
                <span className="action-log__time">{relativeTime(action.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("recommendations");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [health, setHealth] = useState<AppHealth>({
    actionCount: 0,
    catalogCount: 0,
    dbStatus: "loading",
    lastRefreshLabel: "starting"
  });
  const [recentActions, setRecentActions] = useState<UserAction[]>([]);
  const [state, setState] = useState<StoredState>({ items: {} });
  const [tasteGraph, setLocalTasteGraph] = useState<TasteGraph>(emptyTasteGraph());
  const [pageBridge, setPageBridge] = useState<PageBridgeState>({
    activeTabLabel: "none",
    status: "loading",
    details: "loading"
  });

  const runtime = getRuntimeMode();
  const storageProvider = getStorageProvider();

  // ─── Page bridge probe ─────────────────────────────────────────────────

  const refreshPageBridge = useCallback(async () => {
    if (runtime !== "extension" || typeof chrome === "undefined" || !chrome.tabs?.query || !chrome.tabs?.sendMessage) {
      setPageBridge({
        activeTabLabel: "web runtime",
        status: "not-applicable",
        details: "not-applicable"
      });
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabLabel = tab?.url ? new URL(tab.url).host : "no active tab";
      const tabId = tab?.id;

      if (typeof tabId !== "number") {
        setPageBridge({ activeTabLabel: tabLabel, status: "disconnected", details: "no active tab" });
        return;
      }

      const response = await new Promise<{
        cards: number; connected: boolean; controls: number; hidden: number; url: string;
      } | null>((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: "CURATOR_PAGE_PING" }, (value: unknown) => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve((value as { cards: number; connected: boolean; controls: number; hidden: number; url: string }) ?? null);
        });
      });

      if (!response) {
        setPageBridge({ activeTabLabel: tabLabel, status: "disconnected", details: "no content script" });
        return;
      }

      setPageBridge({
        activeTabLabel: tabLabel,
        status: response.connected ? "connected" : "disconnected",
        details: `${response.cards} cards · ${response.controls} controls`
      });
    } catch {
      setPageBridge({ activeTabLabel: "unknown", status: "disconnected", details: "bridge error" });
    }
  }, [runtime]);

  const openFullApp = useCallback(() => {
    const url = getAppUrl();
    if (runtime === "extension" && typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [runtime]);

  const refreshSupportData = useCallback(async () => {
    try {
      const [catalogItems, actionCount, recent] = await Promise.all([
        loadCatalog(),
        getActionCount(),
        getRecentActions(12)
      ]);

      setCatalog(catalogItems);
      setRecentActions(recent);
      setHealth({
        actionCount,
        catalogCount: catalogItems.length,
        dbStatus: "ready",
        lastRefreshLabel: new Date().toLocaleTimeString()
      });
    } catch {
      setHealth((current) => ({
        ...current,
        dbStatus: "degraded",
        lastRefreshLabel: new Date().toLocaleTimeString()
      }));
    }
  }, []);

  const handleMutation = useCallback(
    async (nextState: StoredState, nextGraph: TasteGraph) => {
      setState(nextState);
      setLocalTasteGraph(nextGraph);
      await refreshSupportData();
    },
    [refreshSupportData]
  );

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  useEffect(() => {
    void Promise.all([getStoredState(), getTasteGraph(), refreshSupportData()]).then(
      ([storedState, graph]) => {
        setState(storedState);
        setLocalTasteGraph(graph);
      }
    );

    void refreshPageBridge();
    const bridgeTimer = window.setInterval(() => void refreshPageBridge(), 4000);

    const unsubscribeState = subscribeToStoredState(setState);
    const unsubscribeTaste = subscribeToTasteGraph(setLocalTasteGraph);

    return () => {
      window.clearInterval(bridgeTimer);
      unsubscribeState();
      unsubscribeTaste();
    };
  }, [refreshPageBridge, refreshSupportData]);

  // ─── Derived state ────────────────────────────────────────────────────

  const uniqueItems = useMemo(() => getUniqueStoredItems(state), [state]);
  const hiddenCount = uniqueItems.filter((i) => i.state === "hidden").length;
  const watchedCount = uniqueItems.filter((i) => i.state === "watched").length;
  const laterCount = uniqueItems.filter((i) => i.state === "watch_later").length;
  const tasteSignals = Object.keys(tasteGraph.edges).length;

  const handleCatalogAction = async (
    item: CatalogItem,
    nextState: ItemState
  ) => {
    const result = await applyCatalogAction(item, nextState, "recommendations");
    await handleMutation(result.state, result.tasteGraph);
  };

  const handleResync = async () => {
    await db.catalog.clear();
    await syncCatalogToDb();
    await refreshSupportData();
  };

  // ─── Tab content ──────────────────────────────────────────────────────

  const tabContent = (() => {
    switch (activeTab) {
      case "recommendations":
        return <RecommendationsTab catalog={catalog} onAction={handleCatalogAction} state={state} tasteGraph={tasteGraph} />;
      case "swipe":
        return <SwipeDeckTab catalog={catalog} onMutation={handleMutation} state={state} tasteGraph={tasteGraph} />;
      case "watch-later":
        return <WatchLaterTab catalog={catalog} items={uniqueItems} onMutation={handleMutation} />;
      case "manage":
        return <ManageTab catalog={catalog} onMutation={handleMutation} state={state} tasteGraph={tasteGraph} />;
      case "taste":
        return <TasteTab tasteGraph={tasteGraph} />;
      case "catalog":
        return <CatalogTab catalog={catalog} health={health} onResync={handleResync} recentActions={recentActions} />;
    }
  })();

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      {/* Hero header */}
      <header className="app-hero">
        <div className="app-hero__content">
          <span className="app-hero__kicker">JioHotstar Curator</span>
          <h1 className="app-hero__title">
            <span className="gradient-text">Filter the feed.</span>
          </h1>
          <p className="app-hero__desc">
            AI-powered recommendations. Hide what you've seen. Discover what you'll love.
          </p>

          <div className="app-hero__actions">
            <button className="btn btn-primary btn-lg" onClick={openFullApp} type="button">
              Open Full App
            </button>
            <a className="btn btn-ghost btn-lg" href="https://www.hotstar.com/in/home" rel="noreferrer" target="_blank">
              Open JioHotstar
            </a>
          </div>
        </div>

        {/* Quick stats */}
        <div className="hero-stats">
          <StatTile icon="👁" label="Hidden" value={hiddenCount} hint="Permanent" variant="danger" />
          <StatTile icon="✓" label="Watched" value={watchedCount} hint="Consumed" variant="success" />
          <StatTile icon="+" label="Watchlist" value={laterCount} hint="Queued" variant="info" />
          <StatTile icon="◎" label="Signals" value={tasteSignals} hint="Profile" variant="warning" />
        </div>

        <HealthStrip
          actionCount={health.actionCount}
          catalogCount={health.catalogCount}
          dbStatus={health.dbStatus}
          pageBridge={pageBridge}
          runtime={runtime}
          storageProvider={storageProvider}
        />
      </header>

      {/* Tab navigation */}
      <nav className="tab-bar" aria-label="Application tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-bar__btn ${activeTab === tab.id ? "tab-bar__btn--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            <span className="tab-bar__icon">{tab.icon}</span>
            <span className="tab-bar__label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <main className="app-content">{tabContent}</main>
    </div>
  );
}
