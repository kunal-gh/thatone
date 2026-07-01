# Project Brief

**Project:** JioHotstar Curator
**Version:** 1.2.0
**Repository:** github.com/kunal-gh/thatone
**Last Updated:** 2026-07-02

## Purpose

A professional Chrome MV3 extension that curates the JioHotstar streaming feed for a single user. It hides unwanted content, learns taste preferences from user actions, and surfaces personalized recommendations — all without a backend.

## Goals

- **Personal UX:** Show controls only on hover; collapse hidden cards smoothly with no blank spaces
- **Taste learning:** Every action (hide, watched, save) updates a weighted taste graph across genre, actor, director, and language dimensions
- **Recommendations:** Multi-signal scoring engine (embedding + taste + quality + mood + novelty + diversity + freshness)
- **Account integration:** Import IMDb history via CSV; sync TMDB watchlist via OAuth
- **Professional engineering:** Showcases TypeScript, React, Chrome MV3, Dexie, IIFE content scripts, structured logging, error boundaries, and glassmorphism design

## Non-Goals

- No backend infrastructure required (local-first)
- No DRM bypass or stream URL access
- No multi-user accounts or cloud sync (single-user, local data)
- No real-time catalog scraping (static TMDB build at 5,752 titles)

## Technical Highlights

| Area | Implementation |
|------|---------------|
| Extension | Chrome MV3 — side panel, service worker, IIFE content script |
| UI | React 19 + dark glassmorphism CSS design system (Inter font) |
| Database | Dexie v2 (IndexedDB) — 4 tables with proper migrations |
| Build | Vite 7 (React app) + esbuild (standalone IIFE for content script) |
| Testing | Vitest — 39 passing tests |
| Security | User-provided API keys, CSP enforced, 0 npm audit vulns |

## Status

Complete. All planned phases delivered:
- ✅ Phase 1: Bug fixes (collapse animation, hover controls, real-time sync)
- ✅ Phase 2: UI/UX overhaul (dark glassmorphism, poster images, swipe deck)
- ✅ Phase 3: Account integration (IMDb CSV import, TMDB OAuth)
- ✅ Phase 4: Professional hardening (error boundary, structured logger, icons, CSP, backup/restore)
