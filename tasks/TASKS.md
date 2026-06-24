# Task Tracker

Last updated: 2026-06-24 (Session 3)

## Objective

Build a professional, local-first JioHotstar curation product with:

- a Chrome extension for on-page filtering with Hide / Watched / Watch Later buttons, undo toast, and rating badges
- an extension-owned discovery app with 6 tabs: Manage, Watch Later, Swipe Deck, Recommendations, Taste Controls, Catalog Health
- persistent state tracking and taste graph (IndexedDB + chrome.storage.local)
- a catalog pipeline backed by TMDB
- a deterministic recommendation engine (V1 complete)
- automated catalog refresh via GitHub Actions

## Current Phase

Phase 3: Discovery App + Watch Later + Swipe Deck ✅

## Status Legend

- `TODO`
- `IN PROGRESS`
- `DONE`
- `BLOCKED`

## Active Tasks

| ID | Status | Task | Notes |
| --- | --- | --- | --- |
| P0-01 | DONE | Create persistent project-memory docs | README, task tracker, dev log, handoff, brief |
| P0-02 | DONE | Create buildable extension workspace scaffold | React + TS + Vite + MV3 |
| P1-01 | DONE | Add Manifest V3 shell with popup, app page, background, content script | MVP foundation |
| P1-02 | DONE | Implement hidden/watched/watch_later storage model | Snapshot-based state in chrome.storage.local |
| P1-03 | DONE | Implement first-pass JioHotstar card detection and hide logic | URL/title-based extraction |
| P1-04 | DONE | Build popup for quick stats and navigation | 4 stats + open app + open side panel |
| P1-05 | DONE | Build 6-tab discovery app | Manage, Watch Later, Swipe Deck, Recommendations, Taste, Catalog |
| P1-06 | DONE | Add Hide / Watched / Watch Later actions on detected cards | + undo toast + rating badge |
| P1-07 | DONE | Improve adapter coverage across homepage/search/detail rails | Extended URL pattern, 6 title fallbacks, 3 HTML fixtures, 17 tests |
| P1-08 | DONE | Add import/export backup of user state | Exports taste graph too (v2 backup) |
| P1-09 | DONE | Add catalog ingestion pipeline | TMDB-first builder + 91mobiles seed |
| P1-10 | DONE | Add recommendation V1 | Deterministic 7-weight scoring, diversity rerank, exploration modes |
| P1-11 | DONE | Add baseline adapter tests | 35 total tests passing |
| P2-01 | DONE | IndexedDB catalog storage (Dexie) | Eliminates 10MB chrome.storage.local limit |
| P2-02 | DONE | Taste graph wiring from content script | Background worker updates graph on Hide/Watched |
| P2-03 | DONE | FETCH_CARD_META message + rating badge | Background returns TMDB rating for any card |
| P2-04 | DONE | Undo toast on card actions | 5-second dismiss, works for all 3 action types |
| P2-05 | DONE | Watch Later feature | State, content script button, Watch Later tab in app |
| P2-06 | DONE | Swipe Deck tab | Full-card deck with poster images, emoji actions, skip, undo |
| P2-07 | DONE | Taste Controls tab | Signed weight bars per node type, centroid display |
| P2-08 | DONE | Catalog Health tab | DB stats, action log, force re-sync button |
| P2-09 | DONE | User action log (IndexedDB) | logUserAction() on every Hide/Watched/Later action |
| P2-10 | DONE | Manifest v0.3.0 | sidePanel, alarms permissions, web_accessible_resources for catalog |
| P2-11 | DONE | GitHub Actions catalog refresh workflow | Weekly TMDB pull, auto-commit, TMDB_BEARER_TOKEN secret |

## Near-Term Sequence (Phase 4+)

1. Set `TMDB_BEARER_TOKEN` secret in GitHub repo settings for automated weekly refresh.
2. Phase 4: Logistic regression classifier from action log (V2 scoring).
3. Phase 5: Hosted PWA with `externally_connectable` bridge to extension.
4. Phase 6: Natural language search / LLM explanations ("why this?", mood query).
5. Phase 7: Netflix/Prime adapter, optional Trakt import.

## Deferred By Design

- Redis
- pgvector
- LangGraph
- Ollama
- Two-tower neural network
- Hosted sync backend
- Smart TV/DIAL launch
