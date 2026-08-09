/* bible.js – Book loading, navigation helpers, search. v1.0.0 */

import { getAllBooks, getBook, putBook } from './storage.js';

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
