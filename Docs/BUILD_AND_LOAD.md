# Build And Load

## Local Web App

Use this for normal live testing and future Vercel-style deployment.

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

Open:

```text
http://127.0.0.1:4173/
```

The root page (`index.html`) loads the full app. It works without Chrome extension APIs by using localStorage plus IndexedDB.

## Production Build

```bash
npm run build
```

Build output:

- `dist/index.html`: full web app entry
- `dist/app.html`: extension side-panel/full-app entry
- `dist/popup.html`: extension popup entry
- `dist/manifest.json`: MV3 manifest
- `dist/extension/background.js`
- `dist/extension/content.js`
- `dist/data/catalog/`: bundled catalog files
- `dist/assets/`: React/CSS bundles

## Verify Everything

```bash
npm run verify
npm audit
```

`npm run verify` runs:

1. Vitest suite
2. TypeScript and Vite production build
3. Secret scan

Current expected result:

- 39 tests passing
- build passes
- secret scan passes
- audit reports 0 vulnerabilities

## Load Extension In Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select `dist/`.
6. After every rebuild, click the reload icon on the unpacked extension card.
7. Reload the JioHotstar tab.

When the content script is attached, the JioHotstar page shows a small fixed heartbeat:

```text
CURATOR CONNECTED / {n} CARDS / {n} CONTROLS / {n} HIDDEN
```

The manifest explicitly covers both bare and subdomain URLs:

- `https://hotstar.com/*`
- `https://*.hotstar.com/*`
- `https://jiohotstar.com/*`
- `https://*.jiohotstar.com/*`

## Catalog Commands

```bash
# 91mobiles seed fallback, no key required
npm run catalog:seed

# Full TMDB catalog, requires .env values
npm run catalog:tmdb
```

Environment variables:

```text
TMDB_BEARER_TOKEN=
OMDB_API_KEY=
```

Never commit `.env`.

## Entry Point Map

| File | Purpose |
| --- | --- |
| `index.html` | Root local web app and Vercel entry |
| `app.html` | Extension side panel/full app |
| `popup.html` | Extension toolbar popup |
| `public/manifest.json` | Chrome MV3 manifest |

## Troubleshooting

- If the app shows fewer than 5,752 catalog titles, open System Health and click `REBUILD LOCAL CATALOG`.
- If the local URL says connection refused, start the dev server with `npm run dev -- --host 127.0.0.1 --port 4173`.
- If the side panel opens but no page controls appear, reload the unpacked extension, reload the JioHotstar tab, and confirm the `CURATOR CONNECTED` heartbeat is visible.
- If extension state looks duplicated, use the app views; they dedupe mirrored title/url records.
- If the dev server port is busy, run Vite on another port and open that URL.
