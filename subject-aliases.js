/* subject-aliases.js – Step A local alias map only. KJV Study PWA v6.28.0
   Everyday phrasing → short subject headings → hand-listed KJV refs.
   No commentary. No topical pack. Local only.
*/

const HEADINGS = {
  mourning: {
    name: 'Mourning',
    refs: ['gen.23.2', 'gen.37.34', '2sa.1.12', 'job.1.20', 'jer.31.13', 'mat.5.4', 'jhn.11.35', '1th.4.13']
  },
  burial: {
    name: 'Burial',
    refs: ['gen.23.4', 'gen.50.13', 'deu.34.6', 'ecc.6.3', 'mat.27.59', 'jhn.19.40', 'act.8.2']
  },
  comfort: {
    name: 'Comfort',
    refs: ['psa.23.4', 'psa.34.18', 'isa.40.1', 'isa.61.2', 'mat.5.4', 'jhn.14.1', '2co.1.3', '1th.4.18']
  },
  marriage: {
    name: 'Marriage',
    refs: ['gen.2.24', 'pro.18.22', 'mat.19.5', 'mrk.10.9', 'jhn.2.1', 'eph.5.31', 'heb.13.4']
  },
  wedding_feast: {
    name: 'Wedding feast',
    refs: ['jhn.2.1', 'jhn.2.2', 'mat.22.2', 'mat.25.10', 'rev.19.7', 'rev.19.9']
  },
  birth: {
    name: 'Birth',
    refs: ['gen.4.1', 'gen.21.2', 'gen.25.24', 'ex.2.2', 'rut.4.13', 'luk.1.57', 'luk.2.7', 'jhn.16.21']
  },
  children: {
    name: 'Children',
    refs: ['gen.33.5', 'psa.127.3', 'pro.22.6', 'mrk.10.14', 'luk.18.16', 'eph.6.1']
  },
  sickness: {
    name: 'Sickness',
    refs: ['psa.41.3', 'isa.38.1', 'mat.8.14', 'mat.9.12', 'mrk.1.30', 'jhn.11.4', 'php.2.27', 'jas.5.14']
  },
  healing: {
    name: 'Healing',
    refs: ['exo.15.26', 'psa.103.3', 'isa.53.5', 'mat.4.23', 'mat.8.16', 'mrk.5.34', 'jas.5.15', '1pe.2.24']
  },
  prayer: {
    name: 'Prayer',
    refs: ['psa.55.17', 'psa.65.2', 'mat.6.6', 'mat.21.22', 'luk.18.1', 'php.4.6', '1th.5.17']
  },
  how_to_pray: {
    name: 'How to pray',
    refs: ['mat.6.9', 'mat.6.10', 'mat.6.11', 'mat.6.12', 'mat.6.13', 'luk.11.2', 'rom.8.26']
  },
  when_to_pray: {
    name: 'When to pray',
    refs: ['psa.5.3', 'psa.55.17', 'dan.6.10', 'mrk.1.35', 'luk.6.12', 'act.3.1', '1th.5.17']
  },
  soft_answer: {
    name: 'Soft answer',
    refs: ['pro.15.1', 'pro.25.15', 'ecc.10.12', 'col.4.6', 'jas.1.19', '1pe.3.9']
  },
  speech: {
    name: 'Speech',
    refs: ['psa.19.14', 'pro.12.18', 'pro.18.21', 'eph.4.29', 'col.4.6', 'jas.3.5']
  },
  oppression: {
    name: 'Oppression',
    refs: ['exo.3.9', 'psa.9.9', 'psa.103.6', 'pro.14.31', 'isa.1.17', 'zec.7.10']
  },
  neighbour: {
    name: 'Neighbour',
    refs: ['lev.19.18', 'pro.3.29', 'mat.22.39', 'luk.10.27', 'rom.13.10', 'gal.5.14']
  },
  ishmael: {
    name: 'Ishmael',
    refs: ['gen.16.11', 'gen.16.15', 'gen.17.20', 'gen.21.13', 'gen.21.20', 'gen.25.12', 'gen.25.16']
  },
  ishmaelites: {
    name: 'Ishmaelites',
    refs: ['gen.37.25', 'gen.37.28', 'jdg.8.24', 'psa.83.6']
  },
  arabians: {
    name: 'Arabians',
    refs: ['2ch.17.11', '2ch.21.16', 'isa.13.20', 'isa.21.13', 'jer.25.24', 'gal.4.25']
  }
};

