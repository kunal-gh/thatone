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
import type {
  CatalogItem,
  ExplorationMode,
  RecommendationResult,
  StoredItem,
  StoredState,
  TasteEdge,
  TasteGraph,
  UserAction
} from "../shared/types";

const TABS = [
  { id: "recommendations", label: "Recommendations" },
  { id: "swipe", label: "Swipe Deck" },
  { id: "manage", label: "Manage" },
  { id: "watch-later", label: "Watch Later" },
  { id: "taste", label: "Taste Graph" },
  { id: "catalog", label: "System Health" }
] as const;

type TabId = (typeof TABS)[number]["id"];

type AppHealth = {
  actionCount: number;
  catalogCount: number;
  dbStatus: "loading" | "ready" | "degraded";
  lastRefreshLabel: string;
};

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

function compactList(values: string[], max = 4): string {
  const visible = values.filter(Boolean).slice(0, max);
  return visible.length > 0 ? visible.join(" / ") : "No tags";
}

function scoreLabel(score: number): string {
  if (score >= 0.75) return "Strong";
  if (score >= 0.55) return "Good";
  return "Exploratory";
}

function edgeMagnitude(edge: TasteEdge): number {
  return Math.min(100, Math.round(Math.abs(edge.weight) * 100));
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

function StatTile({
  label,
  value,
  hint
}: {
  hint?: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-row">
      <span>{label}</span>
      <div className="score-track">
        <div className="score-fill" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <strong>{Math.round(value * 100)}%</strong>
    </div>
  );
}

function HealthStrip({
  actionCount,
  catalogCount,
  dbStatus,
  runtime,
  storageProvider
}: {
  actionCount: number;
  catalogCount: number;
  dbStatus: AppHealth["dbStatus"];
  runtime: string;
  storageProvider: string;
}) {
  const items = [
    { label: "Runtime", value: runtime },
    { label: "Storage", value: storageProvider },
    { label: "Catalog", value: `${catalogCount.toLocaleString()} titles` },
    { label: "Database", value: dbStatus },
    { label: "Action Log", value: actionCount.toLocaleString() },
    { label: "Backend", value: "Not required" }
  ];

  return (
    <div className="health-strip">
      {items.map((item) => (
        <div key={item.label} className="health-chip">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function RecommendationCard({
  onAction,
  result
}: {
  onAction: (item: CatalogItem, state: "hidden" | "watched" | "watch_later") => Promise<void>;
  result: RecommendationResult;
}) {
  const { breakdown, item, score } = result;
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <article className="record-card">
      <div className="record-head">
        <div>
          <h3 className="record-title">{item.title}</h3>
          <p className="record-meta">
            {item.year ?? "Unknown year"} / {item.type.toUpperCase()} / {item.language?.toUpperCase() ?? "NA"}
          </p>
        </div>
        <div className="record-score">
          <strong>{Math.round(score * 100)}%</strong>
          <span>{scoreLabel(score)}</span>
        </div>
      </div>

      <p className="record-summary">
        {item.overview?.slice(0, 220) ?? "No overview available yet."}
      </p>

      <div className="tag-row">
        {item.genres.slice(0, 5).map((genre) => (
          <span key={genre} className="tag">
            {genre}
          </span>
        ))}
      </div>

      <div className="action-row">
        {item.jiohotstar_url ? (
          <a className="button button-solid" href={item.jiohotstar_url} rel="noreferrer" target="_blank">
            OPEN TITLE
          </a>
        ) : null}
        <button className="button" onClick={() => void onAction(item, "watch_later")} type="button">
          LATER
        </button>
        <button className="button" onClick={() => void onAction(item, "watched")} type="button">
          WATCHED
        </button>
        <button className="button" onClick={() => void onAction(item, "hidden")} type="button">
          HIDE
        </button>
        <button className="button button-ghost" onClick={() => setDetailsOpen((value) => !value)} type="button">
          {detailsOpen ? "HIDE SCORE" : "SHOW SCORE"}
        </button>
      </div>

      {detailsOpen ? (
        <div className="detail-panel">
          <ScoreRow label="Embedding" value={breakdown.embedding_relevance} />
          <ScoreRow label="Taste graph" value={breakdown.taste_graph_match} />
          <ScoreRow label="Quality" value={breakdown.quality_signal} />
          <ScoreRow label="Mood" value={breakdown.mood_fit} />
          <ScoreRow label="Novelty" value={breakdown.novelty} />
          <ScoreRow label="Freshness" value={breakdown.freshness} />
          <ScoreRow label="Diversity" value={breakdown.diversity_score} />
          <div className="detail-foot">
            <span>Penalty</span>
            <strong>{Math.round(breakdown.penalties * 100)}%</strong>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function RecommendationsTab({
  catalog,
  onAction,
  state,
  tasteGraph
}: {
  catalog: CatalogItem[];
  onAction: (item: CatalogItem, state: "hidden" | "watched" | "watch_later") => Promise<void>;
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
    <section className="stack">
      <div className="toolbar">
        <div className="button-group">
          {(["comfort", "balanced", "surprise"] as ExplorationMode[]).map((option) => (
            <button
              key={option}
              className={`button ${mode === option ? "button-solid" : ""}`}
              onClick={() => setMode(option)}
              type="button"
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="button-group">
          {(["all", "movie", "show"] as const).map((option) => (
            <button
              key={option}
              className={`button ${contentType === option ? "button-solid" : ""}`}
              onClick={() => setContentType(option)}
              type="button"
            >
              {option === "all" ? "ALL" : option.toUpperCase()}
            </button>
          ))}
        </div>

        <input
          className="text-input"
          onChange={(event) => setMood(event.target.value)}
          placeholder="Mood or theme"
          type="text"
          value={mood}
        />
      </div>

      <div className="section-header">
        <p>
          {results.length} ranked titles from {catalog.length.toLocaleString()} catalog entries.
        </p>
        <p>
          {uniqueItems.filter((item) => item.state === "hidden").length} hidden / {uniqueItems.filter((item) => item.state === "watched").length} watched excluded.
        </p>
      </div>

      {results.length === 0 ? (
        <EmptyState>No recommendations yet. Use Hide or Watched to build a stronger profile.</EmptyState>
      ) : (
        <div className="record-grid">
          {results.map((result) => (
            <RecommendationCard key={result.item.content_id} onAction={onAction} result={result} />
          ))}
        </div>
      )}
    </section>
  );
}

function WatchLaterTab({
  items,
  onMutation
}: {
  items: StoredItem[];
  onMutation: (state: StoredState, tasteGraph: TasteGraph) => Promise<void>;
}) {
  const queue = sortByUpdatedAt(items.filter((item) => item.state === "watch_later"));

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
    return <EmptyState>Nothing is parked in Watch Later yet.</EmptyState>;
  }

  return (
    <div className="record-grid">
      {queue.map((item) => (
        <article key={item.canonicalKey} className="record-card">
          <div className="record-head">
            <div>
              <h3 className="record-title">{item.title}</h3>
              <p className="record-meta">Saved {formatDate(item.updatedAt)}</p>
            </div>
            <span className="tag">QUEUE</span>
          </div>

          <div className="action-row">
            {item.sourceUrl ? (
              <a className="button button-solid" href={item.sourceUrl} rel="noreferrer" target="_blank">
                OPEN TITLE
              </a>
            ) : null}
            <button className="button" onClick={() => void handleWatch(item)} type="button">
              WATCHED
            </button>
            <button className="button" onClick={() => void handleRemove(item)} type="button">
              REMOVE
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

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
  const [cursor, setCursor] = useState(0);
  const [feedback, setFeedback] = useState("");

  const deck = useMemo(
    () =>
      getRecommendations(catalog, state, tasteGraph, {
        exploration_mode: "balanced",
        max_results: 40
      }).map((entry) => entry.item),
    [catalog, state, tasteGraph]
  );

  useEffect(() => {
    setCursor(0);
  }, [deck.length]);

  const current = deck[cursor];

  const act = async (nextState: "hidden" | "watched" | "watch_later", label: string) => {
    if (!current) return;
    const result = await applyCatalogAction(current, nextState, "swipe_deck");
    setFeedback(label);
    await onMutation(result.state, result.tasteGraph);
    setCursor((value) => value + 1);
  };

  const skip = async () => {
    if (!current) return;
    await logUserAction("skipped", current.title, {
      content_id: current.content_id,
      source_url: current.jiohotstar_url,
      context: "swipe_deck"
    });
    setFeedback("Skipped");
    setCursor((value) => value + 1);
  };

  if (!current) {
    return <EmptyState>The deck is empty. Build more profile signals and refresh the recommendations tab.</EmptyState>;
  }

  return (
    <section className="deck-shell">
      <div className="section-header">
        <p>
          Card {cursor + 1} of {deck.length}
        </p>
        <p>{feedback || "Use the deck to train the profile quickly."}</p>
      </div>

      <article className="deck-card">
        <div className="deck-topline">
          <span className="tag">{current.type.toUpperCase()}</span>
          <span className="tag">{current.year ?? "NA"}</span>
          <span className="tag">{current.language?.toUpperCase() ?? "NA"}</span>
        </div>

        <h2 className="deck-title">{current.title}</h2>
        <p className="deck-summary">
          {current.overview?.slice(0, 320) ?? "No overview available yet."}
        </p>

        <div className="tag-row">
          {current.genres.slice(0, 6).map((genre) => (
            <span key={genre} className="tag">
              {genre}
            </span>
          ))}
        </div>

        <div className="deck-info">
          <div>
            <span>Cast</span>
            <strong>{compactList(current.cast)}</strong>
          </div>
          <div>
            <span>Director</span>
            <strong>{compactList(current.directors)}</strong>
          </div>
          <div>
            <span>Rating</span>
            <strong>{current.vote_average?.toFixed(1) ?? "NA"}</strong>
          </div>
        </div>

        <div className="action-row action-row-wide">
          <button className="button" onClick={() => void act("hidden", "Hidden")} type="button">
            HIDE
          </button>
          <button className="button" onClick={() => void skip()} type="button">
            SKIP
          </button>
          <button className="button" onClick={() => void act("watch_later", "Saved for later")} type="button">
            LATER
          </button>
          <button className="button button-solid" onClick={() => void act("watched", "Marked watched")} type="button">
            WATCHED
          </button>
        </div>
      </article>
    </section>
  );
}

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
    return <EmptyState>No taste edges yet. Hide and mark titles as watched to train the profile.</EmptyState>;
  }

  return (
    <section className="stack">
      <div className="section-header">
        <p>{Object.keys(tasteGraph.edges).length} active signals.</p>
        <p>{tasteGraph.centroid_updated_at ? `Centroid updated ${formatDate(tasteGraph.centroid_updated_at)}` : "Centroid not computed yet."}</p>
      </div>

      <div className="matrix-grid">
        {groups.map(([group, edges]) => (
          <article key={group} className="matrix-card">
            <h3>{group.replace(/_/g, " ").toUpperCase()}</h3>
            <div className="matrix-list">
              {edges.slice(0, 12).map((edge) => (
                <div key={edge.node_id} className="matrix-row">
                  <span>{edge.node_id.split(":")[1] ?? edge.node_id}</span>
                  <div className="matrix-track">
                    <div
                      className={`matrix-fill ${edge.weight >= 0 ? "positive" : "negative"}`}
                      style={{ width: `${edgeMagnitude(edge)}%` }}
                    />
                  </div>
                  <strong>{edge.weight.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      {tasteGraph.taste_centroid ? (
        <article className="detail-panel">
          <div className="section-header">
            <p>Embedding centroid</p>
            <p>{tasteGraph.taste_centroid.length} dimensions</p>
          </div>
          <div className="vector-row">
            {tasteGraph.taste_centroid.map((value, index) => (
              <span key={index} className="tag">
                d{index}:{value.toFixed(3)}
              </span>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}

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
      { label: "Catalog titles", value: catalog.length.toLocaleString() },
      { label: "Movies", value: catalog.filter((item) => item.type === "movie").length.toLocaleString() },
      { label: "Shows", value: catalog.filter((item) => item.type === "show").length.toLocaleString() },
      { label: "High confidence", value: catalog.filter((item) => item.availability_confidence === "high").length.toLocaleString() },
      { label: "With URL", value: catalog.filter((item) => Boolean(item.jiohotstar_url)).length.toLocaleString() },
      { label: "With embedding", value: catalog.filter((item) => Array.isArray(item.embedding)).length.toLocaleString() }
    ],
    [catalog]
  );

  return (
    <section className="stack">
      <div className="stat-grid">
        {stats.map((stat) => (
          <StatTile key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <article className="detail-panel">
        <div className="section-header">
          <p>System state</p>
          <p>Last refresh {health.lastRefreshLabel}</p>
        </div>
        <div className="health-grid">
          <StatTile label="Database" value={health.dbStatus} />
          <StatTile label="Action log" value={health.actionCount} />
          <StatTile label="Catalog cache" value={health.catalogCount} />
        </div>
        <div className="action-row">
          <button className="button button-solid" onClick={() => void onResync()} type="button">
            REBUILD LOCAL CATALOG
          </button>
        </div>
      </article>

      <article className="detail-panel">
        <div className="section-header">
          <p>Recent actions</p>
          <p>{recentActions.length} shown</p>
        </div>

        {recentActions.length === 0 ? (
          <EmptyState>No action history yet.</EmptyState>
        ) : (
          <div className="log-list">
            {recentActions.map((action) => (
              <div key={action.action_id} className="log-row">
                <div>
                  <strong>{action.title}</strong>
                  <p>
                    {action.action_type} / {action.context}
                  </p>
                </div>
                <span>{formatDate(action.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

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
    <section className="stack">
      <div className="toolbar">
        <div className="button-group">
          {(["all", "hidden", "watched"] as const).map((option) => (
            <button
              key={option}
              className={`button ${filter === option ? "button-solid" : ""}`}
              onClick={() => setFilter(option)}
              type="button"
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="button-group">
          <button className="button" onClick={exportState} type="button">
            EXPORT
          </button>
          <button className="button button-solid" onClick={() => fileInputRef.current?.click()} type="button">
            IMPORT
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

      {items.length === 0 ? (
        <EmptyState>No items in this filter.</EmptyState>
      ) : (
        <div className="record-grid">
          {items.map((item) => {
            const catalogItem = matchCatalogItem(catalog, item.title, item.sourceUrl);

            return (
              <article key={item.canonicalKey} className="record-card">
                <div className="record-head">
                  <div>
                    <h3 className="record-title">{item.title}</h3>
                    <p className="record-meta">
                      {item.state.toUpperCase()} / {formatDate(item.updatedAt)}
                    </p>
                  </div>
                  <span className="tag">{catalogItem?.type.toUpperCase() ?? "LOCAL"}</span>
                </div>

                <p className="record-summary">
                  {catalogItem?.overview?.slice(0, 180) ?? "This entry is stored locally and may not have a matched catalog record yet."}
                </p>

                <div className="action-row">
                  {item.sourceUrl ? (
                    <a className="button button-solid" href={item.sourceUrl} rel="noreferrer" target="_blank">
                      OPEN TITLE
                    </a>
                  ) : null}
                  <button className="button" onClick={() => void handleRemove(item)} type="button">
                    REMOVE
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

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

  const runtime = getRuntimeMode();
  const storageProvider = getStorageProvider();

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

  useEffect(() => {
    void Promise.all([getStoredState(), getTasteGraph(), refreshSupportData()]).then(
      ([storedState, graph]) => {
        setState(storedState);
        setLocalTasteGraph(graph);
      }
    );

    const unsubscribeState = subscribeToStoredState(setState);
    const unsubscribeTaste = subscribeToTasteGraph(setLocalTasteGraph);

    return () => {
      unsubscribeState();
      unsubscribeTaste();
    };
  }, [refreshSupportData]);

  const uniqueItems = useMemo(() => getUniqueStoredItems(state), [state]);
  const hiddenCount = uniqueItems.filter((item) => item.state === "hidden").length;
  const watchedCount = uniqueItems.filter((item) => item.state === "watched").length;
  const laterCount = uniqueItems.filter((item) => item.state === "watch_later").length;
  const tasteSignals = Object.keys(tasteGraph.edges).length;

  const handleCatalogAction = async (
    item: CatalogItem,
    nextState: "hidden" | "watched" | "watch_later"
  ) => {
    const result = await applyCatalogAction(item, nextState, "recommendations");
    await handleMutation(result.state, result.tasteGraph);
  };

  const handleResync = async () => {
    await db.catalog.clear();
    await syncCatalogToDb();
    await refreshSupportData();
  };

  const tabContent = (() => {
    if (activeTab === "recommendations") {
      return (
        <RecommendationsTab
          catalog={catalog}
          onAction={handleCatalogAction}
          state={state}
          tasteGraph={tasteGraph}
        />
      );
    }

    if (activeTab === "swipe") {
      return (
        <SwipeDeckTab
          catalog={catalog}
          onMutation={handleMutation}
          state={state}
          tasteGraph={tasteGraph}
        />
      );
    }

    if (activeTab === "manage") {
      return (
        <ManageTab
          catalog={catalog}
          onMutation={handleMutation}
          state={state}
          tasteGraph={tasteGraph}
        />
      );
    }

    if (activeTab === "watch-later") {
      return <WatchLaterTab items={uniqueItems} onMutation={handleMutation} />;
    }

    if (activeTab === "taste") {
      return <TasteTab tasteGraph={tasteGraph} />;
    }

    return (
      <CatalogTab
        catalog={catalog}
        health={health}
        onResync={handleResync}
        recentActions={recentActions}
      />
    );
  })();

  return (
    <div className="page-shell">
      <div className="page-frame">
        <header className="hero-block">
          <div className="hero-copy">
            <span className="hero-kicker">LOCAL-FIRST JIOHOTSTAR CURATION</span>
            <h1>FILTER THE FEED.</h1>
            <p>
              Run the full product in the browser now, then load the same build as an extension when you want page-level filtering inside JioHotstar.
            </p>
          </div>

          <div className="hero-actions">
            <button className="button button-solid" onClick={openFullApp} type="button">
              OPEN FULL APP
            </button>
            <a className="button" href="https://www.hotstar.com/in/home" rel="noreferrer" target="_blank">
              OPEN JIOHOTSTAR
            </a>
          </div>

          <div className="stat-grid">
            <StatTile hint="Permanent suppressions" label="Hidden" value={hiddenCount} />
            <StatTile hint="Already consumed" label="Watched" value={watchedCount} />
            <StatTile hint="Queued for later" label="Watch later" value={laterCount} />
            <StatTile hint="Learned profile edges" label="Taste signals" value={tasteSignals} />
          </div>

          <HealthStrip
            actionCount={health.actionCount}
            catalogCount={health.catalogCount}
            dbStatus={health.dbStatus}
            runtime={runtime}
            storageProvider={storageProvider}
          />
        </header>

        <nav className="tabbar" aria-label="Application tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="content-shell">{tabContent}</main>
      </div>
    </div>
  );
}
