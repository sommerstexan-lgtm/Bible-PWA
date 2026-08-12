# KJV Study PWA – v6.19.0

Strictly private, local-only Progressive Web App for personal Bible study (public-domain KJV). All personal data stays on the device (IndexedDB). No accounts, no servers, no analytics.

## New in v6.19 — Full TSK phrase-level cross-references

- **Menu → Import TSK Cross-references** installs the complete phrase-level Treasury of Scripture Knowledge dataset derived from CrossReferences.org (CC BY 4.0).
- Data file included in this package: `crossrefs-kjv-tsk.json.gz` (≈1.7 MB compressed, ~29 000 verses).
- After import, opening **Cross-refs** on any verse that has TSK data shows the original phrase anchors and their linked references.
- Personal cross-references you add yourself continue to work exactly as before and take priority.
- Double-tap a TSK reference to add it permanently to your personal list for that verse.
- Fully offline after the one-time import. No network calls.

## How to activate the cross-references

1. Unzip this package.
2. Open the app (serve the folder or open `index.html` via a local server / PWA install).
3. Menu → **Import TSK Cross-references**.
4. Choose `crossrefs-kjv-tsk.json.gz` (or the uncompressed `.json` if your browser cannot decompress).
5. Open any verse → tap **Cross-refs**. Phrase-level TSK groups appear automatically when you have no personal refs yet.

## Fixed / carried from v5.17–v6.18

- Native text-selection reliability after single-letter words (“a”, “I”, “O”).
- Tap-a-word Strong’s (user-controlled marks only).
- Hierarchical Search and Review-by-Color.
- All prior highlight, note, and navigation behaviour unchanged.

## Test checklist (v6.19)

1. Hard-refresh until version bar shows **v6.19.0**.
2. Menu → Import TSK Cross-references → select `crossrefs-kjv-tsk.json.gz`.
3. Open John 3:16 → Cross-refs → you should see phrase anchors such as “God”, “gave”, “that whosoever” with their TSK links.
4. Tap any TSK reference to jump; double-tap to keep it in your personal list.
5. Personal add / delete still works.
6. Strong’s, highlights, notes, Search, Review continue to work as before.

## License note for the TSK data

Cross-reference data: CC BY 4.0 — CrossReferences.org / Treasury of Scripture Knowledge lineage.  
Credit the project when redistributing the data file.
