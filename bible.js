/* bible.js – Book loading, navigation helpers, search. v1.0.0 */

import { getAllBooks, getBook, putBook } from './storage.js';


/** Canonical order — all 66 books (WEB/KJV-style ids) */
export const CANONICAL_BOOKS = [
  // Old Testament
  { id: 'gen', name: 'Genesis', testament: 'OT' },
  { id: 'exo', name: 'Exodus', testament: 'OT' },
  { id: 'lev', name: 'Leviticus', testament: 'OT' },
  { id: 'num', name: 'Numbers', testament: 'OT' },
  { id: 'deu', name: 'Deuteronomy', testament: 'OT' },
  { id: 'jos', name: 'Joshua', testament: 'OT' },
  { id: 'jdg', name: 'Judges', testament: 'OT' },
  { id: 'rut', name: 'Ruth', testament: 'OT' },
  { id: '1sa', name: '1 Samuel', testament: 'OT' },
  { id: '2sa', name: '2 Samuel', testament: 'OT' },
  { id: '1ki', name: '1 Kings', testament: 'OT' },
  { id: '2ki', name: '2 Kings', testament: 'OT' },
  { id: '1ch', name: '1 Chronicles', testament: 'OT' },
  { id: '2ch', name: '2 Chronicles', testament: 'OT' },
  { id: 'ezr', name: 'Ezra', testament: 'OT' },
  { id: 'neh', name: 'Nehemiah', testament: 'OT' },
  { id: 'est', name: 'Esther', testament: 'OT' },
  { id: 'job', name: 'Job', testament: 'OT' },
  { id: 'psa', name: 'Psalms', testament: 'OT' },
  { id: 'pro', name: 'Proverbs', testament: 'OT' },
  { id: 'ecc', name: 'Ecclesiastes', testament: 'OT' },
  { id: 'sng', name: 'Song of Solomon', testament: 'OT' },
  { id: 'isa', name: 'Isaiah', testament: 'OT' },
  { id: 'jer', name: 'Jeremiah', testament: 'OT' },
  { id: 'lam', name: 'Lamentations', testament: 'OT' },
  { id: 'eze', name: 'Ezekiel', testament: 'OT' },
  { id: 'dan', name: 'Daniel', testament: 'OT' },
  { id: 'hos', name: 'Hosea', testament: 'OT' },
  { id: 'joe', name: 'Joel', testament: 'OT' },
  { id: 'amo', name: 'Amos', testament: 'OT' },
  { id: 'oba', name: 'Obadiah', testament: 'OT' },
  { id: 'jon', name: 'Jonah', testament: 'OT' },
  { id: 'mic', name: 'Micah', testament: 'OT' },
  { id: 'nah', name: 'Nahum', testament: 'OT' },
  { id: 'hab', name: 'Habakkuk', testament: 'OT' },
  { id: 'zep', name: 'Zephaniah', testament: 'OT' },
  { id: 'hag', name: 'Haggai', testament: 'OT' },
  { id: 'zec', name: 'Zechariah', testament: 'OT' },
  { id: 'mal', name: 'Malachi', testament: 'OT' },
  // New Testament
  { id: 'mat', name: 'Matthew', testament: 'NT' },
  { id: 'mrk', name: 'Mark', testament: 'NT' },
  { id: 'luk', name: 'Luke', testament: 'NT' },
  { id: 'jhn', name: 'John', testament: 'NT' },
  { id: 'act', name: 'Acts', testament: 'NT' },
  { id: 'rom', name: 'Romans', testament: 'NT' },
  { id: '1co', name: '1 Corinthians', testament: 'NT' },
  { id: '2co', name: '2 Corinthians', testament: 'NT' },
  { id: 'gal', name: 'Galatians', testament: 'NT' },
  { id: 'eph', name: 'Ephesians', testament: 'NT' },
  { id: 'php', name: 'Philippians', testament: 'NT' },
  { id: 'col', name: 'Colossians', testament: 'NT' },
  { id: '1th', name: '1 Thessalonians', testament: 'NT' },
  { id: '2th', name: '2 Thessalonians', testament: 'NT' },
  { id: '1ti', name: '1 Timothy', testament: 'NT' },
  { id: '2ti', name: '2 Timothy', testament: 'NT' },
  { id: 'tit', name: 'Titus', testament: 'NT' },
  { id: 'phm', name: 'Philemon', testament: 'NT' },
  { id: 'heb', name: 'Hebrews', testament: 'NT' },
  { id: 'jas', name: 'James', testament: 'NT' },
  { id: '1pe', name: '1 Peter', testament: 'NT' },
  { id: '2pe', name: '2 Peter', testament: 'NT' },
  { id: '1jn', name: '1 John', testament: 'NT' },
  { id: '2jn', name: '2 John', testament: 'NT' },
  { id: '3jn', name: '3 John', testament: 'NT' },
  { id: 'jud', name: 'Jude', testament: 'NT' },
  { id: 'rev', name: 'Revelation', testament: 'NT' }
];


export function verseKey(bookId, chapter, verse) {
  return `${bookId}.${chapter}.${verse}`;
}

export function parseKey(key) {
  const [bookId, ch, v] = key.split('.');
  return { bookId, chapter: +ch, verse: +v };
}

export async function loadSampleIfEmpty() {
  const books = await getAllBooks();
  if (books.length > 0) return books;

  try {
    const resp = await fetch('./sample-genesis.json');
    const data = await resp.json();
    for (const book of data.books) {
      await putBook(book);
    }
    return data.books;
  } catch (e) {
    console.warn('Could not load sample', e);
    return [];
  }
}

export async function importBookJSON(json) {
  // Accept either { books: [...] } or a single book object
  const books = json.books ? json.books : [json];
  for (const book of books) {
    if (!book.id || !book.name || !Array.isArray(book.chapters)) {
      throw new Error('Invalid book format: need id, name, chapters[]');
    }
    // normalize
    book.testament = book.testament || (['gen','exo','lev','num','deu','jos','jdg','rut','1sa','2sa','1ki','2ki','1ch','2ch','ezr','neh','est','job','psa','pro','ecc','sng','isa','jer','lam','eze','dan','hos','joe','amo','oba','jon','mic','nah','hab','zep','hag','zec','mal'].includes(book.id) ? 'OT' : 'NT');
    await putBook(book);
  }
  return books;
}

export async function searchBooks(query, books) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();
  const results = [];

  for (const book of books) {
    for (const ch of book.chapters) {
      for (const v of ch.verses) {
        if (v.text.toLowerCase().includes(q)) {
          results.push({
            key: verseKey(book.id, ch.number, v.number),
            bookId: book.id,
            bookName: book.name,
            chapter: ch.number,
            verse: v.number,
            text: v.text,
            snippet: highlightSnippet(v.text, q)
          });
          if (results.length >= 80) return results; // safety
        }
      }
    }
  }
  return results;
}

function highlightSnippet(text, q) {
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return text.slice(0, 120) + (text.length > 120 ? '…' : '');
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + q.length + 60);
  let snip = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  return snip;
}

export function getVerseText(books, bookId, chapter, verse) {
  const book = books.find(b => b.id === bookId);
  if (!book) return null;
  const ch = book.chapters.find(c => c.number === chapter);
  if (!ch) return null;
  const v = ch.verses.find(vv => vv.number === verse);
  return v ? v.text : null;
}
