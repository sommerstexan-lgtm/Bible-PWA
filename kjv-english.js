/* kjv-english.js – KJV 1611 English senses for known “false friends” only.
   Public-domain, established Early Modern English readings.
   If a word is not in this list, return no gloss (never guess).
   v6.30.0
*/

const SENSES = {
  meat: { sense: 'food (not only flesh)', trap: true },
  meats: { sense: 'foods (not only flesh)', trap: true },
  conversation: { sense: 'manner of life / conduct', trap: true },
  conversations: { sense: 'manner of life / conduct', trap: true },
  prevent: { sense: 'go before / precede', trap: true },
  prevented: { sense: 'went before / preceded', trap: true },
  preventing: { sense: 'going before / preceding', trap: true },
  suffer: { sense: 'allow / permit (often, not only feel pain)', trap: true },
  suffered: { sense: 'allowed / permitted (often)', trap: true },
  suffereth: { sense: 'allows / permits (often)', trap: true },
  quick: { sense: 'living / alive', trap: true },
  quicken: { sense: 'make alive', trap: true },
  quickened: { sense: 'made alive', trap: true },
  charity: { sense: 'love (Christian love)', trap: true },
  peculiar: { sense: 'belonging specially / one’s own', trap: true },
  replenish: { sense: 'fill', trap: true },
  replenished: { sense: 'filled', trap: true },
  ghost: { sense: 'spirit', trap: true },
  carriage: { sense: 'things carried / baggage', trap: true },
  carriages: { sense: 'things carried / baggage', trap: true },
  corn: { sense: 'grain', trap: true },
  want: { sense: 'lack', trap: true },
  wanted: { sense: 'lacked', trap: true },
  ensample: { sense: 'example', trap: true },
  ensamples: { sense: 'examples', trap: true },
  divers: { sense: 'various / several', trap: true },
  listeth: { sense: 'wishes / wills', trap: true },
  wist: { sense: 'knew', trap: true },
  wot: { sense: 'know', trap: true },
  wotteth: { sense: 'knows', trap: true },
  trow: { sense: 'think / suppose', trap: true },
  sith: { sense: 'since', trap: true },
  holpen: { sense: 'helped', trap: true },
  halt: { sense: 'limp / be lame', trap: true },
  halted: { sense: 'limped', trap: true },
  occupy: { sense: 'trade / do business', trap: true },
  occupied: { sense: 'traded / did business', trap: true },
  bowels: { sense: 'inner feelings / compassion', trap: true },
  damn: { sense: 'condemn', trap: true },
  damned: { sense: 'condemned', trap: true },
  damnation: { sense: 'condemnation', trap: true },
  let: { sense: 'sometimes hinder / restrain (not always “allow”)', trap: true },
  letteth: { sense: 'hinders / restrains', trap: true },
  presently: { sense: 'immediately (not “in a while”)', trap: true },
  study: { sense: 'be diligent / take pains', trap: true },
  unicorn: { sense: 'wild ox', trap: true },
  unicorns: { sense: 'wild oxen', trap: true },
  mean: { sense: 'common / lowly (when not “intend”)', trap: true },
  communication: { sense: 'sharing / participation', trap: true },
  communications: { sense: 'associations / company', trap: true },
  instantly: { sense: 'urgently / earnestly', trap: true },
  alleged: { sense: 'adduced / brought forward', trap: true },
  conversation: { sense: 'manner of life / conduct', trap: true }
};

