# KJV Study PWA – v6.35.0

Private, local-only Bible study (public-domain KJV). All data stays on your device.

## New in 6.35.0
**Chains list and in-order reading rewritten**
- **Menu → Chains** is the list of every saved chain. Tap a title to read it.
- The reader keeps the ordered hops in one panel with Previous / Next. Tap a hop to open that verse. A teal bar (**← title · 2/6**) opens the same list again. The list is not discarded.
- Start a new chain from the verse: **Chains → Start a chain with this verse**. Add a later verse with **Add this verse to an existing chain**.

## New in 6.34.0
**Start a chain from the verse**
- Verse row **Chains → Start a chain with this verse**. That verse is hop 1.

## New in 6.33.0
**Saved chains + verse Chains button + copy for message**
- Header **Trail** is still today’s workbench (session only).
- **Save as chain** stores a named snapshot: title, your explanation, ordered verse refs. Later trail edits do not change that copy until you save again.
- **Saved chains** lists every named package on this device. Tap a title to read the explanation and follow the refs. **Use as current trail** is a separate action.
- Each verse row has **Chains**. Green + count when that verse is in one or more saved chains. Tap lists only those titles. A verse may belong to many chains.
- **Copy for message** puts title + your explanation + numbered refs on the clipboard so you can paste into Gmail on a Chromebook (or Messages on a phone). The app does not send mail.
- Saved chains are included in the existing backup / restore file. Nothing is uploaded.

## New in 6.32.0
**Restore Search + editable study trail**
- Closing Search no longer throws away the last query. Open Search again and the same wording, headings, and book/verse list come back.
- Header **Trail** shows the ordered chain of verses you opened from Search or Cross-refs, plus any verse you pin from the reader.
- Each trail node can be opened, replaced, or removed. **Undo last edit** restores the previous chain. **Clear trail** does not change the original Search results.
- The trail lives in this browser session only (not IndexedDB, not export). Chrome ← Back is unchanged.

## New in 6.31.0
**Subject search — Step B (optional topical pack)**
- Menu → **Load Topical Pack**. One action. Green when loaded; stays loaded. Red **Not completed** + **Try again** on failure.
- Place `topics-torrey.json` in the repo root next to `index.html` (same pattern as the TSK pack). The app still runs if that file is missing.
- Source: public-domain Torrey’s New Topical Textbook, verse references only (trimmed).
- Search order: exact topic name from the pack, then Step A aliases, then raw KJV word hits.
- Still local-only. No commentary.

## New in 6.30.0
**One tap for missing books**
- Books → **Import missing Old Testament** or **Import missing New Testament** reads bundled `kjv-ot.json` / `kjv-nt.json` from the same folder as `index.html`.
- Only books not already stored are written. A short sample Genesis is replaced by full KJV Genesis.
- Green status when finished. Red **Not completed** and **Try again** if a pack file is missing.
- Place both pack files in the repo root with the rest of the app. No third-party download at tap time.
- Per-book **Import** still accepts your own JSON file.

## New in 6.29.0
**Import Old Testament / Import New Testament**
- In Books (and Menu), tap one action and choose a single JSON that contains many books (`{ "books": [ … ] }`).
- Only that testament is stored. Status is green when the load finishes, or red **Not completed** plus the reason if the file is wrong.
- Per-book Import buttons remain for one file at a time.
- Still local only. The app does not download Bible text from the network.

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
