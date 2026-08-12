/* storage.js – IndexedDB wrapper for all private data. v6.20.0
   Everything stays on-device. No network calls.
*/

const DB_NAME = 'nasb-study-db';
const DB_VERSION = 6;

let db = null;

export function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('books')) {
        database.createObjectStore('books', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('highlights')) {
        database.createObjectStore('highlights', { keyPath: 'key' }); // key = "gen.1.3"
      }
      if (!database.objectStoreNames.contains('notes')) {
        database.createObjectStore('notes', { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains('crossrefs')) {
        database.createObjectStore('crossrefs', { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains('learning')) {
        database.createObjectStore('learning', { keyPath: 'id' }); // single record "model"
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('history')) {
        database.createObjectStore('history', { keyPath: 'id' }); // last position
      }
      if (!database.objectStoreNames.contains('sharedNotes')) {
        database.createObjectStore('sharedNotes', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('lexicon')) {
        database.createObjectStore('lexicon', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('commentaryCache')) {
        database.createObjectStore('commentaryCache', { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains('wordMarks')) {
        // Per-occurrence Tap-a-word marks: key = verseKey, marks = [startOffset, ...]
        database.createObjectStore('wordMarks', { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains('tsk')) {
        // Full TSK phrase-level pack from CrossReferences.org (CC BY 4.0)
        database.createObjectStore('tsk', { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function putBook(book) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('books', 'readwrite').put(book);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function getAllBooks() {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('books').getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}

export async function getBook(id) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('books').get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function deleteBook(id) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('books', 'readwrite').delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

/* Highlights v3: { key, ranges: [ {color, start, end} ] }
   Backward compatible with old { key, colors: ["red"] } whole-verse format.
*/
export async function getHighlights(key) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('highlights').get(key);
    r.onsuccess = () => {
      const row = r.result;
      if (!row) return res([]);
      // Migrate old format on the fly
      if (row.colors && !row.ranges) {
        // Old whole-verse colors → convert later when we know text length
        return res({ _legacyColors: row.colors });
      }
      return res(row.ranges || []);
    };
    r.onerror = () => rej(r.error);
  });
}

export async function setHighlights(key, ranges) {
  await openDB();
  return new Promise((res, rej) => {
    // ranges = array of {color, start, end}
    const r = tx('highlights', 'readwrite').put({ key, ranges });
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function getAllHighlights() {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('highlights').getAll();
    r.onsuccess = () => {
      const rows = r.result || [];
      // Normalize for callers that expect .colors or .ranges
      res(rows.map(row => {
        if (row.colors && !row.ranges) {
          return { key: row.key, ranges: row.colors.map(c => ({ color: c, start: 0, end: 99999 })), _legacy: true };
        }
        return row;
      }));
    };
    r.onerror = () => rej(r.error);
  });
}

/* Notes */
export async function getNote(key) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('notes').get(key);
    r.onsuccess = () => res(r.result ? r.result.text : '');
    r.onerror = () => rej(r.error);
  });
}

export async function setNote(key, text) {
  await openDB();
  return new Promise((res, rej) => {
    if (!text || !text.trim()) {
      const r = tx('notes', 'readwrite').delete(key);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    } else {
      const r = tx('notes', 'readwrite').put({ key, text });
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    }
  });
}

/* Cross-refs: { key, refs: [{ target: "mat.5.3", label?: "" }] } */
export async function getCrossRefs(key) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('crossrefs').get(key);
    r.onsuccess = () => res(r.result ? r.result.refs : []);
    r.onerror = () => rej(r.error);
  });
}

export async function setCrossRefs(key, refs) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('crossrefs', 'readwrite').put({ key, refs });
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

/* Learning model – simple keyword boosts from user feedback */
export async function getLearningModel() {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('learning').get('model');
    r.onsuccess = () => res(r.result ? r.result.data : { boosts: {}, demotes: {} });
    r.onerror = () => rej(r.error);
  });
}

export async function saveLearningModel(data) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('learning', 'readwrite').put({ id: 'model', data });
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

/* Settings */
export async function getSettings() {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('settings').get('prefs');
    r.onsuccess = () => res(r.result ? r.result : {
      id: 'prefs',
      fontSize: 1.35,
      lineHeight: 1.75,
      highContrast: false
    });
    r.onerror = () => rej(r.error);
  });
}

export async function saveSettings(prefs) {
  await openDB();
  prefs.id = 'prefs';
  return new Promise((res, rej) => {
    const r = tx('settings', 'readwrite').put(prefs);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

/* Last position */
export async function getLastPosition() {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('history').get('last');
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}

export async function saveLastPosition(pos) {
  await openDB();
  pos.id = 'last';
  return new Promise((res, rej) => {
    const r = tx('history', 'readwrite').put(pos);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}



/* ----- Shared notes (one note → many verses) ----- */
function newSharedId() {
  return 'sn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export async function getSharedNote(id) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('sharedNotes').get(id);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}

export async function getAllSharedNotes() {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('sharedNotes').getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}

export async function saveSharedNote(note) {
  await openDB();
  if (!note.id) note.id = newSharedId();
  if (!Array.isArray(note.verseKeys)) note.verseKeys = [];
  return new Promise((res, rej) => {
    const r = tx('sharedNotes', 'readwrite').put(note);
    r.onsuccess = () => res(note);
    r.onerror = () => rej(r.error);
  });
}

export async function deleteSharedNote(id) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('sharedNotes', 'readwrite').delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

/** Find shared note that includes this verse key, if any */
export async function findSharedNoteForVerse(verseKey) {
  const all = await getAllSharedNotes();
  return all.find(n => Array.isArray(n.verseKeys) && n.verseKeys.includes(verseKey)) || null;
}



/* ----- Lexicon (Strong's) ----- */
export async function saveLexiconPack(pack) {
  await openDB();
  // Store meta + entries as one record for simplicity
  return new Promise((res, rej) => {
    const r = tx('lexicon', 'readwrite').put({ id: 'strongs', ...pack });
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function getLexiconPack() {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('lexicon').get('strongs');
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}

export async function searchLexicon(query) {
  const pack = await getLexiconPack();
  if (!pack || !pack.entries) return [];
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const results = [];
  // Direct Strong's number: H1, G26, 26, h1254
  const numMatch = q.match(/^([hg])?\s*(\d{1,5})$/i);
  if (numMatch) {
    const n = numMatch[2];
    for (const prefix of (numMatch[1] ? [numMatch[1].toUpperCase()] : ['H', 'G'])) {
      const id = prefix + n;
      if (pack.entries[id]) {
        results.push({ id, ...pack.entries[id] });
      }
      // also try without leading zeros issues - already exact
    }
    if (results.length) return results;
  }
  // Text search in gloss / kjv / lemma / xlit
  for (const [id, e] of Object.entries(pack.entries)) {
    const hay = `${e.gloss} ${e.kjv} ${e.lemma} ${e.xlit} ${e.pron}`.toLowerCase();
    if (hay.includes(q)) {
      results.push({ id, ...e });
      if (results.length >= 40) break;
    }
  }
  return results;
}

/* ----- TSK Cross-reference pack (CrossReferences.org, CC BY 4.0) ----- */
export async function saveTskPack(pack) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('tsk', 'readwrite').put({ id: 'tsk', ...pack });
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function getTskPack() {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('tsk').get('tsk');
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}

/** Return phrase-level groups for one verse key, or [] if pack not installed / no data. */
export async function getTskForVerse(key) {
  const pack = await getTskPack();
  if (!pack || !pack.verses) return [];
  return pack.verses[key] || [];
}

/* ----- Word marks (Tap-a-word Strong's – per-occurrence user marks) ----- */
/** @returns {number[]} sorted unique start offsets for marked words in this verse */
export async function getWordMarks(key) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('wordMarks').get(key);
    r.onsuccess = () => {
      const row = r.result;
      const marks = (row && Array.isArray(row.marks)) ? row.marks.map(n => +n).filter(n => Number.isFinite(n) && n >= 0) : [];
      res([...new Set(marks)].sort((a, b) => a - b));
    };
    r.onerror = () => rej(r.error);
  });
}

/** Replace the full mark list for a verse. Pass [] to clear. */
export async function setWordMarks(key, marks) {
  await openDB();
  const clean = [...new Set((marks || []).map(n => +n).filter(n => Number.isFinite(n) && n >= 0))].sort((a, b) => a - b);
  return new Promise((res, rej) => {
    if (!clean.length) {
      const r = tx('wordMarks', 'readwrite').delete(key);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
      return;
    }
    const r = tx('wordMarks', 'readwrite').put({ key, marks: clean });
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function getAllWordMarks() {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('wordMarks').getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}


/* ----- Commentary cache (Adam Clarke / Tyndale from bible.helloao.org) ----- */
export async function getCachedCommentary(key) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('commentaryCache').get(key);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}

export async function saveCachedCommentary(key, data) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('commentaryCache', 'readwrite').put({ key, ...data, cachedAt: new Date().toISOString() });
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

/* ----- Export / Import all personal data ----- */
export async function exportAllData() {
  await openDB();
  const [books, highlights, notes, crossrefs, learning, settings, history, sharedNotes, wordMarks] = await Promise.all([
    getAllBooks(),
    getAllHighlights(),
    new Promise((res, rej) => {
      const r = tx('notes').getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    }),
    new Promise((res, rej) => {
      const r = tx('crossrefs').getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    }),
    getLearningModel(),
    getSettings(),
    getLastPosition(),
    getAllSharedNotes(),
    getAllWordMarks()
  ]);

  return {
    format: 'kjv-study-backup',
    version: 3,
    exportedAt: new Date().toISOString(),
    books,
    highlights,
    notes,
    crossrefs,
    learning,
    settings,
    history,
    sharedNotes,
    wordMarks
  };
}

export async function importAllData(data, { replace = true } = {}) {
  if (!data || (data.format !== 'kjv-study-backup' && data.format !== 'nasb-study-backup')) {
    throw new Error('Not a valid KJV Study backup file');
  }
  await openDB();

  // Books
  if (Array.isArray(data.books)) {
    for (const book of data.books) {
      await putBook(book);
    }
  }

  // Highlights (support both old colors and new ranges shapes)
  if (Array.isArray(data.highlights)) {
    for (const row of data.highlights) {
      if (!row || !row.key) continue;
      if (row.ranges) {
        await setHighlights(row.key, row.ranges);
      } else if (row.colors) {
        // legacy – store as full-verse ranges with a placeholder end; render will clamp
        await setHighlights(row.key, row.colors.map(c => ({ color: c, start: 0, end: 99999 })));
      }
    }
  }

  // Notes
  if (Array.isArray(data.notes)) {
    for (const row of data.notes) {
      if (row && row.key) await setNote(row.key, row.text || '');
    }
  }

  // Cross-refs
  if (Array.isArray(data.crossrefs)) {
    for (const row of data.crossrefs) {
      if (row && row.key) await setCrossRefs(row.key, row.refs || []);
    }
  }

  // Learning model
  if (data.learning) {
    await saveLearningModel(data.learning);
  }

  // Settings
  if (data.settings) {
    await saveSettings(data.settings);
  }

  // Last position
  if (data.history) {
    await saveLastPosition(data.history);
  }

  // Shared notes
  if (Array.isArray(data.sharedNotes)) {
    for (const note of data.sharedNotes) {
      if (note && note.id) await saveSharedNote(note);
    }
  }

  // Word marks (Tap-a-word per-occurrence marks)
  if (Array.isArray(data.wordMarks)) {
    for (const row of data.wordMarks) {
      if (row && row.key) await setWordMarks(row.key, row.marks || []);
    }
  }
}
