/**
 * content.ts — JioHotstar Curator content script
 *
 * MUST remain dependency-free from npm packages.
 * Built as a self-contained IIFE by scripts/build-content.mjs.
 * Imports only from zero-dep local modules.
 */

import { canonicalKeyFromTitle, canonicalKeyFromUrl } from "../shared/normalize";
import {
  getStoredState,
  logUserAction,
  removeStoredItem,
  upsertStoredItem
} from "./content-storage";
import type { ItemState, StoredState } from "./content-storage";
import type { CandidateCard } from "../shared/types";
import { findCandidateCards } from "./adapter";

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_MARKER    = "data-curator-processed";
const HIDDEN_MARKER  = "data-curator-hidden";
const ACTIONS_MARKER = "data-curator-actions";
const STYLE_MARKER   = "data-curator-style";
const TOAST_ID       = "curator-undo-toast";
const STATUS_ID      = "curator-page-status";
const BOOTSTRAP_FLAG = "__jioHotstarCuratorBootstrapped";
const PAGE_PING_TYPE = "CURATOR_PAGE_PING";

const WARMUP_SCAN_LIMIT       = 30;
const WARMUP_SCAN_INTERVAL_MS = 1500;
const COLLAPSE_DURATION_MS    = 350;

let pendingScan = false;
let lastDetectedCount = 0;

// ─── Injected Styles ──────────────────────────────────────────────────────────

function ensureInjectedStyles(): void {
  if (document.getElementById(STYLE_MARKER)) return;

  const style = document.createElement("style");
  style.id = STYLE_MARKER;
  style.textContent = `
    /* ── Curator control overlay ── */

    /* The control panel sits top-right of each card */
    [data-curator-root] {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      display: flex;
      gap: 5px;
      align-items: center;
      flex-wrap: wrap;
      padding: 8px 10px;
      background: linear-gradient(to bottom, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0) 100%);
      border-radius: 4px 4px 0 0;

      /* HIDDEN by default — only reveal on hover */
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }

    /* Show controls when the user hovers the card */
    [data-curator-processed="true"]:hover > [data-curator-root],
    [data-curator-processed="true"]:focus-within > [data-curator-root] {
      opacity: 1;
      pointer-events: auto;
    }

    [data-curator-button] {
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 5px;
      padding: 5px 10px;
      background: rgba(255,255,255,0.10);
      color: #fff;
      font: 700 11px/1 'Inter', system-ui, Arial, sans-serif;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      backdrop-filter: blur(4px);
      transition: background 0.15s, transform 0.1s;
    }

    [data-curator-button]:hover {
      background: rgba(255,255,255,0.28);
      transform: translateY(-1px);
    }

    [data-curator-button="hidden"]:hover    { background: rgba(239,68,68,0.55); border-color: rgba(239,68,68,0.6); }
    [data-curator-button="watched"]:hover   { background: rgba(16,185,129,0.55); border-color: rgba(16,185,129,0.6); }
    [data-curator-button="watch_later"]:hover { background: rgba(59,130,246,0.55); border-color: rgba(59,130,246,0.6); }

    [data-curator-badge] {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border: 1px solid rgba(251,191,36,0.45);
      border-radius: 5px;
      background: rgba(0,0,0,0.5);
      color: #fbbf24;
      font: 700 10px/1 'Inter', system-ui, Arial, sans-serif;
      text-transform: uppercase;
      white-space: nowrap;
      backdrop-filter: blur(4px);
    }

    /* ── Card collapse animation (hide-in-place, no blank gap) ── */
    .curator-collapsing {
      overflow: hidden !important;
      transition:
        max-height ${COLLAPSE_DURATION_MS}ms ease,
        max-width  ${COLLAPSE_DURATION_MS}ms ease,
        width      ${COLLAPSE_DURATION_MS}ms ease,
        flex-basis ${COLLAPSE_DURATION_MS}ms ease,
        opacity    ${COLLAPSE_DURATION_MS * 0.8}ms ease,
        margin     ${COLLAPSE_DURATION_MS}ms ease,
        padding    ${COLLAPSE_DURATION_MS}ms ease !important;
    }

    /* ── Undo toast ── */
    #${TOAST_ID} {
      position: fixed;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%) translateY(16px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 18px;
      background: rgba(10,10,20,0.92);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      color: #fff;
      font: 500 13px/1 'Inter', system-ui, Arial, sans-serif;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.22s, transform 0.22s;
      backdrop-filter: blur(12px);
    }

    #${TOAST_ID}.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
      pointer-events: auto;
    }

    #${TOAST_ID} button {
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 6px;
      background: rgba(255,255,255,0.08);
      color: #fff;
      padding: 5px 12px;
      font: 700 11px/1 'Inter', system-ui, Arial, sans-serif;
      cursor: pointer;
      transition: background 0.15s;
    }

    #${TOAST_ID} button:hover { background: rgba(255,255,255,0.18); }

    /* ── Status heartbeat pill ── */
    #${STATUS_ID} {
      position: fixed;
      left: 16px;
      bottom: 16px;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 12px;
      background: rgba(7,8,15,0.88);
      border: 1px solid rgba(99,102,241,0.3);
      border-radius: 20px;
      color: #a5f3fc;
      font: 700 11px/1 'Inter', system-ui, Arial, sans-serif;
      letter-spacing: 0.03em;
      backdrop-filter: blur(8px);
      pointer-events: none;
      box-shadow: 0 2px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.15);
    }

    #${STATUS_ID}::before {
      content: '';
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #34d399;
      box-shadow: 0 0 6px #34d399;
      flex-shrink: 0;
    }

    #${STATUS_ID}[data-state="scanning"]::before {
      background: #fbbf24;
      box-shadow: 0 0 6px #fbbf24;
    }
  `;

  document.head.appendChild(style);
}

