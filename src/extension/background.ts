import { matchCatalogItemAsync } from "../shared/catalog";
import { syncTasteGraphFromCurrentState } from "../shared/curation";
import { logUserAction } from "../shared/storage";

type SyncTasteGraphMessage = {
  type: "SYNC_TASTE_GRAPH";
};

type FetchCardMetaMessage = {
  type: "FETCH_CARD_META";
  payload: {
    title: string;
    url?: string;
  };
};

type LogUserActionMessage = {
  type: "LOG_USER_ACTION";
  payload: {
    actionType: string;
    title: string;
    context: Record<string, string | undefined>;
  };
};

type CuratorMessage = SyncTasteGraphMessage | FetchCardMetaMessage | LogUserActionMessage;

chrome.runtime.onMessage.addListener(
  (message: CuratorMessage, _sender, sendResponse) => {
    if (message.type === "SYNC_TASTE_GRAPH") {
      void handleTasteGraphSync();
      sendResponse({ success: true });
      return false;
    }

    if (message.type === "FETCH_CARD_META") {
      void handleFetchCardMeta(message.payload, sendResponse);
      return true;
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
  }
);

async function handleTasteGraphSync(): Promise<void> {
  try {
    await syncTasteGraphFromCurrentState();
    console.log("[Curator] Taste graph synced from local state.");
  } catch (err) {
    console.error("[Curator] Failed to sync taste graph:", err);
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

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create("catalog-check", {
    periodInMinutes: 60 * 24
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "catalog-check") {
    console.log("[Curator] Catalog check alarm fired - static catalog build still in use.");
  }
});
