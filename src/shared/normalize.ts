export function normalizeTitle(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
}

export function canonicalKeyFromTitle(title: string): string {
  return `title:${normalizeTitle(title)}`;
}

export function canonicalKeyFromUrl(url?: string): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");

    if (!path) {
      return null;
    }

    return `url:${path}`;
  } catch {
    return null;
  }
}

