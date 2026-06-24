import Dexie, { type Table } from "dexie";
import type { CatalogItem, UserAction } from "./types";

export class CuratorDatabase extends Dexie {
  catalog!: Table<CatalogItem, string>;     // content_id is the primary key
  user_actions!: Table<UserAction, string>; // action_id is the primary key

  constructor() {
    super("CuratorDB");

    this.version(1).stores({
      catalog: "content_id, tmdb_id, title, jiohotstar_url",
      user_actions: "action_id, content_id, action_type, created_at"
    });
  }
}

export const db = new CuratorDatabase();
