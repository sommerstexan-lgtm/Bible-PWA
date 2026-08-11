# KJV Study PWA – v5.12.0

**Password:** `KJV-Study-Private`

## Fixed in v5.12 — Search / Cross-ref back navigation

Search result jumps now push the current location onto the same `navStack` used by Cross-references. A chain of Search → verse → Cross-ref → verse … can be unwound with the main ← Back button all the way to the original starting chapter/verse (scroll restored when captured).

## Test (Search + Cross-ref chain)

1. Hard-refresh until version bar shows **v5.12.0**
2. Open any chapter and note the verse near the top of the screen
3. Tap Search → type a word → tap any result → land on the new verse; ← Back should be visible and labeled with the origin
4. From there open Cross-refs on a verse and jump to another reference
5. Press ← Back repeatedly; each press steps back one jump until you return to the original chapter/verse and the Back button hides

Highlight, note, Research, and ordinary chapter navigation behavior is unchanged.
