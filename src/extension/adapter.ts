import { canonicalKeyFromTitle, canonicalKeyFromUrl, normalizeTitle } from "../shared/normalize";
import type { CandidateCard } from "../shared/types";

// Matches all known JioHotstar content route segments
export const CONTENT_URL_PATTERN =
  /(\/(movies|shows|watch|tv|sports|originals|episodes|series|detail)\/?)/i;

export function isLikelyContentUrl(url: string): boolean {
  return CONTENT_URL_PATTERN.test(url);
}

export function extractTitle(anchor: HTMLAnchorElement): string | null {
  // 1. aria-label on the anchor (most explicit)
  const aria = anchor.getAttribute("aria-label");
  if (aria && normalizeTitle(aria)) {
    return aria.trim();
  }

  // 2. data-title attribute
  const dataTitle = anchor.getAttribute("data-title");
  if (dataTitle && normalizeTitle(dataTitle)) {
    return dataTitle.trim();
  }

  // 3. title attribute on the anchor
  const titleAttr = anchor.getAttribute("title");
  if (titleAttr && normalizeTitle(titleAttr)) {
    return titleAttr.trim();
  }

  // 4. img[alt] inside the anchor (poster images always have the title)
  const image = anchor.querySelector("img[alt]");
  const alt = image?.getAttribute("alt");
  if (alt && normalizeTitle(alt)) {
    return alt.trim();
  }

  // 5. img[data-title] inside the anchor
  const imgDataTitle = image?.getAttribute("data-title");
  if (imgDataTitle && normalizeTitle(imgDataTitle)) {
    return imgDataTitle.trim();
  }

  // 6. aria-label on an inner element
  const innerAria = anchor.querySelector("[aria-label]")?.getAttribute("aria-label");
  if (innerAria && normalizeTitle(innerAria)) {
    return innerAria.trim();
  }

  // 7. textContent of the anchor itself (e.g. text-only links)
  const text = anchor.textContent?.trim();
  if (text && normalizeTitle(text)) {
    return text;
  }

  // 8. Nearest heading / labelling element in the card wrapper
  const wrapper = anchor.closest("article, li, figure, [role='listitem'], [data-item], [data-card], div");
  const nearbyHeading = wrapper?.querySelector("h1, h2, h3, h4, [data-testid*='title'], span[class*='title'], p[class*='title']");
  const headingText = nearbyHeading?.textContent?.trim();
  if (headingText && normalizeTitle(headingText)) {
    return headingText;
  }

  return null;
}

export function resolveCardElement(anchor: HTMLAnchorElement): HTMLElement | null {
  // Walk up through increasingly broad wrappers
  // JioHotstar uses article, li, figure, [role=listitem], [data-item], [data-card]
  // Also catch generic card divs by class patterns
  const selector = [
    "article",
    "li",
    "figure",
    "[role='listitem']",
    "[data-item]",
    "[data-card]",
    "[class*='card']",
    "[class*='item']",
    "[class*='tile']",
    "div"
  ].join(", ");

  return anchor.closest<HTMLElement>(selector);
}

export function findCandidateCards(root: ParentNode = document): CandidateCard[] {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"));
  const results: CandidateCard[] = [];
  const seen = new Set<HTMLElement>();

  for (const anchor of anchors) {
    const href = anchor.getAttribute("href") ?? "";
    if (!isLikelyContentUrl(href)) {
      continue;
    }

    const title = extractTitle(anchor);
    if (!title) {
      continue;
    }

    const cardElement = resolveCardElement(anchor);
    if (!cardElement || seen.has(cardElement)) {
      continue;
    }

    seen.add(cardElement);

    const urlKey = canonicalKeyFromUrl(href);
    const titleKey = canonicalKeyFromTitle(title);

    results.push({
      canonicalKey: urlKey ?? titleKey,
      title,
      url: href,
      element: cardElement
    });
  }

  return results;
}
