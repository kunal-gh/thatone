import { canonicalKeyFromTitle, canonicalKeyFromUrl } from "../shared/normalize";
import { getStoredState, upsertStoredItem, logUserAction } from "../shared/storage";
import { findCandidateCards } from "./adapter";
import type { ItemState } from "../shared/types";
import type { CandidateCard, StoredState } from "../shared/types";

const CARD_MARKER = "data-curator-processed";
const HIDDEN_MARKER = "data-curator-hidden";
const ACTIONS_MARKER = "data-curator-actions";
const STYLE_MARKER = "data-curator-style";
const TOAST_ID = "curator-undo-toast";

// ─── Styles ───────────────────────────────────────────────────────────────────

function ensureInjectedStyles(): void {
  if (document.getElementById(STYLE_MARKER)) return;

  const style = document.createElement("style");
  style.id = STYLE_MARKER;
  style.textContent = `
    [data-curator-root] {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 9999;
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 6px 8px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      transition: opacity 0.2s, transform 0.2s;
    }

    [data-curator-button] {
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 6px 12px;
      color: white;
      font: 600 11px/1 "Inter", "Segoe UI", Tahoma, sans-serif;
      cursor: pointer;
      letter-spacing: 0.02em;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    [data-curator-button]:hover {
      transform: translateY(-1px);
    }

    [data-curator-button="hidden"] { 
      background: rgba(239, 68, 68, 0.15); 
      color: #fca5a5;
    }
    [data-curator-button="hidden"]:hover {
      background: rgba(239, 68, 68, 0.3);
      border-color: rgba(239, 68, 68, 0.5);
    }

    [data-curator-button="watched"] { 
      background: rgba(16, 185, 129, 0.15); 
      color: #6ee7b7;
    }
    [data-curator-button="watched"]:hover {
      background: rgba(16, 185, 129, 0.3);
      border-color: rgba(16, 185, 129, 0.5);
    }

    [data-curator-button="watch_later"] { 
      background: rgba(59, 130, 246, 0.15); 
      color: #93c5fd;
    }
    [data-curator-button="watch_later"]:hover {
      background: rgba(59, 130, 246, 0.3);
      border-color: rgba(59, 130, 246, 0.5);
    }

    [data-curator-badge] {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      font: 700 11px/1 "Inter", "Segoe UI", Tahoma, sans-serif;
      white-space: nowrap;
    }

    #${TOAST_ID} {
      position: fixed;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      opacity: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 20px;
      background: rgba(2, 6, 23, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 12px;
      color: #f8fafc;
      font: 500 14px/1 "Inter", "Segoe UI", Tahoma, sans-serif;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      pointer-events: auto;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    #${TOAST_ID}.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    #${TOAST_ID} button {
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.05);
      color: white;
      font: 600 12px/1 "Inter", "Segoe UI", Tahoma, sans-serif;
      cursor: pointer;
      padding: 6px 14px;
      transition: background 0.2s;
    }
    
    #${TOAST_ID} button:hover {
      background: rgba(255, 255, 255, 0.15);
    }
  `;

  document.head.appendChild(style);
}

// ─── Card visibility ──────────────────────────────────────────────────────────

function shouldHide(card: CandidateCard, state: StoredState): boolean {
  const urlKey = card.url ? canonicalKeyFromUrl(card.url) : null;
  const titleKey = canonicalKeyFromTitle(card.title);

  const byUrl = urlKey ? state.items[urlKey] : undefined;
  const byTitle = state.items[titleKey];
  const item = byUrl ?? byTitle;

  // Only hide and watched suppress card visibility; watch_later keeps it visible
  return item?.state === "hidden" || item?.state === "watched";
}

function hideCard(card: CandidateCard): void {
  if (card.element.getAttribute(HIDDEN_MARKER) === "true") return;
  card.element.style.display = "none";
  card.element.setAttribute(HIDDEN_MARKER, "true");
}

// ─── Storage & taste graph ────────────────────────────────────────────────────

let _lastAction: { card: CandidateCard; prevState: ItemState | null } | null = null;

async function persistCardState(
  card: CandidateCard,
  state: ItemState,
  prevState: ItemState | null
): Promise<void> {
  _lastAction = { card, prevState };

  const titleKey = canonicalKeyFromTitle(card.title);
  const urlKey = card.url ? canonicalKeyFromUrl(card.url) : null;

  await upsertStoredItem(titleKey, card.title, state, card.url);
  if (urlKey && urlKey !== titleKey) {
    await upsertStoredItem(urlKey, card.title, state, card.url);
  }

  // Log to IndexedDB action log
  const actionType = state === "hidden" ? "hide" : state === "watched" ? "watched" : "watch_later";
  void logUserAction(actionType, card.title, {
    source_url: card.url,
    context: "homepage"
  });

  // Notify background to update taste graph (only for hide/watched, not watch_later)
  if (state !== "watch_later") {
    try {
      chrome.runtime.sendMessage({
        type: "UPDATE_TASTE_GRAPH",
        payload: { title: card.title, url: card.url, state }
      });
    } catch {
      // Extension context may not be connected
    }
  }
}

