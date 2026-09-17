/* topics-search.js – Step B pack lookup. KJV Study PWA v6.41.0
   Verse references only. No commentary.
*/

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[“”"'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function packTopicCount(pack) {
  if (!pack || !Array.isArray(pack.topics)) return 0;
  return pack.topics.length;
}

/**
 * Resolve typed text against a loaded topical pack.
 * Exact name first, then heading starts-with, then whole heading token.
 * Letters inside another word (east in Breastplate / Feast) do not match.
 */
export function lookupPackTopics(query, pack, limit = 8) {
  const q = norm(query);
  if (!q || q.length < 2 || !pack || !Array.isArray(pack.topics)) return [];
  const exact = [];
  const starts = [];
  const tokenHits = [];
  for (const t of pack.topics) {
    const n = norm(t.name);
    if (!n || !Array.isArray(t.refs) || !t.refs.length) continue;
    const item = {
      id: 'pack:' + n.replace(/\s+/g, '_'),
      name: t.name,
      refs: t.refs.slice(0, 24),
      fromPack: true
    };
    if (n === q) exact.push(item);
    else if (n.startsWith(q + ' ') || n.startsWith(q)) starts.push(item);
    else if (n.split(' ').some((tok) => tok === q)) tokenHits.push(item);
    if (exact.length + starts.length >= limit) break;
  }
  const out = [];
  const seen = new Set();
  for (const row of exact.concat(starts, tokenHits)) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}
