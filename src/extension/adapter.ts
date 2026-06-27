import { canonicalKeyFromTitle, canonicalKeyFromUrl, normalizeTitle } from "../shared/normalize";
import type { CandidateCard } from "../shared/types";

// Matches all known JioHotstar content route segments
export const CONTENT_URL_PATTERN =
  /\/(?:in\/)?(?:movies?|shows?|watch|tv|sports|originals|episodes?|series|detail|content|clips?)\b/i;

const BLOCKED_TITLES = new Set([
  "all",
  "details",
  "home",
  "login",
  "more like this",
  "play",
  "search",
  "upgrade",
  "watch",
  "watch now",
  "watchlist"
]);

const CARD_WRAPPER_SELECTOR = [
  "article",
  "li",
  "figure",
  "[role='listitem']",
  "[data-item]",
  "[data-card]",
  "[data-testid*='card']",
  "[data-testid*='Card']",
  "[class*='card']",
  "[class*='Card']",
  "[class*='item']",
  "[class*='Item']",
  "[class*='tile']",
  "[class*='Tile']"
].join(", ");

const TITLE_SELECTOR = [
  "[data-title]",
  "[data-name]",
  "[aria-label]",
  "[title]",
  "img[alt]",
  "h1",
  "h2",
  "h3",
  "h4",
  "[data-testid*='title']",
  "[data-testid*='Title']",
  "[class*='title']",
  "[class*='Title']"
].join(", ");

export function isLikelyContentUrl(url: string): boolean {
  return CONTENT_URL_PATTERN.test(url);
}

function cleanCandidateTitle(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text || text.length < 2 || text.length > 120) return null;

  const normalized = normalizeTitle(text);
  if (!normalized || normalized.length < 2 || BLOCKED_TITLES.has(normalized)) return null;

  return text;
}

function titleFromAttributes(element: Element | null): string | null {
  if (!element) return null;

  for (const attribute of ["aria-label", "data-title", "data-name", "title", "alt"]) {
    const title = cleanCandidateTitle(element.getAttribute(attribute));
    if (title) return title;
  }

  return null;
}

function titleFromElement(element: Element | null): string | null {
  const attributeTitle = titleFromAttributes(element);
  if (attributeTitle) return attributeTitle;

  const titledChild = element?.querySelector(TITLE_SELECTOR) ?? null;
  const childAttributeTitle = titleFromAttributes(titledChild);
  if (childAttributeTitle) return childAttributeTitle;

  const childText = cleanCandidateTitle(titledChild?.textContent);
  if (childText) return childText;

  const ownText = cleanCandidateTitle(element?.textContent);
  if (ownText) return ownText;

  return null;
}

function collectElements<T extends Element>(root: ParentNode, selector: string): T[] {
  const elements = Array.from(root.querySelectorAll<T>(selector));
  if (root instanceof Element && root.matches(selector)) {
    elements.unshift(root as unknown as T);
  }

  return elements;
}

function isTinyUtilityImage(image: HTMLImageElement): boolean {
  const rect = image.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0 && (rect.width < 72 || rect.height < 72)) {
    return true;
  }

  const width = Number(image.getAttribute("width") ?? "0");
  const height = Number(image.getAttribute("height") ?? "0");
  return width > 0 && height > 0 && (width < 72 || height < 72);
}

function pushCandidate(
  results: CandidateCard[],
  seen: Set<HTMLElement>,
  element: HTMLElement | null,
  title: string | null,
  url?: string | null
): void {
  if (!element || !title || seen.has(element)) return;

  seen.add(element);

  const usableUrl = url && isLikelyContentUrl(url) ? url : undefined;
  const urlKey = usableUrl ? canonicalKeyFromUrl(usableUrl) : null;
  const titleKey = canonicalKeyFromTitle(title);

  results.push({
    canonicalKey: urlKey ?? titleKey,
    title,
    url: usableUrl,
    element
  });
}

export function extractTitle(anchor: HTMLAnchorElement): string | null {
  const directTitle = titleFromAttributes(anchor);
  if (directTitle) return directTitle;

  const imageTitle = titleFromElement(anchor.querySelector("img"));
  if (imageTitle) return imageTitle;

  const wrapper = anchor.closest(CARD_WRAPPER_SELECTOR);
  const wrapperTitle = titleFromElement(wrapper);
  if (wrapperTitle) return wrapperTitle;

  const anchorText = cleanCandidateTitle(anchor.textContent);
  if (anchorText) return anchorText;

  return null;
}

export function resolveCardElement(anchor: HTMLAnchorElement): HTMLElement | null {
  const wrapper = anchor.closest<HTMLElement>(CARD_WRAPPER_SELECTOR);
  if (wrapper && wrapper !== document.body) {
    return wrapper;
  }

  return anchor;
}

function resolveImageCardElement(image: HTMLImageElement): HTMLElement | null {
  const link = image.closest<HTMLAnchorElement>("a[href]");
  if (link) {
    return resolveCardElement(link);
  }

  return (
    image.closest<HTMLElement>(CARD_WRAPPER_SELECTOR) ??
    image.parentElement ??
    image
  );
}

export function findCandidateCards(root: ParentNode = document): CandidateCard[] {
  const anchors = collectElements<HTMLAnchorElement>(root, "a[href]");
  const images = collectElements<HTMLImageElement>(root, "img[alt], img[title], img[data-title]");
  const results: CandidateCard[] = [];
  const seen = new Set<HTMLElement>();

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href") ?? "";
    if (!isLikelyContentUrl(href)) {
      continue;
    }

    const title = extractTitle(anchor);
    pushCandidate(results, seen, resolveCardElement(anchor), title, href);
  }

  for (const image of images) {
    if (isTinyUtilityImage(image)) continue;

    const link = image.closest<HTMLAnchorElement>("a[href]");
    const href = link?.getAttribute("href") ?? null;
    const title = titleFromElement(image) ?? (link ? extractTitle(link) : null);
    pushCandidate(results, seen, resolveImageCardElement(image), title, href);
  }

  return results;
}