function norm(word) {
  return String(word || '')
    .replace(/^[“”"'([]+/, '')
    .replace(/[”"'.,;:!?)\]]+$/, '')
    .toLowerCase();
}

/**
 * KJV-English sense when the modern reading is the trap.
 * Uses nearby words only for well-known compounds (meat offering).
 * Returns { sense, trap } or null — never a guess.
 */
export function kjvEnglishSense(word, verseText, startOffset) {
  const key = norm(word);
  if (!key) return null;

  const text = String(verseText || '');
  const start = Number.isFinite(startOffset) ? startOffset : -1;
  const after = start >= 0 ? text.slice(start + String(word).length, start + String(word).length + 24).toLowerCase() : '';
  const before = start >= 0 ? text.slice(Math.max(0, start - 16), start).toLowerCase() : '';

  if (key === 'meat' || key === 'meats') {
    if (/^\s*offering\b/.test(after)) {
      return { sense: 'food offering / grain (not grocery meat)', trap: true };
    }
    return SENSES.meat;
  }

  if (key === 'ghost' && /\bholy\s+$/i.test(before)) {
    return { sense: 'Spirit (Holy Ghost = Holy Spirit)', trap: true };
  }

  return SENSES[key] || null;
}

export function isEnglishTrap(word, verseText, startOffset) {
  return !!kjvEnglishSense(word, verseText, startOffset);
}

/** Known KJV (and same-sense) phrases treated as one unit. No guessed glosses. */
const PHRASES = [
  { phrase: 'meat offering', sense: 'food offering / grain (not grocery meat)' },
  { phrase: 'meal offering', sense: 'food offering / grain (not grocery meat)' },
  { phrase: 'burnt offering', sense: 'offering burned on the altar' },
  { phrase: 'burnt sacrifice', sense: 'offering burned on the altar' },
  { phrase: 'peace offering', sense: 'fellowship / well-being offering' },
  { phrase: 'sin offering', sense: 'offering for sin' },
  { phrase: 'trespass offering', sense: 'offering for guilt' },
  { phrase: 'guilt offering', sense: 'offering for guilt' },
  { phrase: 'wave offering', sense: 'portion waved before the LORD' },
  { phrase: 'heave offering', sense: 'portion lifted up / set aside' },
  { phrase: 'drink offering', sense: 'poured-out offering' },
  { phrase: 'freewill offering', sense: 'voluntary offering' },
  { phrase: 'holy convocation', sense: 'sacred assembly' },
  { phrase: 'holy ghost', sense: 'Holy Spirit' },
  { phrase: 'holy spirit', sense: 'Spirit of God' },
  { phrase: 'children of israel', sense: 'the people of Israel' },
  { phrase: 'tabernacle of the congregation', sense: 'tent of meeting' },
  { phrase: 'tent of meeting', sense: 'tabernacle of the congregation' },
  { phrase: 'most holy', sense: 'especially set apart' },
  { phrase: 'thus saith the lord', sense: 'speech frame: the LORD says' },
  { phrase: 'saith the lord', sense: 'speech frame: the LORD says' },
  { phrase: 'the lord spake', sense: 'speech frame: the LORD spoke' },
  { phrase: 'the lord said', sense: 'speech frame: the LORD said' }
].sort((a, b) => b.phrase.length - a.phrase.length);

function wordChar(ch) {
  return /[A-Za-z']/.test(ch || '');
}

/**
 * If the tap sits inside a known phrase in this verse, return that unit.
 * Otherwise null — never invent a phrase.
 */
export function phraseUnitAt(verseText, startOffset, tappedWord) {
  const text = String(verseText || '');
  if (!text || !Number.isFinite(startOffset) || startOffset < 0) return null;
  const lower = text.toLowerCase();
  const tapWord = norm(tappedWord);

  for (const p of PHRASES) {
    let from = 0;
    while (from <= lower.length) {
      const idx = lower.indexOf(p.phrase, from);
      if (idx < 0) break;
      const end = idx + p.phrase.length;
      const beforeOk = idx === 0 || !wordChar(text[idx - 1]);
      const afterOk = end >= text.length || !wordChar(text[end]);
      if (beforeOk && afterOk && startOffset >= idx && startOffset < end) {
        const surface = text.slice(idx, end);
        if (tapWord && !norm(surface).includes(tapWord) && !p.phrase.split(' ').includes(tapWord)) {
          from = idx + 1;
          continue;
        }
        return {
          phrase: surface,
          query: p.phrase,
          sense: p.sense
        };
      }
      from = idx + 1;
    }
  }
  return null;
}
