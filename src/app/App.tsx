import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  getStoredState,
  getTasteGraph,
  removeStoredItem,
  setStoredState,
  subscribeToStoredState,
  subscribeToTasteGraph
} from "../shared/storage";
import { loadCatalog, matchCatalogItem } from "../shared/catalog";
import { getRecommendations } from "../shared/recommend";
import { updateTasteGraph } from "../shared/taste";
import type {
  CatalogItem,
  ExplorationMode,
  RecommendationResult,
  StoredItem,
  StoredState,
  TasteGraph
} from "../shared/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortByUpdatedAt(items: StoredItem[]): StoredItem[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const TABS = ["Manage", "Recommendations"] as const;
type Tab = (typeof TABS)[number];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 36px", gap: 6, alignItems: "center", fontSize: 11 }}>
      <span style={{ color: "#52606d" }}>{label}</span>
      <div style={{ height: 5, borderRadius: 99, background: "rgba(31,41,51,0.1)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#245c47,#14532d)", borderRadius: 99 }} />
      </div>
      <span style={{ color: "#52606d", textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function RecommendCard({ result }: { result: RecommendationResult }) {
  const [showDebug, setShowDebug] = useState(false);
  const { item, score, breakdown } = result;

  return (
    <div className="list-item" style={{ gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <strong>{item.title}</strong>
          {item.year && <span style={{ color: "#52606d", marginLeft: 8, fontSize: 13 }}>{item.year}</span>}
        </div>
        <span
          style={{
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            background: score > 0.7 ? "#c6e8d5" : score > 0.5 ? "#e8e2c6" : "#e8c6c6",
            color: score > 0.7 ? "#14532d" : score > 0.5 ? "#433014" : "#7f1d1d"
          }}
        >
          {Math.round(score * 100)}%
        </span>
      </div>

      {item.genres.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {item.genres.slice(0, 4).map((g) => (
            <span key={g} className="badge" style={{ fontSize: 10 }}>{g}</span>
          ))}
        </div>
      )}

      {item.overview && (
        <p style={{ margin: 0, fontSize: 12, color: "#52606d", lineHeight: 1.4 }}>
          {item.overview.slice(0, 140)}{item.overview.length > 140 ? "…" : ""}
        </p>
      )}

      {item.jiohotstar_url && (
        <a
          href={item.jiohotstar_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, color: "#14532d", fontWeight: 600 }}
        >
          Watch on JioHotstar ↗
        </a>
      )}

      <button
        style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, color: "#52606d", padding: 0, textAlign: "left" }}
        onClick={() => setShowDebug((v) => !v)}
      >
        {showDebug ? "▾ Hide" : "▸ Show"} score breakdown
      </button>

      {showDebug && (
        <div style={{ display: "grid", gap: 5, marginTop: 4 }}>
          <ScoreBar label="Embedding match" value={breakdown.embedding_relevance} />
          <ScoreBar label="Taste graph" value={breakdown.taste_graph_match} />
          <ScoreBar label="Quality signal" value={breakdown.quality_signal} />
          <ScoreBar label="Mood fit" value={breakdown.mood_fit} />
          <ScoreBar label="Novelty" value={breakdown.novelty} />
          <ScoreBar label="Freshness" value={breakdown.freshness} />
          {breakdown.penalties > 0 && (
            <div style={{ fontSize: 11, color: "#7f1d1d" }}>
              Penalties: −{Math.round(breakdown.penalties * 100)}%
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Recommendations tab ──────────────────────────────────────────────────────

function RecommendationsTab({
  state,
  tasteGraph
}: {
  state: StoredState;
  tasteGraph: TasteGraph;
}) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [results, setResults] = useState<RecommendationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ExplorationMode>("balanced");
  const [mood, setMood] = useState("");

  useEffect(() => {
    setLoading(true);
    loadCatalog()
      .then((c) => {
        setCatalog(c);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) {
      const recs = getRecommendations(catalog, state, tasteGraph, {
        exploration_mode: mode,
        mood: mood.trim() || undefined,
        max_results: 20
      });
      setResults(recs);
    }
  }, [catalog, state, tasteGraph, mode, mood, loading]);

  if (loading) {
    return (
      <div className="empty" style={{ textAlign: "center", padding: 32 }}>
        Loading catalog…
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <div className="empty">
        <p>No catalog loaded yet.</p>
        <p style={{ fontSize: 13, color: "#52606d" }}>
          Run <code>npm run catalog:tmdb</code> (requires TMDB_BEARER_TOKEN) or{" "}
          <code>npm run catalog:seed</code> to generate a seed catalog, then rebuild the extension.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#52606d" }}>Exploration:</span>
        {(["comfort", "balanced", "surprise"] as ExplorationMode[]).map((m) => (
          <button
            key={m}
            className={`button${mode === m ? "" : " secondary"}`}
            style={{ padding: "6px 14px", fontSize: 12 }}
            onClick={() => setMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
        <input
          type="text"
          placeholder="Mood filter (e.g. thriller, comedy)…"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          style={{
            border: "1px solid rgba(31,41,51,0.15)",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 12,
            fontFamily: "inherit",
            flexGrow: 1,
            minWidth: 180,
            outline: "none"
          }}
        />
      </div>

      <p style={{ margin: 0, fontSize: 13, color: "#52606d" }}>
        {results.length} recommendations from {catalog.length} catalog titles
        {Object.values(state.items).length > 0 &&
          ` · ${Object.values(state.items).filter(i => i.state === "hidden").length} hidden, ${Object.values(state.items).filter(i => i.state === "watched").length} watched excluded`}
      </p>

      {results.length === 0 ? (
        <div className="empty">
          No recommendations yet. Browse JioHotstar and use the Hide/Watched buttons to build your taste profile.
        </div>
      ) : (
        <div className="list">
          {results.map((r) => (
            <RecommendCard key={r.item.content_id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Manage tab ───────────────────────────────────────────────────────────────

function ManageTab({
  state,
  tasteGraph,
  onTasteUpdate
}: {
  state: StoredState;
  tasteGraph: TasteGraph;
  onTasteUpdate: (graph: TasteGraph) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

  useEffect(() => {
    loadCatalog().then(setCatalog).catch(() => {});
  }, []);

  const items = sortByUpdatedAt(Object.values(state.items));

  const exportState = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: 2,
      state,
      tasteGraph
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `curator-backup-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  const importState = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsed = JSON.parse(text) as { state?: StoredState; tasteGraph?: TasteGraph };

    if (!parsed.state || typeof parsed.state !== "object" || !parsed.state.items) {
      throw new Error("Invalid backup file");
    }

    await setStoredState(parsed.state);

    if (parsed.tasteGraph) {
      const { setTasteGraph } = await import("../shared/storage");
      await setTasteGraph(parsed.tasteGraph);
    }

    event.target.value = "";
  };

  const handleRemove = async (item: StoredItem) => {
    await removeStoredItem(item.canonicalKey);

    // Update taste graph with reversed signal
    const catalogItem = matchCatalogItem(catalog, item.title, item.sourceUrl);
    if (catalogItem) {
      const { setTasteGraph } = await import("../shared/storage");
      const reversed = updateTasteGraph(tasteGraph, item.state === "hidden" ? "watched" : "hidden", catalogItem);
      await setTasteGraph(reversed);
      onTasteUpdate(reversed);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="action-row">
        <button className="button" onClick={exportState}>
          Export backup
        </button>
        <button className="button secondary" onClick={triggerImport}>
          Import backup
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(event) => {
            void importState(event);
          }}
        />
      </div>

      <div className="list">
        {items.length === 0 ? (
          <div className="empty">
            No hidden or watched items yet. Browse JioHotstar and use the Hide/Watched buttons.
          </div>
        ) : (
          items.map((item) => (
            <div className="list-item" key={item.canonicalKey}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="badge">{item.state}</span>
                <strong>{item.title}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>{item.sourceUrl ?? item.canonicalKey}</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {new Date(item.updatedAt).toLocaleString()}
              </div>
              <div className="action-row" style={{ marginTop: 4 }}>
                <button
                  className="button secondary"
                  style={{ padding: "6px 12px", fontSize: 12 }}
                  onClick={() => void handleRemove(item)}
                >
                  Remove from state
                </button>
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
  const [tasteGraph, setTasteGraph] = useState<TasteGraph>({
    edges: {},
    taste_centroid: null,
    centroid_updated_at: null
  });
  const [activeTab, setActiveTab] = useState<Tab>("Manage");

  useEffect(() => {
    void getStoredState().then(setState);
    void getTasteGraph().then(setTasteGraph);

    const unsubState = subscribeToStoredState(setState);
    const unsubTaste = subscribeToTasteGraph(setTasteGraph);

    return () => {
      unsubState();
      unsubTaste();
    };
  }, []);

  const hiddenCount = Object.values(state.items).filter((i) => i.state === "hidden").length;
  const watchedCount = Object.values(state.items).filter((i) => i.state === "watched").length;

  return (
    <div className="shell" style={{ maxWidth: 960, margin: "0 auto" }}>
      <div className="panel" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 className="title">JioHotstar Curator</h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {hiddenCount} hidden · {watchedCount} watched ·{" "}
              {Object.keys(tasteGraph.edges).length} taste signals
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 6 }}>
            {TABS.map((tab) => (
              <button
                key={tab}
                className={`button${activeTab === tab ? "" : " secondary"}`}
                style={{ padding: "8px 16px", fontSize: 13 }}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          {activeTab === "Manage" ? (
            <ManageTab
              state={state}
              tasteGraph={tasteGraph}
              onTasteUpdate={setTasteGraph}
            />
          ) : (
            <RecommendationsTab state={state} tasteGraph={tasteGraph} />
          )}
        </div>
      </div>
    </div>
  );
}
