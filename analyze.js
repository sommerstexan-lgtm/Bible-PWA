/* analyze.js – Rule-based color suggestion engine + local learning. v6.44.0
   All learning stays in IndexedDB. User corrections improve future suggestions.
   Highlight text color is ALWAYS computed for max contrast (pure black or pure white).
*/

import { getLearningModel, saveLearningModel } from './storage.js';

/**
 * Convert #rrggbb (or #rgb) to [r,g,b] 0–255.
 */
function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return [128, 128, 128];
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return [128, 128, 128];
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Relative luminance (sRGB, WCAG).
 */
function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Mandatory high-contrast text color for any highlight background.
 * Returns pure '#000000' or pure '#ffffff' — whichever has higher contrast ratio.
 * Never returns grey or intermediate values.
 */
export function contrastTextColor(bgHex) {
  const L = relativeLuminance(bgHex);
  // Contrast vs black = (L + 0.05) / 0.05 ; vs white = 1.05 / (L + 0.05)
  // Prefer the larger ratio. Tie → white for dark backgrounds bias.
  const contrastBlack = (L + 0.05) / 0.05;
  const contrastWhite = 1.05 / (L + 0.05);
  return contrastBlack >= contrastWhite ? '#000000' : '#ffffff';
}

/**
 * Brighter / slightly more saturated outline color for a highlight background.
 * Used by Tap-a-word Strong's so the frame remains visible on solid fills.
 */
export function outlineColorForHighlight(bgHex) {
  const [r, g, b] = hexToRgb(bgHex);
  // Mix ~40% toward white for a soft glow that still reads the original hue
  const lr = Math.min(255, Math.round(r * 0.55 + 255 * 0.45));
  const lg = Math.min(255, Math.round(g * 0.55 + 255 * 0.45));
  const lb = Math.min(255, Math.round(b * 0.55 + 255 * 0.45));
  return `rgba(${lr},${lg},${lb},0.9)`;
}

// Base palette – text field is ignored at runtime; always recomputed via contrastTextColor.
export const COLORS = [
  { id: 'red',     label: 'Red',          meaning: 'Jesus said',                    hex: '#c41e3a' },
  { id: 'yellow',  label: 'Yellow',       meaning: 'Holy Spirit',                   hex: '#ffd700' },
  { id: 'yg',      label: 'Yellow/Green', meaning: 'Figures of speech & parables',  hex: '#9acd32' },
  { id: 'orange',  label: 'Orange',       meaning: 'Observations (not figures)',    hex: '#ff8c00' },
  { id: 'magenta', label: 'Magenta',      meaning: 'Repetition',                    hex: '#c71585' },
  { id: 'blue',    label: 'Blue',         meaning: 'Words of God',                  hex: '#1e90ff' },
  { id: 'tan',     label: 'Tan',          meaning: 'Tribulation',                   hex: '#d2b48c' },
  { id: 'brown',   label: 'Brown',        meaning: 'Words requiring look up',       hex: '#8b4513' },
  { id: 'lblue',   label: 'Light Blue',   meaning: 'Prophecy',                      hex: '#add8e6' },
  { id: 'aqua',    label: 'Aqua Green',   meaning: 'Rapture',                       hex: '#00ced1' },
  { id: 'pink',    label: 'Pink',         meaning: 'Antichrist',                   hex: '#ff69b4' },
  { id: 'grey',    label: 'Grey',         meaning: 'Satan',                         hex: '#808080' },
  { id: 'violet',  label: 'Violet',       meaning: 'Questions of importance',       hex: '#8a2be2' }
];

const COLOR_MAP = Object.fromEntries(COLORS.map(c => [c.id, c]));

