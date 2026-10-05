/* precision.js – Color apply policy, KJV probes, word counts. v6.66.0
   Pure helpers. No DOM. No IndexedDB.
*/

const GOSPEL = new Set(['mat', 'mrk', 'luk', 'jhn']);
const REV_BEAST = new Set(['rev', '1jn', '2th']);
const TORAH = new Set(['gen', 'exo', 'lev', 'num', 'deu']);

const KJV_PROBES = [
  { id: 'gen', chapter: 1, verse: 1, exact: 'In the beginning God created the heaven and the earth.' },
  { id: 'jhn', chapter: 3, verse: 16, startsWith: 'For God so loved the world, that he gave his only begotten Son' }
];

const SPEECH_RES = [
  /\bthus saith the LORD\b/gi,
  /\bsaith the LORD\b/gi,
  /\bthe LORD(?:\s+\w+){0,2}?\s+(?:called|spake|spoke|said|saith)\b/gi,
  /\bGod\s+said\b/gi,
  /\bthe LORD\s+said\b/gi,
  /\bAnd\s+God\s+said\b/gi
];

const JESUS_FRAME_RES = [
  /\bjesus\s+(said|answered|replied|spake|spoke|saith)\b/gi,
  /\bverily,?\s+verily\b/gi,
  /\bverily\s+I\s+say\s+unto\s+you\b/gi,
  /\bI\s+say\s+unto\s+you\b/gi
];

