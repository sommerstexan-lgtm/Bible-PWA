# KJV Study PWA – v5.11.0

**Password:** `KJV-Study-Private`

## Fixed in v5.11 — Research scroll memory

Root cause: every time Research opened, the empty panel saved scroll position `0` and overwrote your real place before the commentary loaded.

Fix:
- Do not save scroll while the commentary body is empty
- Save only after content is on screen (while scrolling, on close, when switching Clarke/Tyndale)
- Restore retries until content height is ready (iOS)

## Test

1. Hard-refresh until version bar shows **v5.11.0**
2. Open a chapter → Research → scroll halfway down
3. Close with ×
4. Open Research again on the same chapter
5. You should return to the same place in the commentary

Highlight fixes from v5.9 remain included.
