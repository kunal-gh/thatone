import { useEffect, useState } from "react";
import { getStoredState, subscribeToStoredState } from "../shared/storage";
import type { StoredState } from "../shared/types";

export function App() {
  const [state, setState] = useState<StoredState>({ items: {} });

  useEffect(() => {
    void getStoredState().then(setState);
    return subscribeToStoredState(setState);
  }, []);

  const items = Object.values(state.items);
  const hiddenCount = items.filter((item) => item.state === "hidden").length;
  const watchedCount = items.filter((item) => item.state === "watched").length;

  const openManagementApp = async () => {
    const url = chrome.runtime.getURL("app.html");
    await chrome.tabs.create({ url });
  };

  return (
    <div className="shell">
      <div className="panel" style={{ padding: 18 }}>
        <h1 className="title">Curator MVP</h1>
        <p className="muted">
          Local-first filtering state for JioHotstar pages. This is the first build slice.
        </p>

        <div className="stat-grid">
          <div className="stat-card">
            <strong>{hiddenCount}</strong>
            <div className="muted">hidden titles</div>
          </div>
          <div className="stat-card">
            <strong>{watchedCount}</strong>
            <div className="muted">watched titles</div>
          </div>
        </div>

        <div className="action-row">
          <button className="button" onClick={() => void openManagementApp()}>
            Open management app
          </button>
        </div>
      </div>
    </div>
  );
}