// ─── Page status heartbeat ─────────────────────────────────────────────────────

function ensurePageStatus(): HTMLElement {
  let status = document.getElementById(STATUS_ID);
  if (!status) {
    status = document.createElement("div");
    status.id = STATUS_ID;
    status.setAttribute("data-state", "scanning");
    status.textContent = "CURATOR · scanning…";
    document.body.appendChild(status);
  }
  return status;
}

function updatePageStatus(): void {
  const processed = document.querySelectorAll(`[${CARD_MARKER}="true"]`).length;
  const controls  = document.querySelectorAll(`[${ACTIONS_MARKER}="true"]`).length;
  const hidden    = document.querySelectorAll(`[${HIDDEN_MARKER}="true"]`).length;
  const count     = Math.max(lastDetectedCount, processed);

  const status = ensurePageStatus();
  status.setAttribute("data-state", count > 0 ? "ready" : "scanning");
  status.textContent = count > 0
    ? `✓ CURATOR · ${count} cards · ${controls} controls · ${hidden} hidden`
    : "✓ CURATOR · scanning…";
}

function getPagePingResponse() {
  return {
    cards:     Math.max(lastDetectedCount, document.querySelectorAll(`[${CARD_MARKER}="true"]`).length),
    connected: Boolean(document.getElementById(STATUS_ID)),
    controls:  document.querySelectorAll(`[${ACTIONS_MARKER}="true"]`).length,
    hidden:    document.querySelectorAll(`[${HIDDEN_MARKER}="true"]`).length,
    url:       window.location.href
  };
}

// ─── Card collapse (no blank gaps) ────────────────────────────────────────────

/**
 * Collapses a card element smoothly without leaving a blank space.
 * Uses width + height collapse so horizontal carousels do not keep empty slots.
 */
function collapseCard(el: HTMLElement): void {
  if (el.getAttribute(HIDDEN_MARKER) === "true") return;

  el.setAttribute(HIDDEN_MARKER, "true");

  const rect = el.getBoundingClientRect();
  el.style.maxHeight = `${rect.height}px`;
  el.style.maxWidth = `${rect.width}px`;
  el.style.width = `${rect.width}px`;
  el.style.flexBasis = `${rect.width}px`;
  el.style.opacity = "1";

  // Force reflow before starting transition
  void el.offsetHeight;

  el.classList.add("curator-collapsing");
  el.style.maxHeight = "0px";
  el.style.maxWidth = "0px";
  el.style.width = "0px";
  el.style.minWidth = "0px";
  el.style.flexBasis = "0px";
  el.style.opacity = "0";
  el.style.marginTop = "0";
  el.style.marginRight = "0";
  el.style.marginBottom = "0";
  el.style.marginLeft = "0";
  el.style.paddingTop = "0";
  el.style.paddingRight = "0";
  el.style.paddingBottom = "0";
  el.style.paddingLeft = "0";

  window.setTimeout(() => {
    el.style.display = "none";
    el.classList.remove("curator-collapsing");
  }, COLLAPSE_DURATION_MS + 20);
}

