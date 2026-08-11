# KJV Study PWA – v5.9.0

**Password:** `KJV-Study-Private`

## Fixed in v5.9

- **Highlight offsets rewritten** – Selection is clamped to the verse text and measured from the DOM. First word, first two words, full verse, and selections that include the verse number all map to the correct character range. This replaces the fragile string-search approach that was expanding partial selections (especially anything including the first word) into whole-verse highlights, and could leave only a single space colored.

## How to test

1. Hard-refresh until version bar shows **v5.9.0**
2. Select only the first word → Color → Apply → only that word colored
3. Select first two words → only those two colored
4. Select the entire verse text → entire verse colored
5. Select a middle word → only that word colored

If the Color panel says “No text selected”, the selection was lost before open (tell me). If it shows the correct Selected text but wrong span is colored, tell me that.
