/**
 * content-storage.ts
 *
 * A minimal, zero-dependency storage module used ONLY by the content script.
 * It does NOT import Dexie, React, or any npm package — making it safe to
 * bundle as a self-contained IIFE for Chrome MV3 content scripts.
 *
 * The full storage.ts (which uses Dexie for the action log) is used by the
 * page-side app and popup — not here.
 */

const STORAGE_KEY = "curatorState";

export type ItemState = "hidden" | "watched" | "watch_later";

export type StoredItem = {
  canonicalKey: string;
  title: string;
  state: ItemState;
  sourceUrl?: string;
  updatedAt: string;
};

export type StoredState = {
  items: Record<string, StoredItem>;
};

// ─── Chrome storage helpers ────────────────────────────────────────────────────

function readFromChrome(): Promise<StoredState> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        if (chrome.runtime.lastError) {
          resolve({ items: {} });
          return;
        }
        const raw = result[STORAGE_KEY] as StoredState | undefined;
        resolve(raw ?? { items: {} });
      });
    } catch {
      resolve({ items: {} });
    }
  });
}

function writeToChrome(state: StoredState): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getStoredState(): Promise<StoredState> {
  return readFromChrome();
}

export async function upsertStoredItem(
  canonicalKey: string,
  title: string,
  state: ItemState,
  sourceUrl?: string
): Promise<void> {
  const current = await readFromChrome();
  current.items[canonicalKey] = {
    canonicalKey,
    title,
    state,
    sourceUrl,
    updatedAt: new Date().toISOString()
  };
  await writeToChrome(current);
}

export async function removeStoredItem(canonicalKey: string): Promise<void> {
  const current = await readFromChrome();
  delete current.items[canonicalKey];
  await writeToChrome(current);
}

/**
 * Fire-and-forget action log via background message.
 * The background worker writes it to Dexie — the content script never touches Dexie.
 */
export function logUserAction(
  actionType: string,
  title: string,
  context: Record<string, string | undefined>
): void {
  try {
    chrome.runtime.sendMessage({
      type: "LOG_USER_ACTION",
      payload: { actionType, title, context }
    });
  } catch {
    // Extension context may be invalidated — ignore.
  }
}
