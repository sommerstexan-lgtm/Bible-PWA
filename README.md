# KJV Study PWA – v5.5.0

**Password:** `KJV-Study-Private`

Private, local-only Progressive Web App for personal free public-domain KJV Bible study.
All data stays on your device. No accounts, no servers required after initial commentary cache.

## What’s fixed in v5.5

- **Research scroll memory (corrected)** – Only the outer panel scrolls. Your place in the notes is saved and restored correctly when you close and reopen Research on the same chapter and source (Clarke or Tyndale).

## Research / Commentary

- **Adam Clarke’s Commentary** (public domain) and **Tyndale Open Study Notes** (CC BY-SA).
- Tap the **Research** button while viewing any chapter.
- Notes are fetched from the free [bible.helloao.org](https://bible.helloao.org) API (no key, no rate limits).
- Each chapter is cached in IndexedDB after the first load → works offline thereafter.
- Scroll position is remembered per chapter and source.

## Books list

- Smart search at the top: type any part of a name or abbreviation (gen, matthew, 1 cor, psa, etc.) to filter instantly.

## Highlight system

- True solid background color fills on selected words / verse segments.
- Mandatory pure black or pure white text for maximum contrast.
- Multiple colors on the same verse as clean non-overlapping segments.
- 13 fixed colors with meanings (Color Index).

## Features

- Adjustable font size, line spacing, high-contrast mode
- Analyze + local learning
- Color Index + Review-by-color
- Personal notes (private + shared across linked verses)
- Cross-reference sidebar with back navigation
- Offline full-text search
- Last-place memory
- Import free public-domain KJV JSON books
- Optional Strong’s dictionary import
- Backup / restore
- Installable on iPhone and Chromebook

## Upload / Install

1. Place all 12 files at the root of a static host.
2. Open → enter password → hard-refresh until version bar shows **v5.5.0**.
3. iPhone: Safari → Share → Add to Home Screen.
4. Chromebook / desktop Chrome: Install app.
5. Import KJV text via Menu → Import Book (JSON). Sample Genesis is included.
6. Open a chapter → tap **Research**. Scroll, close with X, reopen → you return to the same place.

## File list

- index.html
- styles.css
- app.js
- storage.js
- bible.js
- analyze.js
- sw.js
- manifest.json
- icon-192.png
- icon-512.png
- sample-genesis.json
- README.md
