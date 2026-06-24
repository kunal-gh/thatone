import { loadCatalog, matchCatalogItem } from "./catalog";
import { canonicalKeyFromTitle, canonicalKeyFromUrl } from "./normalize";
import {
  getStoredState,
  getTasteGraph,
  getUniqueStoredItems,
  logUserAction,
  removeStoredItem,
  setTasteGraph,
  upsertStoredItem
} from "./storage";
import { buildTasteGraph } from "./taste";
import type {
  ActionContext,
  CatalogItem,
  ItemState,
  StoredItem,
  StoredState,
  TasteGraph,
  UserActionType
} from "./types";

type StateRef = {
  contentId?: string | null;
  sourceUrl?: string | null;
  title: string;
};

function getStateKeys(ref: StateRef): { titleKey: string; urlKey: string | null } {
  return {
    titleKey: canonicalKeyFromTitle(ref.title),
    urlKey: canonicalKeyFromUrl(ref.sourceUrl ?? undefined)
  };
}

async function writeStateRef(ref: StateRef, state: ItemState): Promise<void> {
  const { titleKey, urlKey } = getStateKeys(ref);
  await upsertStoredItem(titleKey, ref.title, state, ref.sourceUrl ?? undefined);

  if (urlKey && urlKey !== titleKey) {
    await upsertStoredItem(urlKey, ref.title, state, ref.sourceUrl ?? undefined);
  }
}

async function removeStateRef(ref: StateRef): Promise<void> {
  const { titleKey, urlKey } = getStateKeys(ref);
  await removeStoredItem(titleKey);

  if (urlKey && urlKey !== titleKey) {
    await removeStoredItem(urlKey);
  }
}

export async function syncTasteGraphFromState(state: StoredState): Promise<TasteGraph> {
  const catalog = await loadCatalog();
  const matches = getUniqueStoredItems(state)
    .filter((item) => item.state !== "watch_later")
    .map((item) => {
      const matched = matchCatalogItem(catalog, item.title, item.sourceUrl);
      return matched ? { action: item.state, item: matched } : null;
    })
    .filter((entry): entry is { action: ItemState; item: CatalogItem } => entry !== null);

  const nextGraph = buildTasteGraph(matches);
  await setTasteGraph(nextGraph);
  return nextGraph;
}

export async function syncTasteGraphFromCurrentState(): Promise<TasteGraph> {
  const state = await getStoredState();
  return syncTasteGraphFromState(state);
}

export async function applyStoredAction(
  ref: StateRef,
  state: ItemState,
  context: ActionContext
): Promise<{ state: StoredState; tasteGraph: TasteGraph }> {
  await writeStateRef(ref, state);

  const actionType: UserActionType =
    state === "hidden" ? "hide" : state === "watched" ? "watched" : "watch_later";

  await logUserAction(actionType, ref.title, {
    content_id: ref.contentId ?? null,
    source_url: ref.sourceUrl ?? null,
    context
  });

  const nextState = await getStoredState();
  const nextGraph =
    state === "watch_later"
      ? await getTasteGraph()
      : await syncTasteGraphFromState(nextState);

  return { state: nextState, tasteGraph: nextGraph };
}

export async function applyCatalogAction(
  item: CatalogItem,
  state: ItemState,
  context: ActionContext
): Promise<{ state: StoredState; tasteGraph: TasteGraph }> {
  return applyStoredAction(
    {
      contentId: item.content_id,
      sourceUrl: item.jiohotstar_url,
      title: item.title
    },
    state,
    context
  );
}

export async function removeStoredSelection(
  item: StoredItem,
  context: ActionContext
): Promise<{ state: StoredState; tasteGraph: TasteGraph }> {
  await removeStateRef({
    sourceUrl: item.sourceUrl,
    title: item.title
  });

  const actionType: UserActionType =
    item.state === "hidden"
      ? "unhide"
      : item.state === "watched"
        ? "unwatched"
        : "remove_watch_later";

  await logUserAction(actionType, item.title, {
    source_url: item.sourceUrl ?? null,
    context
  });

  const nextState = await getStoredState();
  const nextGraph =
    item.state === "watch_later"
      ? await getTasteGraph()
      : await syncTasteGraphFromState(nextState);

  return { state: nextState, tasteGraph: nextGraph };
}