async function undoLastAction(): Promise<void> {
  if (!_lastAction) return;
  const { card, prevState } = _lastAction;
  _lastAction = null;

  const titleKey = canonicalKeyFromTitle(card.title);
  const urlKey = card.url ? canonicalKeyFromUrl(card.url) : null;

  if (prevState === null) {
    // Remove completely
    const { removeStoredItem } = await import("../shared/storage");
    await removeStoredItem(titleKey);
    if (urlKey && urlKey !== titleKey) await removeStoredItem(urlKey);
  } else {
    await upsertStoredItem(titleKey, card.title, prevState, card.url);
    if (urlKey && urlKey !== titleKey) {
      await upsertStoredItem(urlKey, card.title, prevState, card.url);
    }
  }

  // Show card again
  card.element.style.display = "";
  card.element.removeAttribute(HIDDEN_MARKER);

  void logUserAction("unhide", card.title, { source_url: card.url, context: "homepage" });
}

// ─── Undo toast ───────────────────────────────────────────────────────────────

let _toastTimer: ReturnType<typeof setTimeout> | null = null;

function showUndoToast(action: string): void {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    document.body.appendChild(toast);
  }

  const label = action === "hidden" ? "Hidden" : action === "watched" ? "Marked watched" : "Saved for later";
  toast.innerHTML = `<span>${label}</span><button id="curator-undo-btn">Undo</button>`;
  
  // Force a reflow so the transition triggers
  void toast.offsetWidth;
  toast.classList.add("show");

  document.getElementById("curator-undo-btn")?.addEventListener("click", () => {
    void undoLastAction();
    dismissToast();
  });

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(dismissToast, 5000);
}

function dismissToast(): void {
  const toast = document.getElementById(TOAST_ID);
  if (toast) {
    toast.classList.remove("show");
  }
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
}

// ─── Card UI ──────────────────────────────────────────────────────────────────

function ensureCardIsPositionable(cardElement: HTMLElement): void {
  if (window.getComputedStyle(cardElement).position === "static") {
    cardElement.style.position = "relative";
  }
}

function getCatalogRating(card: CandidateCard): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "FETCH_CARD_META", payload: { title: card.title, url: card.url } },
        (response) => {
          if (response?.rating) resolve(response.rating as number);
          else resolve(null);
        }
      );
    } catch {
      resolve(null);
    }
  });
}

async function injectActions(card: CandidateCard): Promise<void> {
  if (card.element.querySelector(`[${ACTIONS_MARKER}]`)) return;

  ensureCardIsPositionable(card.element);

  const root = document.createElement("div");
  root.setAttribute("data-curator-root", "true");
  root.setAttribute(ACTIONS_MARKER, "true");

  // Rating badge (fetched async)
  const badge = document.createElement("span");
  badge.setAttribute("data-curator-badge", "true");
  badge.textContent = "★ …";
  root.appendChild(badge);

  void getCatalogRating(card).then((rating) => {
    if (rating !== null) {
      badge.textContent = `★ ${rating.toFixed(1)}`;
    } else {
      badge.style.display = "none";
    }
  });

  // Current state (to enable undo)
  const currentState = await getStoredState();
  const titleKey = canonicalKeyFromTitle(card.title);
  const existing = currentState.items[titleKey] ?? null;
  const prevItemState = existing?.state ?? null;

  const makeButton = (label: string, state: ItemState) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.setAttribute("data-curator-button", state);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void persistCardState(card, state, prevItemState).then(() => {
        if (state === "hidden" || state === "watched") hideCard(card);
        showUndoToast(state);
      });
    });
    return btn;
  };

  root.append(
    makeButton("Hide", "hidden"),
    makeButton("Watched", "watched"),
    makeButton("Later", "watch_later")
  );

  card.element.appendChild(root);
}

// ─── Document processing ──────────────────────────────────────────────────────

async function processDocument(root: ParentNode = document): Promise<void> {
  const state = await getStoredState();
  const cards = findCandidateCards(root);

  for (const card of cards) {
    if (card.element.getAttribute(CARD_MARKER) === "true") continue;
    card.element.setAttribute(CARD_MARKER, "true");

    if (shouldHide(card, state)) {
      hideCard(card);
      continue;
    }

    void injectActions(card);
  }
}

function startObserver(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        void processDocument(node);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

async function bootstrap(): Promise<void> {
  ensureInjectedStyles();
  await processDocument(document);
  startObserver();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void bootstrap());
} else {
  void bootstrap();
}
