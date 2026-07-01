import { useCallback, useRef, useState } from "react";
import { processImdbImport, type ImdbImportResult, type ImdbRecord } from "../shared/imdb-import";
import { applyStoredAction, syncTasteGraphFromState } from "../shared/curation";
import { getStoredState, getTasteGraph, setStoredState } from "../shared/storage";
import { exportLogsAsJSON, getRecentLogs, setLogLevel, type LogLevel } from "../shared/logger";
import { downloadBackup, restoreBackup, readFileAsText } from "../shared/data-transfer";
import type { CatalogItem, StoredState, TasteGraph } from "../shared/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsTabProps = {
  catalog: CatalogItem[];
  onMutation: (state: StoredState, tasteGraph: TasteGraph) => Promise<void>;
};

type ImportStep = "idle" | "parsing" | "preview" | "importing" | "done" | "error";

// ─── Settings Tab ─────────────────────────────────────────────────────────────

export function SettingsTab({ catalog, onMutation }: SettingsTabProps) {
  return (
    <section className="tab-content animate-fadeIn">
      <h2 className="settings-title">Settings</h2>

      <ImdbImportSection catalog={catalog} onMutation={onMutation} />
      <TmdbConnectionSection />
      <DataManagementSection onMutation={onMutation} />
      <DiagnosticsSection />
    </section>
  );
}

// ─── IMDb Import ──────────────────────────────────────────────────────────────

