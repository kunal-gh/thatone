import { canonicalKeyFromTitle, canonicalKeyFromUrl } from "../shared/normalize";
import { getStoredState, upsertStoredItem } from "../shared/storage";
import { findCandidateCards } from "./adapter";
import type { ItemState } from "../shared/types";
import type { CandidateCard, StoredState } from "../shared/types";

const CARD_MARKER = "data-curator-processed";
const HIDDEN_MARKER = "data-curator-hidden";
const ACTIONS_MARKER = "data-curator-actions";
const STYLE_MARKER = "data-curator-style";

function ensureInjectedStyles(): void {
  if (document.getElementById(STYLE_MARKER)) {
    return;
  }

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
      padding: 6px;
      border-radius: 999px;
      background: rgba(12, 18, 28, 0.78);
      backdrop-filter: blur(6px);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
    }

    [data-curator-button] {
      border: 0;
      border-radius: 999px;
      padding: 6px 10px;
      color: white;
      font: 600 11px/1 "Segoe UI", Tahoma, sans-serif;
      cursor: pointer;
      letter-spacing: 0;
    }

    [data-curator-button="hidden"] {
      background: #8f2d2d;
    }

    [data-curator-button="watched"] {
      background: #245c47;
    }
  `;

  document.head.appendChild(style);
}

function shouldHide(card: CandidateCard, state: StoredState): boolean {
  const urlKey = card.url ? canonicalKeyFromUrl(card.url) : null;
  const titleKey = canonicalKeyFromTitle(card.title);

  const byUrl = urlKey ? state.items[urlKey] : undefined;
  const byTitle = state.items[titleKey];
  const item = byUrl ?? byTitle;

  return item?.state === "hidden" || item?.state === "watched";
}

function hideCard(card: CandidateCard): void {
  if (card.element.getAttribute(HIDDEN_MARKER) === "true") {
    return;
  }

  card.element.style.display = "none";
  card.element.setAttribute(HIDDEN_MARKER, "true");
}

async function persistCardState(card: CandidateCard, state: ItemState): Promise<void> {
  const titleKey = canonicalKeyFromTitle(card.title);
  const urlKey = card.url ? canonicalKeyFromUrl(card.url) : null;

  await upsertStoredItem(titleKey, card.title, state, card.url);

  if (urlKey && urlKey !== titleKey) {
    await upsertStoredItem(urlKey, card.title, state, card.url);
  }
}

function ensureCardIsPositionable(cardElement: HTMLElement): void {
  const computed = window.getComputedStyle(cardElement);

  if (computed.position === "static") {
    cardElement.style.position = "relative";
  }
}

function injectActions(card: CandidateCard): void {
  if (card.element.querySelector(`[${ACTIONS_MARKER}]`)) {
    return;
  }

  ensureCardIsPositionable(card.element);

  const root = document.createElement("div");
  root.setAttribute("data-curator-root", "true");
  root.setAttribute(ACTIONS_MARKER, "true");

  const hideButton = document.createElement("button");
  hideButton.type = "button";
  hideButton.textContent = "Hide";
  hideButton.setAttribute("data-curator-button", "hidden");

  const watchedButton = document.createElement("button");
  watchedButton.type = "button";
  watchedButton.textContent = "Watched";
  watchedButton.setAttribute("data-curator-button", "watched");

  const wireAction = (button: HTMLButtonElement, state: ItemState) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void persistCardState(card, state).then(() => {
        hideCard(card);
      });
    });
  };

  wireAction(hideButton, "hidden");
  wireAction(watchedButton, "watched");

  root.append(hideButton, watchedButton);
  card.element.appendChild(root);
}

async function processDocument(root: ParentNode = document): Promise<void> {
  const state = await getStoredState();
  const cards = findCandidateCards(root);

  for (const card of cards) {
    if (card.element.getAttribute(CARD_MARKER) === "true") {
      continue;
    }

    card.element.setAttribute(CARD_MARKER, "true");

    if (shouldHide(card, state)) {
      hideCard(card);
      continue;
    }

    injectActions(card);
  }
}

function startObserver(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }

        void processDocument(node);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

async function bootstrap(): Promise<void> {
  ensureInjectedStyles();
  await processDocument(document);
  startObserver();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void bootstrap();
  });
} else {
  void bootstrap();
}
