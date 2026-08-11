# KJV Study PWA – v5.13.0

**Password:** `KJV-Study-Private`

## Fixed in v5.13 — Search screen usability

- Close (X) + title + search input stay sticky at the top of the Search panel; only the results area scrolls.
- Search results are hierarchical: first a short list of matching books in strict canonical order (with match counts); tap a book to see only that book’s matching verses (chapter/verse order).
- Clear “Back to books” control returns to the book list without losing the original query.
- Large touch targets preserved for senior-friendly use.

Previous (v5.12): Search result jumps push onto the same `navStack` as Cross-references so ← Back can unwind the chain.

## Test (Search hierarchical + sticky header)

1. Hard-refresh until version bar shows **v5.13.0**
2. Open Search → type a common word (e.g. “love” or “God”)
3. Confirm a short book list appears first, in biblical order, with counts
4. Tap a book → only that book’s verses appear; “← Back to books” is visible and large
5. Scroll the verse list; X / title / search box remain visible at the top
6. Press Back to books, then change the query or close with X
7. Jumping to a verse still pushes navStack; main ← Back still works as before

Highlight, note, Research, and ordinary chapter navigation behavior is unchanged.
