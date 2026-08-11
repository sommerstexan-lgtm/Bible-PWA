# KJV Study PWA – v5.14.0

**Password:** `KJV-Study-Private`

## Fixed in v5.14 — Review by Color hierarchical + Back

- After selecting a color, results are hierarchical: first a short list of books that contain that color, shown in strict canonical order with verse counts.
- Tap a book → only that book’s matching verses appear (chapter/verse order) with a large “← Back to books” control so you can continue reviewing other books without losing the color selection.
- Selecting a verse pushes the current location onto `navStack` (same pattern as Search / Cross-refs) so the main chrome ← Back returns you to where you were reading.
- Sticky header (color selector + Close) stays visible while the results area scrolls; large touch targets preserved for senior-friendly use.
- The old flat “Book filter” dropdown was removed; the hierarchical book list replaces it.

## Fixed in v5.13 — Search screen usability

- Close (X) + title + search input stay sticky at the top of the Search panel; only the results area scrolls.
- Search results are hierarchical: first a short list of matching books in strict canonical order (with match counts); tap a book to see only that book’s matching verses (chapter/verse order).
- Clear “Back to books” control returns to the book list without losing the original query.
- Large touch targets preserved for senior-friendly use.

Previous (v5.12): Search result jumps push onto the same `navStack` as Cross-references so ← Back can unwind the chain.

## Test (Review hierarchical)

1. Hard-refresh until version bar shows **v5.14.0**
2. Mark a few verses with the same color in at least two different books
3. Open Review → choose that color
4. Confirm a short book list appears first, in biblical order, with verse counts
5. Tap a book → only that book’s verses appear; “← Back to books” is visible and large
6. Press Back to books, then open another book or change color
7. Jump to a verse; main chrome ← Back returns to the chapter you were on before opening Review

Highlight, note, Research, Search, and ordinary chapter navigation behavior is unchanged.
