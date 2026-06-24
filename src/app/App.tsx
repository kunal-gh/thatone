import { ChangeEvent, useEffect, useRef, useState, useCallback } from "react";
import {
  getStoredState,
  getTasteGraph,
  removeStoredItem,
  setStoredState,
  subscribeToStoredState,
  subscribeToTasteGraph,
  logUserAction,
  getRecentActions,
  getActionCount
} from "../shared/storage";
import { loadCatalog, matchCatalogItem, syncCatalogToDb } from "../shared/catalog";
import { getRecommendations } from "../shared/recommend";
import { updateTasteGraph, emptyTasteGraph } from "../shared/taste";
import { db } from "../shared/db";
import type {
  CatalogItem,
  ExplorationMode,
  RecommendationResult,
  StoredItem,
  StoredState,
  TasteGraph,
  UserAction
} from "../shared/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortByUpdatedAt(items: StoredItem[]): StoredItem[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const TABS = ["Manage", "Watch Later", "Swipe", "Recommendations", "Taste", "Catalog"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, string> = {
  "Manage": "⚙️",
  "Watch Later": "🕐",
  "Swipe": "🃏",
  "Recommendations": "⭐",
  "Taste": "🎭",
  "Catalog": "📊"
};

// ─── ScoreBar ─────────────────────────────────────────────────────────────────

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = pct > 70 ? "#14532d" : pct > 40 ? "#92400e" : "#7f1d1d";
  const bg = pct > 70 ? "#c6e8d5" : pct > 40 ? "#fef3c7" : "#fee2e2";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 38px", gap: 6, alignItems: "center", fontSize: 11 }}>
      <span style={{ color: "#52606d" }}>{label}</span>
      <div style={{ height: 5, borderRadius: 99, background: "rgba(31,41,51,0.08)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${color},${bg})`, borderRadius: 99, transition: "width 0.4s" }} />
      </div>
      <span style={{ color, textAlign: "right", fontWeight: 700 }}>{pct}%</span>
    </div>
  );
}

// ─── RecommendCard ────────────────────────────────────────────────────────────

