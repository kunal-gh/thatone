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
  const isHigh = pct > 70;
  const isMed = pct > 40;
  
  const fillClass = isHigh ? "bg-emerald-500" : isMed ? "bg-amber-500" : "bg-red-500";
  const textClass = isHigh ? "text-emerald-400" : isMed ? "text-amber-400" : "text-red-400";
  
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 38px", gap: 8, alignItems: "center", fontSize: "0.75rem" }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <div style={{ height: 4, borderRadius: 99, background: "var(--border-light)", overflow: "hidden" }}>
        <div style={{ 
          height: "100%", width: `${pct}%`, borderRadius: 99, transition: "width 0.4s",
          background: isHigh ? "var(--accent-success)" : isMed ? "var(--accent-warning)" : "var(--accent-danger)"
        }} />
      </div>
      <span style={{ 
        textAlign: "right", fontWeight: 700,
        color: isHigh ? "var(--accent-success)" : isMed ? "var(--accent-warning)" : "var(--accent-danger)"
      }}>
        {pct}%
      </span>
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

  const isHigh = score > 0.7;
  const isMed = score > 0.5;
  const badgeClass = isHigh ? "green" : isMed ? "gold" : "red";

  return (
    <div className="list-item animate-fade-in" style={{ gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <strong style={{ fontSize: "1.1rem", color: "var(--text-primary)" }}>{item.title}</strong>
          {item.year && <span style={{ color: "var(--text-tertiary)", marginLeft: 8, fontSize: "0.8rem" }}>{item.year}</span>}
          {item.vote_average && (
            <span style={{ color: "#fbbf24", marginLeft: 8, fontSize: "0.75rem", fontWeight: 700 }}>★ {item.vote_average.toFixed(1)}</span>
          )}
        </div>
        <span className={`badge ${badgeClass}`} style={{ fontSize: "0.75rem" }}>
          {Math.round(score * 100)}%
        </span>
      </div>

      {item.genres.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {item.genres.slice(0, 5).map((g) => (
            <span key={g} className="badge" style={{ fontSize: "0.65rem" }}>{g}</span>
          ))}
          {item.language && (
            <span className="badge blue" style={{ fontSize: "0.65rem" }}>
              {item.language.toUpperCase()}
            </span>
          )}
        </div>
      )}

      {item.overview && (
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {item.overview.slice(0, 160)}{item.overview.length > 160 ? "…" : ""}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
        {item.jiohotstar_url && (
          <a href={item.jiohotstar_url} target="_blank" rel="noopener noreferrer" className="button" style={{ padding: "6px 14px", fontSize: "0.75rem" }}>
            Watch ↗
          </a>
        )}
        <button className="button secondary" style={{ padding: "6px 14px", fontSize: "0.75rem" }} onClick={() => onWatchLater(item)}>
          + Later
        </button>
        <button className="button secondary" style={{ padding: "6px 14px", fontSize: "0.75rem" }} onClick={() => onWatched(item)}>
          Watched
        </button>
        <button className="button secondary" style={{ padding: "6px 14px", fontSize: "0.75rem", color: "var(--accent-danger)", borderColor: "rgba(239, 68, 68, 0.2)" }} onClick={() => onHide(item)}>
          Hide
        </button>
        <button
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: "0.75rem", color: "var(--text-tertiary)", padding: "6px 8px", marginLeft: "auto", transition: "color 0.2s" }}
          onClick={() => setShowDebug((v) => !v)}
          onMouseEnter={(e) => e.currentTarget.style.color = "var(--text-primary)"}
          onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-tertiary)"}
        >
          {showDebug ? "▾ details" : "▸ details"}
        </button>
      </div>

      {showDebug && (
        <div className="animate-fade-in" style={{ display: "grid", gap: 8, marginTop: 4, padding: "12px 16px", background: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}>
          <ScoreBar label="Embedding match" value={breakdown.embedding_relevance} />
          <ScoreBar label="Taste graph" value={breakdown.taste_graph_match} />
          <ScoreBar label="Quality signal" value={breakdown.quality_signal} />
          <ScoreBar label="Mood fit" value={breakdown.mood_fit} />
          <ScoreBar label="Novelty" value={breakdown.novelty} />
          <ScoreBar label="Freshness" value={breakdown.freshness} />
          {breakdown.penalties > 0 && (
            <div style={{ fontSize: "0.75rem", color: "var(--accent-danger)", marginTop: 4, fontWeight: 600 }}>
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

  if (loading) return <div className="empty" style={{ padding: 48 }}>Loading catalog…</div>;

  if (catalog.length === 0) {
    return (
      <div className="empty">
        <p>No catalog loaded yet.</p>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Run <code>npm run catalog:tmdb</code> to generate the full catalog, then rebuild the extension.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", background: "rgba(0,0,0,0.15)", padding: 12, borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>Mode:</span>
        <div style={{ display: "flex", gap: 4 }}>
          {(["comfort", "balanced", "surprise"] as ExplorationMode[]).map((m) => (
            <button key={m} className={`button${mode === m ? "" : " secondary"}`} style={{ padding: "6px 12px", fontSize: "0.75rem" }} onClick={() => setMode(m)}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        
        <div style={{ width: 1, height: 20, background: "var(--border-light)", margin: "0 4px" }} />
        
        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>Type:</span>
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "movie", "show"] as const).map((t) => (
            <button key={t} className={`button${contentType === t ? "" : " secondary"}`} style={{ padding: "6px 12px", fontSize: "0.75rem" }} onClick={() => setContentType(t)}>
              {t === "all" ? "All" : t === "movie" ? "Movies" : "Shows"}
            </button>
          ))}
        </div>
        
        <input
          type="text"
          placeholder="Mood (e.g. thriller, comedy, romance)…"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          style={{ padding: "8px 16px", fontSize: "0.85rem", flexGrow: 1, minWidth: 200, borderRadius: "var(--radius-full)", outline: "none" }}
        />
      </div>

      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-tertiary)", fontWeight: 500 }}>
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
    <div className="animate-fade-in" style={{ display: "grid", gap: 16 }}>
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>{items.length} title{items.length !== 1 ? "s" : ""} saved for later</p>
      {items.length === 0 ? (
        <div className="empty">Nothing saved yet. Use the "Later" button on JioHotstar cards or in recommendations.</div>
      ) : (
        <div className="list">
          {items.map((item) => (
            <div className="list-item" key={item.canonicalKey} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: "1.05rem" }}>{item.title}</strong>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
                  <span className="muted" style={{ fontSize: "0.75rem" }}>{new Date(item.updatedAt).toLocaleString()}</span>
                  {item.sourceUrl && (
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem" }}>
                      Open on JioHotstar ↗
                    </a>
                  )}
                </div>
              </div>
              <div className="action-row" style={{ marginTop: 0 }}>
                <button className="button" style={{ padding: "6px 14px", fontSize: "0.75rem" }} onClick={() => void handleMarkWatched(item)}>Mark watched</button>
                <button className="button secondary" style={{ padding: "6px 14px", fontSize: "0.75rem" }} onClick={() => void handleRemove(item)}>Remove</button>
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
  const [actionFeedback, setActionFeedback] = useState<{label: string, type: "hide" | "watch" | "later"} | null>(null);

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

  const doAction = async (action: "hidden" | "watched" | "watch_later", label: string, type: "hide" | "watch" | "later") => {
    if (!current) return;
    const key = `title:${current.title.toLowerCase().replace(/\s+/g, "-")}`;
    const { upsertStoredItem } = await import("../shared/storage");
    await upsertStoredItem(key, current.title, action, current.jiohotstar_url ?? undefined);
    void logUserAction(action === "hidden" ? "hide" : action, current.title, {
      content_id: current.content_id,
      context: "swipe_deck"
    });
    setActionFeedback({ label, type });
    setTimeout(() => {
      setActionFeedback(null);
      setIndex((i) => i + 1);
    }, 400);
    onStateChange();
  };

  const skip = () => {
    void logUserAction("skipped", current?.title ?? "", { context: "swipe_deck" });
    setIndex((i) => i + 1);
  };

  if (loading) return <div className="empty" style={{ padding: 48 }}>Loading deck…</div>;
  if (!current || index >= deck.length) {
    return <div className="empty animate-fade-in" style={{ padding: 64 }}>
      <p style={{ fontSize: 40, margin: "0 0 16px" }}>🎉</p>
      <p style={{ fontSize: "1.1rem", color: "var(--text-primary)" }}>You've gone through the whole deck!</p>
      <p>Browse JioHotstar to get more suggestions, or switch to another tab.</p>
      <button className="button" style={{ marginTop: 24, padding: "10px 24px" }} onClick={() => setIndex(0)}>Start over</button>
    </div>;
  }

  const getOverlayColor = (type: string) => {
    if (type === "hide") return "rgba(239, 68, 68, 0.85)"; // Red
    if (type === "watch") return "rgba(16, 185, 129, 0.85)"; // Emerald
    return "rgba(59, 130, 246, 0.85)"; // Blue
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600 }}>{index + 1} of {deck.length}</p>

      <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 420,
        background: "rgba(15, 23, 42, 0.8)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.7), 0 0 0 1px var(--border-light)",
        overflow: "hidden",
        transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
      }}>
        {actionFeedback && (
          <div className="animate-fade-in" style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: getOverlayColor(actionFeedback.type),
            backdropFilter: "blur(4px)",
            color: "white", fontSize: "2rem", fontWeight: 800, zIndex: 10,
            textShadow: "0 4px 12px rgba(0,0,0,0.3)"
          }}>
            {actionFeedback.label}
          </div>
        )}

        {current.poster_path ? (
          <div style={{ position: "relative" }}>
            <img
              src={`https://image.tmdb.org/t/p/w500${current.poster_path}`}
              alt={current.title}
              style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block" }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(15,23,42,1) 0%, rgba(15,23,42,0) 40%)" }} />
          </div>
        ) : (
          <div style={{ width: "100%", aspectRatio: "2/3", background: "linear-gradient(135deg, #1e3a8a 0%, #064e3b 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 64, filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.3))" }}>🎬</span>
          </div>
        )}

        <div style={{ padding: "0 24px 24px", position: "relative", zIndex: 2, marginTop: current.poster_path ? -40 : 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 800, lineHeight: 1.1, textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>{current.title}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{current.year} · {current.type === "movie" ? "Movie" : "Show"}</span>
                {current.vote_average && <span style={{ fontSize: "0.85rem", color: "#fbbf24", fontWeight: 700 }}>★ {current.vote_average.toFixed(1)}</span>}
              </div>
            </div>
            {current.runtime_minutes && (
              <span style={{ fontSize: "0.75rem", color: "var(--text-primary)", background: "rgba(255,255,255,0.15)", borderRadius: 999, padding: "4px 10px", flexShrink: 0 }}>
                {current.runtime_minutes}m
              </span>
            )}
          </div>

          {current.genres.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {current.genres.slice(0, 4).map((g) => <span key={g} className="badge" style={{ background: "rgba(0,0,0,0.3)", borderColor: "rgba(255,255,255,0.1)" }}>{g}</span>)}
            </div>
          )}

          {current.overview && (
            <p style={{ margin: "0 0 20px", fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {current.overview.slice(0, 200)}{current.overview.length > 200 ? "…" : ""}
            </p>
          )}

          {current.jiohotstar_url && (
            <a href={current.jiohotstar_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", fontSize: "0.85rem", fontWeight: 600, padding: "8px 16px", background: "rgba(59,130,246,0.1)", borderRadius: "var(--radius-full)" }}>
              Open on JioHotstar ↗
            </a>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
        <button
          className="button secondary"
          style={{ width: 64, height: 64, borderRadius: "50%", padding: 0, fontSize: 24, border: "2px solid rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.05)" }}
          title="Hide"
          onClick={() => void doAction("hidden", "Hidden!", "hide")}
        >👎</button>
        <button
          className="button secondary"
          style={{ width: 64, height: 64, borderRadius: "50%", padding: 0, fontSize: 24, border: "2px solid rgba(255, 255, 255, 0.1)", background: "rgba(255, 255, 255, 0.05)" }}
          title="Skip"
          onClick={skip}
        >⏭</button>
        <button
          className="button secondary"
          style={{ width: 64, height: 64, borderRadius: "50%", padding: 0, fontSize: 24, border: "2px solid rgba(59, 130, 246, 0.3)", background: "rgba(59, 130, 246, 0.05)" }}
          title="Watch Later"
          onClick={() => void doAction("watch_later", "Saved!", "later")}
        >🕐</button>
        <button
          className="button"
          style={{ width: 64, height: 64, borderRadius: "50%", padding: 0, fontSize: 24, border: "2px solid rgba(16, 185, 129, 0.5)", background: "rgba(16, 185, 129, 0.15)", boxShadow: "0 0 20px rgba(16, 185, 129, 0.2)" }}
          title="Watched"
          onClick={() => void doAction("watched", "Watched!", "watch")}
        >✅</button>
      </div>
      <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-tertiary)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        <span style={{ color: "var(--accent-danger)" }}>Hide</span> · Skip · <span style={{ color: "var(--accent-primary)" }}>Later</span> · <span style={{ color: "var(--accent-success)" }}>Watched</span>
      </p>
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
    <div className="animate-fade-in" style={{ display: "grid", gap: 32 }}>
      <div>
        <p style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          {edges.length} taste signals · Centroid {tasteGraph.taste_centroid ? "computed" : "not yet computed"}
          {tasteGraph.centroid_updated_at && ` · Updated ${new Date(tasteGraph.centroid_updated_at).toLocaleDateString()}`}
        </p>
        {edges.length === 0 && (
          <div className="empty">No taste signals yet. Hide, watch, or interact with content to build your taste profile.</div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
        {Object.entries(groupedEdges).map(([group, items]) => (
          <div key={group} style={{ background: "rgba(0,0,0,0.15)", padding: 20, borderRadius: "var(--radius-lg)", border: "1px solid var(--border-light)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>
              {group.replace(/_/g, " ")}
            </h3>
            <div style={{ display: "grid", gap: 10 }}>
              {items.slice(0, 10).map((edge) => {
                const w = edge.weight;
                const pct = Math.min(100, Math.abs(w) * 50);
                const positive = w >= 0;
                return (
                  <div key={edge.node_id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 40px", gap: 12, alignItems: "center", fontSize: "0.8rem" }}>
                    <span style={{ color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{edge.node_id.split(":")[1] ?? edge.node_id}</span>
                    <div style={{ height: 6, borderRadius: 99, background: "rgba(0,0,0,0.3)", overflow: "hidden" }}>
                      <div style={{ 
                        height: "100%", width: `${pct}%`, 
                        marginLeft: positive ? "50%" : `${50 - pct}%`, 
                        background: positive ? "var(--accent-success)" : "var(--accent-danger)", 
                        borderRadius: 99,
                        boxShadow: positive ? "0 0 8px rgba(16, 185, 129, 0.5)" : "0 0 8px rgba(239, 68, 68, 0.5)"
                      }} />
                    </div>
                    <span style={{ textAlign: "right", color: positive ? "var(--accent-success)" : "var(--accent-danger)", fontWeight: 700, fontFamily: "monospace", fontSize: "0.75rem" }}>
                      {positive ? "+" : ""}{w.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {tasteGraph.taste_centroid && (
        <div style={{ background: "rgba(0,0,0,0.15)", padding: 20, borderRadius: "var(--radius-lg)", border: "1px dashed var(--border-light)" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>Taste Centroid Vector</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontFamily: "monospace", fontSize: "0.75rem" }}>
            {tasteGraph.taste_centroid.map((v, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.05)", borderRadius: "var(--radius-sm)", padding: "4px 8px", color: "var(--text-secondary)" }}>
                d{i}: <span style={{ color: "var(--text-primary)" }}>{v.toFixed(3)}</span>
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
        const recentActions = await getRecentActions(12);
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

  if (loading) return <div className="empty" style={{ padding: 48 }}>Loading catalog stats…</div>;
  if (!stats) return <div className="empty">Failed to load catalog stats.</div>;

  const statItems = [
    { label: "Total titles", value: stats.total, color: "var(--text-primary)" },
    { label: "Movies", value: stats.movies, color: "var(--text-secondary)" },
    { label: "Shows", value: stats.shows, color: "var(--text-secondary)" },
    { label: "High confidence", value: stats.highConfidence, color: "var(--accent-success)" },
    { label: "With Jio URL", value: stats.withJioUrl, color: "var(--accent-primary)" },
    { label: "With embedding", value: stats.withEmbedding, color: "var(--accent-warning)" },
    { label: "User actions", value: stats.actionCount, color: "var(--text-primary)" }
  ];

  return (
    <div className="animate-fade-in" style={{ display: "grid", gap: 32 }}>
      <div>
        <h3 style={{ margin: "0 0 16px", fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>Catalog Statistics</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 16 }}>
          {statItems.map(({ label, value, color }) => (
            <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "16px 20px", transition: "transform 0.2s" }}>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color, lineHeight: 1 }}>{value.toLocaleString()}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 8, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {stats.recentActions.length > 0 && (
        <div>
          <h3 style={{ margin: "0 0 16px", fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>Recent Actions Log</h3>
          <div className="list">
            {stats.recentActions.map((a) => (
              <div key={a.action_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(0,0,0,0.15)", borderRadius: "var(--radius-md)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className={`badge ${a.action_type === 'hide' ? 'red' : a.action_type === 'watched' ? 'green' : 'blue'}`}>{a.action_type}</span>
                  <strong style={{ fontSize: "0.9rem", color: "var(--text-primary)" }}>{a.title}</strong>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{a.context}</span>
                </div>
                <span style={{ color: "var(--text-tertiary)", fontSize: "0.75rem", fontFamily: "monospace" }}>{new Date(a.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>Database Controls</h3>
        <div style={{ background: "rgba(239, 68, 68, 0.05)", border: "1px dashed rgba(239, 68, 68, 0.3)", padding: 20, borderRadius: "var(--radius-md)" }}>
          <button className="button" style={{ background: "var(--accent-danger)", fontSize: "0.85rem", padding: "8px 16px" }} onClick={() => void clearCatalog()}>
            Force re-sync catalog
          </button>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
            This clears the local IndexedDB catalog cache and reloads it from the bundled JSON file. Use this if recommendations seem broken or stuck on an old version.
          </p>
        </div>
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
    <div className="animate-fade-in" style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, background: "rgba(0,0,0,0.15)", padding: "12px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-light)" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", marginRight: 8 }}>Filter:</span>
          {(["all", "hidden", "watched"] as const).map(f => (
            <button key={f} className={`button${filter === f ? " active-tab" : " secondary"}`} style={{ padding: "6px 14px", fontSize: "0.75rem" }} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="action-row" style={{ margin: 0 }}>
          <button className="button" onClick={exportState} style={{ fontSize: "0.75rem", padding: "8px 16px" }}>↓ Export backup</button>
          <button className="button secondary" onClick={() => fileInputRef.current?.click()} style={{ fontSize: "0.75rem", padding: "8px 16px" }}>↑ Import backup</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => void importState(e)} />
        </div>
      </div>

      <div className="list">
        {items.length === 0 ? (
          <div className="empty">No {filter === "all" ? "hidden or watched" : filter} items yet.</div>
        ) : (
          items.map((item) => (
            <div className="list-item" key={item.canonicalKey} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span className={`badge ${item.state === 'hidden' ? 'red' : 'green'}`} style={{ minWidth: 64, justifyContent: "center" }}>{item.state}</span>
                <div>
                  <strong style={{ fontSize: "1.05rem", color: "var(--text-primary)", display: "block", marginBottom: 2 }}>{item.title}</strong>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span className="muted" style={{ fontSize: "0.75rem" }}>{new Date(item.updatedAt).toLocaleString()}</span>
                    {item.sourceUrl && <span className="muted" style={{ fontSize: "0.75rem" }}>· <span style={{ fontFamily: "monospace" }}>{new URL(item.sourceUrl).pathname}</span></span>}
                  </div>
                </div>
              </div>
              <div className="action-row" style={{ margin: 0 }}>
                <button className="button secondary" style={{ padding: "6px 16px", fontSize: "0.75rem" }} onClick={() => void handleRemove(item)}>Remove</button>
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
  const [activeTab, setActiveTab] = useState<Tab>("Recommendations"); // Start on recs

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
    <div className="shell" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="panel" style={{ padding: "32px 40px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
          <div>
            <h1 className="title" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "2rem" }}>🎬</span> Curator
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem", fontWeight: 500 }}>
              <span style={{ color: "var(--accent-danger)" }}>{hiddenCount} hidden</span> <span style={{ margin: "0 6px", opacity: 0.3 }}>|</span> 
              <span style={{ color: "var(--accent-success)" }}>{watchedCount} watched</span> <span style={{ margin: "0 6px", opacity: 0.3 }}>|</span> 
              <span style={{ color: "var(--accent-primary)" }}>{laterCount} watch later</span> <span style={{ margin: "0 6px", opacity: 0.3 }}>|</span> 
              <span style={{ color: "var(--text-primary)" }}>{Object.keys(tasteGraph.edges).length} taste signals</span>
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ 
          display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 32, 
          borderBottom: "1px solid var(--border-light)", paddingBottom: 16 
        }}>
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`button${activeTab === tab ? " active-tab" : " secondary"}`}
              style={{ 
                padding: "10px 20px", fontSize: "0.85rem", 
                borderRadius: "var(--radius-md)",
                borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
                borderBottom: activeTab === tab ? "2px solid var(--accent-primary)" : "2px solid transparent",
                marginBottom: -18
              }}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_ICONS[tab]} <span style={{ marginLeft: 6 }}>{tab}</span>
              {tab === "Watch Later" && laterCount > 0 ? <span style={{ marginLeft: 8, background: "var(--accent-primary)", color: "white", padding: "2px 8px", borderRadius: 99, fontSize: "0.7rem", fontWeight: 800 }}>{laterCount}</span> : ""}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ minHeight: 400 }}>
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
