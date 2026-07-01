/**
 * background.ts — Chrome MV3 service worker.
 *
 * Handles:
 *  - SYNC_TASTE_GRAPH    — triggered by content script after card actions
 *  - FETCH_CARD_META     — returns rating + genres for a card title from catalog
 *  - LOG_USER_ACTION     — writes action log entry to Dexie
 *  - CURATOR_EXPORT_DATA — triggers a data backup export download in the app tab
 *
 * Alarms:
 *  - catalog-check       — daily check for catalog staleness
 *  - tmdb-watchlist-sync — every 6 hours if TMDB account is linked
 */

import { matchCatalogItemAsync } from "../shared/catalog";
import { syncTasteGraphFromCurrentState } from "../shared/curation";
import { getSyncState, setSyncState } from "../shared/db";
import { createLogger } from "../shared/logger";
import { logUserAction } from "../shared/storage";

const log = createLogger("background");

// ─── Message types ────────────────────────────────────────────────────────────

type SyncTasteGraphMessage   = { type: "SYNC_TASTE_GRAPH" };
type FetchCardMetaMessage    = { type: "FETCH_CARD_META"; payload: { title: string; url?: string } };
type LogUserActionMessage    = { type: "LOG_USER_ACTION"; payload: { actionType: string; title: string; context: Record<string, string | undefined> } };
type CuratorPagePingMessage  = { type: "CURATOR_PAGE_PING" };

type CuratorMessage =
  | SyncTasteGraphMessage
  | FetchCardMetaMessage
  | LogUserActionMessage
  | CuratorPagePingMessage;

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: CuratorMessage, _sender, sendResponse) => {
    if (message.type === "SYNC_TASTE_GRAPH") {
      void handleTasteGraphSync();
      sendResponse({ success: true });
      return false;
    }

    if (message.type === "FETCH_CARD_META") {
      void handleFetchCardMeta(message.payload, sendResponse);
      return true; // async response
    }

    if (message.type === "LOG_USER_ACTION") {
      void logUserAction(
        message.payload.actionType as Parameters<typeof logUserAction>[0],
        message.payload.title,
        message.payload.context
      );
      sendResponse({ success: true });
      return false;
    }

    if (message.type === "CURATOR_PAGE_PING") {
      // This is handled by the content script, not the background worker.
      // Background passes it through.
      return false;
    }
  }
);

// ─── Taste graph sync ─────────────────────────────────────────────────────────

async function handleTasteGraphSync(): Promise<void> {
  try {
    await syncTasteGraphFromCurrentState();
    await setSyncState("taste_graph_last_sync", new Date().toISOString());
    log.info("Taste graph synced from local state");
  } catch (err) {
    log.error("Failed to sync taste graph", { error: String(err) });
  }
}

// ─── Card meta fetch ──────────────────────────────────────────────────────────

async function handleFetchCardMeta(
  payload: { title: string; url?: string },
  sendResponse: (response: { rating: number | null; genres: string[] }) => void
): Promise<void> {
  try {
    const item = await matchCatalogItemAsync(payload.title, payload.url);
    if (item) {
      sendResponse({
        rating: item.vote_average ?? item.imdb_rating ?? null,
        genres: item.genres
      });
    } else {
      sendResponse({ rating: null, genres: [] });
    }
  } catch {
    sendResponse({ rating: null, genres: [] });
  }
}

// ─── Install & alarm setup ────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  log.info("Extension installed/updated", { reason: details.reason });

  // Daily catalog check
  await chrome.alarms.create("catalog-check", { periodInMinutes: 60 * 24 });

  // TMDB watchlist sync every 6 hours
  await chrome.alarms.create("tmdb-watchlist-sync", { periodInMinutes: 60 * 6 });

  // Record install state
  await setSyncState("extension_installed_at", new Date().toISOString()).catch(() => {});
});

// ─── Alarm handlers ───────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "catalog-check") {
    void handleCatalogCheck();
  }
  if (alarm.name === "tmdb-watchlist-sync") {
    void handleTmdbWatchlistSync();
  }
});

async function handleCatalogCheck(): Promise<void> {
  try {
    const lastSync = await getSyncState("catalog_last_full_sync");
    const lastSyncTime = lastSync?.value ? new Date(lastSync.value as string).getTime() : 0;
    const hoursSince = (Date.now() - lastSyncTime) / (1000 * 60 * 60);

    if (hoursSince < 20) {
      log.debug("Catalog still fresh, skipping check", { hoursSince: Math.round(hoursSince) });
      return;
    }

    log.info("Catalog check: static catalog build in use, no remote fetch needed");
    await setSyncState("catalog_last_full_sync", new Date().toISOString());
  } catch (err) {
    log.warn("Catalog check failed", { error: String(err) });
  }
}

async function handleTmdbWatchlistSync(): Promise<void> {
  try {
    // Check if TMDB session exists — we can only read chrome.storage, not localStorage
    // (localStorage is per-tab context, not available in service workers)
    // The actual sync is triggered by the Settings tab when user manually requests it.
    // The alarm just nudges the side panel tab if it's open to prompt a re-sync.
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const hotstarTab = tabs.find((t) =>
      t.url?.includes("hotstar.com") || t.url?.includes("jiohotstar.com")
    );

    if (hotstarTab?.id) {
      // Notify the content script to re-process the page with fresh state
      try {
        await chrome.tabs.sendMessage(hotstarTab.id, { type: "CURATOR_REFRESH" });
      } catch {
        // Tab may not have content script — ignore
      }
    }

    await setSyncState("tmdb_last_sync_attempt", new Date().toISOString());
    log.debug("TMDB watchlist sync alarm fired — side panel handles full sync");
  } catch (err) {
    log.warn("TMDB watchlist sync alarm failed", { error: String(err) });
  }
}

// ─── Side panel auto-open on extension icon click ────────────────────────────

chrome.action.onClicked?.addListener((tab) => {
  // If user clicks the extension icon directly (not the popup), open side panel
  if (tab.id) {
    void chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
      // Fall back to popup if sidePanel not available
    });
  }
});