function revealCard(el: HTMLElement): void {
  el.removeAttribute(HIDDEN_MARKER);
  el.style.display = "";
  el.style.maxHeight = "";
  el.style.maxWidth = "";
  el.style.width = "";
  el.style.minWidth = "";
  el.style.flexBasis = "";
  el.style.opacity = "";
  el.style.marginTop = "";
  el.style.marginRight = "";
  el.style.marginBottom = "";
  el.style.marginLeft = "";
  el.style.paddingTop = "";
  el.style.paddingRight = "";
  el.style.paddingBottom = "";
  el.style.paddingLeft = "";
  el.classList.remove("curator-collapsing");
}

// ─── State lookup ──────────────────────────────────────────────────────────────

function shouldHide(card: CandidateCard, state: StoredState): boolean {
  const titleKey = canonicalKeyFromTitle(card.title);
  const urlKey   = card.url ? canonicalKeyFromUrl(card.url) : null;
  const item     = (urlKey ? state.items[urlKey] : undefined) ?? state.items[titleKey];
  return item?.state === "hidden" || item?.state === "watched";
}

// ─── Action persistence ────────────────────────────────────────────────────────

let lastAction: { card: CandidateCard; previousState: ItemState | null } | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function syncTasteGraph(): void {
  try { chrome.runtime.sendMessage({ type: "SYNC_TASTE_GRAPH" }); } catch { /* ignore */ }
}

async function persistCardState(card: CandidateCard, state: ItemState, previousState: ItemState | null): Promise<void> {
  lastAction = { card, previousState };

  const titleKey = canonicalKeyFromTitle(card.title);
  const urlKey   = card.url ? canonicalKeyFromUrl(card.url) : null;

  await upsertStoredItem(titleKey, card.title, state, card.url);
  if (urlKey && urlKey !== titleKey) {
    await upsertStoredItem(urlKey, card.title, state, card.url);
  }

  logUserAction(state === "hidden" ? "hide" : state === "watched" ? "watched" : "watch_later", card.title, {
    source_url: card.url,
    context: "homepage"
  });

  if (state !== "watch_later") syncTasteGraph();
}

async function undoLastAction(): Promise<void> {
  if (!lastAction) return;
  const { card, previousState } = lastAction;
  lastAction = null;

  const titleKey = canonicalKeyFromTitle(card.title);
  const urlKey   = card.url ? canonicalKeyFromUrl(card.url) : null;

  if (previousState === null) {
    await removeStoredItem(titleKey);
    if (urlKey && urlKey !== titleKey) await removeStoredItem(urlKey);
  } else {
    await upsertStoredItem(titleKey, card.title, previousState, card.url);
    if (urlKey && urlKey !== titleKey) await upsertStoredItem(urlKey, card.title, previousState, card.url);
  }

  revealCard(card.element);
  logUserAction("unhide", card.title, { source_url: card.url, context: "homepage" });
  syncTasteGraph();
}

// ─── Toast ─────────────────────────────────────────────────────────────────────

function dismissToast(): void {
  document.getElementById(TOAST_ID)?.classList.remove("show");
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
}

function showUndoToast(action: ItemState): void {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    document.body.appendChild(toast);
  }

  const label = action === "hidden" ? "Hidden" : action === "watched" ? "Marked watched" : "Saved for later";
  toast.innerHTML = `<span>${label}</span><button id="curator-undo-btn">Undo</button>`;
  toast.classList.add("show");

  document.getElementById("curator-undo-btn")?.addEventListener("click", () => {
    void undoLastAction();
    dismissToast();
  });

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(dismissToast, 5000);
}

// ─── Card action injection ─────────────────────────────────────────────────────

function ensurePositionable(el: HTMLElement): void {
  if (window.getComputedStyle(el).position === "static") el.style.position = "relative";
}

function getRating(card: CandidateCard): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: "FETCH_CARD_META", payload: { title: card.title, url: card.url } },
        (response) => resolve(response?.rating ?? null)
      );
    } catch { resolve(null); }
  });
}

