# Personal JioHotstar Curator

Local-first Chrome extension and discovery app for:

- permanently hiding unwanted JioHotstar titles
- tracking watched content
- building a personal taste profile
- getting deterministic recommendations from a versioned JioHotstar catalog
- keeping playback inside official JioHotstar pages

## Project Memory

These files are the source of truth for resuming work across MCP sessions:

- `tasks/TASKS.md`: active roadmap and task checklist
- `logs/DEV_LOG.md`: chronological development log
- `Docs/HANDOFF.md`: current development state and next actions
- `Docs/PROJECT_BRIEF.md`: product objective and architectural guardrails
- `Docs/revised_architecture_blueprint.md`: deep architecture blueprint (801 lines)

## Current Build Scope

All Phase 1 tasks are complete. The extension can:

1. Load on JioHotstar pages
2. Detect content cards across homepage carousels, search results, and detail page rails
3. Inject Hide and Watched buttons on detected cards
4. Persist hidden/watched state across page refreshes
5. Show a popup with counts of hidden and watched titles
6. Show a full management app with:
   - **Manage tab**: list, remove, export/import hidden/watched items
   - **Recommendations tab**: deterministic ranked catalog with score debug, exploration modes, mood filter
7. Build a personal taste graph from user actions
8. Score and rerank catalog items using the 7-weight formula from the architecture blueprint
9. Import/export complete backup (state + taste graph)

## Tech Direction

- React 19 + TypeScript + Vite 7
- Chrome Manifest V3
- `chrome.storage.local` for extension state and taste graph
- IndexedDB via Dexie planned for large catalog storage
- TMDB API as primary catalog source
- 91mobiles as secondary catalog source / validator

## Commands

```bash
# Install dependencies
npm install

# Run tests (adapter + recommendation engine)
npm test

# Build production extension bundle → dist/
npm run build

# Build 91mobiles seed catalog (no API key)
npm run catalog:seed

# Build full TMDB catalog (requires TMDB_BEARER_TOKEN in .env)
npm run catalog:tmdb
```

## Loading the Extension

1. `npm run build`
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click `Load unpacked` → select the `dist/` folder

## Environment Variables

```
TMDB_BEARER_TOKEN=   # Required for catalog:tmdb
OMDB_API_KEY=        # Optional — adds IMDb ratings to catalog
```

## Repository

`github.com/kunal-gh/thatone`
