# Build and Load

Last updated: 2026-07-02 (v1.2.0)

---

## Quick Start — Local Web App

Use this for normal live testing and future Vercel deployment.

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

Open: `http://127.0.0.1:4173/`

The app works without Chrome extension APIs by using `localStorage` + IndexedDB (Dexie). Full feature parity with the extension app.

---

## Production Build

```bash
npm run build
```

Build output:

| Path | Purpose |
|------|---------|
| `dist/index.html` | Web app entry (Vercel / localhost) |
| `dist/app.html` | Extension side panel / full app |
| `dist/popup.html` | Extension toolbar popup |
| `dist/manifest.json` | Chrome MV3 manifest |
| `dist/extension/background.js` | Service worker (module) |
| `dist/extension/content.js` | Injected content script (standalone IIFE) |
| `dist/assets/` | React + CSS bundles |
| `dist/data/catalog/` | Bundled catalog JSON files |
| `dist/icons/` | Branded extension icons |

---

## Verify Everything

```bash
npm run verify
npm audit
```

`npm run verify` runs:
1. Vitest test suite
2. TypeScript type-check
3. Vite production build
4. Secret scan

Expected results:
- 39 tests passing
- Build passes
- Secret scan passes
- `npm audit` reports 0 vulnerabilities

---

## Load Extension In Chrome

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `dist/` folder
6. **After every rebuild:** click the ↻ reload icon on the extension card, then reload the JioHotstar tab

### Verify Connection

When the content script is attached, the JioHotstar page shows a small glass pill at the bottom-left:

```
✓ CURATOR · 24 cards · 24 controls · 0 hidden
```

If this pill is missing:
- Reload the extension in `chrome://extensions`
- Reload the JioHotstar tab
- Check the URL is covered by the manifest (see below)

### Manifest URL Coverage

The extension covers both bare and subdomain URLs:

- `https://hotstar.com/*`
- `https://*.hotstar.com/*`
- `https://jiohotstar.com/*`
- `https://*.jiohotstar.com/*`
- `https://www.jiohotstar.com/*`

---

## Extension Icons

Icons are in `public/icons/` as SVGs and are bundled to `dist/icons/`. They show the Curator "C" lettermark on an indigo→purple gradient square.

Sizes: `icon16.svg`, `icon32.svg`, `icon48.svg`, `icon128.svg`

---

## Settings Tab

After loading the extension and opening the side panel:

1. Click the **Settings** tab (gear icon)
2. **IMDb Import:** drag-and-drop or click to upload your IMDb CSV export
3. **TMDB Connection:** enter your free TMDB API key (from themoviedb.org/settings/api), click Verify Key, then optionally click Link Account for watchlist sync
4. **Data Management:** Download Backup (JSON) or Import Backup to restore

---

## Catalog Commands

```bash
# Full TMDB catalog — requires .env values
npm run catalog:tmdb

# 91mobiles seed (23 items, no key required)
npm run catalog:seed
```

Required environment variables (in `.env`, never commit):

```
TMDB_BEARER_TOKEN=your_token_here
OMDB_API_KEY=your_key_here
```

---

## Entry Point Map

| File | Mode | Purpose |
|------|------|---------|
| `index.html` | Web / Vercel | Root web app |
| `app.html` | Extension | Side panel / full app |
| `popup.html` | Extension | Toolbar popup |
| `public/manifest.json` | Extension | Chrome MV3 manifest |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| App shows fewer than 5,752 catalog titles | System Health tab → **REBUILD LOCAL CATALOG** |
| Local URL says "connection refused" | Start dev server: `npm run dev -- --host 127.0.0.1 --port 4173` |
| Side panel opens but no page controls appear | Reload the unpacked extension, reload the JioHotstar tab, check for CURATOR heartbeat |
| Extension state looks duplicated | The app dedupes mirrored title/URL records in views — this is expected |
| Dev server port is busy | Change the port: `npm run dev -- --port 4200` |
| TMDB key test fails | Check key has read access (v3 auth) at themoviedb.org/settings/api |
| IMDb import shows 0 matches | Ensure the CSV is from IMDb (Ratings or Watchlist export), not a third-party format |
| Backup restore fails | Check the file is a Curator backup (version: "1.0"). Other formats not supported. |
