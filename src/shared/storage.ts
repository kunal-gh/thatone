import type { ItemState, StoredItem, StoredState, TasteGraph } from "./types";
import { emptyTasteGraph } from "./taste";

const STORAGE_KEY = "curatorState";
const TASTE_KEY = "curatorTaste";

function getChromeStorageArea(): chrome.storage.LocalStorageArea {
  return chrome.storage.local;
}

// ─── Curator state (hidden/watched items) ─────────────────────────────────────

export async function getStoredState(): Promise<StoredState> {
  const result = await getChromeStorageArea().get(STORAGE_KEY);
  const state = result[STORAGE_KEY] as StoredState | undefined;

  return state ?? { items: {} };
}

export async function setStoredState(state: StoredState): Promise<void> {
  await getChromeStorageArea().set({
    [STORAGE_KEY]: state
  });
}

export async function upsertStoredItem(
  canonicalKey: string,
  title: string,
  state: ItemState,
  sourceUrl?: string
): Promise<void> {
  const current = await getStoredState();

  const item: StoredItem = {
    canonicalKey,
    title,
    sourceUrl,
    state,
    updatedAt: new Date().toISOString()
  };

  current.items[canonicalKey] = item;

  await getChromeStorageArea().set({
    [STORAGE_KEY]: current
  });
}

export async function removeStoredItem(canonicalKey: string): Promise<void> {
  const current = await getStoredState();
  delete current.items[canonicalKey];

  await getChromeStorageArea().set({
    [STORAGE_KEY]: current
  });
}

export function subscribeToStoredState(
  callback: (state: StoredState) => void
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) {
      return;
    }

    callback((changes[STORAGE_KEY].newValue as StoredState | undefined) ?? { items: {} });
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

// ─── Taste graph ──────────────────────────────────────────────────────────────

export async function getTasteGraph(): Promise<TasteGraph> {
  const result = await getChromeStorageArea().get(TASTE_KEY);
  const graph = result[TASTE_KEY] as TasteGraph | undefined;
  return graph ?? emptyTasteGraph();
}

export async function setTasteGraph(graph: TasteGraph): Promise<void> {
  await getChromeStorageArea().set({
    [TASTE_KEY]: graph
  });
}

export function subscribeToTasteGraph(
  callback: (graph: TasteGraph) => void
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== "local" || !changes[TASTE_KEY]) {
      return;
    }

    callback(
      (changes[TASTE_KEY].newValue as TasteGraph | undefined) ?? emptyTasteGraph()
    );
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}