/** Phrase keys (normalized) → heading ids. Test queries from the Step A brief. */
const ALIAS_TO_HEADINGS = {
  funeral: ['mourning', 'burial', 'comfort'],
  funerals: ['mourning', 'burial', 'comfort'],
  wedding: ['marriage', 'wedding_feast'],
  weddings: ['marriage', 'wedding_feast'],
  marriage: ['marriage', 'wedding_feast'],
  birth: ['birth', 'children'],
  childbirth: ['birth', 'children'],
  sickness: ['sickness', 'healing'],
  sick: ['sickness', 'healing'],
  illness: ['sickness', 'healing'],
  pray: ['prayer', 'how_to_pray', 'when_to_pray'],
  prayer: ['prayer', 'how_to_pray', 'when_to_pray'],
  'how to pray': ['how_to_pray', 'prayer'],
  'when to pray': ['when_to_pray', 'prayer'],
  rudeness: ['soft_answer', 'speech'],
  rude: ['soft_answer', 'speech'],
  bullying: ['oppression', 'neighbour'],
  bully: ['oppression', 'neighbour'],
  bullied: ['oppression', 'neighbour'],
  ishmael: ['ishmael', 'ishmaelites'],
  ishmaelites: ['ishmaelites', 'ishmael'],
  islam: ['ishmael', 'ishmaelites', 'arabians'],
  islamics: ['ishmael', 'ishmaelites', 'arabians'],
  islamic: ['ishmael', 'ishmaelites', 'arabians']
};

const ISLAM_NOTE = 'Scripture does not name Islam. These headings list ancestral names only (Ishmael, Ishmaelites, Arabians).';

export function normalizeSubjectQuery(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function headingByName(norm) {
  for (const [id, h] of Object.entries(HEADINGS)) {
    if (normalizeSubjectQuery(h.name) === norm) return id;
  }
  return null;
}

/**
 * Resolve typed text to 2–6 subject headings (or fewer when the map only has that many).
 */
export function suggestSubjectHeadings(query) {
  const norm = normalizeSubjectQuery(query);
  if (!norm || norm.length < 2) return [];

  const ids = [];
  const add = (id) => {
    if (id && HEADINGS[id] && !ids.includes(id)) ids.push(id);
  };

  if (ALIAS_TO_HEADINGS[norm]) {
    ALIAS_TO_HEADINGS[norm].forEach(add);
  } else {
    const named = headingByName(norm);
    if (named) add(named);
    for (const [alias, list] of Object.entries(ALIAS_TO_HEADINGS)) {
      if (alias.length >= 3 && (norm.includes(alias) || alias.includes(norm))) {
        list.forEach(add);
      }
    }
  }

  return ids.slice(0, 6).map((id) => {
    const h = HEADINGS[id];
    const islamPath = id === 'ishmael' || id === 'ishmaelites' || id === 'arabians';
    const fromIslamQuery = /\bislam/.test(norm);
    return {
      id,
      name: h.name,
      refs: h.refs.slice(),
      note: fromIslamQuery && islamPath ? ISLAM_NOTE : null
    };
  });
}

export function getSubjectHeading(id) {
  const h = HEADINGS[id];
  if (!h) return null;
  return { id, name: h.name, refs: h.refs.slice() };
}

const BOOK_NAMES = {
  gen: 'Genesis', exo: 'Exodus', lev: 'Leviticus', num: 'Numbers', deu: 'Deuteronomy',
  jos: 'Joshua', jdg: 'Judges', rut: 'Ruth', '1sa': '1 Samuel', '2sa': '2 Samuel',
  '1ki': '1 Kings', '2ki': '2 Kings', '1ch': '1 Chronicles', '2ch': '2 Chronicles',
  ezr: 'Ezra', neh: 'Nehemiah', est: 'Esther', job: 'Job', psa: 'Psalms',
  pro: 'Proverbs', ecc: 'Ecclesiastes', sng: 'Song of Solomon', isa: 'Isaiah',
  jer: 'Jeremiah', lam: 'Lamentations', eze: 'Ezekiel', dan: 'Daniel', hos: 'Hosea',
  joe: 'Joel', amo: 'Amos', oba: 'Obadiah', jon: 'Jonah', mic: 'Micah', nah: 'Nahum',
  hab: 'Habakkuk', zep: 'Zephaniah', hag: 'Haggai', zec: 'Zechariah', mal: 'Malachi',
  mat: 'Matthew', mrk: 'Mark', luk: 'Luke', jhn: 'John', act: 'Acts', rom: 'Romans',
  '1co': '1 Corinthians', '2co': '2 Corinthians', gal: 'Galatians', eph: 'Ephesians',
  php: 'Philippians', col: 'Colossians', '1th': '1 Thessalonians', '2th': '2 Thessalonians',
  '1ti': '1 Timothy', '2ti': '2 Timothy', tit: 'Titus', phm: 'Philemon', heb: 'Hebrews',
  jas: 'James', '1pe': '1 Peter', '2pe': '2 Peter', '1jn': '1 John', '2jn': '2 John',
  '3jn': '3 John', jud: 'Jude', rev: 'Revelation'
};

export function formatSubjectRef(key) {
  const parts = String(key || '').split('.');
  const bookId = parts[0];
  const chapter = parts[1];
  const verse = parts[2];
  const name = BOOK_NAMES[bookId] || bookId;
  return { bookId, chapter: +chapter, verse: +verse, label: `${name} ${chapter}:${verse}` };
}
