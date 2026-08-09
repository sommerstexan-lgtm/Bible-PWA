# NASB Study PWA – v1.0.0

Strictly private, local-only Progressive Web App for personal Bible study (NASB 1995 text supplied by you).

**No accounts. No servers. No cloud. No analytics.**  
All data (Bible text you import, multi-color highlights, notes, cross-references, Analyze learning) stays in your browser’s IndexedDB on this device only.

---

## Quick start (local)

Because this is a module-based PWA, open it over HTTP (not `file://`).

### Option A – Python (simplest)
```bash
cd nasb-study-pwa
python3 -m http.server 8080
```
Then open http://localhost:8080 in Chrome, Edge, or Safari.

### Option B – Node
```bash
npx serve .
```

### Install as app
- **Chromebook / Chrome / Edge**: menu → “Install app” / “Add to Home screen”.
- **iPhone / iPad (Safari)**: Share → “Add to Home Screen”.

Once installed it runs offline.

---

## First launch

A **public-domain KJV Genesis 1** sample loads automatically so you can test every feature immediately.  
This is **not** NASB text. Replace it with your own legally obtained NASB 1995 when ready.

---

## Importing your NASB 1995 text

1. Menu → **Import Book (JSON)**  
2. Supply a JSON file matching this shape (one book or many):

```json
{
  "id": "gen",
  "name": "Genesis",
  "abbrev": "Gen",
  "testament": "OT",
  "chapters": [
    {
      "number": 1,
      "verses": [
        { "number": 1, "text": "In the beginning God created the heavens and the earth." }
      ]
    }
  ]
}
```

Or wrap multiple books:
```json
{ "books": [ { … }, { … } ] }
```

You can import one book at a time (recommended) or the whole Bible.  
Highlights, notes, cross-refs and learning data already saved for a verse key continue to work after you replace the sample text.

**Important:** You must supply your own NASB 1995 text. This app never contains copyrighted NASB material.

---

## Must-have features implemented

| Feature | Status |
|---------|--------|
| Large adjustable font + line spacing | ✓ |
| High-contrast mode | ✓ |
| 13 exact color categories, multi-color per verse | ✓ |
| Auto black/white text contrast via background tints + chips | ✓ |
| Analyze button + rule-based suggestions | ✓ |
| Learns from Accept / Reject (local only) | ✓ |
| Color Index + “Show all of this color” | ✓ |
| Review-by-color (filter by book) | ✓ |
| Personal notes per verse | ✓ |
| Cross-reference sidebar (large targets, back stack) | ✓ |
| Offline full-text search (loaded books) | ✓ |
| Book / chapter navigation + last-place memory | ✓ |
| Installable PWA (iPhone + Chromebook) | ✓ |
| 100 % client-side, no backend | ✓ |

---

## Color legend (exactly as specified)

- **Red** – Jesus said  
- **Yellow** – Holy Spirit  
- **Yellow/Green** – Figures of speech and parables  
- **Orange** – Observations (but not figures of speech)  
- **Magenta** – Repetition  
- **Blue** – Words of God  
- **Tan** – Tribulation  
- **Brown** – Words requiring look up  
- **Light Blue** – Prophecy  
- **Aqua Green** – Rapture  
- **Pink** – Antichrist  
- **Grey** – Satan  
- **Violet** – Questions of importance  

---

## Versioning

Current version: **1.0.0**  
Any future code change will receive a new sequential version number.

---

## Privacy statement

- No network requests after the app shell is loaded (except the very first sample JSON fetch, which is local).  
- Service worker caches only the app shell.  
- Bible text, highlights, notes, cross-refs and the Analyze learning model live exclusively in IndexedDB.  
- Clearing site data in the browser permanently removes everything.

---

## Known limitations (v1.0.0)

- Highlights are **verse-level** multi-color (chips + left border + background tint). Character-level segment painting is possible in a later version if needed.  
- Cross-reference jump only works for books you have already imported.  
- The starter cross-ref set is tiny and public-domain; add your own freely.  
- Analyze rules are keyword / pattern based and improve with your Accept/Reject feedback; they are not a full linguistic parser.

---

Enjoy calm, private, senior-friendly study.
