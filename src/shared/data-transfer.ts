/**
 * data-transfer.ts — Export and import all user data as a portable JSON backup.
 *
 * This allows users to:
 * - Back up their hidden/watched/watchlist items
 * - Move their data between devices or browsers
 * - Share or restore their curation profile
 *
 * Format is a self-describing JSON object with a version field.
 */

import { createLogger } from "./logger";
import { getStoredState, getTasteGraph, setStoredState, setTasteGraph } from "./storage";
import { syncTasteGraphFromCurrentState } from "./curation";
import { getImdbImportHistory } from "./db";
import type { StoredState, TasteGraph } from "./types";

const log = createLogger("data-transfer");

// ─── Types ────────────────────────────────────────────────────────────────────

export type CuratorBackup = {
  /** Format version — for future migration support */
  version: "1.0";
  /** ISO timestamp when the backup was created */
  exported_at: string;
  /** User's curation state (hidden/watched/watchlist items) */
  stored_state: StoredState;
  /** User's taste graph (genre/actor/director weights) */
  taste_graph: TasteGraph;
  /** TMDB session username (not the key or session_id — just display info) */
  tmdb_username: string | null;
  /** Number of IMDb imports ever done */
  imdb_import_count: number;
};

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Export all user data as a JSON string suitable for download.
 */
export async function exportAllData(): Promise<string> {
  log.info("Exporting all user data");

  const [state, graph, importHistory] = await Promise.all([
    getStoredState(),
    getTasteGraph(),
    getImdbImportHistory()
  ]);

  // Get TMDB username (safe — no key or session_id)
  let tmdbUsername: string | null = null;
  try {
    const session = localStorage.getItem("curator_tmdb_session");
    if (session) {
      const parsed = JSON.parse(session) as { username?: string };
      tmdbUsername = parsed.username ?? null;
    }
  } catch { /* ignore */ }

  const backup: CuratorBackup = {
    version: "1.0",
    exported_at: new Date().toISOString(),
    stored_state: state,
    taste_graph: graph,
    tmdb_username: tmdbUsername,
    imdb_import_count: importHistory.length
  };

  const json = JSON.stringify(backup, null, 2);
  log.info("Export complete", {
    items: Object.keys(state.items).length,
    edges: Object.keys(graph.edges).length,
    bytes: json.length
  });

  return json;
}

/**
 * Trigger a browser download of the user's backup file.
 */
export async function downloadBackup(): Promise<void> {
  const json = await exportAllData();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jiohotstar-curator-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Import / Restore ─────────────────────────────────────────────────────────

export type RestoreResult = {
  success: boolean;
  itemsRestored: number;
  edgesRestored: number;
  error?: string;
};

/**
 * Validate and restore a backup file.
 */
export async function restoreBackup(json: string): Promise<RestoreResult> {
  log.info("Restoring backup");

  let backup: CuratorBackup;

  try {
    backup = JSON.parse(json) as CuratorBackup;
  } catch {
    return { success: false, itemsRestored: 0, edgesRestored: 0, error: "Invalid JSON file" };
  }

  // Version check
  if (backup.version !== "1.0") {
    return {
      success: false,
      itemsRestored: 0,
      edgesRestored: 0,
      error: `Unsupported backup version: ${String(backup.version)}`
    };
  }

  // Validate required fields
  if (!backup.stored_state?.items || typeof backup.stored_state.items !== "object") {
    return { success: false, itemsRestored: 0, edgesRestored: 0, error: "Backup is missing stored_state.items" };
  }

  if (!backup.taste_graph?.edges || typeof backup.taste_graph.edges !== "object") {
    return { success: false, itemsRestored: 0, edgesRestored: 0, error: "Backup is missing taste_graph.edges" };
  }

  try {
    // Restore state
    await setStoredState(backup.stored_state);
    await setTasteGraph(backup.taste_graph);

    const itemCount = Object.keys(backup.stored_state.items).length;
    const edgeCount = Object.keys(backup.taste_graph.edges).length;

    log.info("Restore complete", { items: itemCount, edges: edgeCount });

    return { success: true, itemsRestored: itemCount, edgesRestored: edgeCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("Restore failed", { error: msg });
    return { success: false, itemsRestored: 0, edgesRestored: 0, error: msg };
  }
}

/**
 * Read a File object as text.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
