# KJV Study PWA – v5.17.0

Strictly private, local-only Progressive Web App for personal Bible study (public-domain KJV). All personal data stays on the device (IndexedDB). No accounts, no servers, no analytics.

## Fixed in v5.17 — Native selection after single-letter words

- When a Strong’s lexicon is loaded, every alphabetic word is wrapped in a `.tap-word` span. Previous CSS used small negative margins so adjacent spans’ layout boxes overlapped.
- On mobile WebKit those overlapping boxes made native text selection unreliable when the word immediately before the intended selection was a single letter (“a”, “I”, “O”): the browser often selected the letter plus only part of the next word, after which the selection handles became unresponsive.
- Fix: remove the negative margins so the layout boxes no longer overlap (padding left unchanged). Strong’s tap-to-lookup, marks, highlights, and the existing selection-capture pipeline are unchanged. Visual difference is minimal.

## New in v5.16 — Tap-a-word Strong's (user-controlled marks)

- The page starts **completely clean**. No automatic outlines on any words.
- **Single quick tap** on any word (when the Strong's lexicon is installed) opens a compact Strong's panel:
  - Strong's number, short gloss, transliteration / pronunciation
  - 3–6 other loaded verses that contain the same English word
  - Large **Mark this word** / **Remove mark** button
- Only words the user has explicitly marked receive a thin outline:
  - Marked, no highlight → soft fixed muted accent outline
  - Marked + solid highlight → brighter / slightly more saturated version of that highlight color (outline never disappears on top of the fill)
- Marks are stored **per occurrence** (this instance of the word in this verse), not globally for every occurrence of the English word.
- **Long-press + drag** continues to work exclusively for text selection and the Color / partial-highlight system. Marks are never placed by long-press.
- If no lexicon pack is installed, words are not wrapped for tap (tapping does nothing); Menu → Import Dictionary (Strong's) installs the pack offline.
- Existing highlights, notes, cross-refs, Review, Search, Research, and chapter navigation are unchanged.

## Previous — v5.15 Tap-a-word Strong's (mid-level)

- First introduction of offline Strong's lookup via installed lexicon pack and word wrappers.
- v5.16 changes the visual rule from “outline every lookup-capable word” to “outline only user-marked words.”

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

## Test checklist (v5.17)

1. Hard-refresh until version bar shows **v5.17.0**.
2. With no lexicon installed: verse words have **no** outlines; tapping a word does nothing.
3. Menu → Import Dictionary (Strong's) → install a valid strongs-lexicon.json.
4. Open a chapter: page is still **clean** — no outlines on any words.
5. Tap a word (do not select text) → Strong's panel opens with number, gloss, transliteration/pron, other verses, and a large **Mark this word** button.
6. Tap **Mark this word** → panel closes; that occurrence now has a thin soft outline; other occurrences of the same English word stay unmarked.
7. Apply a solid highlight that covers a marked word; the outline switches to a brighter frame in that highlight’s color and remains visible on top of the fill.
8. Tap the marked word again → panel shows **Remove mark** → tap it → outline disappears; page stays clean.
9. Select a few words (long-press + drag) then open Color: partial-highlight still works; selection logic is unchanged; long-press does not place marks.
10. **Selection reliability (v5.17):** long-press + drag starting on (or immediately after) a single-letter word such as “a”, “I”, or “O” should select the intended range cleanly; selection handles remain usable so the range can be adjusted.
11. Review, Search, notes, cross-refs, chapter navigation and Analyze continue to work as before.
12. Export / Import study data includes word marks (backup format version 3).

Highlight, note, Research, Search, and ordinary chapter navigation behavior is unchanged.
