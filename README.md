# KJV Study PWA – v5.4.0

**Password:** `KJV-Study-Private`

Private, local-only Progressive Web App for personal free public-domain KJV Bible study.
All data stays on your device. No accounts, no servers required after initial commentary cache.

## What’s new in v5.4

- **Research scroll memory** – When you leave the Research panel and come back (same chapter + source), it restores your previous place in the notes instead of jumping to the top.
- **Smart book search** – In the Books list, type any part of a book name or common abbreviation (gen, matthew, 1 cor, psa, etc.) to instantly filter the list.

## Research / Commentary

- **Adam Clarke’s Commentary** (public domain) and **Tyndale Open Study Notes** (CC BY-SA).
- Tap the **Research** button while viewing any chapter.
- Notes are fetched from the free [bible.helloao.org](https://bible.helloao.org) API (no key, no rate limits).
- Each chapter is cached in IndexedDB after the first load → works offline thereafter.
- Your scroll position inside the notes is remembered per chapter and source.

## Highlight system

- True solid background color fills on selected words / verse segments (never underlines).
- Every highlight automatically forces pure black (`#000000`) or pure white (`#ffffff`) text for maximum contrast.
- Multiple colors on the same verse are supported as clean non-overlapping segments.
- 13 fixed colors with meanings (Color Index button).

## Features

- Fully adjustable font size, line spacing, high-contrast mode
- Analyze button: rule-based suggestions + local learning from accept/reject
- Color Index + Review-by-color
- Personal notes (private + shared across linked verses)
- Tappable cross-reference sidebar with back navigation
- Offline full-text search
- Last-place memory
- Import free public-domain KJV (or compatible) JSON books
- Strong’s dictionary import (optional)
- Backup / restore of study data
- Installable on iPhone and Chromebook (Add to Home Screen)

## Upload / Install

1. Place all 12 files at the root of a static host (GitHub Pages, local server, etc.).
2. Open the site → enter password → hard-refresh until version bar shows **v5.4.0**.
3. On iPhone: Safari → Share → Add to Home Screen.
4. On Chromebook / desktop Chrome: install prompt or menu → Install app.
5. Import full free KJV text via Menu → Import Book (JSON). Sample Genesis is included.
6. Open any chapter → tap **Research** to load commentary (network needed only the first time for that chapter).

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
