# JioHotstar Curator

> **AI-powered content curation for JioHotstar** — hide what you've watched, surface what you'll love, and train a personal taste profile without leaving the page.

[![Version](https://img.shields.io/badge/version-1.2.0-6366f1?style=flat-square)](https://github.com/kunal-gh/thatone/releases)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-34d399?style=flat-square&logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![Build](https://img.shields.io/badge/build-passing-34d399?style=flat-square)](#)

---

## What It Does

JioHotstar's home feed is noisy — reality shows you'd never watch, titles you've already seen, genres you don't care about. This extension fixes that:

- **Hides unwanted titles** from JioHotstar's home feed with a smooth animation (no blank gaps)
- **Shows controls only on hover** — your feed looks exactly the same until you interact
- **Learns your taste** from every action you take (hide, watched, save for later)
- **Recommends content** you'll actually like, ranked by a multi-signal scoring engine
- **Imports your history** from IMDb or links your TMDB account for instant personalization
- **Backs up your profile** — export and restore your entire curation state as JSON

---

## Features

### 🎬 On-Page Integration

Hover over any movie or show on JioHotstar to see controls:

| Action | Effect |
|--------|--------|
| **Hide** | Card collapses smoothly (no blank gap). Adds negative taste signal. |
| **Watched** | Marks as seen. Removes from recommendations. Adds positive taste signal. |
| **Save for Later** | Adds to your Watchlist tab. Neutral taste signal. |
| **Undo** | 5-second glass toast lets you instantly undo any action |

### 🖥 Side Panel App

Open the side panel from the extension icon. 7 tabs:

#### Discover
Poster-grid of ranked recommendations drawn from 5,752 JioHotstar titles. Each card shows:
- Full TMDB poster image (lazy-loaded)
- Recommendation score ring
- Genre tags
- One-click actions

#### Swipe
Tinder-style card deck. Drag left to hide, right to mark watched, up to save for later. Spring physics for satisfying snap-back and throw animations.

#### Watchlist
Your saved "Watch Later" queue in a poster grid. Sort by date added, rating, or title.

#### Library
All your hidden and watched titles. Filter by text search. Restore any item.

#### Profile (Taste Graph)
Your personal taste profile displayed as:
- **Genre Affinity Radar** — SVG spider chart of your top 8 genre weights
- **Horizontal bar charts** — genre, actor, director, language signals

Score formula:
```
score = 0.35 × embedding_similarity
      + 0.20 × taste_alignment
      + 0.15 × quality_signal
      + 0.10 × mood_match
      + 0.08 × novelty
      + 0.07 × diversity
      + 0.05 × freshness
      − penalties
```

#### System Health
Real-time dashboard: runtime mode, storage provider, catalog title count, DB status, alarm state, catalog rebuild control.

#### Settings
- **IMDb Import** — drag-and-drop your IMDb ratings/watchlist CSV
- **TMDB Account** — verify API key + link account for watchlist sync
- **Backup & Restore** — export/import all data as portable JSON
- **Diagnostics** — log level control, log export

---

## Architecture

```
src/
├── app/
│   └── App.tsx              — 7-tab side panel app (React)
├── components/
│   ├── PosterCard.tsx        — TMDB poster image with lazy load & score ring
│   ├── SwipeDeck.tsx         — Drag-gesture card deck with spring physics
│   ├── RadarChart.tsx        — Pure SVG radar chart for taste visualization
│   ├── SettingsTab.tsx       — Import, account linking, backup, diagnostics
│   └── ErrorBoundary.tsx     — React error boundary with recovery UI
├── extension/
│   ├── content.ts            — DOM injection (IIFE, no npm deps)
│   ├── background.ts         — Service worker, alarms, message bus
│   ├── adapter.ts            — JioHotstar card detection
│   └── content-storage.ts   — Chrome storage wrapper (zero npm deps)
├── popup/
│   └── App.tsx               — Toolbar popup
├── shared/
│   ├── storage.ts            — Chrome/localStorage dual-mode adapter
│   ├── db.ts                 — Dexie v2 schema (catalog, actions, imports, sync)
│   ├── catalog.ts            — Catalog load, Dexie sync, matching helpers
│   ├── recommend.ts          — Multi-signal recommendation scoring engine
│   ├── curation.ts           — Action application, taste graph sync
│   ├── taste.ts              — Taste graph edge weights, centroid
│   ├── imdb-import.ts        — IMDb CSV parsing, auto-detect, fuzzy matching
│   ├── tmdb-account.ts       — TMDB OAuth flow, watchlist/ratings sync
│   ├── data-transfer.ts      — Versioned JSON backup / restore
│   ├── logger.ts             — Structured logger with ring buffer
│   ├── runtime.ts            — Runtime capability detection
│   ├── normalize.ts          — Title normalization utilities
│   └── types.ts              — Shared TypeScript types
└── styles/
    └── base.css              — Dark glassmorphism design system (2300+ lines)

public/
├── manifest.json             — Chrome MV3 manifest (v1.2.0)
├── icons/                    — Extension icons (16/32/48/128px SVG)
└── data/catalog/
    ├── tmdb-jiohotstar-catalog.json   — 5,752 curated titles
    └── 91mobiles-jiohotstar-seed.json — 23-item fallback
```

### Build Pipeline

```
TypeScript → tsc type-check
          → Vite build (React app, popup, background)
          → esbuild IIFE (content script — standalone, no npm imports)
```

The content script must be a self-contained IIFE because Chrome MV3 restricts module scripts in content script injection contexts. Esbuild bundles it separately from the Vite pipeline.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript 5 |
| Build | Vite 7 + esbuild (content script) |
| Database | Dexie (IndexedDB wrapper) |
| Styling | Vanilla CSS — dark glassmorphism design system |
| Font | Inter (Google Fonts) |
| Extension | Chrome MV3 — service worker, side panel, content script |
| Catalog | TMDB API (static build) + OMDB cross-reference |
| Account | TMDB OAuth v3 (user-provided API key — no hardcoded secrets) |

---

## Setup

### Prerequisites

- Node.js 18+ and npm
- Chrome (or Chromium-based browser)
- Free [TMDB API key](https://www.themoviedb.org/settings/api) (optional — for account sync)

### Install and Run

```bash
git clone https://github.com/kunal-gh/thatone.git
cd thatone
npm install

# Run as web app
npm run dev -- --host 127.0.0.1 --port 4173
# → open http://127.0.0.1:4173/

# Or build as Chrome extension
npm run build
# → load dist/ in chrome://extensions (Developer mode → Load unpacked)
```

### Environment Variables

Create a `.env` file (never commit it):

```env
TMDB_BEARER_TOKEN=<your_tmdb_bearer_token>
OMDB_API_KEY=your_omdb_key
```

Only needed if you want to rebuild the catalog. The extension ships with a pre-built catalog.

### Rebuild The Catalog

```bash
npm run catalog:tmdb   # Full TMDB catalog (5,752 items)
npm run catalog:seed   # 23-item fallback (no API key)
```

---

## IMDb Import

1. Go to [imdb.com/list/watchlist](https://www.imdb.com/list/watchlist/) or [imdb.com/user/ratings](https://www.imdb.com/user/ratings/) on your IMDb profile
2. Click **Export** → download the CSV
3. Open the Curator side panel → **Settings** tab
4. Drag-and-drop your CSV into the IMDb Import zone
5. Review the preview (matched/unmatched titles), then click **Import**

The parser auto-detects ratings vs. watchlist format. Matching uses IMDb ID first, then title + year fuzzy fallback.

---

## TMDB Account Linking

1. Get a free API key at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
2. Open Settings → TMDB Connection
3. Paste your key and click **Verify Key**
4. Click **Link Account** — TMDB opens in a new tab
5. Approve access on the TMDB page
6. Return to Curator and click **Confirm Link**

Your TMDB watchlist and rated movies/shows will be matched against the local catalog.

---

## Data Backup

All your data lives locally (IndexedDB + localStorage). Back it up:

1. Settings → Data Management → **Download Backup**
2. A JSON file is downloaded: `jiohotstar-curator-backup-YYYY-MM-DD.json`

Restore on another device:
1. Settings → Data Management → **Import Backup**
2. Select the JSON file

---

## Development

```bash
npm run dev           # Vite dev server
npm run build         # Full production build
npm run test          # Vitest suite (39 tests)
npm run verify        # Tests + build + secret scan
npm run security:scan # Secret scan only
npm audit             # Dependency audit
```

### Content Script Rules

`content.ts` is built as a standalone IIFE. It can **only** import from:
- `./content-storage` — chrome.storage wrapper
- `./adapter` — JioHotstar card detection
- `../shared/normalize` — pure string utils
- `../shared/types` — TypeScript types (erased at build time)

Never import Dexie, React, or any npm package into content.ts.

### Database Schema

```
CuratorDB (Dexie v2)
├── catalog       — 5,752 CatalogItem rows (content_id PK)
├── user_actions  — action log (action_id PK)
├── imdb_imports  — import history (auto-increment PK)
└── sync_state    — alarm timestamps and sync metadata (key PK)
```

---

## Security

- **No hardcoded secrets** — TMDB API key is user-provided, stored in `localStorage`
- **No backend** — all data is local; no telemetry, no analytics
- **CSP enforced** — extension pages: `script-src 'self'`, allows Google Fonts
- **Manifest permissions** — `storage`, `tabs`, `alarms`, `sidePanel` only
- **Host permissions** — scoped to `hotstar.com` and `jiohotstar.com` only
- **No DRM bypass** — no stream URL access, no cookie interception, no account tokens
- `npm audit` — 0 vulnerabilities

---

## Roadmap

- [ ] Trakt.tv OAuth integration (industry-standard watch history)
- [ ] Cloudflare Worker proxy (hide TMDB key from network inspector)
- [ ] Chrome Web Store release (privacy policy + screenshots needed)
- [ ] Playwright E2E tests (verify heartbeat on live JioHotstar tab)
- [ ] Vercel deployment of web app
- [ ] Live catalog refresh from hosted TMDB endpoint

---

## Repository

**GitHub:** [github.com/kunal-gh/thatone](https://github.com/kunal-gh/thatone)

**Architecture docs:** [Docs/HANDOFF.md](Docs/HANDOFF.md) · [Docs/BUILD_AND_LOAD.md](Docs/BUILD_AND_LOAD.md) · [Docs/CATALOG_PIPELINE.md](Docs/CATALOG_PIPELINE.md)

**Dev log:** [logs/DEV_LOG.md](logs/DEV_LOG.md)
