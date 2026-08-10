# NASB Study PWA – v5.1.0

**Password:** `NASB-Study-1995-Private`

Private, local-only Progressive Web App for personal NASB 1995 Bible study.
All data stays on your device. No accounts, no servers, no sync.

## Highlight system (v5.1)

- True solid background color fills on selected words / verse segments (never underlines).
- Every highlight automatically forces pure black (`#000000`) or pure white (`#ffffff`) text — whichever gives the highest contrast ratio (WCAG relative luminance). Calculation is mandatory and runs on every render.
- Multiple colors on the same verse are supported as clean non-overlapping segments; each keeps its own background + correctly contrasted text.
- 13 fixed colors with meanings (Color Index button).

## Features

- Fully adjustable font size, line spacing, high-contrast mode
- Analyze button: rule-based suggestions + local learning from accept/reject
- Color Index + Review-by-color
- Personal notes (private + shared across linked verses)
- Tappable cross-reference sidebar with back navigation
- Offline full-text search
- Last-place memory
- Import your own NASB 1995 JSON books
- Backup / restore of study data (highlights, notes, learning model)
- Installable on iPhone and Chromebook (Add to Home Screen)

## Upload / Install

1. Place all 12 files at the root of a static host (GitHub Pages, local server, etc.).
2. Open the site → enter password → hard-refresh until version bar shows **v5.1.0**.
3. On iPhone: Safari → Share → Add to Home Screen.
4. On Chromebook / desktop Chrome: install prompt or menu → Install app.
5. Import your NASB 1995 text via Menu → Import Book (JSON). Sample Genesis (public-domain KJV) is included for testing.

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
