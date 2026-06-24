import { useEffect, useMemo, useState } from "react";
import { getAppUrl, hasChromeSidePanel } from "../shared/runtime";
import {
  getStoredState,
  getTasteGraph,
  getUniqueStoredItems,
  subscribeToStoredState
} from "../shared/storage";
import type { StoredState } from "../shared/types";

export function App() {
  const [state, setState] = useState<StoredState>({ items: {} });
  const [tasteSignals, setTasteSignals] = useState(0);

  useEffect(() => {
    void getStoredState().then(setState);
    void getTasteGraph().then((graph) => setTasteSignals(Object.keys(graph.edges).length));
    return subscribeToStoredState(setState);
  }, []);

  const items = useMemo(() => getUniqueStoredItems(state), [state]);
  const hiddenCount = items.filter((item) => item.state === "hidden").length;
  const watchedCount = items.filter((item) => item.state === "watched").length;
  const laterCount = items.filter((item) => item.state === "watch_later").length;

  const openApp = async () => {
    await chrome.tabs.create({ url: getAppUrl() });
  };

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !hasChromeSidePanel()) return;
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  };

  return (
    <div className="popup-shell">
      <div className="popup-frame">
        <span className="hero-kicker">CURATOR</span>
        <h1 className="popup-title">READY</h1>
        <p className="popup-copy">Same state model, same recommendations, smaller control surface.</p>

        <div className="popup-grid">
          <div className="popup-stat">
            <span>Hidden</span>
            <strong>{hiddenCount}</strong>
          </div>
          <div className="popup-stat">
            <span>Watched</span>
            <strong>{watchedCount}</strong>
          </div>
          <div className="popup-stat">
            <span>Later</span>
            <strong>{laterCount}</strong>
          </div>
          <div className="popup-stat">
            <span>Taste</span>
            <strong>{tasteSignals}</strong>
          </div>
        </div>

        <div className="popup-actions">
          {hasChromeSidePanel() ? (
            <button className="button button-solid" onClick={() => void openSidePanel()} type="button">
              OPEN SIDE PANEL
            </button>
          ) : null}
          <button className="button" onClick={() => void openApp()} type="button">
            OPEN FULL APP
          </button>
        </div>
      </div>
    </div>
  );
}
