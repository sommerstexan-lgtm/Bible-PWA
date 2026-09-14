/* then-kind-now.js – Offline application prompts only. v6.30.0
   Questions, not answers. No network. No sermon text.
   Kind is taken from words on the verse, or we show no kind.
*/

function has(text, re) {
  return re.test(text || '');
}

/**
 * Classify the verse from its own wording.
 * Returns { id, label, why } or null if nothing is clear.
 */
export function kindOfVerse(text, bookId) {
  const t = String(text || '');
  if (has(t, /\b(saith the lord|the lord (said|spake|spoke|called)|thus saith|god said)\b/i)) {
    return { id: 'speech', label: 'Divine speech / command', why: 'the verse reports God speaking' };
  }
  if (has(t, /\b(burnt offering|meal offering|meat offering|sin offering|peace offering|trespass offering|guilt offering|drink offering|wave offering|heave offering|freewill offering)\b/i)) {
    return { id: 'offering', label: 'Ritual offering law', why: 'an offering is named' };
  }
  if (has(t, /\b(offering|sacrifice|altar|blood|atonement)\b/i)) {
    return { id: 'sacrifice', label: 'Sacrifice / altar law', why: 'offering, altar, or blood is in the verse' };
  }
  if (has(t, /\b(holy convocation|sabbath|feast|passover|pentecost|atonement)\b/i)) {
    return { id: 'calendar', label: 'Holy day / assembly', why: 'a feast, sabbath, or convocation is named' };
  }
  if (has(t, /\b(clean|unclean|leprosy|issue|purify|defile)\b/i)) {
    return { id: 'purity', label: 'Purity law', why: 'clean / unclean language is in the verse' };
  }
  if (has(t, /\b(thou shalt|you shall|ye shall|shall not)\b/i)) {
    return { id: 'command', label: 'Command', why: 'the verse uses shall / shall not' };
  }
  if (has(t, /\b(parable|like unto|is like)\b/i)) {
    return { id: 'figure', label: 'Figure / comparison', why: 'likeness language is in the verse' };
  }
  if (bookId === 'lev' && has(t, /\b(priest|aaron|tabernacle|congregation)\b/i)) {
    return { id: 'priest', label: 'Priestly instruction', why: 'priest or tabernacle is in the verse' };
  }
  return null;
}

export function buildThenKindNow({ text, bookId, bookName, chapter, verse, purpose, themes }) {
  const kind = kindOfVerse(text, bookId);
  const ref = `${bookName || bookId} ${chapter}:${verse}`;
  const themeLine = (themes && themes.length) ? themes.slice(0, 3).join(', ') : '';

  const thenQs = [
    `In ${bookName || 'this book'}, who first heard these words, and what were they being told to do?`,
    purpose ? `How does this verse sit under the book’s purpose: “${purpose}”` : `What was happening in Israel when this was given?`
  ];
  if (themeLine) thenQs.push(`Which of these book themes, if any, is this verse actually doing: ${themeLine}?`);

  const kindQs = kind
    ? [
        `This verse looks like: ${kind.label} (${kind.why}). Does the wording agree?`,
        'If you stripped the later chapter title, would you still call it that kind of text?'
      ]
    : [
        'What kind of text is this on its own words (law, speech, story, warning, promise)?',
        'Do not name a kind you cannot point to in the verse.'
      ];

  const nowQs = [
    'What in this verse is bound to that time and place, and what still describes God or His people?',
    'If you applied this today, what would you be obeying — the words themselves, or an idea you added?',
    'What would it look like to take this verse seriously without turning it into a slogan?'
  ];
  if (kind && kind.id === 'offering') {
    nowQs.unshift('An offering then was brought as God specified. What would “bring what He asked, not what I prefer” look like now — without inventing a new ritual?');
  }

  return { ref, text, kind, thenQs, kindQs, nowQs };
}
