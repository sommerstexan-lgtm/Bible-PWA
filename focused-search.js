/**
 * focused-search.js
 * Focused Search for KJV Study PWA
 * Implements the discussed design: term search + anchor verse that stays fixed,
 * focused results, fallback to show everything, comparison view.
 * Works with the existing books array and bible.getVerseText.
 */

export function createFocusedSearch(books, bible) {
  function getAllLoadedVerses() {
    const list = [];
    for (const book of books) {
      if (!book || !book.chapters) continue;
      const meta = bible.CANONICAL_BOOKS.find(b => b.id === book.id);
      const bookName = meta ? meta.name : book.id;
      for (const ch of book.chapters) {
        if (!ch || !ch.verses) continue;
        for (let i = 0; i < ch.verses.length; i++) {
          const text = ch.verses[i] || '';
          list.push({
            ref: `${bookName} ${ch.chapter}:${i + 1}`,
            bookId: book.id,
            bookName,
            chapter: ch.chapter,
            verse: i + 1,
            text,
            key: bible.makeKey(book.id, ch.chapter, i + 1)
          });
        }
      }
    }
    return list;
  }

  function tokenize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function resolveAnchor(anchorInput, allVerses) {
    if (!anchorInput) return null;
    const trimmed = anchorInput.trim();
    // Try as reference
    const byRef = allVerses.find(v => v.ref.toLowerCase() === trimmed.toLowerCase());
    if (byRef) return byRef;
    // Try as text substring
    const byText = allVerses.find(v => v.text.toLowerCase().includes(trimmed.toLowerCase()));
    return byText || null;
  }

  function search(term, anchorInput) {
    const allVerses = getAllLoadedVerses();
    const termLower = (term || '').toLowerCase().trim();
    if (!termLower) return { anchor: null, focused: [], all: [], term: '' };

    const tokens = tokenize(term);
    let matches = [];
    if (tokens.length === 1) {
      matches = allVerses.filter(v => tokenize(v.text).includes(tokens[0]));
    } else {
      matches = allVerses.filter(v => v.text.toLowerCase().includes(termLower));
    }

    const anchor = resolveAnchor(anchorInput, allVerses);

    // Simple scoring for focus (extensible)
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

    return { anchor, focused: focused.slice(0, 50), all: matches, term };
  }

  return { search, getAllLoadedVerses };
}
