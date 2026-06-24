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
    <div className="shell">
      <div className="panel" style={{ padding: 18 }}>
        <h1 className="title" style={{ fontSize: 17, marginBottom: 4 }}>JioHotstar Curator</h1>
        <p className="muted" style={{ fontSize: 11, margin: "0 0 14px" }}>Local-first curation for JioHotstar</p>

        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <div className="stat-card">
            <strong style={{ fontSize: 20 }}>{hiddenCount}</strong>
            <div className="muted" style={{ fontSize: 10 }}>hidden</div>
          </div>
          <div className="stat-card">
            <strong style={{ fontSize: 20 }}>{watchedCount}</strong>
            <div className="muted" style={{ fontSize: 10 }}>watched</div>
          </div>
          <div className="stat-card">
            <strong style={{ fontSize: 20 }}>{laterCount}</strong>
            <div className="muted" style={{ fontSize: 10 }}>watch later</div>
          </div>
          <div className="stat-card">
            <strong style={{ fontSize: 20 }}>{tasteSignals}</strong>
            <div className="muted" style={{ fontSize: 10 }}>taste signals</div>
          </div>
        </div>

        <div className="action-row" style={{ marginTop: 14, flexDirection: "column", gap: 6 }}>
          <button id="open-app-btn" className="button" onClick={() => void openApp()} style={{ width: "100%", padding: "8px" }}>
            🗂 Open full app
          </button>
          <button id="open-side-panel-btn" className="button secondary" onClick={() => void openSidePanel()} style={{ width: "100%", padding: "8px" }}>
            ▶ Open side panel
          </button>
        </div>
      </div>
    </div>
  );
}
