import { canonicalKeyFromTitle, canonicalKeyFromUrl } from "./normalize";
import { getStorageProvider } from "./runtime";
import { emptyTasteGraph } from "./taste";
import { db } from "./db";
import type {
  ActionContext,
  ItemState,
  StoredItem,
  StoredState,
  TasteGraph,
  UserAction,
  UserActionType
} from "./types";

const STORAGE_KEY = "curatorState";
const TASTE_KEY = "curatorTaste";
const STORED_STATE_EVENT = "curator:stored-state";
const TASTE_GRAPH_EVENT = "curator:taste-graph";
const fallbackMemoryStore = new Map<string, string>();

function getChromeStorageArea(): chrome.storage.LocalStorageArea | null {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    return chrome.storage.local;
  }

  return null;
}

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function readFallbackValue<T>(key: string, fallback: T): T {
  const raw = hasWindow()
    ? window.localStorage.getItem(key)
    : fallbackMemoryStore.get(key) ?? null;

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeFallbackValue<T>(key: string, value: T): void {
  const serialized = JSON.stringify(value);

  if (hasWindow()) {
    window.localStorage.setItem(key, serialized);
    return;
  }

  fallbackMemoryStore.set(key, serialized);
}

function emitStorageEvent<T>(eventName: string, payload: T): void {
  if (!hasWindow()) return;
  window.dispatchEvent(new CustomEvent<T>(eventName, { detail: payload }));
}

export async function getStoredState(): Promise<StoredState> {
  const chromeStorage = getChromeStorageArea();

  if (chromeStorage) {
    const result = await chromeStorage.get(STORAGE_KEY);
    const state = result[STORAGE_KEY] as StoredState | undefined;
    return state ?? { items: {} };
  }

  return readFallbackValue(STORAGE_KEY, { items: {} });
}

export async function setStoredState(state: StoredState): Promise<void> {
  const chromeStorage = getChromeStorageArea();

  if (chromeStorage) {
    await chromeStorage.set({ [STORAGE_KEY]: state });
    return;
  }

  writeFallbackValue(STORAGE_KEY, state);
  emitStorageEvent(STORED_STATE_EVENT, state);
}

export async function upsertStoredItem(
  canonicalKey: string,
  title: string,
  state: ItemState,
  sourceUrl?: string
): Promise<void> {
  const current = await getStoredState();

  current.items[canonicalKey] = {
    canonicalKey,
    title,
    sourceUrl,
    state,
    updatedAt: new Date().toISOString()
  };

  await setStoredState(current);
}

export async function removeStoredItem(canonicalKey: string): Promise<void> {
  const current = await getStoredState();
  delete current.items[canonicalKey];
  await setStoredState(current);
}

export function subscribeToStoredState(
  callback: (state: StoredState) => void
): () => void {
  const chromeStorage = getChromeStorageArea();

  if (!chromeStorage || !hasWindow()) {
    const customListener = (event: Event) => {
      const detail = (event as CustomEvent<StoredState>).detail;
      callback(detail ?? { items: {} });
    };

    const storageListener = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      callback(readFallbackValue(STORAGE_KEY, { items: {} }));
    };

    if (hasWindow()) {
      window.addEventListener(STORED_STATE_EVENT, customListener);
      window.addEventListener("storage", storageListener);
    }

    return () => {
      if (!hasWindow()) return;
      window.removeEventListener(STORED_STATE_EVENT, customListener);
      window.removeEventListener("storage", storageListener);
    };
  }

  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) return;
    callback((changes[STORAGE_KEY].newValue as StoredState | undefined) ?? { items: {} });
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function getWatchLaterItems(): Promise<StoredItem[]> {
  const state = await getStoredState();
  return getUniqueStoredItems(state).filter((item) => item.state === "watch_later");
}

export async function getTasteGraph(): Promise<TasteGraph> {
  const chromeStorage = getChromeStorageArea();

  if (chromeStorage) {
    const result = await chromeStorage.get(TASTE_KEY);
    const graph = result[TASTE_KEY] as TasteGraph | undefined;
    return graph ?? emptyTasteGraph();
  }

  return readFallbackValue(TASTE_KEY, emptyTasteGraph());
}

export async function setTasteGraph(graph: TasteGraph): Promise<void> {
  const chromeStorage = getChromeStorageArea();

  if (chromeStorage) {
    await chromeStorage.set({ [TASTE_KEY]: graph });
    return;
  }

  writeFallbackValue(TASTE_KEY, graph);
  emitStorageEvent(TASTE_GRAPH_EVENT, graph);
}

export function subscribeToTasteGraph(
  callback: (graph: TasteGraph) => void
): () => void {
  const chromeStorage = getChromeStorageArea();

  if (!chromeStorage || !hasWindow()) {
    const customListener = (event: Event) => {
      const detail = (event as CustomEvent<TasteGraph>).detail;
      callback(detail ?? emptyTasteGraph());
    };

    const storageListener = (event: StorageEvent) => {
      if (event.key !== TASTE_KEY) return;
      callback(readFallbackValue(TASTE_KEY, emptyTasteGraph()));
    };

    if (hasWindow()) {
      window.addEventListener(TASTE_GRAPH_EVENT, customListener);
      window.addEventListener("storage", storageListener);
    }

    return () => {
      if (!hasWindow()) return;
      window.removeEventListener(TASTE_GRAPH_EVENT, customListener);
      window.removeEventListener("storage", storageListener);
    };
  }

  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== "local" || !changes[TASTE_KEY]) return;
    callback((changes[TASTE_KEY].newValue as TasteGraph | undefined) ?? emptyTasteGraph());
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function logUserAction(
  actionType: UserActionType,
  title: string,
  options?: {
    content_id?: string | null;
    source_url?: string | null;
    context?: ActionContext;
  }
): Promise<void> {
  const action: UserAction = {
    action_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content_id: options?.content_id ?? null,
    title,
    source_url: options?.source_url ?? null,
    action_type: actionType,
    context: options?.context ?? "homepage",
    created_at: new Date().toISOString()
  };

  try {
    await db.user_actions.add(action);
  } catch {
    // Tests and private browsing modes can fail here. State flow should still work.
  }
}

export async function getRecentActions(limit = 50): Promise<UserAction[]> {
  return db.user_actions
    .orderBy("created_at")
    .reverse()
    .limit(limit)
    .toArray();
}

export async function getActionCount(): Promise<number> {
  return db.user_actions.count();
}

export function getUniqueStoredItems(state: StoredState): StoredItem[] {
  const unique = new Map<string, StoredItem>();

  for (const item of Object.values(state.items)) {
    const signature =
      item.sourceUrl
        ? canonicalKeyFromUrl(item.sourceUrl) ?? canonicalKeyFromTitle(item.title)
        : canonicalKeyFromTitle(item.title);

    const existing = unique.get(signature);

    if (!existing || item.updatedAt > existing.updatedAt) {
      unique.set(signature, item);
    }
  }

  return Array.from(unique.values());
}

export function getStorageHealthLabel(): string {
  return getStorageProvider();
}