function findAll(text, re) {
  const out = [];
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const r = new RegExp(re.source, flags);
  let m;
  while ((m = r.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    if (!m[0].length) r.lastIndex++;
  }
  return out;
}

export function speechFrames(text, bookId, colorId) {
  if (!text) return [];
  const id = String(bookId || '').toLowerCase();
  const frames = [];
  if (!colorId || colorId === 'blue') {
    for (const re of SPEECH_RES) {
      for (const hit of findAll(text, re)) frames.push({ ...hit, colorId: 'blue' });
    }
  }
  if (!colorId || colorId === 'red') {
    if (GOSPEL.has(id) || /jesus/i.test(text)) {
      for (const re of JESUS_FRAME_RES) {
        for (const hit of findAll(text, re)) frames.push({ ...hit, colorId: 'red' });
      }
    }
  }
  frames.sort((a, b) => a.start - b.start);
  const cleaned = [];
  for (const f of frames) {
    const last = cleaned[cleaned.length - 1];
    if (last && f.start < last.end) {
      if ((f.end - f.start) > (last.end - last.start)) cleaned[cleaned.length - 1] = f;
      continue;
    }
    cleaned.push(f);
  }
  return cleaned;
}

export function isGospel(bookId) {
  return GOSPEL.has(String(bookId || '').toLowerCase());
}

export function allowBeastPaint(bookId) {
  return REV_BEAST.has(String(bookId || '').toLowerCase());
}

export function isTorah(bookId) {
  return TORAH.has(String(bookId || '').toLowerCase());
}

function isNamedHolySpirit(text, hit) {
  const win = text.slice(Math.max(0, hit.start - 24), Math.min(text.length, hit.end + 32));
  return /\bholy\s+spirit\b/i.test(win)
    || /\bholy\s+ghost\b/i.test(win)
    || /\bspirit\s+of\s+(god|christ|jesus|his\s+son|the\s+lord|the\s+living\s+god)\b/i.test(win)
    || /\bgod['’]s\s+spirit\b/i.test(win);
}

export function ambiguousTokens(text, bookId) {
  const out = [];
  if (!text) return out;
  const id = String(bookId || '').toLowerCase();
  for (const hit of findAll(text, /\bspirit\b/gi)) {
    if (isNamedHolySpirit(text, hit)) continue;
    out.push({ key: 'spirit', ...hit });
  }
  for (const hit of findAll(text, /\bbeast\b/gi)) {
    if (allowBeastPaint(id)) continue;
    out.push({ key: 'beast', ...hit });
  }
  for (const hit of findAll(text, /\bserpent\b/gi)) {
    const win = text.slice(Math.max(0, hit.start - 24), Math.min(text.length, hit.end + 24));
    if (/\b(satan|devil|dragon)\b/i.test(win)) continue;
    out.push({ key: 'serpent', ...hit });
  }
  return out;
}

export function senseChoices(tokenKey) {
  if (tokenKey === 'spirit') {
    return [
      { id: 'holy', label: 'Holy Spirit', colorId: 'yellow', reason: 'Holy Spirit' },
      { id: 'human', label: 'Human / other spirit — do not paint' }
    ];
  }
  if (tokenKey === 'beast') {
    return [
      { id: 'antichrist', label: 'Antichrist figure', colorId: 'pink', reason: 'Antichrist figure' },
      { id: 'animal', label: 'Animal / other — do not paint' }
    ];
  }
  if (tokenKey === 'serpent') {
    return [
      { id: 'satan', label: 'Satan / adversary', colorId: 'grey', reason: 'Satan / adversary' },
      { id: 'animal', label: 'Snake / other — do not paint' }
    ];
  }
  return [];
}

/** Span to paint after the reader picks a sense. Expands Spirit of God / God's Spirit. */
export function identifySpan(text, token, senseId) {
  if (!token) return null;
  const patterns = [];
  if (senseId === 'holy') {
    patterns.push(
      /\bholy\s+spirit\b/gi,
      /\bholy\s+ghost\b/gi,
      /\bgod['’]s\s+spirit\b/gi,
      /\bspirit\s+of\s+(?:god|christ|jesus|his\s+son|the\s+lord|the\s+living\s+god)\b/gi
    );
  } else if (senseId === 'antichrist') {
    patterns.push(/\b(?:the\s+)?beast\b/gi);
  } else if (senseId === 'satan') {
    patterns.push(/\bserpent\b/gi);
  }
  for (const re of patterns) {
    for (const hit of findAll(text, re)) {
      if (hit.start < token.end && hit.end > token.start) return hit;
    }
  }
  return { start: token.start, end: token.end, text: token.text };
}

/**
 * Decide highlight ranges for a color apply.
 * Never silently wash a speech payload when a frame exists.
 */
export function planColorApply(text, colorId, bookId, selection, opts) {
  const len = (text || '').length;
  const result = { ranges: [], mode: 'none', needSense: null, note: '' };
  if (!len || !colorId) return result;
  const resolved = !!(opts && opts.senseResolved);
  const reason = (opts && opts.reason) || '';

  const sel = selection && selection.end > selection.start
    ? { start: Math.max(0, selection.start), end: Math.min(len, selection.end) }
    : null;
  const selWhole = !sel || (sel.start === 0 && sel.end >= len);

  if (!resolved) {
    const amb = ambiguousTokens(text, bookId).filter((t) => {
      if (t.key === 'spirit' && colorId === 'yellow') return true;
      if (t.key === 'beast' && colorId === 'pink') return true;
      if (t.key === 'serpent' && colorId === 'grey') return true;
      return false;
    }).filter((t) => !sel || selWhole || (t.start < sel.end && t.end > sel.start));
    if (amb.length) {
      result.needSense = amb[0];
      result.mode = 'sense-lock';
      result.note = 'This word has more than one sense. Pick one before paint.';
      return result;
    }
  }

  const frames = speechFrames(text, bookId, colorId === 'red' ? 'red' : colorId === 'blue' ? 'blue' : '');
  const speechColor = colorId === 'blue' || colorId === 'red';

  if (speechColor && selWhole && frames.length) {
    const wanted = frames.filter((f) => f.colorId === colorId);
    const use = wanted.length ? wanted : frames;
    result.ranges = use.map((f) => ({ color: colorId, start: f.start, end: f.end, reason: 'speech frame only' }));
    result.mode = 'speech-frame';
    result.note = 'Painted the speech frame only. The words after it were left alone.';
    return result;
  }

  if (speechColor && sel && !selWhole && frames.length) {
    const overlap = frames.filter((f) => f.colorId === colorId && f.start < sel.end && f.end > sel.start);
    if (overlap.length && (sel.end - sel.start) > Math.max(...overlap.map((f) => f.end - f.start)) * 2) {
      result.ranges = overlap.map((f) => ({ color: colorId, start: f.start, end: f.end, reason: 'speech frame only' }));
      result.mode = 'speech-frame';
      result.note = 'Selection covered the quote. Only the speech frame was painted.';
      return result;
    }
  }

  if (sel && !selWhole) {
    result.ranges = [{ color: colorId, start: sel.start, end: sel.end, reason }];
    result.mode = 'selection';
    result.note = reason || 'Applied to the selected words only.';
    return result;
  }

  result.ranges = [{ color: colorId, start: 0, end: len }];
  result.mode = 'whole-verse';
  result.note = 'No speech frame and no selection — whole verse.';
  return result;
}

export function mergeRanges(existing, incoming, textLen) {
  const next = Array.isArray(existing) ? existing.slice() : [];
  for (const add of incoming || []) {
    const punched = [];
    for (const r of next) {
      if (r.end <= add.start || r.start >= add.end) punched.push(r);
      else {
        if (r.start < add.start) punched.push({ color: r.color, start: r.start, end: add.start, reason: r.reason });
        if (r.end > add.end) punched.push({ color: r.color, start: add.end, end: r.end, reason: r.reason });
      }
    }
    punched.push({ color: add.color, start: add.start, end: add.end, reason: add.reason || '' });
    next.length = 0;
    next.push(...punched);
  }
  return next
    .filter((r) => r && r.end > r.start && r.start < textLen)
    .map((r) => ({
      color: r.color,
      start: Math.max(0, r.start),
      end: Math.min(textLen, r.end),
      reason: r.reason || ''
    }));
}

export function quoteSpan(text, start, end) {
  return String(text || '').slice(start, end);
}

export function checkBundledKjv(books) {
  const flags = [];
  for (const probe of KJV_PROBES) {
    const book = (books || []).find((b) => b && b.id === probe.id);
    if (!book || !Array.isArray(book.chapters)) continue;
    const ch = book.chapters.find((c) => c.number === probe.chapter);
    if (!ch || !Array.isArray(ch.verses)) continue;
    const v = ch.verses.find((x) => x.number === probe.verse);
    if (!v || !v.text) continue;
    const got = String(v.text).replace(/\s+/g, ' ').trim();
    if (probe.exact && got !== probe.exact) {
      flags.push({
        bookId: probe.id,
        label: probe.id === 'gen' ? 'Genesis 1:1' : 'John 3:16',
        expected: probe.exact,
        got
      });
    } else if (probe.startsWith && !got.startsWith(probe.startsWith)) {
      flags.push({
        bookId: probe.id,
        label: 'John 3:16',
        expected: probe.startsWith,
        got
      });
    }
  }
  return flags;
}

export function countWordInChapter(word, book, chapterNum) {
  const q = String(word || '').trim();
  if (!q || !book) return { count: 0, hits: [] };
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(^|[^A-Za-z])' + escaped + '([^A-Za-z]|$)', 'i');
  const ch = (book.chapters || []).find((c) => c.number === chapterNum);
  if (!ch) return { count: 0, hits: [] };
  const hits = [];
  for (const v of ch.verses || []) {
    if (v && v.text && re.test(v.text)) hits.push(v.number);
  }
  return { count: hits.length, hits };
}
