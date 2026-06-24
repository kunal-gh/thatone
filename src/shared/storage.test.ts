import { beforeEach, describe, expect, it } from "vitest";
import { canonicalKeyFromTitle, canonicalKeyFromUrl } from "./normalize";
import { getStoredState, getUniqueStoredItems, setStoredState, upsertStoredItem } from "./storage";

describe("storage fallback", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await setStoredState({ items: {} });
  });

  it("persists state without chrome.storage", async () => {
    const key = canonicalKeyFromTitle("Interstellar");
    await upsertStoredItem(key, "Interstellar", "watched", "https://www.hotstar.com/in/movies/interstellar");

    const state = await getStoredState();
    expect(state.items[key]?.title).toBe("Interstellar");
    expect(state.items[key]?.state).toBe("watched");
  });

  it("dedupes mirrored title and url records for app views", async () => {
    const titleKey = canonicalKeyFromTitle("Andor");
    const urlKey = canonicalKeyFromUrl("https://www.hotstar.com/in/shows/andor");

    await upsertStoredItem(titleKey, "Andor", "watch_later", "https://www.hotstar.com/in/shows/andor");
    await upsertStoredItem(urlKey!, "Andor", "watch_later", "https://www.hotstar.com/in/shows/andor");

    const state = await getStoredState();
    expect(Object.values(state.items)).toHaveLength(2);
    expect(getUniqueStoredItems(state)).toHaveLength(1);
  });

  it("prefers the freshest duplicate entry when app state conflicts", async () => {
    const titleKey = canonicalKeyFromTitle("Sita Ramam");
    const urlKey = canonicalKeyFromUrl("https://www.hotstar.com/in/movies/sita-ramam");

    await setStoredState({
      items: {
        [titleKey]: {
          canonicalKey: titleKey,
          title: "Sita Ramam",
          sourceUrl: "https://www.hotstar.com/in/movies/sita-ramam",
          state: "hidden",
          updatedAt: "2026-06-24T10:00:00.000Z"
        },
        [urlKey!]: {
          canonicalKey: urlKey!,
          title: "Sita Ramam",
          sourceUrl: "https://www.hotstar.com/in/movies/sita-ramam",
          state: "watched",
          updatedAt: "2026-06-24T11:00:00.000Z"
        }
      }
    });

    const deduped = getUniqueStoredItems(await getStoredState());
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.state).toBe("watched");
  });
});
