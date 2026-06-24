# Personal JioHotstar Curator

Local-first recommendation and filtering layer for JioHotstar.

The project gives you a clean discovery app plus a Chrome extension. It can hide unwanted titles, track watched items, keep a Watch Later queue, build a local taste graph, and recommend unseen titles from a generated JioHotstar catalog.

The current build is deliberately DRM-safe: it only works with metadata, browser UI state, local storage, and official JioHotstar links.

## Current Status

- Full web app runs at `http://127.0.0.1:4173/`.
- Chrome extension build works from `dist/`.
- Full TMDB catalog is bundled: 5,752 unique titles.
- Brutalist monochrome UI is active across app, popup, and injected controls.
- Runtime health indicators are visible in the app.
- Web mode works without Chrome APIs.
- Secret scan and Vercel security headers are included.

## Project Memory

Read these files first when resuming development:

- `tasks/TASKS.md`
- `logs/DEV_LOG.md`
- `Docs/HANDOFF.md`
- `Docs/BUILD_AND_LOAD.md`
- `Docs/CATALOG_PIPELINE.md`
- `Docs/PROJECT_BRIEF.md`

## Commands

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
npm run verify
npm audit
```

Catalog:

```bash
npm run catalog:seed
npm run catalog:tmdb
```

`catalog:tmdb` requires `TMDB_BEARER_TOKEN` in `.env`. `OMDB_API_KEY` is optional.

## Extension Loading

```bash
npm run build
```

Then load `dist/` from `chrome://extensions` using Developer mode.

## Main Architecture

- React 19 + TypeScript + Vite 7
- Chrome Manifest V3
- Dexie/IndexedDB for catalog and action log
- `chrome.storage.local` in extension mode
- `localStorage` fallback in web mode
- Static JSON catalog in `public/data/catalog/`
- Deterministic recommendation engine with hard filters, taste graph, diversity, novelty, freshness, and exploration

## Security Notes

- `.env` is ignored.
- `npm run security:scan` checks tracked and untracked non-ignored files for common key/token patterns.
- `vercel.json` includes security headers.
- `npm audit` is clean in the current dependency state.

## Repository

`github.com/kunal-gh/thatone`
