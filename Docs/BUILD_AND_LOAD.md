# Build And Load

## Local Development

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

The production extension bundle is written to:

- `dist/manifest.json`
- `dist/extension/background.js`
- `dist/extension/content.js`
- `dist/index.html` (popup)
- `dist/app.html` (management app)
- `dist/assets/` (React bundles, CSS)

### Test

```bash
npm test
```

Runs Vitest. All adapter tests and recommendation engine tests should pass.

## Load In Chrome

1. Open `chrome://extensions`
2. Enable Developer mode (top right toggle)
3. Click `Load unpacked`
4. Select the `dist` folder

## Current User Flows

### On JioHotstar Pages
1. Open any JioHotstar page in Chrome.
2. The content script scans for movie/show cards across:
   - Homepage carousels
   - Search results
   - Detail page "More like this" rails
3. Each detected card gets floating **Hide** (dark red) and **Watched** (dark green) buttons.
4. Clicking Hide/Watched: persists to `chrome.storage.local`, hides the card immediately.
5. Hidden/watched titles are suppressed on next visit automatically.

### Popup
1. Click the extension icon in Chrome toolbar.
2. See counts of hidden and watched titles.
3. Click "Open management app" to go to the full app.

### Management App (app.html)
**Manage tab:**
- See all hidden/watched items sorted newest-first.
- Remove any item from state.
- Export full backup (JSON, includes taste graph).
- Import a previous backup.

**Recommendations tab:**
- See up to 20 recommendations from the catalog.
- Switch exploration mode: Comfort (5% exploration), Balanced (15%), Surprise (35%).
- Type a mood filter (e.g. "thriller", "comedy") to narrow recommendations.
- Click "Show score breakdown" per item to see the 7-weight scoring debug panel.
- Click "Watch on JioHotstar" to open the title.

## Catalog Commands

```bash
# 91mobiles seed (no API key needed, ~23 items)
npm run catalog:seed

# Full TMDB-first catalog (requires TMDB_BEARER_TOKEN in .env)
TMDB_BEARER_TOKEN=<your_token> npm run catalog:tmdb
```

After generating the catalog, run `npm run build` again so the extension bundles include the catalog path reference. The catalog file itself goes in `data/catalog/` — copy it to `dist/` or serve it from a static host.

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
TMDB_BEARER_TOKEN=   # Required for catalog:tmdb
OMDB_API_KEY=        # Optional — adds IMDb ratings to catalog
```

## If Another MCP Resumes Work

Read in this order:

1. `tasks/TASKS.md`
2. `logs/DEV_LOG.md`
3. `docs/HANDOFF.md`
4. `docs/PROJECT_BRIEF.md`
5. `Docs/revised_architecture_blueprint.md`

## Known Limits Right Now

- Catalog is the 23-item seed until `catalog:tmdb` is run with a token.
- Taste graph is updated from the app only — not yet from the content script.
- chrome.storage.local has a 10MB cap; IndexedDB (Dexie) needed for large catalogs.
- No end-to-end extension loading test yet.
