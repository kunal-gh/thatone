import { canonicalKeyFromTitle, canonicalKeyFromUrl } from "../shared/normalize";
import {
  getStoredState,
  logUserAction,
  removeStoredItem,
  upsertStoredItem
} from "../shared/storage";
import type { CandidateCard, ItemState, StoredState } from "../shared/types";
import { findCandidateCards } from "./adapter";

const CARD_MARKER = "data-curator-processed";
const HIDDEN_MARKER = "data-curator-hidden";
const ACTIONS_MARKER = "data-curator-actions";
const STYLE_MARKER = "data-curator-style";
const TOAST_ID = "curator-undo-toast";
const STATUS_ID = "curator-page-status";
const BOOTSTRAP_FLAG = "__jioHotstarCuratorBootstrapped";
const PAGE_PING_TYPE = "CURATOR_PAGE_PING";
const WARMUP_SCAN_LIMIT = 30;
const WARMUP_SCAN_INTERVAL_MS = 1500;

let pendingScan = false;
let lastDetectedCount = 0;

type PagePingResponse = {
  cards: number;
  connected: boolean;
  controls: number;
  hidden: number;
  url: string;
};

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
      flex-wrap: wrap;
      max-width: calc(100% - 16px);
      padding: 8px;
      background: #ffffff;
      border: 2px solid #000000;
      border-radius: 4px;
      box-shadow: 4px 4px 0 #000000;
    }

    [data-curator-button] {
      border: 2px solid #000000;
      border-radius: 4px;
      padding: 6px 10px;
      background: #ffffff;
      color: #000000;
      font: 700 11px/1 Arial, Helvetica, sans-serif;
      cursor: pointer;
      text-transform: uppercase;
    }

    [data-curator-button]:hover {
      background: #000000;
      color: #ffffff;
    }

    [data-curator-badge] {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border: 2px solid #c3c3c3;
      border-radius: 4px;
      background: #f3f3f3;
      color: #1c1c1c;
      font: 700 11px/1 Arial, Helvetica, sans-serif;
      text-transform: uppercase;
      white-space: nowrap;
    }

    #${TOAST_ID} {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: #000000;
      border: 2px solid #ffffff;
      border-radius: 4px;
      color: #ffffff;
      font: 700 12px/1 Arial, Helvetica, sans-serif;
      text-transform: uppercase;
      box-shadow: 4px 4px 0 #1c1c1c;
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms ease;
    }

    #${TOAST_ID}.show {
      opacity: 1;
      pointer-events: auto;
    }

    #${TOAST_ID} button {
      border: 2px solid #ffffff;
      border-radius: 4px;
      background: #000000;
      color: #ffffff;
      padding: 6px 10px;
      font: 700 11px/1 Arial, Helvetica, sans-serif;
      cursor: pointer;
      text-transform: uppercase;
    }

    #${TOAST_ID} button:hover {
      background: #ffffff;
      color: #000000;
    }

    #${STATUS_ID} {
      position: fixed;
      left: 16px;
      bottom: 16px;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      max-width: calc(100vw - 32px);
      padding: 10px 12px;
      background: #ffffff;
      border: 2px solid #000000;
      border-radius: 4px;
      color: #000000;
      font: 700 11px/1 Arial, Helvetica, sans-serif;
      letter-spacing: 0;
      text-transform: uppercase;
      box-shadow: 4px 4px 0 #000000;
      pointer-events: none;
    }

    #${STATUS_ID}[data-state="scanning"] {
      background: #f3f3f3;
      color: #1c1c1c;
    }
  `;

  document.head.appendChild(style);
}

function ensurePageStatus(): HTMLElement {
  let status = document.getElementById(STATUS_ID);
  if (!status) {
    status = document.createElement("div");
    status.id = STATUS_ID;
    status.setAttribute("data-state", "scanning");
    status.textContent = "CURATOR CONNECTED / SCANNING JIOHOTSTAR";
    document.body.appendChild(status);
  }

  return status;
}

function updatePageStatus(detectedCount = lastDetectedCount): void {
  lastDetectedCount = Math.max(lastDetectedCount, detectedCount);

  const status = ensurePageStatus();
  const processed = document.querySelectorAll(`[${CARD_MARKER}="true"]`).length;
  const controls = document.querySelectorAll(`[${ACTIONS_MARKER}="true"]`).length;
  const hidden = document.querySelectorAll(`[${HIDDEN_MARKER}="true"]`).length;
  const visibleCount = Math.max(lastDetectedCount, processed);

  status.setAttribute("data-state", visibleCount > 0 ? "ready" : "scanning");
  status.textContent =
    visibleCount > 0
      ? `CURATOR CONNECTED / ${visibleCount} CARDS / ${controls} CONTROLS / ${hidden} HIDDEN`
    : "CURATOR CONNECTED / SCANNING JIOHOTSTAR";
}

function getPagePingResponse(): PagePingResponse {
  return {
    cards: Math.max(lastDetectedCount, document.querySelectorAll(`[${CARD_MARKER}="true"]`).length),
    connected: Boolean(document.getElementById(STATUS_ID)),
    controls: document.querySelectorAll(`[${ACTIONS_MARKER}="true"]`).length,
    hidden: document.querySelectorAll(`[${HIDDEN_MARKER}="true"]`).length,
    url: window.location.href
  };
}

function shouldHide(card: CandidateCard, state: StoredState): boolean {
  const titleKey = canonicalKeyFromTitle(card.title);
  const urlKey = card.url ? canonicalKeyFromUrl(card.url) : null;
  const item = (urlKey ? state.items[urlKey] : undefined) ?? state.items[titleKey];
  return item?.state === "hidden" || item?.state === "watched";
}

function hideCard(card: CandidateCard): void {
  if (card.element.getAttribute(HIDDEN_MARKER) === "true") return;
  card.element.style.display = "none";
  card.element.setAttribute(HIDDEN_MARKER, "true");
}

let lastAction: { card: CandidateCard; previousState: ItemState | null } | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function syncTasteGraph(): void {
  try {
    chrome.runtime.sendMessage({ type: "SYNC_TASTE_GRAPH" });
  } catch {
    // Extension context may not be available in tests or during reloads.
  }
}

async function persistCardState(
  card: CandidateCard,
  state: ItemState,
  previousState: ItemState | null
): Promise<void> {
  lastAction = { card, previousState };

  const titleKey = canonicalKeyFromTitle(card.title);
  const urlKey = card.url ? canonicalKeyFromUrl(card.url) : null;

  await upsertStoredItem(titleKey, card.title, state, card.url);
  if (urlKey && urlKey !== titleKey) {
    await upsertStoredItem(urlKey, card.title, state, card.url);
  }

  const actionType = state === "hidden" ? "hide" : state === "watched" ? "watched" : "watch_later";
  void logUserAction(actionType, card.title, {
    source_url: card.url,
    context: "homepage"
  });

  if (state !== "watch_later") {
    syncTasteGraph();
  }
}

async function undoLastAction(): Promise<void> {
  if (!lastAction) return;
  const { card, previousState } = lastAction;
  lastAction = null;

  const titleKey = canonicalKeyFromTitle(card.title);
  const urlKey = card.url ? canonicalKeyFromUrl(card.url) : null;

  if (previousState === null) {
    await removeStoredItem(titleKey);
    if (urlKey && urlKey !== titleKey) {
      await removeStoredItem(urlKey);
    }
  } else {
    await upsertStoredItem(titleKey, card.title, previousState, card.url);
    if (urlKey && urlKey !== titleKey) {
      await upsertStoredItem(urlKey, card.title, previousState, card.url);
    }
  }

  card.element.style.display = "";
  card.element.removeAttribute(HIDDEN_MARKER);

  void logUserAction("unhide", card.title, {
    source_url: card.url,
    context: "homepage"
  });

  syncTasteGraph();
}

function dismissToast(): void {
  const toast = document.getElementById(TOAST_ID);
  if (toast) {
    toast.classList.remove("show");
  }

  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

function showUndoToast(action: ItemState): void {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    document.body.appendChild(toast);
  }

  const label =
    action === "hidden"
      ? "Hidden"
      : action === "watched"
        ? "Marked watched"
        : "Saved for later";

  toast.innerHTML = `<span>${label}</span><button id="curator-undo-btn">Undo</button>`;
  toast.classList.add("show");

  document.getElementById("curator-undo-btn")?.addEventListener("click", () => {
    void undoLastAction();
    dismissToast();
  });

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(dismissToast, 5000);
}

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
        (response) => resolve(response?.rating ?? null)
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

  const badge = document.createElement("span");
  badge.setAttribute("data-curator-badge", "true");
  badge.textContent = "Rating ...";
  root.appendChild(badge);

  void getCatalogRating(card).then((rating) => {
    if (rating === null) {
      badge.style.display = "none";
      return;
    }

    badge.textContent = `Rating ${rating.toFixed(1)}`;
  });

  const currentState = await getStoredState();
  const titleKey = canonicalKeyFromTitle(card.title);
  const urlKey = card.url ? canonicalKeyFromUrl(card.url) : null;
  const existing = (urlKey ? currentState.items[urlKey] : undefined) ?? currentState.items[titleKey] ?? null;
  const previousState = existing?.state ?? null;

  const makeButton = (label: string, state: ItemState) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("data-curator-button", state);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      void persistCardState(card, state, previousState).then(() => {
        if (state === "hidden" || state === "watched") {
          hideCard(card);
        }
        showUndoToast(state);
      });
    });
    return button;
  };

  root.append(
    makeButton("Hide", "hidden"),
    makeButton("Watched", "watched"),
    makeButton("Later", "watch_later")
  );

  card.element.appendChild(root);
  updatePageStatus();
}

async function processDocument(root: ParentNode = document): Promise<void> {
  const state = await getStoredState();
  const cards = findCandidateCards(root);
  updatePageStatus(cards.length);

  for (const card of cards) {
    if (card.element.getAttribute(CARD_MARKER) === "true") continue;
    card.element.setAttribute(CARD_MARKER, "true");

    if (shouldHide(card, state)) {
      hideCard(card);
      continue;
    }

    void injectActions(card);
  }

  updatePageStatus(cards.length);
}

function scheduleProcessDocument(delayMs = 180): void {
  if (pendingScan) return;

  pendingScan = true;
  window.setTimeout(() => {
    pendingScan = false;
    void processDocument(document);
  }, delayMs);
}

function startObserver(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.id === STATUS_ID || node.closest(`[data-curator-root], #${TOAST_ID}, #${STATUS_ID}`)) {
          continue;
        }

        scheduleProcessDocument();
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function startWarmupScans(): void {
  let scanCount = 0;
  const interval = window.setInterval(() => {
    scanCount += 1;
    scheduleProcessDocument();

    if (scanCount >= WARMUP_SCAN_LIMIT) {
      window.clearInterval(interval);
    }
  }, WARMUP_SCAN_INTERVAL_MS);
}

function watchSinglePageNavigation(): void {
  let lastHref = window.location.href;
  window.setInterval(() => {
    if (lastHref === window.location.href) return;

    lastHref = window.location.href;
    scheduleProcessDocument(250);
  }, 1000);

  window.addEventListener("focus", () => scheduleProcessDocument());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleProcessDocument();
    }
  });
}

function listenForPagePing(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== PAGE_PING_TYPE) return;

    sendResponse(getPagePingResponse());
    return false;
  });
}

async function bootstrap(): Promise<void> {
  const windowState = window as unknown as Record<string, boolean>;
  if (windowState[BOOTSTRAP_FLAG]) return;
  windowState[BOOTSTRAP_FLAG] = true;

  ensureInjectedStyles();
  ensurePageStatus();
  listenForPagePing();
  await processDocument(document);
  startObserver();
  startWarmupScans();
  watchSinglePageNavigation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void bootstrap());
} else {
  void bootstrap();
}