function RecommendCard({
  result,
  onHide,
  onWatched,
  onWatchLater
}: {
  result: RecommendationResult;
  onHide: (item: CatalogItem) => void;
  onWatched: (item: CatalogItem) => void;
  onWatchLater: (item: CatalogItem) => void;
}) {
  const [showDebug, setShowDebug] = useState(false);
  const { item, score, breakdown } = result;

  return (
    <div className="list-item" style={{ gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <strong>{item.title}</strong>
          {item.year && <span style={{ color: "#52606d", marginLeft: 8, fontSize: 12 }}>{item.year}</span>}
          {item.vote_average && (
            <span style={{ color: "#f5c518", marginLeft: 8, fontSize: 11, fontWeight: 700 }}>★ {item.vote_average.toFixed(1)}</span>
          )}
        </div>
        <span style={{
          padding: "3px 10px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          background: score > 0.7 ? "#c6e8d5" : score > 0.5 ? "#fef3c7" : "#fee2e2",
          color: score > 0.7 ? "#14532d" : score > 0.5 ? "#92400e" : "#7f1d1d",
          flexShrink: 0
        }}>
          {Math.round(score * 100)}%
        </span>
      </div>

      {item.genres.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {item.genres.slice(0, 5).map((g) => (
            <span key={g} className="badge" style={{ fontSize: 10 }}>{g}</span>
          ))}
          {item.language && (
            <span className="badge" style={{ fontSize: 10, background: "rgba(30,64,175,0.1)", color: "#1e40af" }}>
              {item.language.toUpperCase()}
            </span>
          )}
        </div>
      )}

      {item.overview && (
        <p style={{ margin: 0, fontSize: 12, color: "#52606d", lineHeight: 1.5 }}>
          {item.overview.slice(0, 160)}{item.overview.length > 160 ? "…" : ""}
        </p>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {item.jiohotstar_url && (
          <a href={item.jiohotstar_url} target="_blank" rel="noopener noreferrer" className="button" style={{ padding: "5px 12px", fontSize: 11, textDecoration: "none" }}>
            Watch ↗
          </a>
        )}
        <button className="button secondary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => onWatchLater(item)}>
          + Later
        </button>
        <button className="button secondary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => onWatched(item)}>
          Watched
        </button>
        <button className="button secondary" style={{ padding: "5px 12px", fontSize: 11, color: "#7f1d1d" }} onClick={() => onHide(item)}>
          Hide
        </button>
        <button
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, color: "#52606d", padding: "5px 4px" }}
          onClick={() => setShowDebug((v) => !v)}
        >
          {showDebug ? "▾ scores" : "▸ scores"}
        </button>
      </div>

      {showDebug && (
        <div style={{ display: "grid", gap: 5, marginTop: 4, padding: "10px 12px", background: "rgba(31,41,51,0.04)", borderRadius: 8 }}>
          <ScoreBar label="Embedding match" value={breakdown.embedding_relevance} />
          <ScoreBar label="Taste graph" value={breakdown.taste_graph_match} />
          <ScoreBar label="Quality signal" value={breakdown.quality_signal} />
          <ScoreBar label="Mood fit" value={breakdown.mood_fit} />
          <ScoreBar label="Novelty" value={breakdown.novelty} />
          <ScoreBar label="Freshness" value={breakdown.freshness} />
          {breakdown.penalties > 0 && (
            <div style={{ fontSize: 11, color: "#7f1d1d", marginTop: 2 }}>
              Penalties: −{Math.round(breakdown.penalties * 100)}%
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Recommendations ─────────────────────────────────────────────────────

function RecommendationsTab({
  state,
  tasteGraph,
  onStateChange
}: {
  state: StoredState;
  tasteGraph: TasteGraph;
  onStateChange: () => void;
}) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [results, setResults] = useState<RecommendationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ExplorationMode>("balanced");
  const [mood, setMood] = useState("");
  const [contentType, setContentType] = useState<"all" | "movie" | "show">("all");

  useEffect(() => {
    setLoading(true);
    loadCatalog()
      .then((c) => { setCatalog(c); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    const filtered = contentType === "all" ? catalog : catalog.filter(c => c.type === contentType);
    const recs = getRecommendations(filtered, state, tasteGraph, {
      exploration_mode: mode,
      mood: mood.trim() || undefined,
      max_results: 25
    });
    setResults(recs);
  }, [catalog, state, tasteGraph, mode, mood, loading, contentType]);

  const handleAction = async (item: CatalogItem, action: "hidden" | "watched" | "watch_later") => {
    const key = `title:${item.title.toLowerCase().replace(/\s+/g, "-")}`;
    const { upsertStoredItem } = await import("../shared/storage");
    await upsertStoredItem(key, item.title, action, item.jiohotstar_url ?? undefined);
    void logUserAction(action === "hidden" ? "hide" : action, item.title, {
      content_id: item.content_id,
      context: "recommendations"
    });
    onStateChange();
  };

  if (loading) return <div className="empty" style={{ padding: 48, textAlign: "center" }}>Loading catalog…</div>;

  if (catalog.length === 0) {
    return (
      <div className="empty">
        <p>No catalog loaded yet.</p>
        <p style={{ fontSize: 13, color: "#52606d" }}>
          Run <code>npm run catalog:tmdb</code> to generate the full catalog, then rebuild the extension.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#52606d" }}>Mode:</span>
        {(["comfort", "balanced", "surprise"] as ExplorationMode[]).map((m) => (
          <button key={m} className={`button${mode === m ? "" : " secondary"}`} style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => setMode(m)}>
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
        <span style={{ fontSize: 12, color: "#52606d", marginLeft: 4 }}>Type:</span>
        {(["all", "movie", "show"] as const).map((t) => (
          <button key={t} className={`button${contentType === t ? "" : " secondary"}`} style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => setContentType(t)}>
            {t === "all" ? "All" : t === "movie" ? "Movies" : "Shows"}
          </button>
        ))}
        <input
          type="text"
          placeholder="Mood (e.g. thriller, comedy, romance)…"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          style={{ border: "1px solid rgba(31,41,51,0.15)", borderRadius: 999, padding: "5px 14px", fontSize: 12, fontFamily: "inherit", flexGrow: 1, minWidth: 200, outline: "none" }}
        />
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "#52606d" }}>
        {results.length} recommendations · {catalog.length} catalog titles
        {Object.values(state.items).length > 0 && ` · ${Object.values(state.items).filter(i => i.state === "hidden").length} hidden, ${Object.values(state.items).filter(i => i.state === "watched").length} watched excluded`}
      </p>

      {results.length === 0 ? (
        <div className="empty">No recommendations yet. Browse JioHotstar and use the Hide/Watched buttons to build your taste profile.</div>
      ) : (
        <div className="list">
          {results.map((r) => (
            <RecommendCard
              key={r.item.content_id}
              result={r}
              onHide={(item) => void handleAction(item, "hidden")}
              onWatched={(item) => void handleAction(item, "watched")}
              onWatchLater={(item) => void handleAction(item, "watch_later")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Watch Later ─────────────────────────────────────────────────────────

function WatchLaterTab({ state, onStateChange }: { state: StoredState; onStateChange: () => void }) {
  const items = sortByUpdatedAt(Object.values(state.items).filter(i => i.state === "watch_later"));

  const handleRemove = async (item: StoredItem) => {
    await removeStoredItem(item.canonicalKey);
    void logUserAction("remove_watch_later", item.title, { context: "manage_app" });
    onStateChange();
  };

  const handleMarkWatched = async (item: StoredItem) => {
    const { upsertStoredItem } = await import("../shared/storage");
    await upsertStoredItem(item.canonicalKey, item.title, "watched", item.sourceUrl);
    void logUserAction("watched", item.title, { context: "manage_app" });
    onStateChange();
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#52606d" }}>{items.length} title{items.length !== 1 ? "s" : ""} saved for later</p>
      {items.length === 0 ? (
        <div className="empty">Nothing saved yet. Use the "Later" button on JioHotstar cards or in recommendations.</div>
      ) : (
        <div className="list">
          {items.map((item) => (
            <div className="list-item" key={item.canonicalKey}>
              <strong>{item.title}</strong>
              {item.sourceUrl && (
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#1d4ed8" }}>
                  Open on JioHotstar ↗
                </a>
              )}
              <div className="muted" style={{ fontSize: 11 }}>{new Date(item.updatedAt).toLocaleString()}</div>
              <div className="action-row" style={{ marginTop: 6 }}>
                <button className="button" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => void handleMarkWatched(item)}>Mark watched</button>
                <button className="button secondary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => void handleRemove(item)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Swipe Deck ──────────────────────────────────────────────────────────

function SwipeDeckTab({ state, tasteGraph, onStateChange }: { state: StoredState; tasteGraph: TasteGraph; onStateChange: () => void }) {
  const [deck, setDeck] = useState<CatalogItem[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog()
      .then((catalog) => {
        // Get unseen, unblocked items, sorted by score
        const recs = getRecommendations(catalog, state, tasteGraph, {
          exploration_mode: "balanced",
          max_results: 50
        });
        setDeck(recs.map(r => r.item));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const current = deck[index];

  const doAction = async (action: "hidden" | "watched" | "watch_later", label: string) => {
    if (!current) return;
    const key = `title:${current.title.toLowerCase().replace(/\s+/g, "-")}`;
    const { upsertStoredItem } = await import("../shared/storage");
    await upsertStoredItem(key, current.title, action, current.jiohotstar_url ?? undefined);
    void logUserAction(action === "hidden" ? "hide" : action, current.title, {
      content_id: current.content_id,
      context: "swipe_deck"
    });
    setActionFeedback(label);
    setTimeout(() => {
      setActionFeedback(null);
      setIndex((i) => i + 1);
    }, 600);
    onStateChange();
  };

  const skip = () => {
    void logUserAction("skipped", current?.title ?? "", { context: "swipe_deck" });
    setIndex((i) => i + 1);
  };

  if (loading) return <div className="empty" style={{ padding: 48, textAlign: "center" }}>Loading deck…</div>;
  if (!current || index >= deck.length) {
    return <div className="empty" style={{ padding: 48, textAlign: "center" }}>
      <p style={{ fontSize: 20 }}>🎉</p>
      <p>You've gone through the whole deck! Browse JioHotstar to get more suggestions, or switch to another tab.</p>
      <button className="button" style={{ marginTop: 12 }} onClick={() => setIndex(0)}>Start over</button>
    </div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      <p style={{ margin: 0, fontSize: 12, color: "#52606d" }}>{index + 1} / {deck.length}</p>

      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 440,
        background: "white",
        borderRadius: 16,
        boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
        overflow: "hidden",
        transition: "transform 0.2s"
      }}>
        {actionFeedback && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: actionFeedback === "Hidden!" ? "rgba(127,29,29,0.85)" : actionFeedback === "Watched!" ? "rgba(20,83,45,0.85)" : "rgba(29,58,107,0.85)",
            color: "white", fontSize: 28, fontWeight: 700, zIndex: 10, borderRadius: 16
          }}>
            {actionFeedback}
          </div>
        )}

        {current.poster_path ? (
          <img
            src={`https://image.tmdb.org/t/p/w500${current.poster_path}`}
            alt={current.title}
            style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", aspectRatio: "2/3", background: "linear-gradient(135deg, #1e3a5f 0%, #14532d 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 48 }}>🎬</span>
          </div>
        )}

        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>{current.title}</h2>
              <span style={{ fontSize: 13, color: "#52606d" }}>{current.year} · {current.type === "movie" ? "Movie" : "Show"}</span>
              {current.vote_average && <span style={{ fontSize: 13, color: "#f5c518", marginLeft: 8, fontWeight: 700 }}>★ {current.vote_average.toFixed(1)}</span>}
            </div>
            {current.runtime_minutes && (
              <span style={{ fontSize: 12, color: "#52606d", background: "rgba(31,41,51,0.07)", borderRadius: 999, padding: "3px 10px", flexShrink: 0 }}>
                {current.runtime_minutes}m
              </span>
            )}
          </div>

          {current.genres.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
              {current.genres.slice(0, 4).map((g) => <span key={g} className="badge" style={{ fontSize: 10 }}>{g}</span>)}
            </div>
          )}

          {current.overview && (
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
              {current.overview.slice(0, 200)}{current.overview.length > 200 ? "…" : ""}
            </p>
          )}

          {current.jiohotstar_url && (
            <a href={current.jiohotstar_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#1d4ed8" }}>Open on JioHotstar ↗</a>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button
          className="button secondary"
          style={{ padding: "10px 20px", fontSize: 22, borderRadius: 999 }}
          title="Hide"
          onClick={() => void doAction("hidden", "Hidden!")}
        >👎</button>
        <button
          className="button secondary"
          style={{ padding: "10px 20px", fontSize: 22, borderRadius: 999 }}
          title="Skip"
          onClick={skip}
        >⏭</button>
        <button
          className="button secondary"
          style={{ padding: "10px 20px", fontSize: 22, borderRadius: 999 }}
          title="Watch Later"
          onClick={() => void doAction("watch_later", "Saved!")}
        >🕐</button>
        <button
          className="button"
          style={{ padding: "10px 20px", fontSize: 22, borderRadius: 999 }}
          title="Watched"
          onClick={() => void doAction("watched", "Watched!")}
        >✅</button>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>👎 hide · ⏭ skip · 🕐 watch later · ✅ watched</p>
    </div>
  );
}

// ─── Tab: Taste Controls ──────────────────────────────────────────────────────

function TasteTab({ tasteGraph }: { tasteGraph: TasteGraph }) {
  const edges = Object.values(tasteGraph.edges).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  const groupedEdges: Record<string, typeof edges> = {};
  for (const edge of edges) {
    const group = edge.node_type;
    groupedEdges[group] = groupedEdges[group] ?? [];
    groupedEdges[group].push(edge);
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "#52606d" }}>
          {edges.length} taste signals · Centroid {tasteGraph.taste_centroid ? "computed" : "not yet computed"}
          {tasteGraph.centroid_updated_at && ` · Updated ${new Date(tasteGraph.centroid_updated_at).toLocaleDateString()}`}
        </p>
        {edges.length === 0 && (
          <div className="empty">No taste signals yet. Hide, watch, or interact with content to build your taste profile.</div>
        )}
      </div>

      {Object.entries(groupedEdges).map(([group, items]) => (
        <div key={group}>
          <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#374151" }}>
            {group.replace(/_/g, " ")}
          </h3>
          <div style={{ display: "grid", gap: 6 }}>
            {items.slice(0, 12).map((edge) => {
              const w = edge.weight;
              const pct = Math.min(100, Math.abs(w) * 50);
              const positive = w >= 0;
              return (
                <div key={edge.node_id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 50px", gap: 8, alignItems: "center", fontSize: 12 }}>
                  <span style={{ color: "#374151" }}>{edge.node_id.split(":")[1] ?? edge.node_id}</span>
                  <div style={{ height: 5, borderRadius: 99, background: "rgba(31,41,51,0.08)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, marginLeft: positive ? "50%" : `${50 - pct}%`, background: positive ? "#14532d" : "#7f1d1d", borderRadius: 99 }} />
                  </div>
                  <span style={{ textAlign: "right", color: positive ? "#14532d" : "#7f1d1d", fontWeight: 700, fontSize: 11 }}>
                    {positive ? "+" : ""}{w.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {tasteGraph.taste_centroid && (
        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#374151" }}>Taste Centroid</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {tasteGraph.taste_centroid.map((v, i) => (
              <div key={i} style={{ fontSize: 11, background: "rgba(31,41,51,0.07)", borderRadius: 6, padding: "3px 8px", color: "#52606d" }}>
                dim{i}: {v.toFixed(3)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Catalog Health ──────────────────────────────────────────────────────

function CatalogTab() {
  const [stats, setStats] = useState<{
    total: number;
    movies: number;
    shows: number;
    highConfidence: number;
    withJioUrl: number;
    withEmbedding: number;
    actionCount: number;
    recentActions: UserAction[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        await syncCatalogToDb();
        const catalog = await loadCatalog();
        const actionCount = await getActionCount();
        const recentActions = await getRecentActions(10);
        setStats({
          total: catalog.length,
          movies: catalog.filter(c => c.type === "movie").length,
          shows: catalog.filter(c => c.type === "show").length,
          highConfidence: catalog.filter(c => c.availability_confidence === "high").length,
          withJioUrl: catalog.filter(c => !!c.jiohotstar_url).length,
          withEmbedding: catalog.filter(c => c.embedding !== null).length,
          actionCount,
          recentActions
        });
      } catch {
        // ignore
      }
      setLoading(false);
    };
    void load();
  }, []);

  const clearCatalog = async () => {
    await db.catalog.clear();
    await syncCatalogToDb();
    window.location.reload();
  };

  if (loading) return <div className="empty" style={{ padding: 48, textAlign: "center" }}>Loading catalog stats…</div>;
  if (!stats) return <div className="empty">Failed to load catalog stats.</div>;

  const statItems = [
    { label: "Total titles", value: stats.total },
    { label: "Movies", value: stats.movies },
    { label: "Shows", value: stats.shows },
    { label: "High confidence", value: stats.highConfidence },
    { label: "With JioHotstar URL", value: stats.withJioUrl },
    { label: "With embedding", value: stats.withEmbedding },
    { label: "User actions logged", value: stats.actionCount }
  ];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#374151" }}>Catalog Stats</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {statItems.map(({ label, value }) => (
            <div key={label} style={{ background: "rgba(31,41,51,0.04)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#1e3a5f" }}>{value.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: "#52606d", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {stats.recentActions.length > 0 && (
        <div>
          <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#374151" }}>Recent Actions</h3>
          <div className="list">
            {stats.recentActions.map((a) => (
              <div key={a.action_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(31,41,51,0.06)", fontSize: 12 }}>
                <div>
                  <strong>{a.title}</strong>
                  <span className="badge" style={{ marginLeft: 8, fontSize: 10 }}>{a.action_type}</span>
                  <span style={{ marginLeft: 6, fontSize: 10, color: "#9ca3af" }}>{a.context}</span>
                </div>
                <span style={{ color: "#9ca3af", fontSize: 10 }}>{new Date(a.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#374151" }}>Database</h3>
        <button className="button secondary" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => void clearCatalog()}>
          Force re-sync catalog from bundle
        </button>
        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>This clears the local IndexedDB catalog and reloads from the bundled JSON file.</p>
      </div>
    </div>
  );
}

// ─── Tab: Manage ──────────────────────────────────────────────────────────────

function ManageTab({
  state,
  tasteGraph,
  onTasteUpdate,
  onStateChange
}: {
  state: StoredState;
  tasteGraph: TasteGraph;
  onTasteUpdate: (graph: TasteGraph) => void;
  onStateChange: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [filter, setFilter] = useState<"all" | "hidden" | "watched">("all");

  useEffect(() => {
    loadCatalog().then(setCatalog).catch(() => {});
  }, []);

  const items = sortByUpdatedAt(
    Object.values(state.items).filter(i =>
      filter === "all" ? i.state !== "watch_later" : i.state === filter
    )
  );

  const exportState = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), version: 2, state, tasteGraph }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `curator-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importState = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed = JSON.parse(await file.text()) as { state?: StoredState; tasteGraph?: TasteGraph };
    if (!parsed.state?.items) throw new Error("Invalid backup file");
    await setStoredState(parsed.state);
    if (parsed.tasteGraph) {
      const { setTasteGraph } = await import("../shared/storage");
      await setTasteGraph(parsed.tasteGraph);
    }
    event.target.value = "";
    onStateChange();
  };

  const handleRemove = async (item: StoredItem) => {
    await removeStoredItem(item.canonicalKey);
    const catalogItem = matchCatalogItem(catalog, item.title, item.sourceUrl);
    if (catalogItem) {
      const { setTasteGraph } = await import("../shared/storage");
      const reversed = updateTasteGraph(tasteGraph, item.state === "hidden" ? "watched" : "hidden", catalogItem);
      await setTasteGraph(reversed);
      onTasteUpdate(reversed);
    }
    void logUserAction("unhide", item.title, { context: "manage_app" });
    onStateChange();
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "hidden", "watched"] as const).map(f => (
            <button key={f} className={`button${filter === f ? "" : " secondary"}`} style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="action-row">
          <button className="button" onClick={exportState} style={{ fontSize: 12, padding: "6px 12px" }}>Export backup</button>
          <button className="button secondary" onClick={() => fileInputRef.current?.click()} style={{ fontSize: 12, padding: "6px 12px" }}>Import backup</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => void importState(e)} />
        </div>
      </div>

      <div className="list">
        {items.length === 0 ? (
          <div className="empty">No {filter === "all" ? "hidden or watched" : filter} items yet.</div>
        ) : (
          items.map((item) => (
            <div className="list-item" key={item.canonicalKey}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="badge">{item.state}</span>
                <strong>{item.title}</strong>
              </div>
              {item.sourceUrl && <div className="muted" style={{ fontSize: 11 }}>{item.sourceUrl}</div>}
              <div className="muted" style={{ fontSize: 11 }}>{new Date(item.updatedAt).toLocaleString()}</div>
              <div className="action-row" style={{ marginTop: 6 }}>
                <button className="button secondary" style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => void handleRemove(item)}>Remove</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

export function App() {
  const [state, setState] = useState<StoredState>({ items: {} });
  const [tasteGraph, setLocalTasteGraph] = useState<TasteGraph>(emptyTasteGraph());
  const [activeTab, setActiveTab] = useState<Tab>("Manage");

  const refreshState = useCallback(() => {
    void getStoredState().then(setState);
  }, []);

  useEffect(() => {
    void getStoredState().then(setState);
    void getTasteGraph().then(setLocalTasteGraph);

    const unsubState = subscribeToStoredState(setState);
    const unsubTaste = subscribeToTasteGraph(setLocalTasteGraph);

    return () => { unsubState(); unsubTaste(); };
  }, []);

  const hiddenCount = Object.values(state.items).filter(i => i.state === "hidden").length;
  const watchedCount = Object.values(state.items).filter(i => i.state === "watched").length;
  const laterCount = Object.values(state.items).filter(i => i.state === "watch_later").length;

  return (
    <div className="shell" style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div className="panel" style={{ padding: 24 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h1 className="title" style={{ marginBottom: 4 }}>JioHotstar Curator</h1>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              {hiddenCount} hidden · {watchedCount} watched · {laterCount} watch later · {Object.keys(tasteGraph.edges).length} taste signals
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 20, borderBottom: "1px solid rgba(31,41,51,0.1)", paddingBottom: 12 }}>
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`button${activeTab === tab ? "" : " secondary"}`}
              style={{ padding: "7px 14px", fontSize: 12 }}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_ICONS[tab]} {tab}{tab === "Watch Later" && laterCount > 0 ? ` (${laterCount})` : ""}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === "Manage" && (
            <ManageTab state={state} tasteGraph={tasteGraph} onTasteUpdate={setLocalTasteGraph} onStateChange={refreshState} />
          )}
          {activeTab === "Watch Later" && (
            <WatchLaterTab state={state} onStateChange={refreshState} />
          )}
          {activeTab === "Swipe" && (
            <SwipeDeckTab state={state} tasteGraph={tasteGraph} onStateChange={refreshState} />
          )}
          {activeTab === "Recommendations" && (
            <RecommendationsTab state={state} tasteGraph={tasteGraph} onStateChange={refreshState} />
          )}
          {activeTab === "Taste" && (
            <TasteTab tasteGraph={tasteGraph} />
          )}
          {activeTab === "Catalog" && (
            <CatalogTab />
          )}
        </div>
      </div>
    </div>
  );
}