// Base keyword / pattern rules (case-insensitive)
const BASE_RULES = {
  red: [
    { re: /\bjesus\s+(said|answered|replied|spoke|saith)\b/i, w: 5, reason: 'Jesus speaking' },
    { re: /\b(he|jesus)\s+said\s+(to|unto)\s+(them|him|her)\b/i, w: 4, reason: 'He said to them/him' },
    { re: /\btruly,?\s+i\s+(say|tell)\s+you\b/i, w: 5, reason: 'Truly I say to you' },
    { re: /\bi\s+am\s+the\b/i, w: 3, reason: 'I am the… (Jesus self-identification)' },
    { re: /\bverily,?\s+verily\b/i, w: 4, reason: 'Verily, verily' }
  ],
  yellow: [
    { re: /\bholy\s+spirit\b/i, w: 6, reason: 'Holy Spirit mentioned' },
    { re: /\bspirit\s+of\s+(god|the\s+lord|the\s+living\s+god)\b/i, w: 5, reason: 'Spirit of God / the Lord' },
    { re: /\bthe\s+spirit\b/i, w: 2, reason: 'the Spirit' },
    { re: /\bspirit\s+moved\b/i, w: 4, reason: 'Spirit moved' }
  ],
  yg: [
    { re: /\bparable\b/i, w: 5, reason: 'Parable' },
    { re: /\blike\s+(a|unto)\b/i, w: 2, reason: 'Simile / “like a”' },
    { re: /\bas\s+a\b.+\bso\b/i, w: 2, reason: 'As … so figure' },
    { re: /\bkingdom\s+of\s+(heaven|god)\s+is\s+like\b/i, w: 5, reason: 'Kingdom is like…' }
  ],
  orange: [
    { re: /\b(observed|noticed|saw\s+that|behold)\b/i, w: 2, reason: 'Observation language' },
    { re: /\bit\s+was\s+(good|very\s+good)\b/i, w: 3, reason: 'Evaluation / observation' }
  ],
  magenta: [
    { re: /\b(again|likewise|also|the\s+same)\b/i, w: 1, reason: 'Repetition cue' },
    { re: /\band\s+god\s+said\b/i, w: 2, reason: 'Repeated “And God said”' }
  ],
  blue: [
    { re: /\bgod\s+said\b/i, w: 5, reason: 'God said' },
    { re: /\b(thus|this)\s+says?\s+the\s+lord\b/i, w: 6, reason: 'Thus says the Lord' },
    { re: /\bword\s+of\s+(the\s+lord|god)\b/i, w: 4, reason: 'Word of the Lord / God' },
    { re: /\band\s+god\s+(said|spoke|called)\b/i, w: 4, reason: 'And God said / spoke' }
  ],
  tan: [
    { re: /\btribulation\b/i, w: 6, reason: 'Tribulation' },
    { re: /\bgreat\s+distress\b/i, w: 4, reason: 'Great distress' },
    { re: /\bday\s+of\s+(wrath|the\s+lord)\b/i, w: 3, reason: 'Day of wrath / the Lord' }
  ],
  brown: [
    { re: /\b(firmament|begat|selah|ephod|teraphim|shibboleth)\b/i, w: 4, reason: 'Uncommon / look-up word' },
    { re: /\b(sheol|hades|gehenna)\b/i, w: 3, reason: 'Technical term' }
  ],
  lblue: [
    { re: /\b(prophecy|prophesy|prophet)\b/i, w: 4, reason: 'Prophecy / prophet' },
    { re: /\bin\s+that\s+day\b/i, w: 2, reason: 'In that day (prophetic)' },
    { re: /\bthe\s+days\s+are\s+coming\b/i, w: 4, reason: 'The days are coming' }
  ],
  aqua: [
    { re: /\b(rapture|caught\s+up|caught\s+away)\b/i, w: 6, reason: 'Rapture language' },
    { re: /\bmeet\s+the\s+lord\s+in\s+the\s+air\b/i, w: 6, reason: 'Meet the Lord in the air' },
    { re: /\bchanged\s+in\s+a\s+moment\b/i, w: 4, reason: 'Changed in a moment' }
  ],
  pink: [
    { re: /\b(antichrist|man\s+of\s+sin|son\s+of\s+perdition|beast)\b/i, w: 5, reason: 'Antichrist / beast language' },
    { re: /\bfalse\s+prophet\b/i, w: 4, reason: 'False prophet' }
  ],
  grey: [
    { re: /\b(satan|devil|the\s+evil\s+one|serpent|dragon)\b/i, w: 5, reason: 'Satan / devil / serpent' },
    { re: /\btempter\b/i, w: 3, reason: 'Tempter' }
  ],
  violet: [
    { re: /\?$/, w: 3, reason: 'Ends with question mark' },
    { re: /\b(why|how|what|who|where|when)\b.+\?/i, w: 4, reason: 'Interrogative question' },
    { re: /\bdo\s+you\s+(not\s+)?(know|understand|believe)\b/i, w: 3, reason: 'Do you know / believe…?' }
  ]
};

/**
 * Score a verse text against all color rules, applying learned boosts/demotes.
 * Returns sorted array of { colorId, score, reasons[] }
 */
