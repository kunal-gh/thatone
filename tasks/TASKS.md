# Task Tracker

Last updated: 2026-06-24

## Objective

Build a professional, local-first JioHotstar curation product with:

- a Chrome extension for on-page filtering
- an extension-owned discovery app with recommendations
- persistent hidden/watched tracking and taste graph
- a catalog pipeline backed by TMDB
- a deterministic recommendation engine (V1 complete)

## Current Phase

Phase 2: Catalog hardening + Recommendation V1 ✅

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
| P1-02 | DONE | Implement hidden/watched storage model in `chrome.storage.local` | Snapshot-based state |
| P1-03 | DONE | Implement first-pass JioHotstar card detection and hide logic | URL/title-based extraction |
| P1-04 | DONE | Build popup for quick stats and navigation | MVP control surface |
| P1-05 | DONE | Build app page for hidden/watched management | Now has Manage + Recommendations tabs |
| P1-06 | DONE | Add explicit "hide" and "watched" actions directly on detected cards | User-facing page controls |
| P1-07 | DONE | Improve adapter coverage across homepage/search/detail rails | Extended URL pattern, 6 title fallbacks, 3 HTML fixtures, 10+ tests |
| P1-08 | DONE | Add import/export backup of user state | Now exports taste graph too (v2 backup) |
| P1-09 | DONE | Add catalog ingestion pipeline | TMDB-first builder + 91mobiles seed, shared catalog.ts module |
| P1-10 | DONE | Add recommendation V1 | Deterministic 7-weight scoring, diversity rerank, exploration modes, score debug UI |
| P1-11 | DONE | Add baseline adapter tests | Vitest + jsdom fixture coverage, now 10+ test cases |

## Near-Term Sequence

1. Run `npm run catalog:tmdb` with a TMDB_BEARER_TOKEN to generate the full catalog.
2. Expand taste graph update: call updateTasteGraph on every Hide/Watched action from the content script.
3. Add Dexie/IndexedDB for catalog storage (chrome.storage.local has 10MB cap).
4. Add watch-later state and Watch Later tab in the app.

## Deferred By Design

- Redis
- pgvector
- LangGraph
- Ollama
- two-tower neural network
- hosted sync backend
- Smart TV/DIAL launch
