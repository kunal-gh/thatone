import { useEffect, useState } from "react";
import { getStoredState, subscribeToStoredState, getTasteGraph } from "../shared/storage";
import type { StoredState } from "../shared/types";

export function App() {
  const [state, setState] = useState<StoredState>({ items: {} });
  const [tasteSignals, setTasteSignals] = useState(0);

  useEffect(() => {
    void getStoredState().then(setState);
    void getTasteGraph().then((g) => setTasteSignals(Object.keys(g.edges).length));
    return subscribeToStoredState(setState);
  }, []);

  const items = Object.values(state.items);
  const hiddenCount = items.filter((i) => i.state === "hidden").length;
  const watchedCount = items.filter((i) => i.state === "watched").length;
  const laterCount = items.filter((i) => i.state === "watch_later").length;

  const openApp = async () => {
    const url = chrome.runtime.getURL("app.html");
    await chrome.tabs.create({ url });
  };

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  };

  return (
    <div className="shell animate-fade-in" style={{ padding: 16 }}>
      <div className="panel" style={{ padding: 20 }}>
        <h1 className="title" style={{ fontSize: "1.25rem", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span>🎬</span> Curator
        </h1>
        <p className="muted" style={{ fontSize: "0.8rem", margin: "0 0 20px" }}>Local-first discovery for JioHotstar</p>

        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "var(--radius-md)", padding: "12px 16px" }}>
            <strong style={{ fontSize: "1.5rem", color: "var(--accent-danger)", lineHeight: 1 }}>{hiddenCount}</strong>
            <div className="muted" style={{ fontSize: "0.7rem", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Hidden</div>
          </div>
          <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "var(--radius-md)", padding: "12px 16px" }}>
            <strong style={{ fontSize: "1.5rem", color: "var(--accent-success)", lineHeight: 1 }}>{watchedCount}</strong>
            <div className="muted" style={{ fontSize: "0.7rem", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Watched</div>
          </div>
          <div style={{ background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.2)", borderRadius: "var(--radius-md)", padding: "12px 16px" }}>
            <strong style={{ fontSize: "1.5rem", color: "var(--accent-primary)", lineHeight: 1 }}>{laterCount}</strong>
            <div className="muted" style={{ fontSize: "0.7rem", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Watch Later</div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid var(--border-light)", borderRadius: "var(--radius-md)", padding: "12px 16px" }}>
            <strong style={{ fontSize: "1.5rem", color: "var(--text-primary)", lineHeight: 1 }}>{tasteSignals}</strong>
            <div className="muted" style={{ fontSize: "0.7rem", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Taste Signals</div>
          </div>
        </div>

        <div className="action-row" style={{ marginTop: 24, flexDirection: "column", gap: 8 }}>
          <button id="open-side-panel-btn" className="button" onClick={() => void openSidePanel()} style={{ width: "100%", padding: "10px", fontSize: "0.85rem" }}>
            ▶ Open in Side Panel
          </button>
          <button id="open-app-btn" className="button secondary" onClick={() => void openApp()} style={{ width: "100%", padding: "10px", fontSize: "0.85rem" }}>
            🗂 Open Full Window
          </button>
        </div>
      </div>
    </div>
  );
}