export async function analyzeVerse(text) {
  if (!text || typeof text !== 'string') return [];

  const model = await getLearningModel();
  const boosts = model.boosts || {};
  const demotes = model.demotes || {};

  const scores = {};

  for (const [colorId, rules] of Object.entries(BASE_RULES)) {
    let score = 0;
    const reasons = [];
    for (const rule of rules) {
      if (rule.re.test(text)) {
        let w = rule.w;
        // Apply learning
        const key = `${colorId}::${rule.reason}`;
        if (boosts[key]) w += boosts[key];
        if (demotes[key]) w -= demotes[key];
        if (w > 0) {
          score += w;
          reasons.push(rule.reason);
        }
      }
    }
    // Extra: whole-word boosts from free-form learning
    const freeKey = `free::${colorId}`;
    if (boosts[freeKey]) score += boosts[freeKey] * 0.5;

    if (score > 0) {
      scores[colorId] = { colorId, score, reasons: [...new Set(reasons)] };
    }
  }

  return Object.values(scores)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5); // top 5
}

/**
 * Record user feedback so future suggestions improve.
 * action: 'accept' | 'reject'
 */
export async function recordFeedback(colorId, reasons, action) {
  const model = await getLearningModel();
  if (!model.boosts) model.boosts = {};
  if (!model.demotes) model.demotes = {};

  for (const reason of (reasons || [])) {
    const key = `${colorId}::${reason}`;
    if (action === 'accept') {
      model.boosts[key] = (model.boosts[key] || 0) + 1;
      if (model.demotes[key]) model.demotes[key] = Math.max(0, model.demotes[key] - 1);
    } else if (action === 'reject') {
      model.demotes[key] = (model.demotes[key] || 0) + 1;
      if (model.boosts[key]) model.boosts[key] = Math.max(0, model.boosts[key] - 1);
    }
  }

  // Also a free-form boost for the color itself
  const freeKey = `free::${colorId}`;
  if (action === 'accept') {
    model.boosts[freeKey] = (model.boosts[freeKey] || 0) + 0.5;
  } else {
    model.demotes[freeKey] = (model.demotes[freeKey] || 0) + 0.5;
  }

  await saveLearningModel(model);
}

export function getColorMeta(id) {
  const base = COLOR_MAP[id];
  if (!base) return null;
  // Always recompute pure black/white for maximum legibility
  return {
    ...base,
    text: contrastTextColor(base.hex)
  };
}

export function allColors() {
  return COLORS.map(c => ({
    ...c,
    text: contrastTextColor(c.hex)
  }));
}

function clipQuote(s, max) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + '…';
}

function paintReason(colorId, quoted, why) {
  const meta = COLOR_MAP[colorId];
  const name = meta ? `${meta.label} · ${meta.meaning}` : colorId;
  return `${name} · “${clipQuote(quoted, 48)}” — ${why}`;
}

/**
 * Word-level color suggestions for one verse.
 * Named subject tokens and speech frames only. Payload after a frame is left alone.
 * Every span has a reason that quotes this verse. No reason → no span.
 * Does not write highlights.
 */
