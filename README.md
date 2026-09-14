# KJV Study PWA – v6.28.0

Private, local-only Bible study (public-domain KJV). All data stays on your device.

## New in 6.28.0
**Subject search — Step A only**
- The existing Search box also accepts everyday phrasing that is not KJV wording (funeral, wedding, bullying, Islam, and the other listed test queries).
- Matching phrases suggest short subject headings. Tap a heading for a short list of KJV verse references. Tap a reference to open that verse in the reader. Chrome ← Back is unchanged.
- Word search is unchanged: this word in loaded books, grouped by book.
- Local alias map only (`subject-aliases.js`). No network. No account. No topical pack.
- Islam / Islamics suggest genealogy headings only (Ishmael, Ishmaelites, Arabians). One-line note: Scripture does not name Islam.
- Step B (optional Nave / Torrey topical pack, same load contract as TSK) is a future version after this Step A is accepted. Do not place a topical pack for this version.

## New in 6.27.0
**Tap-a-word Step 1**
- KJV 1611 English sense first when modern English is the trap (e.g. *meat* = food offering / grain). No guessed glosses.
- Same tap then lists this word in this book, then this word in the loaded KJV.
- Strong’s stays second if the dictionary pack is imported.

**Verse number suggestions**
- Tap a verse number for faint word-level color suggestions plus a one-line reason.
- Speech frames may be blue; payload words are not washed.
- Nothing is saved until Keep or Clear.

## Cross-references – clear status

### Green button under a verse
The **Cross-refs** button turns **green** when that verse has additional reading available.

### Load cross-references for a book (one clear action)
At the top of every chapter:

1. You see a status line and a button **Load Cross-References for [Book]**.
2. Tap the button once.
3. Wait until you see:

   **✓ Cross-references loaded for [Book]**

   The button itself also changes to green and says **✓ Loaded for [Book]**.

4. That status stays. You do not need to load the same book again.

If something goes wrong you will see a red **Not completed** message and a **Try again** button. Nothing is left uncertain.

### Built-in starter
Some passages (Genesis 1–3, John 3, Romans 5 & 8, and others) already show green Cross-refs buttons with no loading step.

### Optional TSK pack
Place `crossrefs-kjv-tsk.json` in the repo root (same folder as `index.html`) and use **Menu → Load More Cross-References**. That file is optional. The app still runs if it is missing.
