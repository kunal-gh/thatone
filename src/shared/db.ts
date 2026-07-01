/**
 * db.ts — Dexie (IndexedDB) schema for the JioHotstar Curator extension.
 *
 * Version history:
 *   v1 — catalog + user_actions
 *   v2 — adds imdb_imports, sync_state tables; indexes for better lookup perf
 */

import Dexie, { type Table } from "dexie";
import type { CatalogItem, UserAction } from "./types";

// ─── Extra table types ────────────────────────────────────────────────────────

export type ImdbImportRecord = {
  id?: number;                   // auto-increment
  imported_at: string;           // ISO timestamp
  source: "ratings" | "watchlist";
  total_parsed: number;
  total_matched: number;
  total_unmatched: number;
  matched_titles: string[];      // list of matched content_ids
  unmatched_titles: string[];    // list of titles that couldn't be matched
};

export type SyncState = {
  key: string;                   // primary key, e.g. "tmdb_watchlist", "catalog_last_sync"
  value: string | number | null; // ISO timestamp or count
  updated_at: string;
};

// ─── Database class ───────────────────────────────────────────────────────────

export class CuratorDatabase extends Dexie {
  catalog!: Table<CatalogItem, string>;          // PK: content_id
  user_actions!: Table<UserAction, string>;       // PK: action_id
  imdb_imports!: Table<ImdbImportRecord, number>; // PK: id (auto)
  sync_state!: Table<SyncState, string>;          // PK: key

  constructor() {
    super("CuratorDB");

    // v1 schema (existing)
    this.version(1).stores({
      catalog: "content_id, tmdb_id, title, jiohotstar_url",
      user_actions: "action_id, content_id, action_type, created_at"
    });

    // v2 schema — adds imdb_imports + sync_state; adds genre index on catalog
    this.version(2)
      .stores({
        catalog: "content_id, tmdb_id, imdb_id, title, jiohotstar_url, type, vote_average",
        user_actions: "action_id, content_id, action_type, created_at",
        imdb_imports: "++id, imported_at, source",
        sync_state: "key, updated_at"
      })
      .upgrade(async () => {
        // Migrate existing data — no structural changes needed for existing tables
        console.log("[CuratorDB] Migrated to v2 schema");
      });
  }
}

export const db = new CuratorDatabase();

// ─── sync_state helpers ───────────────────────────────────────────────────────

export async function getSyncState(key: string): Promise<SyncState | null> {
  return (await db.sync_state.get(key)) ?? null;
}

export async function setSyncState(key: string, value: string | number | null): Promise<void> {
  await db.sync_state.put({ key, value, updated_at: new Date().toISOString() });
}

// ─── imdb_imports helpers ─────────────────────────────────────────────────────

export async function recordImdbImport(record: Omit<ImdbImportRecord, "id">): Promise<number> {
  return db.imdb_imports.add(record as ImdbImportRecord);
}

export async function getImdbImportHistory(): Promise<ImdbImportRecord[]> {
  return db.imdb_imports.orderBy("imported_at").reverse().limit(20).toArray();
}