async function injectActions(card: CandidateCard): Promise<void> {
  if (card.element.querySelector(`[${ACTIONS_MARKER}]`)) return;

  ensurePositionable(card.element);

  const root = document.createElement("div");
  root.setAttribute("data-curator-root", "true");
  root.setAttribute(ACTIONS_MARKER, "true");

  // Rating badge — initially "..." then filled async
  const badge = document.createElement("span");
  badge.setAttribute("data-curator-badge", "true");
  badge.textContent = "★…";
  root.appendChild(badge);

  void getRating(card).then((rating) => {
    if (rating === null) { badge.style.display = "none"; return; }
    badge.textContent = `★ ${rating.toFixed(1)}`;
  });

  // Get current state for undo support
  const currentState = await getStoredState();
  const titleKey     = canonicalKeyFromTitle(card.title);
  const urlKey       = card.url ? canonicalKeyFromUrl(card.url) : null;
  const existing     = (urlKey ? currentState.items[urlKey] : undefined) ?? currentState.items[titleKey] ?? null;
  const previousState = existing?.state ?? null;

  const makeButton = (label: string, state: ItemState) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.setAttribute("data-curator-button", state);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void persistCardState(card, state, previousState).then(() => {
        if (state === "hidden" || state === "watched") collapseCard(card.element);
        showUndoToast(state);
        updatePageStatus();
      });
    });
    return btn;
  };

  root.append(makeButton("Hide", "hidden"), makeButton("Watched", "watched"), makeButton("Later", "watch_later"));
  card.element.appendChild(root);
  updatePageStatus();
}

// ─── Document processing ───────────────────────────────────────────────────────

async function processDocument(root: ParentNode = document): Promise<void> {
  const state = await getStoredState();
  const cards = findCandidateCards(root);

  if (cards.length > 0) lastDetectedCount = Math.max(lastDetectedCount, cards.length);
  updatePageStatus();

  for (const card of cards) {
    if (shouldHide(card, state)) {
      collapseCard(card.element);
      continue;
    }

    if (card.element.getAttribute(HIDDEN_MARKER) === "true") {
      revealCard(card.element);
    }

    if (card.element.getAttribute(CARD_MARKER) !== "true") {
      card.element.setAttribute(CARD_MARKER, "true");
      void injectActions(card);
    }
  }

  updatePageStatus();
}

function scheduleProcessDocument(delayMs = 200): void {
  if (pendingScan) return;
  pendingScan = true;
  window.setTimeout(() => { pendingScan = false; void processDocument(); }, delayMs);
}

// ─── Real-time sync from side panel ───────────────────────────────────────────

/**
 * When the user takes an action in the side panel (hide/unhide from the app),
 * re-process the page immediately so the card state reflects the change
 * without needing a manual page refresh.
 */
function listenForStorageChanges(): void {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes["curatorState"]) return;
      // Small debounce — storage can fire multiple events for one action
      scheduleProcessDocument(300);
    });
  } catch {
    // Ignore if storage API not available
  }
}

// ─── MutationObserver & SPA support ───────────────────────────────────────────

function startObserver(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.id === STATUS_ID || node.id === TOAST_ID) continue;
        if (node.closest(`[data-curator-root], #${TOAST_ID}, #${STATUS_ID}`)) continue;
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
    if (scanCount >= WARMUP_SCAN_LIMIT) window.clearInterval(interval);
  }, WARMUP_SCAN_INTERVAL_MS);
}

function watchSPANavigation(): void {
  let lastHref = window.location.href;
  window.setInterval(() => {
    if (lastHref === window.location.href) return;
    lastHref = window.location.href;
    lastDetectedCount = 0; // reset count on page change
    scheduleProcessDocument(300);
  }, 1000);

  window.addEventListener("focus",      () => scheduleProcessDocument());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleProcessDocument();
  });
}

function listenForPagePing(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== PAGE_PING_TYPE) return;
    sendResponse(getPagePingResponse());
    return false;
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  const win = window as unknown as Record<string, boolean>;
  if (win[BOOTSTRAP_FLAG]) return;
  win[BOOTSTRAP_FLAG] = true;

  ensureInjectedStyles();
  ensurePageStatus();
  listenForPagePing();
  listenForStorageChanges();

  await processDocument(document);

  startObserver();
  startWarmupScans();
  watchSPANavigation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void bootstrap());
} else {
  void bootstrap();
}
