/**
 * focused-search.js
 * Focused Search for KJV Study PWA
 *
 * Correctly matches the real book structure used by the rest of the app:
 *   book.chapters[] → { number, verses: [{ number, text }, ...] }
 * Uses bible.verseKey for keys that jumpToRef understands.
 */

export function createFocusedSearch(books, bible) {
  function getAllLoadedVerses() {
    const list = [];
    const bookList = Array.isArray(books) ? books : [];
    for (const book of bookList) {
      if (!book || !Array.isArray(book.chapters)) continue;
      const bookName = book.name || book.id;
      for (const ch of book.chapters) {
        if (!ch || !Array.isArray(ch.verses)) continue;
        const chapterNum = Number(ch.number);
        if (!Number.isFinite(chapterNum)) continue;
        for (const v of ch.verses) {
          if (!v || typeof v.text !== 'string') continue;
          const verseNum = Number(v.number);
          if (!Number.isFinite(verseNum)) continue;
          list.push({
            ref: `${bookName} ${chapterNum}:${verseNum}`,
            bookId: book.id,
            bookName,
            chapter: chapterNum,
            verse: verseNum,
            text: v.text,
            key: bible.verseKey(book.id, chapterNum, verseNum)
          });
        }
      }
    }
    return list;
  }

  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function resolveAnchor(anchorInput, allVerses) {
    if (!anchorInput) return null;
    const trimmed = String(anchorInput).trim();
    if (!trimmed) return null;

    // Exact reference match (case-insensitive, normalized spaces)
    const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();
    const byRef = allVerses.find(v => v.ref.toLowerCase() === normalized);
    if (byRef) return byRef;

    // Text substring match
    const lower = trimmed.toLowerCase();
    return allVerses.find(v => v.text.toLowerCase().includes(lower)) || null;
  }

  function search(term, anchorInput) {
    const allVerses = getAllLoadedVerses();
    const termLower = String(term || '').toLowerCase().trim();
    if (!termLower) {
      return { anchor: null, focused: [], all: [], term: '', totalLoaded: allVerses.length };
    }

    const tokens = tokenize(term);
    let matches = [];
    if (tokens.length === 1) {
      matches = allVerses.filter(v => tokenize(v.text).includes(tokens[0]));
    } else {
      matches = allVerses.filter(v => v.text.toLowerCase().includes(termLower));
    }

    const anchor = resolveAnchor(anchorInput, allVerses);

    let focused = matches;
    if (anchor) {
      focused = matches
        .map(v => {
          let score = 0;
          if (v.bookId === anchor.bookId) score += 10;
          if (Math.abs(v.chapter - anchor.chapter) <= 1) score += 5;
          if (/son of/i.test(v.text) && /son of/i.test(anchor.text)) score += 3;
          if (/porter|gate|door/i.test(v.text) && /porter|gate|door/i.test(anchor.text)) score += 4;
          return { v, score };
        })
        .sort((a, b) => b.score - a.score)
        .map(x => x.v);
    }

    return {
      anchor,
      focused: focused.slice(0, 80),
      all: matches,
      term,
      totalLoaded: allVerses.length
    };
  }

  return { search, getAllLoadedVerses };
}