export function suggestWordSpans(text) {
  if (!text || typeof text !== 'string') return [];
  const spans = [];
  const used = new Array(text.length).fill(false);

  function addSpan(start, end, colorId, reason) {
    if (start < 0 || end <= start || end > text.length || !reason) return;
    for (let i = start; i < end; i++) {
      if (used[i]) return;
    }
    for (let i = start; i < end; i++) used[i] = true;
    spans.push({ start, end, colorId, reason });
  }

  function findAll(re) {
    const out = [];
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
    const r = new RegExp(re.source, flags);
    let m;
    while ((m = r.exec(text)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
      if (m[0].length === 0) r.lastIndex++;
    }
    return out;
  }

  const speech = [
    { re: /\bthus saith the LORD\b/gi, why: 'speech frame only; words after it stay unpainted' },
    { re: /\bsaith the LORD\b/gi, why: 'speech frame only; words after it stay unpainted' },
    { re: /\bthe LORD(?:\s+\w+){0,2}?\s+(?:called|spake|spoke|said|saith)\b/gi, why: 'speech frame only; words after it stay unpainted' },
    { re: /\band\s+spake\s+unto\s+him\b/gi, why: 'speech frame only; not the message that follows' },
    { re: /\bthe word of the LORD\b/gi, why: 'names the speech, not the payload' },
    { re: /\bGod\s+said\b/gi, why: 'speech frame only; words after it stay unpainted' },
    { re: /\bthe LORD\s+said\b/gi, why: 'speech frame only; words after it stay unpainted' }
  ];
  for (const rule of speech) {
    for (const hit of findAll(rule.re)) {
      addSpan(hit.start, hit.end, 'blue', paintReason('blue', hit.text, rule.why));
    }
  }

  for (const hit of findAll(/\bsaying\b/gi)) {
    const before = text.slice(Math.max(0, hit.start - 80), hit.start);
    if (/\b(said|saith|spake|spoke|called|saying)\b/i.test(before) ||
        /\b(LORD|God|LORD God)\b/.test(before)) {
      addSpan(hit.start, hit.end, 'blue', paintReason('blue', hit.text, 'hinge after a speech verb — not the quote body'));
    }
  }

  const named = [
    { id: 'red', re: /\bjesus\s+(said|answered|replied|spake|spoke|saith)\b/gi, why: 'Jesus-speech frame; not the rest of the line' },
    { id: 'red', re: /\bverily,?\s+verily\b/gi, why: 'Jesus’ speech marker in this wording' },
    { id: 'red', re: /\bverily\s+I\s+say\s+unto\s+you\b/gi, why: 'Jesus’ speech marker in this wording' },
    { id: 'yellow', re: /\bholy\s+ghost\b/gi, why: 'named Holy Ghost in this verse' },
    { id: 'yellow', re: /\bholy\s+spirit\b/gi, why: 'named Holy Spirit in this verse' },
    { id: 'yellow', re: /\bspirit\s+of\s+(?:god|the\s+lord|the\s+living\s+god)\b/gi, why: 'Spirit named with God / the LORD' },
    { id: 'yg', re: /\bparable\b/gi, why: 'the verse names a parable' },
    { id: 'yg', re: /\blike\s+unto\b/gi, why: 'figure marker only; image words stay unpainted' },
    { id: 'brown', re: /\b(firmament|begat|selah|ephod|teraphim|shibboleth)\b/gi, why: 'uncommon KJV word — look-up color' },
    { id: 'tan', re: /\bgreat\s+tribulation\b/gi, why: 'named great tribulation' },
    { id: 'tan', re: /\btribulation\b/gi, why: 'the word tribulation is in this verse' },
    { id: 'lblue', re: /\b(prophesy|prophecy|prophet)\b/gi, why: 'prophecy word named here' },
    { id: 'aqua', re: /\bcaught\s+up\b/gi, why: 'caught up — rapture-color token only' },
    { id: 'aqua', re: /\bmeet\s+the\s+lord\s+in\s+the\s+air\b/gi, why: 'meet the Lord in the air named here' },
    { id: 'pink', re: /\bantichrist\b/gi, why: 'antichrist named here' },
    { id: 'pink', re: /\bman\s+of\s+sin\b/gi, why: 'man of sin named here' },
    { id: 'pink', re: /\bson\s+of\s+perdition\b/gi, why: 'son of perdition named here' },
    { id: 'grey', re: /\b(satan|devil|the\s+tempter)\b/gi, why: 'the adversary named here' }
  ];
  for (const rule of named) {
    for (const hit of findAll(rule.re)) {
      addSpan(hit.start, hit.end, rule.id, paintReason(rule.id, hit.text, rule.why));
    }
  }

  if (/\?/.test(text)) {
    for (const hit of findAll(/\b(why|how|what|who|where|when|whom)\b/gi)) {
      addSpan(hit.start, hit.end, 'violet', paintReason('violet', hit.text, 'question word in a verse that asks'));
    }
  }

  spans.sort((a, b) => a.start - b.start);
  return spans;
}

/**
 * One-line reason when tap finds no paintable span. Quotes this verse. Not a lesson.
 */
export function explainNoSuggestion(text) {
  const clip = clipQuote(text, 56);
  if (!clip) return 'No word-level suggestions. Nothing to keep.';
  if (/\bsaying\b/i.test(text) && !/\b(said|saith|spake|LORD|God)\b/i.test(text)) {
    return `No span in “${clip}” — “saying” here is not a speech-frame hinge.`;
  }
  if (/\bspirit\b/i.test(text) && !/\bholy\s+(ghost|spirit)\b/i.test(text) && !/\bspirit\s+of\s+(god|the\s+lord)\b/i.test(text)) {
    return `No span in “${clip}” — “spirit” is not marked unless Holy Ghost / Spirit of God.`;
  }
  if (/\bbeast\b/i.test(text) && !/\bantichrist\b/i.test(text)) {
    return `No span in “${clip}” — “beast” alone is not painted (dual use).`;
  }
  return `No named subject token or speech frame in “${clip}”. Highlights unchanged.`;
}
