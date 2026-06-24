# Project Brief

## Product Goal

Build a personal curation layer on top of JioHotstar that gives the user control over discovery without touching DRM, authentication, or private APIs.

## User Problems

1. Unwanted titles keep appearing on the homepage.
2. Watched titles get recommended again.
3. The default recommendation feed does not reflect personal taste.
4. The user needs a cleaner and more intentional discovery flow.

## MVP Goal

Ship a Chrome extension that can:

1. detect content cards on JioHotstar pages
2. hide blocked titles
3. track watched titles
4. show a management UI for hidden/watched state

## Architectural Guardrails

- Playback always happens on official JioHotstar pages.
- No internal/private JioHotstar API becomes a dependency.
- No cookies, tokens, or credentials are captured or transmitted.
- Hard filters are deterministic and always happen before ranking.
- Local-first storage is the default.

## Phase Order

1. Extension MVP
2. Extension-owned discovery app
3. Import/export and resilience
4. Catalog ingestion
5. Recommendation V1
6. Optional hosted sync/PWA
7. Optional AI and advanced ML layers

## Source Architecture

Primary architecture document:

- `Docs/revised_architecture_blueprint.md`

