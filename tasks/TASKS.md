# Task Tracker

Last updated: 2026-06-27 (Session 5)

## Objective

Build a professional, local-first JioHotstar curation product that can run in two modes:

- Web app/PWA mode for easy localhost testing and future Vercel deployment.
- Chrome extension mode for on-page JioHotstar filtering.

The product permanently hides unwanted titles, tracks watched titles, saves Watch Later items, builds a local taste graph, and recommends unseen catalog items without touching DRM, streams, or private platform APIs.

## Current Phase

Phase 5: Live connectivity repair and localhost verification - DONE.

## Active Tasks

| ID | Status | Task | Notes |
| --- | --- | --- | --- |
| P0-01 | DONE | Create persistent project-memory docs | README, task tracker, dev log, handoff, build/load guide |
| P0-02 | DONE | Create buildable workspace scaffold | React 19, TypeScript, Vite, MV3 |
| P1-01 | DONE | Add Manifest V3 shell | Popup, app page, background worker, content script |
| P1-02 | DONE | Implement hidden/watched/watch_later state | Chrome storage in extension, localStorage fallback in web |
| P1-03 | DONE | Implement JioHotstar card detection | URL/title/card heuristics |
| P1-04 | DONE | Build popup | Stats plus app/side-panel launch |
| P1-05 | DONE | Build discovery app | Recommendations, Swipe, Manage, Watch Later, Taste, System Health |
| P1-06 | DONE | Add on-page actions | Hide, Watched, Later, rating badge, undo toast |
| P1-07 | DONE | Improve adapter coverage | 17 adapter tests and 3 HTML fixtures |
| P1-08 | DONE | Add backup import/export | State plus taste graph |
| P1-09 | DONE | Add catalog ingestion pipeline | TMDB-first builder plus 91mobiles seed fallback |
| P1-10 | DONE | Add Recommendation V1 | Deterministic scoring, hard filters, diversity, exploration |
| P1-11 | DONE | Add baseline tests | Adapter and recommendation tests |
| P2-01 | DONE | Add IndexedDB catalog storage | Dexie catalog and user_actions tables |
| P2-02 | DONE | Wire taste graph from extension actions | Background syncs graph from current local state |
| P2-03 | DONE | Add rating metadata lookup | Background `FETCH_CARD_META` response |
| P2-04 | DONE | Add undo toast | Restores previous card state and resyncs graph |
| P2-05 | DONE | Add Watch Later | Content script and app support |
| P2-06 | DONE | Add Swipe Deck | Recommendation-seeded training deck |
| P2-07 | DONE | Add Taste Graph tab | Edge weights plus centroid view |
| P2-08 | DONE | Add System Health tab | Catalog, DB, backend, action-log indicators |
| P2-09 | DONE | Add user action log | IndexedDB-backed local log |
| P2-10 | DONE | Update manifest | v0.4.0, side panel, alarms, catalog web resources |
| P2-11 | DONE | Add GitHub Actions catalog refresh | Weekly TMDB refresh using repository secrets |
| P3-01 | DONE | Make app runnable as a normal URL | `index.html` now loads the full app at localhost/root |
| P3-02 | DONE | Keep extension popup separate | `popup.html` is the MV3 popup entry |
| P3-03 | DONE | Add web storage fallback | App works without Chrome extension APIs |
| P3-04 | DONE | Add health indicators | Runtime, storage, catalog, DB, action log, backend |
| P3-05 | DONE | Redesign UI | Minimal brutalist monochrome theme, no RGB/gradient glass UI |
| P3-06 | DONE | Add security scan | `npm run security:scan` scans tracked and untracked files |
| P3-07 | DONE | Add production verify command | `npm run verify` runs tests, build, and secret scan |
| P3-08 | DONE | Add Vercel hardening | `vercel.json` with CSP and security headers |
| P3-09 | DONE | Fix catalog primary key collision | TMDB IDs now include media type, preserving all 5,752 rows |
| P3-10 | DONE | Remove tracked build artifacts | `tsconfig*.tsbuildinfo` and generated `vite.config.js` removed |
| P3-11 | DONE | Fix dev dependency advisory | `esbuild` overridden to fixed `^0.28.1`; audit clean |
| P3-12 | DONE | Fix bare Hotstar domain injection | Manifest now matches `https://hotstar.com/*` and `https://jiohotstar.com/*` in addition to wildcard subdomains |
| P3-13 | DONE | Add visible on-page extension heartbeat | JioHotstar page now shows `CURATOR CONNECTED` with detected card/control counts |
| P3-14 | DONE | Add stronger live-card adapter fallback | Poster image cards and click-handler layouts are detected even when content links are missing |
| P3-15 | DONE | Add full-app launch from side panel | App header now exposes `OPEN FULL APP` and `OPEN JIOHOTSTAR` actions |
| P3-16 | DONE | Improve startup health honesty | Database health starts as `loading` until catalog sync completes |
| P3-17 | DONE | Add explicit active-tab bridge probe | Side panel now pings the content script and shows connected/disconnected state |

## Verification Snapshot

- `npm test`: 39/39 passing.
- `npm run build`: production build passes.
- `npm run security:scan`: no tracked or untracked secrets detected.
- `npm audit`: 0 vulnerabilities after `esbuild` override.
- Browser verification: `http://127.0.0.1:4173/` renders live, shows runtime `WEB`, database `READY`, 5,752 catalog titles, and 24 recommendations from 5,752 catalog entries.
- Built-extension verification: `dist/manifest.json` includes bare Hotstar/JioHotstar matches; `dist/extension/content.js` includes `CURATOR CONNECTED` page heartbeat.

## Next Work

| ID | Status | Task | Notes |
| --- | --- | --- | --- |
| P4-01 | TODO | Add hosted PWA deploy config | Vercel static deploy is ready structurally; add project settings after push |
| P4-02 | TODO | Add extension-to-web bridge | Optional `externally_connectable` sync between extension and hosted app |
| P4-03 | TODO | Add smarter learning | Lightweight logistic/bandit model from `user_actions` |
| P4-04 | TODO | Add natural language search/explanations | Deferred until local-first core is stable |
| P4-05 | TODO | Add visual E2E tests | Playwright route smoke tests for app tabs |

## Deferred By Design

- Redis
- pgvector/vector database
- LangGraph
- Ollama/local LLM runtime
- Two-tower neural network
- Hosted sync backend
- Smart TV/DIAL launch
