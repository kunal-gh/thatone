import { useEffect, useState } from "react";
import { getRuntimeMode } from "../shared/runtime";
import { getStoredState, getTasteGraph, getUniqueStoredItems, subscribeToStoredState } from "../shared/storage";
import type { StoredState } from "../shared/types";

export function App() {
  const [state, setState] = useState<StoredState>({ items: {} });
  const [catalogCount, setCatalogCount] = useState(0);
  const runtime = getRuntimeMode();

  useEffect(() => {
    void Promise.all([getStoredState(), getTasteGraph()]).then(([s]) => setState(s));

    // Try to get catalog count from background
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get("catalogCount", (result) => {
        if (result["catalogCount"]) setCatalogCount(result["catalogCount"] as number);
      });
    }

    const unsub = subscribeToStoredState(setState);
    return () => { unsub(); };
  }, []);

  const items    = getUniqueStoredItems(state);
  const hidden   = items.filter((i) => i.state === "hidden").length;
  const watched  = items.filter((i) => i.state === "watched").length;
  const later    = items.filter((i) => i.state === "watch_later").length;
  const signals  = Object.keys({}).length; // placeholder

  const openSidePanel = () => {
    if (typeof chrome !== "undefined" && chrome.sidePanel?.open) {
      void chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id) void chrome.sidePanel.open({ tabId: tab.id });
      });
    }
  };

  const openFullApp = () => {
    const url = runtime === "extension" && typeof chrome !== "undefined"
      ? chrome.runtime.getURL("app.html")
      : "/app.html";
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank");
    }
  };

  const openJioHotstar = () => {
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      chrome.tabs.create({ url: "https://www.hotstar.com/in/home" });
    }
  };

  return (
    <div style={{
      width: 300,
      minHeight: 320,
      background: "#07080f",
      color: "#f0f0f5",
      fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex",
      flexDirection: "column",
      padding: 0,
      overflow: "hidden"
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(168,85,247,0.08) 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "16px 16px 14px"
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#818cf8", marginBottom: 4 }}>
          JioHotstar Curator
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, background: "linear-gradient(135deg, #818cf8, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Filter the Feed
        </div>
        <div style={{ fontSize: 11, color: "#5c6380", marginTop: 4 }}>
          {catalogCount > 0 ? `${catalogCount.toLocaleString()} titles in catalog` : "AI-powered curation"}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "rgba(255,255,255,0.04)", margin: "12px 12px 0" }}>
        {[
          { label: "Hidden",    value: hidden,  icon: "👁", color: "#f87171" },
          { label: "Watched",   value: watched, icon: "✓",  color: "#34d399" },
          { label: "Watchlist", value: later,   icon: "+",  color: "#60a5fa" },
          { label: "Signals",   value: signals, icon: "◎",  color: "#fbbf24" }
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{
            display: "flex",
            flexDirection: "column",
            padding: "10px 12px",
            background: "#0f1120",
            gap: 2
          }}>
            <span style={{ fontSize: 14 }}>{icon}</span>
            <strong style={{ fontSize: 20, fontWeight: 800, color }}>{value}</strong>
            <span style={{ fontSize: 10, color: "#5c6380", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Status indicator */}
      <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px #34d399", display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: "#5c6380" }}>Extension active on JioHotstar</span>
      </div>

      {/* Action buttons */}
      <div style={{ padding: "0 12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          onClick={openSidePanel}
          style={{
            padding: "9px 14px",
            background: "#6366f1",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            font: "700 12px/1 'Inter', sans-serif",
            cursor: "pointer",
            boxShadow: "0 0 12px rgba(99,102,241,0.35)"
          }}
        >
          Open Side Panel
        </button>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={openFullApp}
            style={{
              flex: 1,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              color: "#9ca3b8",
              font: "600 11px/1 'Inter', sans-serif",
              cursor: "pointer"
            }}
          >
            Full App
          </button>
          <button
            onClick={openJioHotstar}
            style={{
              flex: 1,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              color: "#9ca3b8",
              font: "600 11px/1 'Inter', sans-serif",
              cursor: "pointer"
            }}
          >
            JioHotstar ↗
          </button>
        </div>
      </div>
    </div>
  );
}
