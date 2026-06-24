import { matchCatalogItemAsync } from "../shared/catalog";
import { getTasteGraph, setTasteGraph } from "../shared/storage";
import { updateTasteGraph } from "../shared/taste";
import type { ItemState } from "../shared/types";

// ─── Message types ────────────────────────────────────────────────────────────

type UpdateTasteGraphMessage = {
  type: "UPDATE_TASTE_GRAPH";
  payload: {
    title: string;
    url?: string;
    state: ItemState;
  };
};

type FetchCardMetaMessage = {
  type: "FETCH_CARD_META";
  payload: {
    title: string;
    url?: string;
  };
};

type CuratorMessage = UpdateTasteGraphMessage | FetchCardMetaMessage;

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: CuratorMessage, _sender, sendResponse) => {
    if (message.type === "UPDATE_TASTE_GRAPH") {
      void handleTasteGraphUpdate(message.payload);
      sendResponse({ success: true });
      return false;
    }

    if (message.type === "FETCH_CARD_META") {
      // Must return true to keep channel open for async response
      void handleFetchCardMeta(message.payload, sendResponse);
      return true;
    }
  }
);

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleTasteGraphUpdate(payload: {
  title: string;
  url?: string;
  state: ItemState;
}): Promise<void> {
  try {
    const catalogItem = await matchCatalogItemAsync(payload.title, payload.url);
    if (!catalogItem) {
      console.log(`[Curator] No catalog item for taste update: ${payload.title}`);
      return;
    }

    const graph = await getTasteGraph();
    const updatedGraph = updateTasteGraph(graph, payload.state, catalogItem);
    await setTasteGraph(updatedGraph);

    console.log(`[Curator] Taste graph updated: ${payload.title} → ${payload.state}`);
  } catch (err) {
    console.error("[Curator] Failed to update taste graph:", err);
  }
}

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

// ─── Alarm: periodic catalog version check ────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create("catalog-check", {
    periodInMinutes: 60 * 24 // once a day
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "catalog-check") {
    console.log("[Curator] Catalog check alarm fired — nothing to update yet (static catalog).");
  }
});
