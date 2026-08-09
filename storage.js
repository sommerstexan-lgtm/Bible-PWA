/* storage.js – IndexedDB wrapper for all private data. v1.0.0
   Everything stays on-device. No network calls.
*/

const DB_NAME = 'nasb-study-db';
const DB_VERSION = 1;

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

/* Highlights: { key: "gen.1.1", colors: ["red","yellow"] } */
export async function getHighlights(key) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('highlights').get(key);
    r.onsuccess = () => res(r.result ? r.result.colors : []);
    r.onerror = () => rej(r.error);
  });
}

export async function setHighlights(key, colors) {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('highlights', 'readwrite').put({ key, colors });
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function getAllHighlights() {
  await openDB();
  return new Promise((res, rej) => {
    const r = tx('highlights').getAll();
    r.onsuccess = () => res(r.result || []);
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
