/**
 * focused-search.js
 * Focused Search for KJV Study PWA
 *
 * - Walks real structure: book.chapters[].verses[] = { number, text }
 * - Uses bible.verseKey
 * - Caches the verse list; rebuilds only when books reference changes
 * - Contextual scoring: shared distinctive tokens with the anchor verse
 * - Surfaces why an anchor failed and any known name variants
 */

import { findGroupFor, otherSpellings } from './name-variants.js';

const STOP = new Set([
  'the','and','of','to','a','in','that','he','was','for','on','are','with','as','his','they',
  'be','at','one','have','this','from','or','had','by','not','but','what','all','were','we',
  'when','your','can','said','there','use','an','each','which','she','do','how','their','if',
  'will','up','other','about','out','many','then','them','these','so','some','her','would',
  'make','like','him','into','time','has','look','two','more','go','see','no','way','could',
  'my','than','first','been','call','who','its','now','find','long','down','day','did','get',
  'come','made','may','part','over','new','sound','take','only','little','work','know','place',
  'year','live','me','back','give','most','very','after','thing','our','just','name','good',
  'sentence','man','think','say','great','where','help','through','much','before','line','right',
  'too','mean','old','any','same','tell','boy','follow','came','want','show','also','around',
  'form','three','small','set','put','end','does','another','well','large','must','big','even',
  'such','because','turn','here','why','ask','went','men','read','need','land','different',
  'home','us','move','try','kind','hand','picture','again','change','off','play','spell','air',
  'away','animal','house','point','page','letter','mother','answer','found','study','still',
  'learn','should','america','world','high','every','near','add','food','between','own','below',
  'country','plant','last','school','father','keep','tree','never','start','city','earth','eye',
  'light','thought','head','under','story','saw','left','don','few','while','along','might',
  'close','something','seem','next','hard','open','example','begin','life','always','those',
  'both','paper','together','got','group','often','run','important','until','children','side',
  'feet','car','mile','night','walk','white','sea','began','grow','took','river','four','carry',
  'state','once','book','hear','stop','without','second','later','miss','idea','enough','eat',
  'face','watch','far','indian','real','almost','let','above','girl','sometimes','mountain',
  'cut','young','talk','soon','list','song','being','leave','family','it','is','am','you','i'
]);

export function createFocusedSearch(books, bible) {
  let cache = null;
  let cacheBooks = null;

  function getAllLoadedVerses() {
    if (cache && cacheBooks === books) return cache;
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
    cache = list;
    cacheBooks = books;
    return list;
  }

  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function distinctiveTokens(text) {
    return tokenize(text).filter(t => t.length > 2 && !STOP.has(t));
  }

  function resolveAnchor(anchorInput, allVerses) {
    const info = { verse: null, note: '', tried: [] };
    if (!anchorInput || !String(anchorInput).trim()) {
      info.note = 'No anchor verse supplied.';
      return info;
    }
    const trimmed = String(anchorInput).trim();
    const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();
    info.tried.push(normalized);

    const byRef = allVerses.find(v => v.ref.toLowerCase() === normalized);
    if (byRef) {
      info.verse = byRef;
      info.note = 'Anchor matched by reference.';
      return info;
    }

    // Common short-form attempts
    const short = normalized
      .replace(/^1\s+chronicles/, '1 chronicles')
      .replace(/^i\s+chronicles/, '1 chronicles')
      .replace(/^1\s*chr\.?/, '1 chronicles')
      .replace(/^1ch\b/, '1 chronicles');
    if (short !== normalized) {
      info.tried.push(short);
      const byShort = allVerses.find(v => v.ref.toLowerCase() === short);
      if (byShort) {
        info.verse = byShort;
        info.note = 'Anchor matched after normalizing the reference.';
        return info;
      }
    }

    const lower = trimmed.toLowerCase();
    const byText = allVerses.find(v => v.text.toLowerCase().includes(lower));
    if (byText) {
      info.verse = byText;
      info.note = 'Anchor matched by verse text.';
      return info;
    }

    info.note = 'Anchor not found. Use a full reference such as “1 Chronicles 9:21” or paste the exact verse text. Tried: ' + info.tried.join(' | ');
    return info;
  }

  function variantsFor(term) {
    const g = findGroupFor(term);
    if (!g) return [];
    return otherSpellings(g, term);
  }

  function search(term, anchorInput) {
    const allVerses = getAllLoadedVerses();
    const termStr = String(term || '').trim();
    const termLower = termStr.toLowerCase();
    const diagnostics = [];

    if (!termLower) {
      diagnostics.push('No search term entered.');
      return {
        anchor: null,
        anchorNote: '',
        focused: [],
        all: [],
        term: '',
        totalLoaded: allVerses.length,
        variants: [],
        diagnostics
      };
    }

    const tokens = tokenize(term);
    let matches = [];
    if (tokens.length === 1) {
      matches = allVerses.filter(v => tokenize(v.text).includes(tokens[0]));
    } else {
      matches = allVerses.filter(v => v.text.toLowerCase().includes(termLower));
    }

    const anchorInfo = resolveAnchor(anchorInput, allVerses);
    const anchor = anchorInfo.verse;
    if (anchorInput && !anchor) diagnostics.push(anchorInfo.note);
    else if (anchor) diagnostics.push(anchorInfo.note);

    const variants = variantsFor(termStr);
    if (variants.length) {
      diagnostics.push('Known alternate spellings: ' + variants.join(', ') + '. You can search any of these.');
    }

    let focused = matches.slice();
    if (anchor && matches.length) {
      const anchorTokens = new Set(distinctiveTokens(anchor.text));
      focused = matches
        .map(v => {
          let score = 0;
          const reasons = [];
          if (v.bookId === anchor.bookId) {
            score += 12;
            reasons.push('same book');
          }
          const chDiff = Math.abs(v.chapter - anchor.chapter);
          if (chDiff === 0) {
            score += 8;
            reasons.push('same chapter');
          } else if (chDiff === 1) {
            score += 4;
            reasons.push('adjacent chapter');
          }
          const vTokens = distinctiveTokens(v.text);
          let shared = 0;
          for (const t of vTokens) {
            if (anchorTokens.has(t) && t !== termLower) shared++;
          }
          if (shared) {
            score += shared * 3;
            reasons.push(shared + ' shared distinctive word' + (shared > 1 ? 's' : ''));
          }
          return { v: { ...v, score, reasons }, score };
        })
        .sort((a, b) => b.score - a.score)
        .map(x => x.v);
    } else {
      focused = matches.map(v => ({ ...v, score: 0, reasons: [] }));
    }

    if (!matches.length) {
      diagnostics.push('No verses in the loaded books contain “' + termStr + '”.');
    }

    return {
      anchor,
      anchorNote: anchorInfo.note,
      focused,
      all: matches,
      term: termStr,
      totalLoaded: allVerses.length,
      variants,
      diagnostics
    };
  }

  return { search, getAllLoadedVerses, invalidate: () => { cache = null; cacheBooks = null; } };
}
