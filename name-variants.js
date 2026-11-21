/* name-variants.js – User-approved KJV name/place alternate spellings.
   Only groups the user has explicitly confirmed are stored.
   No automatic assumptions.
*/

const STORE = 'nameVariants';

let groups = []; // [{ id, spellings: [string], verses: [string], note: string }]

async function load() {
  try {
    const raw = localStorage.getItem(STORE);
    groups = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(groups)) groups = [];
  } catch (_) {
    groups = [];
  }
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(groups));
  } catch (_) {}
}

export async function initNameVariants() {
  await load();
}

/** Find any group that contains the exact spelling (case-insensitive). */
export function findGroupFor(spelling) {
  const s = String(spelling || '').trim().toLowerCase();
  if (!s) return null;
  return groups.find(g => g.spellings.some(sp => sp.toLowerCase() === s)) || null;
}

/** All other spellings in the group, excluding the one searched. */
export function otherSpellings(group, searched) {
  const s = String(searched || '').trim().toLowerCase();
  return (group?.spellings || []).filter(sp => sp.toLowerCase() !== s);
}

/** Add a new spelling to an existing group or create a new group.
    Caller must have already verified the link.
*/
export function addSpelling({ spelling, verses, note, existingGroupId }) {
  const sp = String(spelling || '').trim();
  if (!sp) return null;
  const versesArr = Array.isArray(verses) ? verses.filter(Boolean) : [];
  if (existingGroupId) {
    const g = groups.find(x => x.id === existingGroupId);
    if (g && !g.spellings.some(x => x.toLowerCase() === sp.toLowerCase())) {
      g.spellings.push(sp);
      if (versesArr.length) g.verses = Array.from(new Set([...(g.verses || []), ...versesArr]));
      if (note) g.note = note;
      save();
      return g;
    }
  }
  const id = 'nv-' + Date.now();
  const newG = { id, spellings: [sp], verses: versesArr, note: note || '' };
  groups.push(newG);
  save();
  return newG;
}

export function removeSpelling(groupId, spelling) {
  const g = groups.find(x => x.id === groupId);
  if (!g) return;
  g.spellings = g.spellings.filter(sp => sp.toLowerCase() !== String(spelling).toLowerCase());
  if (g.spellings.length === 0) {
    groups = groups.filter(x => x.id !== groupId);
  }
  save();
}

export function removeGroup(groupId) {
  groups = groups.filter(x => x.id !== groupId);
  save();
}

export function allGroups() {
  return groups.slice();
}