function ImdbImportSection({
  catalog,
  onMutation
}: {
  catalog: CatalogItem[];
  onMutation: SettingsTabProps["onMutation"];
}) {
  const [step, setStep] = useState<ImportStep>("idle");
  const [result, setResult] = useState<ImdbImportResult | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setStep("parsing");
    setError("");

    try {
      const text = await file.text();
      const importResult = processImdbImport(text, catalog);

      if (importResult.totalParsed === 0) {
        setError("No valid records found in the CSV file. Make sure it's an IMDb export.");
        setStep("error");
        return;
      }

      setResult(importResult);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse CSV");
      setStep("error");
    }
  }, [catalog]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleFile(file);
  }, [handleFile]);

  const handleImport = useCallback(async () => {
    if (!result) return;

    setStep("importing");
    const total = result.matched.length;
    setProgress({ done: 0, total });

    try {
      for (let i = 0; i < result.matched.length; i++) {
        const { catalogItem, targetState } = result.matched[i];
        await applyStoredAction(
          { contentId: catalogItem.content_id, sourceUrl: catalogItem.jiohotstar_url, title: catalogItem.title },
          targetState,
          "manage_app"
        );
        setProgress({ done: i + 1, total });
      }

      // Final sync
      const state = await getStoredState();
      const graph = await syncTasteGraphFromState(state);
      await onMutation(state, graph);

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("error");
    }
  }, [result, onMutation]);

  const reset = useCallback(() => {
    setStep("idle");
    setResult(null);
    setError("");
    setProgress({ done: 0, total: 0 });
  }, []);

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h3 className="settings-section__title">
          <span>🎬</span> IMDb Import
        </h3>
        <span className="settings-section__badge">CSV</span>
      </div>

      <p className="settings-section__desc">
        Import your IMDb ratings or watchlist. Go to{" "}
        <a href="https://www.imdb.com/list/ratings" target="_blank" rel="noreferrer" style={{ color: "var(--accent-light)" }}>
          IMDb → Your Ratings → Export
        </a>{" "}
        to download your CSV file.
      </p>

      {step === "idle" && (
        <div
          className={`import-zone ${dragOver ? "import-zone--active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => void handleDrop(e)}
          onClick={() => fileRef.current?.click()}
        >
          <span className="import-zone__icon">📁</span>
          <span className="import-zone__text">
            Drop your IMDb CSV here, or click to browse
          </span>
          <span className="import-zone__hint">
            Supports ratings.csv and watchlist.csv
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => void handleFileChange(e)}
          />
        </div>
      )}

      {step === "parsing" && (
        <div className="import-status">
          <span className="spinner" />
          <span>Parsing CSV...</span>
        </div>
      )}

      {step === "preview" && result && (
        <div className="import-preview">
          <div className="import-preview__stats">
            <div className="import-preview__stat">
              <strong>{result.totalParsed}</strong>
              <span>Total Records</span>
            </div>
            <div className="import-preview__stat import-preview__stat--success">
              <strong>{result.matched.length}</strong>
              <span>Matched</span>
            </div>
            <div className="import-preview__stat import-preview__stat--warning">
              <strong>{result.unmatched.length}</strong>
              <span>Unmatched</span>
            </div>
          </div>

          {result.matched.length > 0 && (
            <div className="import-preview__matches">
              <h4>Matched titles (first 10):</h4>
              <div className="import-preview__list">
                {result.matched.slice(0, 10).map(({ record, catalogItem, targetState }) => (
                  <div key={record.imdbId || record.title} className="import-preview__row">
                    <span className="import-preview__title">
                      {catalogItem.title}
                      {record.year ? ` (${record.year})` : ""}
                    </span>
                    <span className={`import-preview__badge import-preview__badge--${targetState}`}>
                      {targetState === "watched" ? "Watched" : "Watchlist"}
                    </span>
                  </div>
                ))}
                {result.matched.length > 10 && (
                  <span className="import-preview__more">
                    +{result.matched.length - 10} more
                  </span>
                )}
              </div>
            </div>
          )}

          {result.unmatched.length > 0 && (
            <details className="import-preview__unmatched">
              <summary>{result.unmatched.length} titles couldn't be matched to the local catalog</summary>
              <div className="import-preview__list">
                {result.unmatched.slice(0, 15).map((r) => (
                  <div key={r.imdbId || r.title} className="import-preview__row import-preview__row--muted">
                    <span>{r.title} {r.year ? `(${r.year})` : ""}</span>
                    <span className="import-preview__imdb">{r.imdbId}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {result.errors.length > 0 && (
            <div className="import-preview__errors">
              {result.errors.map((e, i) => <span key={i}>{e}</span>)}
            </div>
          )}

          <div className="import-preview__actions">
            <button className="btn btn-primary" onClick={() => void handleImport()}>
              Import {result.matched.length} Titles
            </button>
            <button className="btn btn-ghost" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="import-status">
          <div className="import-progress">
            <div className="import-progress__bar">
              <div
                className="import-progress__fill"
                style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <span className="import-progress__text">
              {progress.done} / {progress.total} imported
            </span>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="import-done">
          <span className="import-done__icon">✓</span>
          <strong>Import complete!</strong>
          <span>{result.matched.length} titles imported into your library.</span>
          <button className="btn btn-ghost" onClick={reset}>Import Another</button>
        </div>
      )}

      {step === "error" && (
        <div className="import-error">
          <span>⚠ {error || "An unknown error occurred"}</span>
          <button className="btn btn-ghost" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}

// ─── TMDB Connection + Account Linking ────────────────────────────────────────

function TmdbConnectionSection() {
  const [apiKey, setApiKey] = useState(() => {
    try {
      return localStorage.getItem("curator_tmdb_key") ?? "";
    } catch { return ""; }
  });
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [accountStep, setAccountStep] = useState<"idle" | "awaiting" | "linked" | "error">("idle");
  const [accountInfo, setAccountInfo] = useState<{ username: string; linkedAt: string } | null>(null);
  const [requestToken, setRequestToken] = useState<string | null>(null);

  // Check for existing session on mount
  useState(() => {
    try {
      const raw = localStorage.getItem("curator_tmdb_session");
      if (raw) {
        const session = JSON.parse(raw) as { username: string; linkedAt: string };
        setAccountInfo({ username: session.username, linkedAt: session.linkedAt });
        setAccountStep("linked");
      }
    } catch { /* ignore */ }
  });

  const testConnection = async () => {
    if (!apiKey.trim()) return;
    setStatus("testing");

    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey.trim())}`
      );
      if (res.ok) {
        localStorage.setItem("curator_tmdb_key", apiKey.trim());
        setStatus("ok");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const startAccountLink = async () => {
    if (!apiKey.trim()) return;
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/authentication/token/new?api_key=${encodeURIComponent(apiKey.trim())}`
      );
      if (!res.ok) throw new Error("Failed to create token");
      const data = await res.json() as { request_token: string };
      setRequestToken(data.request_token);
      setAccountStep("awaiting");

      // Open TMDB approval page
      window.open(`https://www.themoviedb.org/authenticate/${data.request_token}`, "_blank");
    } catch {
      setAccountStep("error");
    }
  };

  const completeAccountLink = async () => {
    if (!requestToken || !apiKey.trim()) return;
    try {
      const sessionRes = await fetch(
        `https://api.themoviedb.org/3/authentication/session/new?api_key=${encodeURIComponent(apiKey.trim())}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_token: requestToken }) }
      );
      if (!sessionRes.ok) throw new Error("Token not approved yet");
      const sessionData = await sessionRes.json() as { session_id: string };

      // Fetch account info
      const acctRes = await fetch(
        `https://api.themoviedb.org/3/account?api_key=${encodeURIComponent(apiKey.trim())}&session_id=${sessionData.session_id}`
      );
      const acct = await acctRes.json() as { id: number; username: string; avatar: { gravatar: { hash: string } } };

      const session = {
        apiKey: apiKey.trim(),
        sessionId: sessionData.session_id,
        accountId: acct.id,
        username: acct.username,
        avatarHash: acct.avatar?.gravatar?.hash ?? null,
        linkedAt: new Date().toISOString()
      };

      localStorage.setItem("curator_tmdb_session", JSON.stringify(session));
      setAccountInfo({ username: session.username, linkedAt: session.linkedAt });
      setAccountStep("linked");
    } catch {
      setAccountStep("error");
    }
  };

  const unlinkAccount = () => {
    localStorage.removeItem("curator_tmdb_session");
    setAccountInfo(null);
    setAccountStep("idle");
    setRequestToken(null);
  };

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h3 className="settings-section__title">
          <span>🎥</span> TMDB Connection
        </h3>
        <span className={`settings-section__badge settings-section__badge--${accountStep === "linked" ? "success" : status === "ok" ? "success" : "default"}`}>
          {accountStep === "linked" ? "Account Linked" : status === "ok" ? "API Connected" : "Optional"}
        </span>
      </div>

      <p className="settings-section__desc">
        Connect your TMDB API key for poster images and enhanced metadata. Optionally, link your account to sync your watchlist.
        Get a free key at{" "}
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer" style={{ color: "var(--accent-light)" }}>
          themoviedb.org
        </a>
      </p>

      {/* API Key row */}
      <div className="settings-row">
        <input
          type="password"
          className="text-input"
          placeholder="Your TMDB API v3 key"
          value={apiKey}
          onChange={(e) => { setApiKey(e.target.value); setStatus("idle"); }}
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-primary"
          onClick={() => void testConnection()}
          disabled={!apiKey.trim() || status === "testing"}
        >
          {status === "testing" ? "Testing..." : "Verify Key"}
        </button>
      </div>

      {status === "ok" && (
        <div className="settings-feedback settings-feedback--success">✓ API key verified</div>
      )}
      {status === "error" && (
        <div className="settings-feedback settings-feedback--error">✕ Invalid key or network error</div>
      )}

      {/* Account linking */}
      {status === "ok" && accountStep !== "linked" && (
        <div className="settings-row" style={{ marginTop: 8 }}>
          <div className="settings-row__info">
            <strong>Link TMDB Account</strong>
            <span>Sync your TMDB watchlist and ratings into Curator</span>
          </div>
          {accountStep === "idle" && (
            <button className="btn btn-ghost" onClick={() => void startAccountLink()}>
              Link Account →
            </button>
          )}
          {accountStep === "awaiting" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--warning)" }}>Approve on TMDB, then:</span>
              <button className="btn btn-primary" onClick={() => void completeAccountLink()}>
                Confirm Link
              </button>
            </div>
          )}
          {accountStep === "error" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--danger)" }}>Failed — approve token first</span>
              <button className="btn btn-ghost" onClick={() => void startAccountLink()}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Linked account info */}
      {accountStep === "linked" && accountInfo && (
        <div className="settings-row" style={{ marginTop: 8 }}>
          <div className="settings-row__info">
            <strong>@{accountInfo.username}</strong>
            <span>Linked {new Date(accountInfo.linkedAt).toLocaleDateString()}</span>
          </div>
          <button className="btn btn-danger btn-xs" onClick={unlinkAccount}>
            Unlink
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Data Management ──────────────────────────────────────────────────────────

function DataManagementSection({ onMutation }: { onMutation: SettingsTabProps["onMutation"] }) {
  const [clearing, setClearing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  const handleClearAll = async () => {
    if (!window.confirm("This will remove ALL your hidden, watched, and watchlist data. This cannot be undone. Continue?")) {
      return;
    }
    setClearing(true);
    try {
      await setStoredState({ items: {} });
      const state = await getStoredState();
      const graph = await syncTasteGraphFromState(state);
      await onMutation(state, graph);
    } finally {
      setClearing(false);
    }
  };

  const handleRestore = async (file: File) => {
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const text = await readFileAsText(file);
      const result = await restoreBackup(text);
      if (result.success) {
        const state = await getStoredState();
        const graph = await syncTasteGraphFromState(state);
        await onMutation(state, graph);
        setRestoreMsg({ ok: true, msg: `Restored ${result.itemsRestored} items and ${result.edgesRestored} taste signals` });
      } else {
        setRestoreMsg({ ok: false, msg: result.error ?? "Restore failed" });
      }
    } catch (err) {
      setRestoreMsg({ ok: false, msg: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setRestoring(false);
      if (restoreRef.current) restoreRef.current.value = "";
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h3 className="settings-section__title">
          <span>🗄</span> Data Management
        </h3>
      </div>

      {/* Backup download */}
      <div className="settings-row">
        <div className="settings-row__info">
          <strong>Export Backup</strong>
          <span>Download all your hidden/watched/watchlist items and taste profile as JSON</span>
        </div>
        <button className="btn btn-ghost" onClick={() => void downloadBackup()}>
          ↓ Download Backup
        </button>
      </div>

      {/* Restore from backup */}
      <div className="settings-row">
        <div className="settings-row__info">
          <strong>Import Backup</strong>
          <span>Restore from a previously exported backup file</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {restoring && <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Restoring...</span>}
          <button
            className="btn btn-ghost"
            onClick={() => restoreRef.current?.click()}
            disabled={restoring}
          >
            ↑ Import Backup
          </button>
          <input
            ref={restoreRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleRestore(file);
            }}
          />
        </div>
      </div>

      {restoreMsg && (
        <div className={`settings-feedback settings-feedback--${restoreMsg.ok ? "success" : "error"}`}>
          {restoreMsg.ok ? "✓" : "✕"} {restoreMsg.msg}
        </div>
      )}

      {/* Reset all data */}
      <div className="settings-row">
        <div className="settings-row__info">
          <strong>Reset All Data</strong>
          <span>Remove all hidden, watched, and watchlist entries. Taste profile will be cleared.</span>
        </div>
        <button
          className="btn btn-danger"
          onClick={() => void handleClearAll()}
          disabled={clearing}
        >
          {clearing ? "Clearing..." : "Clear All Data"}
        </button>
      </div>
    </div>
  );
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

function DiagnosticsSection() {
  const [logLevel, setLevel] = useState<LogLevel>("info");

  const handleLevelChange = (level: LogLevel) => {
    setLevel(level);
    setLogLevel(level);
  };

  const downloadLogs = () => {
    const json = exportLogsAsJSON();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `curator-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h3 className="settings-section__title">
          <span>🔧</span> Diagnostics
        </h3>
      </div>

      <div className="settings-row">
        <div className="settings-row__info">
          <strong>Log Level</strong>
          <span>Control console output verbosity</span>
        </div>
        <div className="toolbar__group">
          {(["debug", "info", "warn", "error"] as LogLevel[]).map((level) => (
            <button
              key={level}
              className={`btn ${logLevel === level ? "btn-primary" : "btn-ghost"} btn-xs`}
              onClick={() => handleLevelChange(level)}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row__info">
          <strong>Export Logs</strong>
          <span>Download recent log entries for debugging</span>
        </div>
        <button className="btn btn-ghost" onClick={downloadLogs}>
          ↓ Download ({getRecentLogs().length} entries)
        </button>
      </div>

      <div className="settings-row">
        <div className="settings-row__info">
          <strong>Version</strong>
        </div>
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>v1.0.0</span>
      </div>
    </div>
  );
}
