# KJV Study PWA – v5.15.0

**Password:** `KJV-Study-Private`

## New in v5.15 — Tap-a-word Strong's (mid-level)

- When a Strong's lexicon pack is installed, every alphabetic word in the verse text receives a thin outline / frame so it feels tappable.
- **No highlight:** soft fixed muted blue-gray outline.
- **Has highlight:** outline becomes a brighter / slightly more saturated version of that word's dominant highlight color (soft glow that never disappears on top of the solid fill).
- Tap a word (selection must be collapsed) → compact bottom-sheet shows:
  - Strong's number + lemma
  - Transliteration and pronunciation (when present)
  - Short gloss
  - 3–6 other loaded verses that contain the same English word (practical offline approximation of same-Strong occurrences)
- If no lexicon is installed the feature is inactive; a gentle prompt points to Menu → Import Dictionary (Strong's).
- Existing partial-highlight selection, solid-fill + contrast text, notes, cross-refs, Review, Search, and chapter navigation are unchanged.

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

## Test checklist (v5.15 Tap-a-word Strong's)

1. Hard-refresh until version bar shows **v5.15.0**.
2. With no lexicon installed: verse words have no outlines; tapping a word does nothing (or gently offers Import Dictionary).
3. Menu → Import Dictionary (Strong's) → install a valid strongs-lexicon.json.
4. Open a chapter: every word now has a thin soft outline.
5. Apply a solid highlight to part of a verse; the outlined words inside the highlight show a brighter frame in that highlight’s color; the outline never disappears.
6. Tap an outlined word (do not select text) → Strong's panel opens with number, gloss, transliteration/pron, and a short list of other verses.
7. Tap an occurrence row → jumps to that verse; main chrome ← Back returns to the previous place.
8. Select a few words (long-press + drag) then open Color: partial-highlight still works; selection logic is unchanged.
9. Review, Search, notes, cross-refs, chapter navigation and Analyze continue to work as before.

Highlight, note, Research, Search, and ordinary chapter navigation behavior is unchanged.
