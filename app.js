/* app.js – Main application controller. KJV Study PWA v6.24.0
   Client-side only. Personal data never leaves the device.
   Highlight system: solid background fills + mandatory pure black/white contrast text.
*/

import * as storage from './storage.js';
import * as bible from './bible.js';
import * as analyze from './analyze.js';
import { getChapterContext } from './context-data.js';

// ---------- Password gate (client-side only) ----------
const APP_PASSWORD = 'KJV-Study-Private';

function checkPassword() {
  if (localStorage.getItem('kjv-unlocked') === 'yes') return true;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay center';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px;text-align:center">
        <h2 style="margin-bottom:1rem">KJV Study</h2>
        <p style="margin-bottom:1.2rem;color:var(--text-dim);font-size:0.95em">
          Private study app. Enter password to continue.
        </p>
        <input type="password" id="pw-input" placeholder="Password"
          style="width:100%;padding:0.85rem;font-size:1.15rem;border-radius:8px;
                 border:1px solid var(--border);background:var(--bg);color:var(--text);
                 margin-bottom:1rem;text-align:center">
        <button type="button" id="pw-go"
          style="width:100%;min-height:52px;font-size:1.1rem;font-weight:600;
                 background:var(--accent);color:#111;border:none;border-radius:8px">
          Open
        </button>
        <p id="pw-err" style="color:var(--danger);margin-top:0.8rem;display:none">
          Incorrect password
        </p>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#pw-input');
    const go = overlay.querySelector('#pw-go');
    const err = overlay.querySelector('#pw-err');

    function tryUnlock() {
      if (input.value === APP_PASSWORD) {
        localStorage.setItem('kjv-unlocked', 'yes');
        overlay.remove();
        resolve(true);
      } else {
        err.style.display = 'block';
        input.value = '';
        input.focus();
      }
    }

    go.onclick = tryUnlock;
    input.onkeydown = (e) => { if (e.key === 'Enter') tryUnlock(); };
    setTimeout(() => input.focus(), 200);
  });
}

// ---------- State ----------
let books = [];
let currentBookId = null;
let currentChapter = 1;
let settings = { fontSize: 1.35, lineHeight: 1.75, highContrast: false };
let navStack = []; // origin stack for Search + Cross-ref back navigation

// ---------- DOM helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function showOverlay(html, { center = false } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay' + (center ? ' center' : '');
  overlay.innerHTML = html;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay(overlay);
  });
  document.body.appendChild(overlay);
  return overlay;
}

function closeOverlay(overlay) {
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
}

function applySettings() {
  document.documentElement.style.setProperty('--font-size', settings.fontSize + 'rem');
  document.documentElement.style.setProperty('--line-height', settings.lineHeight);
  document.body.classList.toggle('high-contrast', !!settings.highContrast);
}

// ---------- Boot ----------
async function init() {
  // Password gate first
  await checkPassword();

  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      // Reload once when a new SW takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        // Don't wipe the UI mid-import / mid-note
        if (document.querySelector('.overlay')) return;
        refreshing = true;
        location.reload();
      });

      // updateViaCache:'none' + version query force iOS/Safari to re-fetch sw.js
      const reg = await navigator.serviceWorker.register('./sw.js?v=6.24.0', {
        updateViaCache: 'none'
      });
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            nw.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
      try { await reg.update(); } catch (_) {}
    } catch (e) {
      console.warn('SW registration failed (normal on file://)', e);
    }
  }

  settings = await storage.getSettings();
  applySettings();

  books = await bible.loadSampleIfEmpty();
  const last = await storage.getLastPosition();
  if (last && books.find(b => b.id === last.bookId)) {
    currentBookId = last.bookId;
    currentChapter = last.chapter || 1;
  } else if (books.length) {
    currentBookId = books[0].id;
    currentChapter = 1;
  }

  renderShell();
  if (currentBookId) {
    await renderChapter(currentBookId, currentChapter);
  } else {
    showEmptyState();
  }
}

function renderShell() {
  const app = $('#app');
  app.innerHTML = `
    <div id="chrome" class="chrome">
      <header class="chrome-header">
        <button type="button" id="btn-nav" title="Books" aria-label="Books">☰</button>
        <div class="title" id="header-title">KJV Study</div>
        <button type="button" id="btn-search" title="Search" aria-label="Search">Search</button>
        <button type="button" id="btn-menu" title="Menu" aria-label="Menu">Menu</button>
      </header>
      <div class="toolbar" id="toolbar">
        <button type="button" id="btn-font-down" aria-label="Smaller text">A−</button>
        <button type="button" id="btn-font-up" aria-label="Larger text">A+</button>
        <button type="button" id="btn-colors" title="Color Index">Colors</button>
        <button type="button" id="btn-review" title="Review by color">Review</button>
        <button type="button" id="btn-help" title="Help">Help</button>
        <button type="button" id="btn-dict" title="Dictionary">Dict</button>
        <button type="button" id="btn-research" title="Commentary / Research">Research</button>
        <button type="button" id="btn-context" title="Book / Chapter Context">Context</button>
        <span class="spacer"></span>
        <button type="button" id="btn-prev-ch" aria-label="Previous chapter">◀</button>
        <button type="button" id="btn-next-ch" aria-label="Next chapter">▶</button>
      </div>
      <div class="version-bar">v6.24.0</div>
    </div>
    <button type="button" id="chrome-reveal" class="chrome-reveal" aria-label="Show controls" hidden>☰ Controls</button>
    <button type="button" id="nav-back" class="nav-back" aria-label="Back to previous verse" hidden>← Back</button>
    <main id="main"></main>
  `;

  $('#btn-nav').onclick = openBookNav;
  $('#btn-search').onclick = openSearch;
  $('#btn-menu').onclick = openMenu;
  $('#btn-font-down').onclick = () => changeFont(-0.1);
  $('#btn-font-up').onclick = () => changeFont(0.1);
  $('#btn-colors').onclick = openColorIndex;
  $('#btn-review').onclick = openReviewByColor;
  $('#btn-help').onclick = openHelp;
  $('#btn-dict').onclick = () => {
    let q = '';
    if (pendingSelection && pendingSelection.text) {
      q = pendingSelection.text.trim();
    } else {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) q = sel.toString().trim();
    }
    if (q) q = q.split(/\s+/)[0].replace(/[^a-zA-Z'-]/g, '');
    openDictionary(q);
  };
  $('#btn-research').onclick = () => openResearch();
  $('#btn-context').onclick = () => openContext();
  $('#btn-prev-ch').onclick = () => changeChapter(-1);
  $('#btn-next-ch').onclick = () => changeChapter(1);
  $('#chrome-reveal').onclick = () => showChrome();
  $('#nav-back').onclick = () => goNavBack();

  installChromeAutoHide();
  updateNavBackButton();
}

let chromeHidden = false;
let lastScrollTop = 0;

function showChrome() {
  const chrome = document.getElementById('chrome');
  const reveal = document.getElementById('chrome-reveal');
  if (!chrome) return;
  chrome.classList.remove('chrome-hidden');
  document.body.classList.remove('chrome-is-hidden');
  if (reveal) reveal.hidden = true;
  chromeHidden = false;
}

function hideChrome() {
  // Never hide while an overlay panel is open
  if (document.querySelector('.overlay')) return;
  const chrome = document.getElementById('chrome');
  const reveal = document.getElementById('chrome-reveal');
  if (!chrome) return;
  chrome.classList.add('chrome-hidden');
  document.body.classList.add('chrome-is-hidden');
  if (reveal) reveal.hidden = false;
  chromeHidden = true;
}


async function goNavBack() {
  if (!navStack.length) return;
  const prev = navStack.pop();
  updateNavBackButton();
  await renderChapter(prev.bookId, prev.chapter, {
    scrollToKey: prev.verseKey || null,
    preserveScroll: prev.scrollTop
  });
}

function updateNavBackButton() {
  const btn = document.getElementById('nav-back');
  if (!btn) return;
  if (navStack.length) {
    btn.hidden = false;
    const top = navStack[navStack.length - 1];
    const label = top.label || (top.bookId + ' ' + top.chapter);
    btn.textContent = '← Back' + (label ? ' · ' + label : '');
  } else {
    btn.hidden = true;
  }
}

/** Nearest verse currently near the top of the main scroll viewport (for Search origin). */
function getNearestVerseKey() {
  const main = document.getElementById('main');
  if (!main) return null;
  const verses = main.querySelectorAll('.verse[data-key]');
  if (!verses.length) return null;
  const mainTop = main.getBoundingClientRect().top;
  let best = null;
  let bestDist = Infinity;
  for (const el of verses) {
    const dist = Math.abs(el.getBoundingClientRect().top - mainTop - 8);
    if (dist < bestDist) {
      bestDist = dist;
      best = el.dataset.key;
    }
  }
  return best;
}

function installChromeAutoHide() {
  const main = document.getElementById('main');
  if (!main) return;
  if (main._chromeBound) return;
  main._chromeBound = true;
  lastScrollTop = main.scrollTop || 0;

  // ANY scroll (up or down) hides controls. Only the Controls button shows them.
  main.addEventListener('scroll', () => {
    const st = main.scrollTop;
    const delta = Math.abs(st - lastScrollTop);
    lastScrollTop = st;
    if (delta < 4) return; // ignore tiny jitter
    if (!chromeHidden) hideChrome();
  }, { passive: true });
  // No click-to-show on verse background — Controls button only.
}


async function changeFont(delta) {
  settings.fontSize = Math.max(0.95, Math.min(2.4, +(settings.fontSize + delta).toFixed(2)));
  applySettings();
  await storage.saveSettings(settings);
}

async function changeChapter(dir) {
  const book = books.find(b => b.id === currentBookId);
  if (!book) {
    alert('No book loaded.');
    return;
  }
  const total = book.chapters.length;
  let ch = currentChapter + dir;
  if (ch < 1) {
    // optional: soft feedback
    return;
  }
  if (ch > total) {
    return;
  }
  currentChapter = ch;
  await renderChapter(currentBookId, currentChapter);
  await storage.saveLastPosition({ bookId: currentBookId, chapter: currentChapter });
  updateChapterButtons();
}

function updateChapterButtons() {
  const book = books.find(b => b.id === currentBookId);
  const prev = document.getElementById('btn-prev-ch');
  const next = document.getElementById('btn-next-ch');
  if (!prev || !next) return;
  if (!book) {
    prev.disabled = true;
    next.disabled = true;
    return;
  }
  prev.disabled = currentChapter <= 1;
  next.disabled = currentChapter >= book.chapters.length;
}

// ---------- Chapter rendering ----------


// ---------- Highlight range helpers (v3.1) ----------
function normalizeRanges(raw, textLen) {
  if (!raw) return [];
  if (raw._legacyColors) {
    return raw._legacyColors.map(c => ({ color: c, start: 0, end: textLen }));
  }
  if (Array.isArray(raw) && raw.length && typeof raw[0] === "string") {
    return raw.map(c => ({ color: c, start: 0, end: textLen }));
  }
  const ranges = Array.isArray(raw) ? raw : [];
  return ranges
    .filter(r => r && r.color != null)
    .map(r => ({
      color: r.color,
      start: Math.max(0, Math.min(textLen, +r.start || 0)),
      end: Math.max(0, Math.min(textLen, +r.end || textLen))
    }))
    .filter(r => r.end > r.start);
}

/**
 * Build verse HTML with solid highlight fills + optional Tap-a-word Strong's wrappers.
 * When enableTap is true, every alphabetic word is wrapped in .tap-word so it can be
 * tapped for Strong's. Outlines appear ONLY on user-marked words (.marked):
 *   - marked, no highlight → soft fixed accent (CSS --tap-outline-default)
 *   - marked + highlight → brighter version of that highlight color (never disappears)
 * Marks are per occurrence (character start offset). Text offsets stay intact for selection.
 * @param {Set<number>|number[]} markedStarts – start offsets of user-marked words in this verse
 */
function buildColoredHtml(text, ranges, enableTap = false, markedStarts = null) {
  if (!ranges.length && !enableTap) return escapeHtml(text);
  const marked = markedStarts instanceof Set
    ? markedStarts
    : new Set(Array.isArray(markedStarts) ? markedStarts : []);
  const len = text.length;
  // Last range wins on any overlapping pixels (apply logic punches holes first)
  const cover = Array.from({ length: len }, () => null);
  for (const r of ranges) {
    for (let i = r.start; i < r.end; i++) {
      if (i >= 0 && i < len) cover[i] = r.color;
    }
  }
  let html = "";
  let i = 0;
  while (i < len) {
    const col = cover[i];
    let j = i + 1;
    while (j < len && cover[j] === col) j++;
    const rawSlice = text.slice(i, j);
    if (enableTap) {
      // Split run into words (letter + optional apostrophes) and non-word runs
      const wordRe = /[A-Za-z][A-Za-z']*/g;
      let last = 0;
      let m;
      while ((m = wordRe.exec(rawSlice)) !== null) {
        if (m.index > last) {
          html += escapeHtml(rawSlice.slice(last, m.index));
        }
        const word = m[0];
        const esc = escapeHtml(word);
        const absStart = i + m.index;
        const isMarked = marked.has(absStart);
        const markCls = isMarked ? ' marked' : '';
        if (col) {
          const meta = analyze.getColorMeta(col);
          const bg = (meta && meta.hex) ? meta.hex : "#666666";
          const fg = (meta && meta.text) ? meta.text : analyze.contrastTextColor(bg);
          // Outline color only needed when marked; brighter version of highlight
          const outlineStyle = isMarked
            ? `;--tap-outline:${analyze.outlineColorForHighlight(bg)}`
            : '';
          html += `<span class="hl tap-word${markCls}" data-color="${col}" data-word="${esc}" data-start="${absStart}" style="background-color:${bg};color:${fg};-webkit-text-fill-color:${fg}${outlineStyle}">${esc}</span>`;
        } else {
          html += `<span class="tap-word${markCls}" data-word="${esc}" data-start="${absStart}">${esc}</span>`;
        }
        last = m.index + word.length;
      }
      if (last < rawSlice.length) html += escapeHtml(rawSlice.slice(last));
    } else {
      const slice = escapeHtml(rawSlice);
      if (col) {
        const meta = analyze.getColorMeta(col);
        // True solid background fill + mandatory pure black/white text for max contrast
        const bg = (meta && meta.hex) ? meta.hex : "#666666";
        const fg = (meta && meta.text) ? meta.text : analyze.contrastTextColor(bg);
        html += `<span class="hl" data-color="${col}" style="background-color:${bg};color:${fg};-webkit-text-fill-color:${fg}">${slice}</span>`;
      } else {
        html += slice;
      }
    }
    i = j;
  }
  return html;
}

function uniqueColors(ranges) {
  const seen = [];
  for (const r of ranges) {
    if (!seen.includes(r.color)) seen.push(r.color);
  }
  return seen;
}


let pendingSelection = null; // { key, start, end, text } — never cleared by a failed capture


/**
 * Locate `selected` inside `plain`, preferring the occurrence nearest to approxStart.
 * range.toString() is the source of truth for what the user highlighted.
 */
function locateSelected(plain, selected, approxStart) {
  if (!selected || !plain) return null;
  const len = selected.length;
  if (len === 0) return null;
  if (approxStart >= 0 && plain.slice(approxStart, approxStart + len) === selected) {
    return { start: approxStart, end: approxStart + len };
  }
  let best = -1;
  let bestDist = Infinity;
  let from = 0;
  while (from <= plain.length - len) {
    const idx = plain.indexOf(selected, from);
    if (idx < 0) break;
    const dist = Math.abs(idx - approxStart);
    if (dist < bestDist) {
      bestDist = dist;
      best = idx;
      if (dist === 0) break;
    }
    from = idx + 1;
  }
  if (best < 0) return null;
  return { start: best, end: best + len };
}

/** Strip a leading verse number that iOS often includes in the selection string. */
function stripLeadingVerseNum(selected) {
  if (!selected) return selected;
  // "1 In", "12 In", "1In", "1\nIn", " 1  In"
  return selected.replace(/^\s*\d+\s*/, '');
}


/**
 * Map the live DOM selection to start/end offsets inside .verse-text.
 *
 * Method: clamp the selection range to .verse-text, then measure character
 * offsets from the text nodes only. No string search. This is the reliable
 * path for first-word / first-two-words / full-verse on iOS.
 */
function getSelectionOffsets(textEl) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount || !textEl) return null;

  let range;
  try {
    range = sel.getRangeAt(0);
  } catch (_) {
    return null;
  }

  const verseEl = textEl.closest('.verse');
  const ancestor = range.commonAncestorContainer;
  const insideText = textEl === ancestor || textEl.contains(ancestor);
  const insideVerse = verseEl && (verseEl === ancestor || verseEl.contains(ancestor));
  if (!insideText && !insideVerse) return null;

  const plain = textEl.textContent || '';
  if (!plain) return null;

  // Range that covers the entire verse text
  const textRange = document.createRange();
  try {
    textRange.selectNodeContents(textEl);
  } catch (_) {
    return null;
  }

  // Clamp selection to textEl boundaries (drops verse-num and anything outside)
  const clamped = range.cloneRange();
  try {
    if (clamped.compareBoundaryPoints(Range.START_TO_START, textRange) < 0) {
      clamped.setStart(textRange.startContainer, textRange.startOffset);
    }
    if (clamped.compareBoundaryPoints(Range.END_TO_END, textRange) > 0) {
      clamped.setEnd(textRange.endContainer, textRange.endOffset);
    }
  } catch (_) {
    return null;
  }

  // If clamp left an empty range, nothing usable inside verse text
  if (clamped.collapsed) return null;

  let selected = '';
  try {
    selected = clamped.toString();
  } catch (_) {
    return null;
  }
  if (!selected) return null;

  // Character offset from start of textEl to start of clamped range
  let start = 0;
  try {
    const pre = document.createRange();
    pre.selectNodeContents(textEl);
    pre.setEnd(clamped.startContainer, clamped.startOffset);
    start = pre.toString().length;
  } catch (_) {
    // Fallback: walk text nodes
    try {
      if (clamped.startContainer.nodeType === Node.TEXT_NODE && textEl.contains(clamped.startContainer)) {
        const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
        let acc = 0;
        while (walker.nextNode()) {
          const n = walker.currentNode;
          if (n === clamped.startContainer) {
            acc += Math.min(n.nodeValue.length, clamped.startOffset);
            break;
          }
          acc += n.nodeValue.length;
        }
        start = acc;
      }
    } catch (__) {
      start = 0;
    }
  }

  start = Math.max(0, Math.min(plain.length, start));
  let end = start + selected.length;
  end = Math.max(start, Math.min(plain.length, end));

  // If measurement drifted (iOS quirks), re-sync by locating selected text near start
  const slice = plain.slice(start, end);
  if (slice !== selected) {
    const located = locateSelected(plain, selected, start);
    if (located) {
      start = located.start;
      end = located.end;
    } else {
      // Strip verse-num leftovers from selected string and try again
      const trimmed = stripLeadingVerseNum(selected).trim();
      if (trimmed && trimmed !== selected) {
        const loc2 = locateSelected(plain, trimmed, start);
        if (loc2) {
          start = loc2.start;
          end = loc2.end;
          selected = trimmed;
        }
      }
    }
  }

  if (end <= start) return null;

  return {
    start,
    end,
    text: plain.slice(start, end),
    plainLen: plain.length
  };
}

function captureSelectionFromVerse(key) {
  const verseEl = document.getElementById('v-' + key.replace(/\./g, '-'));
  if (!verseEl) return null;
  const textEl = verseEl.querySelector('.verse-text');
  if (!textEl) return null;
  const result = getSelectionOffsets(textEl);
  if (!result) return null; // do not wipe pendingSelection on failure
  pendingSelection = { key, start: result.start, end: result.end, text: result.text };
  return pendingSelection;
}

function installSelectionWatchers(main) {
  // Save selection whenever it is non-empty. Never clear on collapse —
  // collapse happens the instant the user taps Color on mobile.
  const save = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    let node = sel.anchorNode;
    while (node && node !== main) {
      if (node.classList && node.classList.contains("verse") && node.dataset.key) {
        captureSelectionFromVerse(node.dataset.key);
        return;
      }
      node = node.parentNode;
    }
  };
  main.addEventListener("mouseup", save);
  main.addEventListener("touchend", save, { passive: true });
  document.addEventListener("selectionchange", () => {
    clearTimeout(installSelectionWatchers._t);
    installSelectionWatchers._t = setTimeout(save, 30);
  });
}

async function renderChapter(bookId, chapterNum, opts = {}) {
  const book = books.find(b => b.id === bookId);
  if (!book) return;
  const ch = book.chapters.find(c => c.number === chapterNum);
  if (!ch) return;

  currentBookId = bookId;
  currentChapter = chapterNum;
  const isSample = book.translation !== 'WEB' && book.id === 'gen' && (!book.chapters || book.chapters.length <= 2);
  $('#header-title').textContent = isSample
    ? `${book.name} ${chapterNum} (KJV sample)`
    : `${book.name} ${chapterNum}${book.translation ? ' (' + book.translation + ')' : ''}`;

  const main = $('#main');
  main.innerHTML = `
    <div class="chapter-header">${book.name} ${chapterNum}</div>
    <div id="xref-load-bar" style="padding:0.7rem 0.9rem;margin-bottom:0.5rem;background:var(--panel,#16213e);border-radius:10px">
      <div id="xref-load-status" style="font-size:1.05em;line-height:1.45;margin-bottom:0.55rem;color:var(--text-dim)">Checking…</div>
      <button type="button" id="btn-load-book-xrefs" style="min-height:52px;padding:0.6rem 1.1rem;font-weight:700;width:100%">
        Load Cross-References for ${book.name}
      </button>
    </div>`;

  const keys = ch.verses.map(v => bible.verseKey(bookId, chapterNum, v.number));
  const highlightMap = {};
  const noteMap = {};
  const xrefMap = {};
  const wordMarkMap = {};
  // Lexicon presence enables Tap-a-word wrappers (fully offline); outlines only on user marks
  const [lexPack] = await Promise.all([
    storage.getLexiconPack(),
    ...keys.map(async (k) => {
      const [hl, note, xrefs, shared, marks] = await Promise.all([
        storage.getHighlights(k),
        storage.getNote(k),
        storage.getCrossRefs(k),
        storage.findSharedNoteForVerse(k),
        storage.getWordMarks(k)
      ]);
      highlightMap[k] = hl;
      const hasPrivate = !!(note && String(note).trim());
      const hasShared = !!(shared && shared.body && String(shared.body).trim());
      noteMap[k] = hasPrivate || hasShared;
      const hasPersonalXref = Array.isArray(xrefs) && xrefs.length > 0;
      // Green indicator if personal refs OR built-in/loaded TSK data exists
      const hasTsk = !!(STARTER_TSK[k] && STARTER_TSK[k].length) || false;
      xrefMap[k] = hasPersonalXref || hasTsk;
      wordMarkMap[k] = marks;
    })
  ]);
  // Also mark verses that exist in the full TSK pack (if user has loaded it)
  try {
    const pack = await storage.getTskPack();
    if (pack && pack.verses) {
      for (const k of keys) {
        if (pack.verses[k] && pack.verses[k].length) xrefMap[k] = true;
      }
    }
  } catch (_) {}
  const enableTap = !!(lexPack && lexPack.entries);

  for (const v of ch.verses) {
    const key = bible.verseKey(bookId, chapterNum, v.number);
    const raw = highlightMap[key];
    const ranges = normalizeRanges(raw, v.text.length);
    // Persist migration if legacy
    if (raw && raw._legacyColors) {
      await storage.setHighlights(key, ranges);
    }

    const colors = uniqueColors(ranges);
    const verseEl = document.createElement('div');
    verseEl.className = 'verse';
    verseEl.dataset.key = key;
    verseEl.id = `v-${key.replace(/\./g, '-')}`;

    if (colors.length) {
      verseEl.classList.add('has-' + colors[0]);
    }

    const chips = colors.map(c => {
      const meta = analyze.getColorMeta(c);
      return `<span class="color-chip" style="background:${meta ? meta.hex : '#666'}" title="${meta ? meta.label : c}"></span>`;
    }).join('');

    const coloredText = buildColoredHtml(v.text, ranges, enableTap, wordMarkMap[key] || []);
    const noteCls = noteMap[key] ? ' has-content' : '';
    const xrefCls = xrefMap[key] ? ' has-content' : '';

    verseEl.innerHTML = `
      <span class="verse-num">${v.number}</span>
      <span class="verse-text">${coloredText}</span>
      <div class="color-chips">${chips}</div>
      <div class="verse-actions">
        <button type="button" data-act="analyze" data-key="${key}">Analyze</button>
        <button type="button" data-act="color" data-key="${key}">Color</button>
        <button type="button" data-act="note" data-key="${key}" class="${noteCls.trim()}">Note</button>
        <button type="button" data-act="xref" data-key="${key}" class="${xrefCls.trim()}">Cross-refs</button>
      </div>
    `;
    main.appendChild(verseEl);
  }


  // Wire "Load Cross-References for this book" — clear permanent states only
  const loadBtn = document.getElementById('btn-load-book-xrefs');
  const loadStatus = document.getElementById('xref-load-status');
  if (loadBtn && loadStatus) {
    const setLoadedUI = (count) => {
      loadStatus.innerHTML = `<span style="color:#2ecc71;font-weight:700">✓ Cross-references loaded for ${book.name}</span>` +
        (count ? `<br><span style="font-size:0.9em;color:var(--text-dim)">${count} verses in this book have links</span>` : '');
      loadBtn.textContent = '✓ Loaded for ' + book.name;
      loadBtn.disabled = true;
      loadBtn.style.background = '#1b7a3d';
      loadBtn.style.color = '#fff';
      loadBtn.style.border = '1px solid #2ecc71';
    };
    const setNotLoadedUI = () => {
      loadStatus.textContent = 'Not loaded yet. Tap the button once to load cross-references for this book. They will stay loaded.';
      loadBtn.disabled = false;
      loadBtn.textContent = 'Load Cross-References for ' + book.name;
      loadBtn.style.background = '';
      loadBtn.style.color = '';
      loadBtn.style.border = '';
    };

    (async () => {
      const pack = await storage.getTskPack();
      const loadedBooks = (pack && Array.isArray(pack.loadedBooks)) ? pack.loadedBooks : [];
      const isLoaded = loadedBooks.includes(bookId);
      let count = 0;
      const prefix = bookId + '.';
      if (pack && pack.verses) {
        for (const k of Object.keys(pack.verses)) {
          if (k.startsWith(prefix)) count++;
        }
      }
      // Starter-only does not count as "fully loaded by user"
      if (isLoaded) setLoadedUI(count);
      else setNotLoadedUI();
    })();

    loadBtn.onclick = async () => {
      loadBtn.disabled = true;
      loadStatus.textContent = 'Loading… please wait. Do not leave this page.';
      try {
        const count = await loadCrossRefsForBook(bookId, book.name);
        setLoadedUI(count);
        // Brief pause so the user sees the success state, then refresh greens
        setTimeout(() => {
          renderChapter(bookId, chapterNum, { preserveScroll: main.scrollTop });
        }, 900);
      } catch (err) {
        loadStatus.innerHTML = `<span style="color:#e57373;font-weight:700">Not completed.</span> ${escapeHtml(String(err.message || err))}`;
        loadBtn.disabled = false;
        loadBtn.textContent = 'Try again – Load Cross-References for ' + book.name;
      }
    };
  }

  // Event delegation
  // CRITICAL (iOS): selection collapses on button press. Snapshot on
  // touchstart/mousedown in capture phase BEFORE the collapse.
  const earlyCapture = (e) => {
    const btn = e.target.closest && e.target.closest('button[data-act="color"]');
    if (!btn) return;
    const key = btn.dataset.key;
    if (!key) return;
    captureSelectionFromVerse(key);
  };
  main.addEventListener('touchstart', earlyCapture, { capture: true, passive: true });
  main.addEventListener('mousedown', earlyCapture, { capture: true });

  main.onclick = async (e) => {
    // Tap-a-word Strong's: only when selection is collapsed (user tapped, not selected)
    const wordEl = e.target.closest && e.target.closest('.tap-word');
    if (wordEl && wordEl.dataset.word) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return; // user is selecting text for highlight
      e.preventDefault();
      e.stopPropagation();
      const verseEl = wordEl.closest('.verse');
      const start = wordEl.dataset.start != null ? +wordEl.dataset.start : null;
      openStrongsForWord(wordEl.dataset.word, verseEl ? verseEl.dataset.key : null, start);
      return;
    }

    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const key = btn.dataset.key;

    // Prefer already-captured selection. Only capture live if still selected —
    // do not clear pending when selection has already collapsed (mobile).
    if (!(pendingSelection && pendingSelection.key === key)) {
      captureSelectionFromVerse(key);
    }

    if (act === 'analyze') openAnalyze(key);
    else if (act === 'color') openColorPicker(key);
    else if (act === 'note') openNote(key);
    else if (act === 'xref') openCrossRefs(key);
  };

  installSelectionWatchers(main);
  // Re-enable chrome auto-hide on the (possibly new) main content
  const m = document.getElementById('main');
  if (m) m._chromeBound = false;
  installChromeAutoHide();

  if (opts.scrollToKey) {
    const el = document.getElementById('v-' + String(opts.scrollToKey).replace(/\./g, '-'));
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'instant' in window ? 'instant' : 'auto' });
    } else {
      main.scrollTop = 0;
    }
  } else if (typeof opts.preserveScroll === 'number') {
    main.scrollTop = opts.preserveScroll;
  } else {
    main.scrollTop = 0;
  }
  await storage.saveLastPosition({ bookId, chapter: chapterNum });
  updateChapterButtons();
  updateNavBackButton();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showEmptyState() {
  $('#main').innerHTML = `
    <div class="empty-state">
      <p><strong>No books loaded yet.</strong></p>
      <p>Use <strong>Menu → Import Book</strong> to load a book JSON,<br>
      or the included public-domain Genesis sample will appear after first load.</p>
      <p style="margin-top:1.5rem">This app never sends data anywhere.<br>All study data stays on this device only.</p>
    </div>
  `;
}

// ---------- Navigation ----------

async function openBookNav() {
  const loaded = new Map(books.map(b => [b.id, b]));

  function rowHtml(meta) {
    const b = loaded.get(meta.id);
    if (b) {
      return `<li class="book-row loaded" data-book="${meta.id}" data-name="${escapeHtml((b.name || meta.name).toLowerCase())}" data-id="${meta.id}">
        <div class="book-row-main">
          <strong>${escapeHtml(b.name || meta.name)}</strong>
          <span class="book-meta">${b.chapters.length} ch · Loaded</span>
        </div>
      </li>`;
    }
    return `<li class="book-row not-loaded" data-book="${meta.id}" data-name="${escapeHtml(meta.name.toLowerCase())}" data-id="${meta.id}">
      <div class="book-row-main">
        <strong style="color:var(--text-dim)">${escapeHtml(meta.name)}</strong>
        <span class="book-meta">Not loaded</span>
      </div>
      <button type="button" class="btn-import-book" data-book="${meta.id}" data-name="${escapeHtml(meta.name)}">Import</button>
    </li>`;
  }

  const ot = bible.CANONICAL_BOOKS.filter(b => b.testament === 'OT').map(rowHtml).join('');
  const nt = bible.CANONICAL_BOOKS.filter(b => b.testament === 'NT').map(rowHtml).join('');

  const overlay = showOverlay(`
    <div class="panel">
      <button class="close" type="button" aria-label="Close">×</button>
      <h2>Books</h2>
      <input type="search" id="book-search" placeholder="Search books (e.g. gen, matthew, 1 cor)…"
        style="width:100%;padding:0.7rem 0.85rem;font-size:1.05rem;border-radius:8px;border:1px solid var(--border);
               background:var(--bg);color:var(--text);margin-bottom:0.75rem;min-height:48px;box-sizing:border-box"
        autocomplete="off" enterkeyhint="search">
      <p id="book-search-hint" style="font-size:0.88em;color:var(--text-dim);margin-bottom:0.75rem;line-height:1.45">
        Canonical order. Tap a loaded book to open chapters. Use <strong>Import</strong> to load a JSON book file.
      </p>
      <div id="book-list">
        <h3 class="testament-heading" data-test="OT">Old Testament</h3>
        <ul class="nav-list" data-test="OT">${ot}</ul>
        <h3 class="testament-heading" data-test="NT">New Testament</h3>
        <ul class="nav-list" data-test="NT">${nt}</ul>
      </div>
      <div id="chapter-area" class="hidden">
        <h2 id="ch-title" style="margin-top:0.5rem"></h2>
        <div class="chapter-grid" id="ch-grid"></div>
        <button type="button" id="back-to-books" style="margin-top:1rem;width:100%">← Back to books</button>
      </div>
      <input type="file" id="nav-file-input" accept=".json,application/json" hidden>
    </div>
  `);

  $('.close', overlay).onclick = () => closeOverlay(overlay);
  $('#back-to-books', overlay).onclick = () => {
    $('#book-list', overlay).classList.remove('hidden');
    $('#chapter-area', overlay).classList.add('hidden');
    // restore search visibility
    const s = $('#book-search', overlay);
    if (s) s.style.display = '';
    const h = $('#book-search-hint', overlay);
    if (h) h.style.display = '';
  };

  // --- Smart book search ---
  const searchInput = $('#book-search', overlay);
  const hintEl = $('#book-search-hint', overlay);

  function normalize(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Common abbreviations / aliases for smarter matching
  const ALIASES = {
    gen: 'genesis', ge: 'genesis', gn: 'genesis',
    ex: 'exodus', exo: 'exodus',
    lev: 'leviticus', le: 'leviticus',
    num: 'numbers', nu: 'numbers',
    deu: 'deuteronomy', deut: 'deuteronomy', dt: 'deuteronomy',
    jos: 'joshua', josh: 'joshua',
    jdg: 'judges', judg: 'judges', ju: 'judges',
    rut: 'ruth', ru: 'ruth',
    '1sa': '1samuel', '1sam': '1samuel', '1s': '1samuel',
    '2sa': '2samuel', '2sam': '2samuel', '2s': '2samuel',
    '1ki': '1kings', '1k': '1kings', '1kg': '1kings',
    '2ki': '2kings', '2k': '2kings', '2kg': '2kings',
    '1ch': '1chronicles', '1chr': '1chronicles',
    '2ch': '2chronicles', '2chr': '2chronicles',
    ezr: 'ezra', ez: 'ezra',
    neh: 'nehemiah', ne: 'nehemiah',
    est: 'esther', es: 'esther',
    job: 'job',
    psa: 'psalms', ps: 'psalms', psalm: 'psalms',
    pro: 'proverbs', pr: 'proverbs', prov: 'proverbs',
    ecc: 'ecclesiastes', ec: 'ecclesiastes', eocl: 'ecclesiastes',
    sng: 'songofsolomon', song: 'songofsolomon', sos: 'songofsolomon', cant: 'songofsolomon',
    isa: 'isaiah', is: 'isaiah',
    jer: 'jeremiah', je: 'jeremiah',
    lam: 'lamentations', la: 'lamentations',
    eze: 'ezekiel', ezk: 'ezekiel', ezek: 'ezekiel',
    dan: 'daniel', da: 'daniel',
    hos: 'hosea', ho: 'hosea',
    joe: 'joel', jol: 'joel',
    amo: 'amos', am: 'amos',
    oba: 'obadiah', ob: 'obadiah',
    jon: 'jonah',
    mic: 'micah',
    nah: 'nahum', na: 'nahum',
    hab: 'habakkuk',
    zep: 'zephaniah', zepn: 'zephaniah',
    hag: 'haggai',
    zec: 'zechariah', zech: 'zechariah',
    mal: 'malachi',
    mat: 'matthew', mt: 'matthew', matt: 'matthew',
    mrk: 'mark', mk: 'mark',
    luk: 'luke', lk: 'luke',
    jhn: 'john', jn: 'john', joh: 'john',
    act: 'acts', ac: 'acts',
    rom: 'romans', ro: 'romans',
    '1co': '1corinthians', '1cor': '1corinthians', '1c': '1corinthians',
    '2co': '2corinthians', '2cor': '2corinthians', '2c': '2corinthians',
    gal: 'galatians', ga: 'galatians',
    eph: 'ephesians',
    php: 'philippians', phil: 'philippians',
    col: 'colossians',
    '1th': '1thessalonians', '1thess': '1thessalonians', '1thes': '1thessalonians',
    '2th': '2thessalonians', '2thess': '2thessalonians', '2thes': '2thessalonians',
    '1ti': '1timothy', '1tim': '1timothy',
    '2ti': '2timothy', '2tim': '2timothy',
    tit: 'titus',
    phm: 'philemon', phlm: 'philemon',
    heb: 'hebrews',
    jas: 'james', jam: 'james',
    '1pe': '1peter', '1pet': '1peter', '1p': '1peter',
    '2pe': '2peter', '2pet': '2peter', '2p': '2peter',
    '1jn': '1john', '1j': '1john', '1jo': '1john',
    '2jn': '2john', '2j': '2john', '2jo': '2john',
    '3jn': '3john', '3j': '3john', '3jo': '3john',
    jud: 'jude',
    rev: 'revelation', re: 'revelation', revn: 'revelation'
  };

  function bookMatches(q, name, id) {
    if (!q) return true;
    const nq = normalize(q);
    const nname = normalize(name);
    const nid = normalize(id);
    if (nname.includes(nq) || nid.includes(nq) || nname.startsWith(nq) || nid.startsWith(nq)) return true;
    // alias expansion
    const expanded = ALIASES[nq] || ALIASES[q.toLowerCase().trim()];
    if (expanded && (nname.includes(expanded) || nname === expanded || nid === nq)) return true;
    // also try stripping leading numbers for "1 corinthians" style
    const stripped = nq.replace(/^[123]/, '');
    if (stripped.length >= 2 && (nname.includes(stripped) || nid.includes(stripped))) return true;
    return false;
  }

  function applyBookFilter() {
    const q = (searchInput.value || '').trim();
    const rows = $$('#book-list li.book-row', overlay);
    let visibleOT = 0, visibleNT = 0;
    rows.forEach(li => {
      const name = li.dataset.name || '';
      const id = li.dataset.id || li.dataset.book || '';
      const match = bookMatches(q, name, id);
      li.style.display = match ? '' : 'none';
      if (match) {
        // determine testament from parent ul
        const ul = li.closest('ul.nav-list');
        if (ul && ul.dataset.test === 'OT') visibleOT++;
        if (ul && ul.dataset.test === 'NT') visibleNT++;
      }
    });
    // Hide empty testament headings
    $$('.testament-heading', overlay).forEach(h => {
      const t = h.dataset.test;
      if (t === 'OT') h.style.display = visibleOT ? '' : 'none';
      if (t === 'NT') h.style.display = visibleNT ? '' : 'none';
    });
    if (hintEl) {
      if (q) {
        const total = visibleOT + visibleNT;
        hintEl.textContent = total === 0
          ? 'No books match “' + q + '”.'
          : total + ' book' + (total === 1 ? '' : 's') + ' match.';
      } else {
        hintEl.innerHTML = 'Canonical order. Tap a loaded book to open chapters. Use <strong>Import</strong> to load a JSON book file.';
      }
    }
  }

  searchInput.addEventListener('input', applyBookFilter);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      applyBookFilter();
      searchInput.blur();
    }
  });
  // Auto-focus search on open for quick typing (desktop + many mobile keyboards)
  setTimeout(() => { try { searchInput.focus(); } catch (_) {} }, 80);

  function showChapters(book) {
    $('#book-list', overlay).classList.add('hidden');
    $('#chapter-area', overlay).classList.remove('hidden');
    if (searchInput) searchInput.style.display = 'none';
    if (hintEl) hintEl.style.display = 'none';
    $('#ch-title', overlay).textContent = book.name + ' – Chapters';
    const grid = $('#ch-grid', overlay);
    grid.innerHTML = book.chapters.map(c =>
      `<button type="button" data-ch="${c.number}">${c.number}</button>`
    ).join('');
    $$('button[data-ch]', grid).forEach(btn => {
      btn.onclick = async () => {
        closeOverlay(overlay);
        await renderChapter(book.id, +btn.dataset.ch);
      };
    });
  }

  $$('#book-list li.loaded[data-book]', overlay).forEach(li => {
    li.onclick = (e) => {
      if (e.target.closest('button')) return;
      const book = loaded.get(li.dataset.book);
      if (book) showChapters(book);
    };
  });

  const fileInput = $('#nav-file-input', overlay);

  $$('#book-list .btn-import-book', overlay).forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const expectId = btn.dataset.book;
      const expectName = btn.dataset.name;
      fileInput.onchange = async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        try {
          const json = JSON.parse(await file.text());
          const imported = await bible.importBookJSON(json);
          books = await storage.getAllBooks();
          const match = imported.find(b => b.id === expectId) ||
            imported.find(b => (b.name || '').toLowerCase() === expectName.toLowerCase()) ||
            imported[0];
          if (!match) {
            alert('Import finished, but this file did not contain ' + expectName + '.');
            closeOverlay(overlay);
            openBookNav();
            return;
          }
          alert('Imported ' + (match.name || expectName) + ' successfully.');
          closeOverlay(overlay);
          openBookNav();
        } catch (err) {
          console.error(err);
          alert('Import failed: ' + (err.message || err));
        }
      };
      fileInput.click();
    };
  });
}


function openColorIndex() {
  const items = analyze.allColors().map(c => `
    <li data-color="${c.id}">
      <span class="swatch" style="background:${c.hex}"></span>
      <div class="meaning">
        <span class="label">${c.label}</span>
        ${c.meaning}
      </div>
      <button type="button" data-show="${c.id}" style="min-width:auto;padding:0.4rem 0.7rem">Show all</button>
    </li>
  `).join('');

  const overlay = showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>Color Index</h2>
      <ul class="color-list">${items}</ul>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);

  $$('button[data-show]', overlay).forEach(btn => {
    btn.onclick = () => {
      closeOverlay(overlay);
      openReviewByColor(btn.dataset.show);
    };
  });
}

// ---------- Review by color (hierarchical book → verse + Back to books) ----------
async function openReviewByColor(preselectColor = null) {
  const allHighlights = await storage.getAllHighlights();
  const colorFilter = preselectColor;

  const colorOptions = analyze.allColors().map(c =>
    `<option value="${c.id}" ${c.id === colorFilter ? 'selected' : ''}>${c.label} – ${c.meaning}</option>`
  ).join('');

  // Reuse the same panel structure / styles as hierarchical Search for consistency
  const overlay = showOverlay(`
    <div class="panel search-panel">
      <div class="search-header">
        <div class="search-header-top">
          <h2 class="search-title">Review by Color</h2>
          <button type="button" class="close search-close" aria-label="Close">×</button>
        </div>
        <label style="display:block;margin:0 0 0.4rem;font-size:0.95em;color:var(--text-dim)">
          Color
          <select id="review-color" style="width:100%;padding:0.6rem;font-size:1.05rem;margin-top:0.25rem;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px">
            <option value="">— choose a color —</option>
            ${colorOptions}
          </select>
        </label>
      </div>
      <div id="review-results" class="search-body"></div>
    </div>
  `);
  $('.search-close', overlay).onclick = () => closeOverlay(overlay);

  const resultsEl = $('#review-results', overlay);
  let lastMatches = [];   // flat list of matching highlight rows for the chosen color
  let viewMode = 'books'; // 'books' | 'verses'
  let selectedBookId = null;

  // Canonical order index (same approach as Search)
  const canonIndex = new Map(bible.CANONICAL_BOOKS.map((b, i) => [b.id, i]));

  function groupByBook(matches) {
    const map = new Map();
    for (const h of matches) {
      const { bookId, chapter, verse } = bible.parseKey(h.key);
      if (!map.has(bookId)) {
        const book = books.find(b => b.id === bookId);
        map.set(bookId, {
          bookId,
          bookName: book ? book.name : bookId,
          items: []
        });
      }
      map.get(bookId).items.push({
        key: h.key,
        bookId,
        chapter,
        verse,
        text: bible.getVerseText(books, bookId, chapter, verse) || ''
      });
    }
    // Sort groups by canonical order; verses inside a book by chapter then verse
    const groups = Array.from(map.values()).sort((a, b) => {
      const ia = canonIndex.has(a.bookId) ? canonIndex.get(a.bookId) : 999;
      const ib = canonIndex.has(b.bookId) ? canonIndex.get(b.bookId) : 999;
      return ia - ib;
    });
    for (const g of groups) {
      g.items.sort((a, b) => (a.chapter - b.chapter) || (a.verse - b.verse));
    }
    return groups;
  }

  function bindVerseClicks(container) {
    $$('.search-result', container).forEach(row => {
      row.onclick = async () => {
        // Push current reading location so the main chrome ← Back can return here
        // (identical pattern to hierarchical Search and Cross-refs).
        if (currentBookId) {
          const main = document.getElementById('main');
          const book = books.find(b => b.id === currentBookId);
          const label = book ? `${book.name} ${currentChapter}` : `${currentBookId} ${currentChapter}`;
          navStack.push({
            bookId: currentBookId,
            chapter: currentChapter,
            verseKey: getNearestVerseKey() || null,
            scrollTop: main ? main.scrollTop : 0,
            label
          });
          updateNavBackButton();
        }
        closeOverlay(overlay);
        await jumpToRef(row.dataset.key);
      };
    });
  }

  function renderBookList() {
    viewMode = 'books';
    selectedBookId = null;
    const groups = groupByBook(lastMatches);
    if (!groups.length) {
      const color = $('#review-color', overlay).value;
      resultsEl.innerHTML = color
        ? '<p style="color:var(--text-dim);padding:0.5rem 0">No verses marked with this color yet.</p>'
        : '<p style="color:var(--text-dim);padding:0.5rem 0">Select a color to see matching verses.</p>';
      return;
    }
    resultsEl.innerHTML = groups.map(g => `
      <div class="search-book-row" data-book-id="${escapeHtml(g.bookId)}" role="button" tabindex="0">
        <span class="book-name">${escapeHtml(g.bookName)}</span>
        <span class="match-count">${g.items.length}</span>
      </div>
    `).join('');
    $$('.search-book-row', resultsEl).forEach(row => {
      const go = () => {
        selectedBookId = row.dataset.bookId;
        renderVerseList();
      };
      row.onclick = go;
      row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
  }

  function renderVerseList() {
    viewMode = 'verses';
    const groups = groupByBook(lastMatches);
    const group = groups.find(g => g.bookId === selectedBookId);
    if (!group) {
      renderBookList();
      return;
    }
    const verseHtml = group.items.map(r => `
      <div class="search-result" data-key="${r.key}">
        <span class="ref">${escapeHtml(r.bookName || group.bookName)} ${r.chapter}:${r.verse}</span>
        ${escapeHtml((r.text || '').slice(0, 140))}${(r.text || '').length > 140 ? '…' : ''}
      </div>
    `).join('');
    resultsEl.innerHTML = `
      <div class="search-back-row">
        <button type="button" class="search-back-btn" id="review-back">← Back to books</button>
      </div>
      <p style="font-size:0.9em;color:var(--text-dim);margin:0 0 0.5rem">${escapeHtml(group.bookName)} · ${group.items.length} verse${group.items.length === 1 ? '' : 's'}</p>
      ${verseHtml}
    `;
    $('#review-back', resultsEl).onclick = () => renderBookList();
    bindVerseClicks(resultsEl);
  }

  function refresh() {
    const color = $('#review-color', overlay).value;
    if (!color) {
      lastMatches = [];
      renderBookList();
      return;
    }
    lastMatches = allHighlights.filter(h => {
      const ranges = h.ranges || [];
      return ranges.some(r => r.color === color);
    });
    // Any color change returns to the book-list view
    renderBookList();
  }

  $('#review-color', overlay).onchange = refresh;
  if (colorFilter) refresh();
}

// ---------- Analyze ----------
async function openAnalyze(key) {
  const { bookId, chapter, verse } = bible.parseKey(key);
  const text = bible.getVerseText(books, bookId, chapter, verse);
  if (!text) return;

  const suggestions = await analyze.analyzeVerse(text);
  const ranges = normalizeRanges(await storage.getHighlights(key), text.length);
  const currentColors = uniqueColors(ranges);

  let body = '';
  if (!suggestions.length) {
    body = '<p style="color:var(--text-dim)">No strong rule-based suggestions for this verse. You can still apply any color manually.</p>';
  } else {
    body = suggestions.map(s => {
      const meta = analyze.getColorMeta(s.colorId);
      const already = currentColors.includes(s.colorId);
      return `
        <div class="suggestion" data-color="${s.colorId}">
          <div style="display:flex;align-items:center;gap:0.6rem">
            <span class="swatch" style="background:${meta.hex};width:28px;height:28px"></span>
            <strong>${meta.label}</strong> – ${meta.meaning}
            ${already ? '<span style="color:var(--success);font-size:0.9em">(already applied)</span>' : ''}
          </div>
          <div class="reason">Reason: ${s.reasons.join('; ') || 'pattern match'}</div>
          <div class="actions">
            <button type="button" data-act="accept" data-color="${s.colorId}">Accept (whole verse)</button>
            <button type="button" data-act="reject" data-color="${s.colorId}">Reject</button>
          </div>
        </div>
      `;
    }).join('');
  }

  const overlay = showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>Analyze – ${bookId.toUpperCase()} ${chapter}:${verse}</h2>
      <p style="margin-bottom:1rem;font-size:0.95em;color:var(--text-dim)">${escapeHtml(text)}</p>
      ${body}
      <button type="button" id="open-manual" style="width:100%;margin-top:0.8rem">Open color picker (supports segments)</button>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);
  $('#open-manual', overlay).onclick = () => {
    closeOverlay(overlay);
    openColorPicker(key);
  };

  overlay.querySelectorAll('button[data-act]').forEach(btn => {
    btn.onclick = async () => {
      const colorId = btn.dataset.color;
      const act = btn.dataset.act;
      const sug = suggestions.find(s => s.colorId === colorId);
      const reasons = sug ? sug.reasons : [];

      if (act === 'accept') {
        // Apply as whole-verse range
        const newRanges = [...ranges, { color: colorId, start: 0, end: text.length }];
        await storage.setHighlights(key, newRanges);
        await analyze.recordFeedback(colorId, reasons, 'accept');
      } else if (act === 'reject') {
        await analyze.recordFeedback(colorId, reasons, 'reject');
      }
      closeOverlay(overlay);
      await renderChapter(currentBookId, currentChapter);
      setTimeout(() => {
        const t = document.getElementById('v-' + key.replace(/\./g, '-'));
        if (t) t.scrollIntoView({ block: 'center' });
      }, 80);
    };
  });
}

// ---------- Color picker (manual multi-select) ----------


async function openColorPicker(key) {
  const { bookId, chapter, verse } = bible.parseKey(key);
  const plain = bible.getVerseText(books, bookId, chapter, verse) || "";
  let ranges = normalizeRanges(await storage.getHighlights(key), plain.length);

  // Snapshot selection NOW (may already be in pending from touchstart earlyCapture).
  // One more live try if still nothing.
  if (!(pendingSelection && pendingSelection.key === key && pendingSelection.end > pendingSelection.start)) {
    captureSelectionFromVerse(key);
  }

  // LOCK a copy so Apply cannot lose it if pendingSelection is cleared later.
  let lockedSel = null;
  if (pendingSelection && pendingSelection.key === key && pendingSelection.end > pendingSelection.start) {
    lockedSel = {
      key: pendingSelection.key,
      start: pendingSelection.start,
      end: pendingSelection.end,
      text: pendingSelection.text
    };
  }

  // Re-map by text content so offsets stay correct for partial selections
  // (first word, first two words, etc.)
  if (lockedSel && lockedSel.text && plain) {
    const selText = stripLeadingVerseNum(String(lockedSel.text)).trim();
    if (selText && selText.length < plain.length) {
      let located = locateSelected(plain, selText, lockedSel.start || 0);
      if (!located && plain.startsWith(selText)) {
        located = { start: 0, end: selText.length };
      }
      if (!located) {
        located = locateSelected(plain, selText, 0);
      }
      if (located && (located.end - located.start) < plain.length) {
        lockedSel = {
          key,
          start: located.start,
          end: located.end,
          text: plain.slice(located.start, located.end)
        };
      }
    }
  }

  const sel = lockedSel;

  const modeHtml = sel
    ? `<p style="font-size:0.95em;color:var(--success);margin-bottom:0.8rem;line-height:1.45">
         Selected: “${escapeHtml(sel.text.slice(0, 60))}${sel.text.length > 60 ? "…" : ""}”<br>
         Color will apply <strong>only to this selection</strong>.
       </p>`
    : `<p style="font-size:0.95em;color:var(--text-dim);margin-bottom:0.8rem;line-height:1.45">
         No text selected — color will apply to the <strong>whole verse</strong>.<br>
         To color only some words: select them first, then open Color.
       </p>`;

  const items = analyze.allColors().map(c => `
    <label style="display:flex;align-items:center;gap:0.7rem;padding:0.75rem 0.3rem;border-bottom:1px solid var(--border);cursor:pointer;min-height:52px">
      <input type="radio" name="pick-color" value="${c.id}" style="width:22px;height:22px;flex-shrink:0">
      <span class="swatch" style="background:${c.hex};flex-shrink:0"></span>
      <span><strong>${c.label}</strong> – ${c.meaning}</span>
    </label>
  `).join("");

  const hasRanges = ranges.length > 0;
  const clearSection = `
    <div style="margin:0.8rem 0 1rem;padding-top:0.6rem;border-top:1px solid var(--border)">
      ${sel ? `<button type="button" id="clear-selection" style="width:100%;margin-bottom:0.5rem;color:var(--danger)">
        Clear color from selected text only
      </button>` : ""}
      ${hasRanges ? `<button type="button" id="clear-all-colors" style="width:100%;color:var(--danger)">
        Clear ALL colors on this verse
      </button>` : ""}
    </div>`;

  const overlay = showOverlay(`
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem">
        <h2 style="margin:0;border:none;padding:0">Apply Color</h2>
        <button type="button" class="close" aria-label="Close" style="float:none;min-width:52px;min-height:52px;font-size:1.5rem">×</button>
      </div>
      ${modeHtml}
      ${clearSection}
      <div id="color-checks">${items}</div>
      <button type="button" id="apply-color" style="width:100%;margin-top:1rem;min-height:52px;background:var(--accent);color:#111;font-weight:600;font-size:1.1rem">Apply Color</button>
      <button type="button" id="cancel-color" style="width:100%;margin-top:0.5rem;min-height:48px">Cancel</button>
    </div>
  `);

  const close = () => { pendingSelection = null; closeOverlay(overlay); };
  $(".close", overlay).onclick = close;
  $("#cancel-color", overlay).onclick = close;

  const clearSelBtn = $("#clear-selection", overlay);
  if (clearSelBtn) {
    clearSelBtn.onclick = async () => {
      if (!sel) return;
      // Remove any range that overlaps the selection
      const next = ranges.filter(r => r.end <= sel.start || r.start >= sel.end);
      // Also punch a hole in ranges that partially overlap
      const punched = [];
      for (const r of ranges) {
        if (r.end <= sel.start || r.start >= sel.end) {
          punched.push(r);
        } else {
          if (r.start < sel.start) punched.push({ color: r.color, start: r.start, end: sel.start });
          if (r.end > sel.end) punched.push({ color: r.color, start: sel.end, end: r.end });
        }
      }
      await storage.setHighlights(key, punched);
      pendingSelection = null;
      closeOverlay(overlay);
      await renderChapter(currentBookId, currentChapter);
      setTimeout(() => {
        const t = document.getElementById("v-" + key.replace(/\./g, "-"));
        if (t) t.scrollIntoView({ block: "center" });
      }, 80);
    };
  }

  const clearAllBtn = $("#clear-all-colors", overlay);
  if (clearAllBtn) {
    clearAllBtn.onclick = async () => {
      await storage.setHighlights(key, []);
      pendingSelection = null;
      closeOverlay(overlay);
      await renderChapter(currentBookId, currentChapter);
      setTimeout(() => {
        const t = document.getElementById("v-" + key.replace(/\./g, "-"));
        if (t) t.scrollIntoView({ block: "center" });
      }, 80);
    };
  }

  $("#apply-color", overlay).onclick = async () => {
    const chosen = overlay.querySelector('input[name="pick-color"]:checked');
    if (!chosen) {
      alert("Select a color first.");
      return;
    }
    const colorId = chosen.value;

    // Use the selection locked when the picker opened — do not re-read live
    // selection (already collapsed on iOS) and do not expand short text to whole verse.
    let useSel = lockedSel;

    if (useSel && useSel.text && plain) {
      const selText = stripLeadingVerseNum(String(useSel.text)).trim();
      if (selText && selText.length < plain.length) {
        let located = locateSelected(plain, selText, useSel.start || 0);
        if (!located && plain.startsWith(selText)) {
          located = { start: 0, end: selText.length };
        }
        if (!located) {
          located = locateSelected(plain, selText, 0);
        }
        if (located && (located.end - located.start) < plain.length) {
          useSel = {
            key,
            start: located.start,
            end: located.end,
            text: plain.slice(located.start, located.end)
          };
        }
      }
    }

    if (useSel && useSel.end > useSel.start && (useSel.end - useSel.start) < plain.length) {
      const punched = [];
      for (const r of ranges) {
        if (r.end <= useSel.start || r.start >= useSel.end) {
          punched.push(r);
        } else {
          if (r.start < useSel.start) punched.push({ color: r.color, start: r.start, end: useSel.start });
          if (r.end > useSel.end) punched.push({ color: r.color, start: useSel.end, end: r.end });
        }
      }
      punched.push({ color: colorId, start: useSel.start, end: useSel.end });
      ranges = punched;
    } else if (useSel && useSel.end > useSel.start && (useSel.end - useSel.start) >= plain.length) {
      ranges = [{ color: colorId, start: 0, end: plain.length }];
    } else {
      // No usable partial selection → whole verse
      ranges = [{ color: colorId, start: 0, end: plain.length }];
    }

    await storage.setHighlights(key, ranges);
    pendingSelection = null;
    closeOverlay(overlay);
    await renderChapter(currentBookId, currentChapter, { scrollToKey: key });
  };
}


// ---------- Notes ----------

async function openNote(key) {
  const { bookId, chapter, verse } = bible.parseKey(key);
  const refLabel = `${bookId.toUpperCase()} ${chapter}:${verse}`;

  // Prefer shared note that includes this verse; else private per-verse note
  let shared = await storage.findSharedNoteForVerse(key);
  let privateText = await storage.getNote(key);
  let mode = shared ? 'shared' : 'private';
  let text = shared ? (shared.text || '') : privateText;

  function linkedListHtml(note) {
    if (!note || !note.verseKeys || !note.verseKeys.length) return '<p style="color:var(--text-dim);font-size:0.9em">No other verses linked.</p>';
    return '<ul style="list-style:none;margin:0.4rem 0 0;padding:0">' +
      note.verseKeys.map(k => {
        const p = bible.parseKey(k);
        const label = `${p.bookId.toUpperCase()} ${p.chapter}:${p.verse}`;
        const isCurrent = k === key;
        return `<li style="display:flex;align-items:center;justify-content:space-between;padding:0.45rem 0;border-bottom:1px solid var(--border);min-height:44px">
          <span>${label}${isCurrent ? ' (this verse)' : ''}</span>
          ${isCurrent ? '' : `<button type="button" data-unlink="${k}" style="min-height:40px;min-width:auto;padding:0.3rem 0.6rem;color:var(--danger);font-size:0.9rem">Unlink</button>`}
        </li>`;
      }).join('') + '</ul>';
  }

  const overlay = showOverlay(`
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem">
        <h2 style="margin:0;border:none;padding:0">Note – ${refLabel}</h2>
        <button type="button" class="close" style="float:none;min-width:52px;min-height:52px;font-size:1.5rem">×</button>
      </div>
      <p id="note-mode" style="font-size:0.9em;color:var(--text-dim);margin-bottom:0.6rem">
        ${mode === 'shared'
          ? 'Shared note — edits apply to all linked verses.'
          : 'Private note for this verse only. Link more verses to share one note.'}
      </p>
      <textarea class="note-input" id="note-text" placeholder="Your notes stay on this device only…">${escapeHtml(text)}</textarea>

      <div style="margin-top:0.9rem;padding-top:0.7rem;border-top:1px solid var(--border)">
        <strong style="font-size:0.95em">Linked verses</strong>
        <div id="linked-list">${linkedListHtml(shared)}</div>
        <label style="display:block;margin-top:0.7rem;font-size:0.9em;color:var(--text-dim)">
          Add verse references (e.g. gen.1.3 or Genesis 1:3 — one per line)
        </label>
        <textarea id="link-refs" rows="3" placeholder="gen.1.3&#10;Genesis 1:5"
          style="width:100%;margin-top:0.35rem;padding:0.6rem;font-size:1rem;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)"></textarea>
        <button type="button" id="add-links" style="width:100%;margin-top:0.5rem;min-height:48px">Add links</button>
      </div>

      <button type="button" id="save-note" style="width:100%;margin-top:1rem;min-height:52px;background:var(--accent);color:#111;font-weight:600">Save Note</button>
      ${shared ? `<button type="button" id="unlink-this" style="width:100%;margin-top:0.45rem;min-height:48px;color:var(--danger)">Unlink this verse from shared note</button>
      <button type="button" id="delete-shared" style="width:100%;margin-top:0.45rem;min-height:48px;color:var(--danger)">Delete shared note entirely</button>` : ''}
      <button type="button" id="cancel-note" style="width:100%;margin-top:0.45rem;min-height:48px">Cancel</button>
    </div>
  `);

  const close = () => closeOverlay(overlay);
  $('.close', overlay).onclick = close;
  $('#cancel-note', overlay).onclick = close;

  async function refreshLinkedUI() {
    shared = shared ? await storage.getSharedNote(shared.id) : await storage.findSharedNoteForVerse(key);
    const list = $('#linked-list', overlay);
    if (list) list.innerHTML = linkedListHtml(shared);
    // re-bind unlink buttons
    $$('[data-unlink]', overlay).forEach(btn => {
      btn.onclick = async () => {
        const k = btn.dataset.unlink;
        if (!shared) return;
        shared.verseKeys = shared.verseKeys.filter(x => x !== k);
        if (shared.verseKeys.length === 0) {
          await storage.deleteSharedNote(shared.id);
          shared = null;
        } else {
          await storage.saveSharedNote(shared);
        }
        await refreshLinkedUI();
      };
    });
  }

  $$('[data-unlink]', overlay).forEach(btn => {
    btn.onclick = async () => {
      const k = btn.dataset.unlink;
      if (!shared) return;
      shared.verseKeys = shared.verseKeys.filter(x => x !== k);
      if (shared.verseKeys.length === 0) {
        await storage.deleteSharedNote(shared.id);
        shared = null;
      } else {
        await storage.saveSharedNote(shared);
      }
      await refreshLinkedUI();
    };
  });

  $('#add-links', overlay).onclick = async () => {
    const raw = ($('#link-refs', overlay).value || '').trim();
    if (!raw) return;
    const lines = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const keys = [];
    for (const line of lines) {
      const parsed = parseUserRef(line);
      if (parsed && parsed.key) keys.push(parsed.key);
      else {
        // try book.chapter.verse already
        const m = line.match(/^([a-z0-9]+)\.(\d+)\.(\d+)$/i);
        if (m) keys.push(`${m[1].toLowerCase()}.${m[2]}.${m[3]}`);
      }
    }
    if (!keys.length) {
      alert('Could not parse any references. Try gen.1.3 or Genesis 1:3');
      return;
    }
    // Ensure current verse is included
    if (!keys.includes(key)) keys.unshift(key);

    const body = ($('#note-text', overlay).value || '').trim();

    if (!shared) {
      // Promote private note to shared
      shared = await storage.saveSharedNote({
        id: null,
        text: body || privateText || '',
        verseKeys: [...new Set(keys)]
      });
      // Clear private note for this verse to avoid dual storage confusion
      await storage.setNote(key, '');
    } else {
      shared.verseKeys = [...new Set([...(shared.verseKeys || []), ...keys])];
      if (body) shared.text = body;
      await storage.saveSharedNote(shared);
    }
    $('#link-refs', overlay).value = '';
    $('#note-mode', overlay).textContent = 'Shared note — edits apply to all linked verses.';
    await refreshLinkedUI();
  };

  $('#save-note', overlay).onclick = async () => {
    const body = $('#note-text', overlay).value || '';
    if (shared) {
      shared.text = body;
      if (!shared.verseKeys.includes(key)) shared.verseKeys.push(key);
      await storage.saveSharedNote(shared);
      // keep private empty when shared
      await storage.setNote(key, '');
    } else {
      await storage.setNote(key, body);
    }
    closeOverlay(overlay);
    if (currentBookId) await renderChapter(currentBookId, currentChapter, { scrollToKey: key });
  };

  const unlinkThis = $('#unlink-this', overlay);
  if (unlinkThis) {
    unlinkThis.onclick = async () => {
      if (!shared) return;
      // Keep a private copy of the text on this verse
      const body = $('#note-text', overlay).value || shared.text || '';
      shared.verseKeys = shared.verseKeys.filter(k => k !== key);
      if (shared.verseKeys.length === 0) {
        await storage.deleteSharedNote(shared.id);
      } else {
        await storage.saveSharedNote(shared);
      }
      await storage.setNote(key, body);
      closeOverlay(overlay);
      if (currentBookId) await renderChapter(currentBookId, currentChapter, { scrollToKey: key });
    };
  }

  const delShared = $('#delete-shared', overlay);
  if (delShared) {
    delShared.onclick = async () => {
      if (!shared) return;
      if (!confirm('Delete this shared note for all linked verses?')) return;
      await storage.deleteSharedNote(shared.id);
      closeOverlay(overlay);
      if (currentBookId) await renderChapter(currentBookId, currentChapter, { scrollToKey: key });
    };
  }

  setTimeout(() => $('#note-text', overlay).focus(), 100);
}


// ---------- Cross-references ----------
/* Pre-loaded high-value phrase-level TSK (always available, zero import).
   Full pack (~29k verses) remains optional via Menu → Load More Cross-References.
*/
const STARTER_TSK = {"1co.13.1":[{"a":"I speak","r":["1 Cor 13:2-3","1 Cor 12:8,16,29-30","1 Cor 14:6","2 Cor 12:4","2 Pet 2:18"]},{"a":"have not","r":["1 Cor 8:1","Matt 25:45","Rom 14:15","Gal 5:6,22","1 Tim 1:5","1 Pet 4:8"]},{"a":"as","r":["1 Cor 14:7-8"]}],"1co.13.10":[{"a":"But when that which is perfect is come, then that which is in part shall be done away.","r":["1 Cor 13:12","Isa 24:23","Isa 60:19-20","2 Cor 5:7-8","Rev 21:22-23","Rev 22:4-5"]}],"1co.13.11":[{"a":"I spake","r":["1 Cor 3:1-2","1 Cor 14:20","Eccl 11:10","Gal 4:1"]}],"1co.13.12":[{"a":"we see","r":["2 Cor 3:18","2 Cor 5:7","Phil 3:12","Jas 1:23"]},{"a":"darkly","r":["Judg 14:12-19","Ezek 17:2"]},{"a":"face","r":["Exod 33:11","Num 12:8","Matt 5:8","Matt 18:10","Rom 8:18","1 John 3:2","Rev 22:4"]},{"a":"now","r":["1 Cor 13:9-10","John 10:15"]}],"1co.13.13":[{"a":"abideth","r":["1 Cor 3:14","1 Pet 1:21","1 John 2:14,24","1 John 3:9"]},{"a":"faith","r":["Luke 8:13-15","Luke 22:32","Gal 5:6","Heb 10:35,39","Heb 11:1-7","1 John 5:1-5"]},{"a":"hope","r":["Ps 42:11","Ps 43:5","Ps 146:5","Lam 3:21-26","Rom 5:4-5","Rom 8:24-25","Rom 15:13","Col 1:5,27","1 Thess 5:8","Heb 6:11,19","1 Pet 1:21","1 John 3:3"]},{"a":"charity","r":["1 Cor 13:1-8","1 Cor 8:1,3","2 Cor 5:10,15","Gal 5:6","1 John 2:10","1 John 4:7-18"]},{"a":"the greatest","r":["1 Cor 13:8","1 Cor 14:1","1 Cor 16:14","Mark 12:29-31","Luke 10:27","Gal 5:13-22","Phil 1:9","Col 3:14","1 Tim 1:5","2 Tim 1:7","1 John 4:7-9","2 John 1:4-6"]}],"1co.13.2":[{"a":"I have the","r":["1 Cor 12:8-10,28","1 Cor 14:1,6-9","Num 24:15-24","Matt 7:22-23"]},{"a":"understand","r":["1 Cor 4:1","Matt 13:11","Rom 11:25","Rom 16:25","Eph 3:4","Eph 6:19","Col 1:26","1 Tim 3:16"]},{"a":"and though I have all","r":["1 Cor 12:9","Matt 17:20","Matt 21:21","Mark 11:22-23","Luke 17:5-6"]},{"a":"and have","r":["1 Cor 13:1,3","1 Cor 16:22","Gal 5:16,22","1 John 4:8,20-21"]},{"a":"I am","r":["1 Cor 13:3","1 Cor 7:19","1 Cor 8:4","Matt 21:19","2 Cor 12:11","Gal 6:3"]}],"1co.13.3":[{"a":"though I bestow","r":["Matt 6:1-4","Matt 23:5","Luke 18:22,28","Luke 19:8","Luke 21:3-4","John 12:43","Gal 5:26","Phil 1:15-18"]},{"a":"though I give","r":["Dan 3:16-28","Matt 7:22-23","John 13:37","John 15:13","Acts 21:13","Phil 1:20-21","Phil 2:3"]},{"a":"profiteth","r":["Isa 57:12","Jer 7:8","John 6:63","1 Tim 4:8","Heb 13:9","Jas 2:14-17"]}],"1co.13.4":[{"a":"suffereth","r":["Prov 10:12","2 Cor 6:6","Gal 5:22","Eph 4:2","Col 1:11","Col 3:12","2 Tim 2:25","2 Tim 3:10","2 Tim 4:2","Jas 3:17","1 Pet 4:8"]},{"a":"is kind","r":["Neh 9:17","Prov 19:22","Prov 31:20,26","Luke 6:35-36","Eph 4:32","Col 3:12","1 Pet 3:8","2 Pet 1:7","1 John 3:16-18","1 John 4:11"]},{"a":"envieth","r":["1 Cor 3:3","Gen 30:1","Gen 37:11","Matt 27:18","Rom 1:29","Rom 13:13","2 Cor 12:20","Gal 5:21,26","Phil 1:15","1 Tim 6:4","Titus 3:3","Jas 3:14-16","Jas 4:5","1 Pet 2:1"]},{"a":"vaunteth not itself","r":["1 Sam 25:21-22,33-34","1 Kgs 20:10-11","Ps 10:5","Prov 13:10","Prov 17:14","Prov 25:8-10","Eccl 7:8-9","Eccl 10:4","Dan 3:19-22"]},{"a":"is not","r":["1 Cor 4:6,18","1 Cor 5:2","1 Cor 8:1","Col 2:18","Phil 2:1-5"]}],"1co.13.5":[{"a":"behave","r":["1 Cor 7:36","1 Cor 11:13-16,18,21-22","1 Cor 14:33-40","Isa 3:5","Phil 4:8","2 Thess 3:7"]},{"a":"seeketh","r":["1 Cor 10:24,33","1 Cor 12:25","Rom 14:12-15","Rom 15:1-2","Gal 5:13","Gal 6:1-2","Phil 2:3-5,21","2 Tim 2:10","1 John 3:16-17"]},{"a":"is not","r":["Num 12:3","Num 16:15","Num 20:10-12","Ps 106:32-33","Prov 14:17","Matt 5:22","Mark 3:5","Jas 1:19"]},{"a":"thinketh","r":["2 Sam 10:3","Job 21:27","Jer 11:19","Jer 18:18-20","Jer 40:13-16","Matt 9:4","Luke 7:39"]}],"1co.13.6":[{"a":"Rejoiceth not","r":["1 Sam 23:19-21","2 Sam 4:10-12","Ps 10:3","Ps 119:136","Prov 14:9","Jer 9:1","Jer 13:17","Jer 20:10","Hos 4:8","Hos 7:3","Mic 7:8","Luke 19:41-42","Luke 22:5","Rom 1:32","Phil 3:18"]},{"a":"rejoiceth","r":["Exod 18:9","Josh 22:22-33","Rom 12:9","2 Cor 7:9-16","Phil 1:4,18","Phil 2:17-18","1 Thess 3:6-10","2 John 1:4","3 John 1:3"]}],"1co.13.7":[{"a":"Beareth","r":["1 Cor 13:4","Num 11:12-14","Deut 1:9","Prov 10:12","Song 8:6-7","Rom 15:1","Gal 6:2","Heb 13:13","1 Pet 2:24","1 Pet 4:8"]},{"a":"believeth","r":["Ps 119:66"]},{"a":"hopeth","r":["Luke 7:37-39,44-46","Luke 19:4-10","Rom 8:24"]},{"a":"endureth","r":["1 Cor 9:18-22","Gen 29:20","Job 13:15","Matt 10:22","2 Cor 11:8-12","2 Thess 1:4","2 Tim 2:3-10,24","2 Tim 3:11","2 Tim 4:5","Jas 1:12"]}],"1co.13.8":[{"a":"never","r":["1 Cor 13:10,13","Luke 22:32","Gal 5:6"]},{"a":"tongues","r":["1 Cor 13:1","1 Cor 12:10,28-30","1 Cor 14:39","Acts 2:4","Acts 19:6"]},{"a":"vanish","r":["Jer 49:7","Heb 8:13"]}],"1co.13.9":[{"a":"For we know in part, and we prophesy in part.","r":["1 Cor 13:12","1 Cor 2:9","1 Cor 8:2","Job 11:7-8","Job 26:14","Ps 40:5","Ps 139:6","Prov 30:4","Matt 11:27","Rom 11:34","Eph 3:8,18-19","Col 2:2-3","1 Pet 1:10-12","1 John 3:2"]}],"1jn.1.1":[{"a":"That which","r":["1 John 2:13","Prov 8:22-31","Isa 41:4","Mic 5:2","John 1:1-18","John 8:58","Rev 1:8,11,17-18","Rev 2:8"]},{"a":"which we have heard","r":["1 John 4:14","Luke 1:2","John 1:14","Acts 1:3","Acts 4:20","2 Pet 1:16-18"]},{"a":"and our","r":["Luke 24:39","John 20:27"]},{"a":"the Word","r":["1 John 5:7","John 1:14","John 5:26","Rev 19:13"]}],"1jn.1.10":[{"a":"we say","r":["1 John 1:8","Ps 130:3"]},{"a":"we make","r":["1 John 5:10","Job 24:25"]},{"a":"his word","r":["1 John 1:8","1 John 2:4","1 John 4:4","Col 3:16","2 John 1:2"]}],"1jn.1.2":[{"a":"the life","r":["1 John 5:11,20","John 1:4","John 11:25-26","John 14:6"]},{"a":"was manifested","r":["1 John 3:5,8","Rom 16:25-26","1 Tim 3:16","2 Tim 1:10","Titus 1:2"]},{"a":"and bear","r":["John 15:27","John 21:14","Acts 1:22","Acts 2:32","Acts 3:15","Acts 5:32","Acts 10:41","1 Pet 5:1"]},{"a":"shew","r":["1 John 5:20"]},{"a":"that eternal","r":["John 17:3"]},{"a":"which was","r":["Prov 8:22-30","John 1:1-2,18","John 3:13","John 7:29","John 8:38","John 16:28","John 17:5","Rom 8:3","Gal 4:4"]}],"1jn.1.3":[{"a":"which","r":["1 John 1:1","Acts 4:20"]},{"a":"declare","r":["1 John 1:5","Ps 2:7","Ps 22:22","Isa 66:19","John 17:25","Acts 13:32,41","Acts 20:27","1 Cor 15:1","Heb 2:12"]},{"a":"ye also","r":["Acts 2:42","Rom 15:27","Eph 3:6","Phil 1:7","Phil 2:1","1 Tim 6:2","Heb 3:1","1 Pet 5:1"]},{"a":"our fellowship","r":["1 John 1:7","1 John 2:23-24","John 14:20-23","John 17:3,11,21","1 Cor 1:9,30","2 Cor 13:14","Phil 2:1","Phil 3:10","Heb 3:14"]},{"a":"with his","r":["1 John 5:10-11","Col 1:13","1 Thess 1:10"]}],"1jn.1.4":[{"a":"that","r":["Isa 61:10","Hab 3:17-18","John 15:11","John 16:24","2 Cor 1:24","Eph 3:19","Phil 1:25-26","2 John 1:12"]}],"1jn.1.5":[{"a":"the message","r":["1 John 3:11","1 Cor 11:23"]},{"a":"that God","r":["Ps 27:1","Ps 36:9","Ps 84:11","Isa 60:19","John 1:4,9","John 8:12","John 9:5","John 12:35-36","1 Tim 6:16","Jas 1:17","Rev 21:23","Rev 22:5"]}],"1jn.1.6":[{"a":"If","r":["1 John 1:8,10","1 John 2:4","1 John 4:20","Matt 7:22","Jas 2:14,16,18","Rev 3:17-18"]},{"a":"fellowship","r":["1 John 1:3","Ps 5:4-6","Ps 94:20","2 Cor 6:14-16"]},{"a":"walk","r":["1 John 2:9-11","Ps 82:5","Prov 2:13","Prov 4:18-19","John 3:19-20","John 11:10","John 12:35,46"]},{"a":"we lie","r":["1 John 1:10","1 John 4:20","John 8:44-45","1 Tim 4:2"]},{"a":"do not","r":["John 3:21"]}],"1jn.1.7":[{"a":"If we","r":["1 John 2:9-10","Ps 56:13","Ps 89:15","Ps 97:11","Isa 2:5","John 12:35","Rom 13:12","Eph 5:8","2 John 1:4","3 John 1:4"]},{"a":"as","r":["1 John 1:5","Ps 104:2","1 Tim 6:16","Jas 1:17"]},{"a":"we have","r":["1 John 1:3","Amos 3:3"]},{"a":"and the","r":["1 John 2:1-2","1 John 5:6,8","Zech 13:1","John 1:29","1 Cor 6:11","Eph 1:7","Heb 9:14","1 Pet 1:19","Rev 1:5","Rev 7:14"]}],"1jn.1.8":[{"a":"say","r":["1 John 1:6,10","1 John 3:5-6","1 Kgs 8:46","2 Chr 6:36","Job 9:2","Job 14:4","Job 15:14","Job 25:4","Ps 143:2","Prov 20:9","Eccl 7:20","Isa 53:6","Isa 64:6","Jer 2:22-23","Rom 3:23","Jas 3:2"]},{"a":"we deceive","r":["1 Cor 3:18","Gal 6:3","2 Tim 3:13","Jas 1:22,26","2 Pet 2:13"]},{"a":"the truth","r":["1 John 2:4","1 Tim 6:5","2 John 1:2","3 John 1:3"]}],"1jn.1.9":[{"a":"we confess","r":["Lev 26:40-42","1 Kgs 8:47","2 Chr 6:37-38","Neh 1:6","Neh 9:2-37","Job 33:27-28","Ps 32:5","Ps 51:2-5","Prov 28:13","Dan 9:4-20","Matt 3:6","Mark 1:5","Acts 19:18"]},{"a":"he is","r":["Deut 7:9","Lam 3:23","1 Cor 1:9","1 Tim 1:15","Heb 10:23","Heb 11:11"]},{"a":"just","r":["Isa 45:21","Zech 9:9","Rom 3:26","Heb 6:10","Rev 15:3"]},{"a":"and to","r":["1 John 1:7","Ps 19:12","Ps 51:2","Jer 33:8","Ezek 36:25","Ezek 37:23","1 Cor 6:11","Eph 5:26","Titus 2:14"]}],"1jn.4.1":[{"a":"believe not","r":["Deut 13:1-5","Prov 14:15","Jer 5:31","Jer 29:8-9","Matt 7:15-16","Matt 24:4-5","Rom 16:18","2 Pet 2:1"]},{"a":"try","r":["Luke 12:57","Acts 17:11","Rom 16:19","1 Cor 14:29","1 Thess 5:21","Rev 2:2"]},{"a":"many","r":["1 John 2:18","Matt 24:5,23-26","Mark 13:21","Luke 21:8","Acts 20:29","1 Tim 4:1","2 Tim 3:13","2 Pet 2:1","2 John 1:7"]}],"1jn.4.10":[{"a":"Herein","r":["1 John 4:8-9","1 John 3:1"]},{"a":"not","r":["1 John 4:19","Deut 7:7-8","John 15:16","Rom 5:8-10","Rom 8:29-30","2 Cor 5:19-21","Eph 2:4-5","Titus 3:3-5"]},{"a":"and sent","r":["1 John 2:2","Dan 9:24","Rom 3:25-26","1 Pet 2:24","1 Pet 3:18"]}],"1jn.4.11":[{"a":"Beloved, if God so loved us, we ought also to love one another.","r":["1 John 3:16-17,23","Matt 18:32-33","Luke 10:37","John 13:34","John 15:12-13","2 Cor 8:8-9","Eph 4:31-32","Eph 5:1-2","Col 3:13"]}],"1jn.4.12":[{"a":"seen","r":["1 John 4:20","Gen 32:30","Exod 33:20","Num 12:8","John 1:18","1 Tim 1:17","1 Tim 6:16","Heb 11:27"]},{"a":"love one","r":["1 John 4:6","1 John 3:24"]},{"a":"and his","r":["1 John 4:17-18","1 John 2:5","1 Cor 13:13"]}],"1jn.4.13":[{"a":"Hereby know we that we dwell in him, and he in us, because he hath given us of his Spirit.","r":["1 John 4:15-16","1 John 3:24","John 14:20-26","Rom 8:9-17","1 Cor 2:12","1 Cor 3:16-17","1 Cor 6:19","Gal 5:22-25","Eph 2:20-22"]}],"1jn.4.14":[{"a":"we have","r":["1 John 1:1-3","1 John 5:9","John 1:14","John 3:11,32","John 5:39","John 15:26-27","Acts 18:5","1 Pet 5:12"]},{"a":"the Father","r":["1 John 4:10","John 3:34","John 5:36-37","John 10:36"]},{"a":"the Saviour","r":["1 John 2:1-2","John 1:29","John 3:16-17","John 4:42","John 12:47"]}],"1jn.4.15":[{"a":"confess","r":["1 John 4:2","1 John 5:1,5","Matt 10:32","Luke 12:8","Rom 10:9","Phil 2:11","2 John 1:7"]},{"a":"God dwelleth","r":["1 John 4:12","1 John 3:24"]}],"1jn.4.16":[{"a":"we","r":["1 John 4:9-10","1 John 3:1,16","Ps 18:1-3","Ps 31:19","Ps 36:7-9","Isa 64:4","1 Cor 2:9"]},{"a":"God is love","r":["1 John 4:8,12-13"]},{"a":"and he","r":["1 John 4:12","1 John 3:24"]}],"1jn.4.17":[{"a":"made","r":["1 John 4:12","1 John 2:5","Jas 2:22"]},{"a":"we may","r":["1 John 2:28","1 John 3:19-21","Jas 2:13"]},{"a":"the day","r":["Matt 10:15","Matt 11:22,24","Matt 12:36","2 Pet 2:9","2 Pet 3:7"]},{"a":"as","r":["1 John 3:3","Matt 10:25","John 15:20","Rom 8:29","Heb 12:2-3","1 Pet 3:16-18","1 Pet 4:1-3,13-14"]}],"1jn.4.18":[{"a":"is no","r":["Luke 1:74-75","Rom 8:15","2 Tim 1:7","Heb 12:28"]},{"a":"fear hath","r":["Job 15:21","Ps 73:19","Ps 88:15-16","Ps 119:120","Jas 2:19"]},{"a":"He that","r":["1 John 4:12"]}],"1jn.4.19":[{"a":"We love him, because he first loved us.","r":["1 John 4:10","Luke 7:47","John 3:16","John 15:16","2 Cor 5:14-15","Gal 5:22","Eph 2:3-5","Titus 3:3-5"]}],"1jn.4.2":[{"a":"Every","r":["1 John 5:1","John 16:13-15","1 Cor 12:3"]},{"a":"come","r":["1 John 4:3","John 1:14","1 Tim 3:16"]}],"1jn.4.20":[{"a":"a man","r":["1 John 2:4","1 John 3:17"]},{"a":"not","r":["1 John 4:12"]}],"1jn.4.21":[{"a":"And this commandment have we from him, That he who loveth God love his brother also.","r":["1 John 4:11","1 John 3:11,14,18,23","Lev 19:18","Matt 22:37-39","Mark 12:29-33","Luke 10:37","John 13:34-35","John 15:12","Rom 12:9-10","Rom 13:9-10","Gal 5:6,14","1 Thess 4:9","1 Pet 3:8","1 Pet 4:8"]}],"1jn.4.3":[{"a":"and this","r":["1 John 2:18,22","2 Thess 2:7-8","2 John 1:7"]}],"1jn.4.4":[{"a":"are","r":["1 John 4:6,16","1 John 3:9-10","1 John 5:19"]},{"a":"and have","r":["1 John 2:13","1 John 5:4","Rom 8:37","Eph 6:10,13","Rev 12:11"]},{"a":"greater","r":["1 John 4:13,16","1 John 3:24","John 10:28-30","John 14:17-23","John 17:23","Rom 8:10-11","1 Cor 6:13","2 Cor 6:16","Eph 3:17"]},{"a":"than","r":["1 John 5:19","John 12:31","John 14:30","John 16:11","1 Cor 2:12","2 Cor 4:4","Eph 2:2","Eph 6:12"]}],"1jn.4.5":[{"a":"are","r":["Ps 17:4","Luke 16:8","John 3:31","John 7:6-7","John 8:23","John 15:19-20","John 17:14,16","Rev 12:9"]},{"a":"and","r":["Isa 30:10-11","Jer 5:31","Jer 29:8","Mic 2:11","John 15:19","John 17:14","2 Tim 4:3","2 Pet 2:2-3"]}],"1jn.4.6":[{"a":"We are","r":["1 John 4:4","Mic 3:8","Rom 1:1","1 Cor 2:12-14","2 Pet 3:2","Jude 1:17"]},{"a":"he that knoweth","r":["1 John 4:8","Luke 10:22","John 8:19,45-50","John 10:27","John 13:20","John 18:37","John 20:21","1 Cor 14:37","2 Cor 10:7","2 Thess 1:8"]},{"a":"Hereby","r":["1 John 4:1","Isa 8:20"]},{"a":"the spirit of truth","r":["John 14:17","John 15:26"]},{"a":"and","r":["Isa 29:10","Hos 4:12","Mic 2:11","Rom 11:8","2 Thess 2:9-11"]}],"1jn.4.7":[{"a":"let","r":["1 John 4:20-21","1 John 2:10","1 John 3:10-23","1 John 5:1"]},{"a":"love is","r":["1 John 4:8","Deut 30:6","Gal 5:22","1 Thess 4:9-10","2 Tim 1:7","1 Pet 1:22"]},{"a":"every","r":["1 John 4:12","1 John 2:29","1 John 3:14","1 John 5:1"]},{"a":"and knoweth","r":["John 17:3","2 Cor 4:6","Gal 4:9"]}],"1jn.4.8":[{"a":"knoweth","r":["1 John 2:4,9","1 John 3:6","John 8:54-55"]},{"a":"God is","r":["1 John 1:5","Exod 34:6-7","Ps 86:5,15","2 Cor 13:11","Eph 2:4","Heb 12:29"]}],"1jn.4.9":[{"a":"was","r":["1 John 3:16","John 3:16","Rom 5:8-10","Rom 8:32"]},{"a":"God sent","r":["1 John 4:10","Luke 4:18","John 5:23","John 6:29","John 8:29,42"]},{"a":"only","r":["Ps 2:7","Mark 12:6","John 1:14-18","John 3:18","Heb 1:5"]},{"a":"we","r":["1 John 5:11","John 6:51,57","John 10:10,28-30","John 11:25-26","John 14:6","Col 3:3-4"]}],"1jn.5.1":[{"a":"believeth","r":["1 John 2:22-23","1 John 4:2,14-15","Matt 16:16","John 1:12-13","John 6:69","Acts 8:37","Rom 10:9-10"]},{"a":"is born","r":["1 John 5:4","1 John 2:29","1 John 3:9","1 John 4:7"]},{"a":"and every","r":["1 John 2:10","1 John 3:14,17","1 John 4:20","John 15:23","Jas 1:18","1 Pet 1:3,22-23"]}],"1jn.5.10":[{"a":"that believeth on","r":["1 John 5:1","John 3:16"]},{"a":"hath the","r":["Ps 25:14","Prov 3:32","Rom 8:16","Gal 4:6","Col 3:3","2 Pet 1:19","Rev 2:17,28"]},{"a":"hath made","r":["1 John 1:10","Num 23:19","Job 24:25","Isa 53:1","Jer 15:18","John 3:33","John 5:38","Heb 3:12"]}],"1jn.5.11":[{"a":"this","r":["1 John 5:7,10","John 1:19,32-34","John 8:13-14","John 19:35","3 John 1:12","Rev 1:2"]},{"a":"God","r":["1 John 5:13","1 John 2:25","Matt 25:46","John 3:15-16,36","John 4:4,36","John 6:40,47,68","John 10:28","John 12:50","John 17:2-3","Rom 5:21","Rom 6:23","1 Tim 1:16","Titus 1:2","Jude 1:21"]},{"a":"this","r":["1 John 5:12,20","1 John 1:1-3","1 John 4:9","John 1:4","John 5:21,26","John 11:25-26","John 14:6","Col 3:3-4","Rev 22:1"]}],"1jn.5.12":[{"a":"that hath the","r":["1 John 2:23-24","John 1:12","John 3:36","John 5:24","1 Cor 1:30","Gal 2:20","Heb 3:14","2 John 1:9"]},{"a":"and he","r":["Mark 16:16","John 3:36"]}],"1jn.5.13":[{"a":"have I","r":["1 John 1:4","1 John 2:1,13-14,21,26","John 20:31","John 21:24","1 Pet 5:12"]},{"a":"believe","r":["1 John 3:23","John 1:12","John 2:23","John 3:18","Acts 3:16","Acts 4:12","1 Tim 1:15-16"]},{"a":"ye may know","r":["1 John 5:10","1 John 1:1-2","Rom 8:15-17","2 Cor 5:1","Gal 4:6","2 Pet 1:10-11"]}],"1jn.5.14":[{"a":"this","r":["1 John 3:21","Eph 3:12","Heb 3:6,14","Heb 10:35"]},{"a":"if","r":["1 John 3:22","Jer 29:12-13","Jer 33:3","Matt 7:7-11","Matt 21:22","John 14:13","John 15:7","John 16:24","Jas 1:5-6","Jas 4:3","Jas 5:16"]},{"a":"he","r":["Job 34:28","Ps 31:22","Ps 34:17","Ps 69:33","Prov 15:29","John 9:31","John 11:42"]}],"1jn.5.15":[{"a":"if","r":["Prov 15:29","Jer 15:12-13"]},{"a":"we know","r":["Mark 11:24","Luke 11:9-10"]}],"1jn.5.16":[{"a":"he shall ask","r":["Gen 20:7,17","Exod 32:10-14,31-32","Exod 34:9","Num 12:13","Num 14:11-21","Deut 9:18-20","2 Chr 30:18-20","Job 42:7-9","Ps 106:23","Ezek 22:30","Amos 7:1-3","Jas 5:14-15"]},{"a":"There","r":["Num 15:30","Num 16:26-32","1 Sam 2:25","Jer 15:1-2","Matt 12:31-32","Mark 3:28-30","Luke 12:10","2 Tim 4:14","Heb 6:4-6","Heb 10:26-31","2 Pet 2:20-22"]},{"a":"I do not","r":["Jer 7:16","Jer 11:14","Jer 14:11","Jer 18:18-21","John 17:9"]}],"1jn.5.17":[{"a":"all","r":["1 John 3:4","Deut 5:32","Deut 12:32"]},{"a":"and","r":["1 John 5:16","Isa 1:18","Ezek 18:26-32","Rom 5:20-21","Jas 1:15","Jas 4:7-10"]}],"1jn.5.18":[{"a":"whosoever","r":["1 John 5:1,4","1 John 2:29","1 John 3:9","1 John 4:6","John 1:13","John 3:2-5","Jas 1:18","1 Pet 1:23"]},{"a":"keepeth","r":["1 John 5:21","1 John 3:3","Ps 17:4","Ps 18:23","Ps 39:1","Ps 119:101","Prov 4:23","John 15:4,7,9","Acts 11:23","Jas 1:27","Jude 1:21,24","Rev 2:13","Rev 3:8-10"]},{"a":"wicked","r":["1 John 2:13-14","1 John 3:12"]}],"1jn.5.19":[{"a":"we know","r":["1 John 5:10,13,20","1 John 3:14,24","1 John 4:4-6","Rom 8:16","2 Cor 1:12","2 Cor 5:1","2 Tim 1:12"]},{"a":"and the","r":["1 John 4:4-5","John 15:18-19","Rom 1:28-32","Rom 3:9-18","Gal 1:4","Titus 3:3","Jas 4:4"]},{"a":"in wickedness","r":["1 John 5:18","John 12:31","John 14:30","John 16:11","2 Cor 4:4","Eph 2:2","Rev 12:9","Rev 13:7-8","Rev 20:3,7-8"]}],"1jn.5.2":[{"a":"By this we know that we love the children of God, when we love God, and keep his commandments.","r":["1 John 3:22-24","1 John 4:21","John 13:34-35","John 15:17"]}],"1jn.5.20":[{"a":"we know","r":["1 John 5:1","1 John 4:2,14"]},{"a":"and hath","r":["Matt 13:11","Luke 21:15","Luke 24:45","John 17:3,14,25","1 Cor 1:30","2 Cor 4:6","Eph 1:17-19","Eph 3:18","Col 2:2-3"]},{"a":"him that","r":["John 14:6","John 17:3","Rev 3:7,14","Rev 6:10","Rev 15:3","Rev 19:11"]},{"a":"and we","r":["1 John 2:6,24","1 John 4:16","John 10:30","John 14:20,23","John 15:4","John 17:20-23","2 Cor 5:17","Phil 3:9"]},{"a":"This is","r":["1 John 5:11-13","1 John 1:1-3","Isa 9:6","Isa 44:6","Isa 45:14-15,21-25","Isa 54:5","Jer 10:10","Jer 23:6","John 1:1-3","John 14:9","John 20:28","Acts 20:28","Rom 9:5","1 Tim 3:16","Titus 2:13","Heb 1:8"]}],"1jn.5.21":[{"a":"Little","r":["1 John 2:1"]},{"a":"keep","r":["Exod 20:3-4","1 Cor 10:7,14","2 Cor 6:16-17","Rev 9:20","Rev 13:14-15","Rev 14:11"]},{"a":"Amen","r":["Matt 6:13"]}],"1jn.5.3":[{"a":"this","r":["Exod 20:6","Deut 5:10","Deut 7:9","Deut 10:12-13","Dan 9:4","Matt 12:47-50","John 14:15","John 14:21-24","John 15:10,14","2 John 1:6"]},{"a":"and","r":["Ps 19:7-11","Ps 119:45,47-48,103-104,127-128,140","Prov 3:17","Mic 6:8","Matt 11:28-30","Rom 7:12,22","Heb 8:10"]}],"1jn.5.4":[{"a":"whatsoever","r":["1 John 5:1","1 John 3:9"]},{"a":"overcometh","r":["1 John 5:5","1 John 2:13-17","1 John 4:4","John 16:33","Rom 8:35-37","1 Cor 15:57","Rev 2:7,11,17,26","Rev 3:5,12,21","Rev 12:11","Rev 15:2"]}],"1jn.5.5":[{"a":"but","r":["1 John 5:1","1 John 4:15"]}],"1jn.5.6":[{"a":"is he","r":["John 19:34-35"]},{"a":"by water and","r":["Isa 45:3-4","Ezek 36:25","John 1:31-33","John 3:5","John 4:10,14","John 7:38-39","Acts 8:36","Eph 5:25-27","Titus 3:5","1 Pet 3:21"]},{"a":"blood","r":["1 John 1:7","1 John 4:10","Lev 17:11","Zech 9:11","Matt 26:28","Mark 14:24","Luke 22:20","John 6:55","Rom 3:25","Eph 1:7","Col 1:4","Heb 9:7,14","Heb 10:29","Heb 12:24","Heb 13:20","1 Pet 1:2","Rev 1:5","Rev 5:9","Rev 7:14"]},{"a":"the Spirit that","r":["1 John 5:7-8","John 14:17","John 15:26","1 Tim 3:16"]},{"a":"is truth","r":["John 14:6","John 16:13"]}],"1jn.5.7":[{"a":"bear","r":["1 John 5:10-11","John 8:13-14"]},{"a":"The Father","r":["Ps 33:6","Isa 48:16-17","Isa 61:1","Matt 3:16-17","Matt 17:5","Matt 28:19","John 5:26","John 8:18,54","John 10:37-38","John 12:28","1 Cor 12:4-6","2 Cor 13:14","Rev 1:4-5"]},{"a":"the Word","r":["1 John 1:1","John 1:1,32-34","Heb 4:12-13","Rev 19:13"]},{"a":"the Holy","r":["1 John 5:6","Matt 3:16","John 1:33","Acts 2:33","Acts 5:32","Heb 2:3-4"]},{"a":"and these","r":["Deut 6:4","Matt 28:19","John 10:30"]}],"1jn.5.8":[{"a":"the spirit","r":["1 John 5:6","Matt 26:26-28","Matt 28:19","John 15:26","Rom 8:16","Heb 6:4"]},{"a":"the water","r":["Acts 2:2-4","2 Cor 1:22"]},{"a":"the blood","r":["Heb 13:12","1 Pet 3:21"]},{"a":"and these","r":["Mark 14:56","Acts 15:15"]}],"1jn.5.9":[{"a":"we","r":["1 John 5:10","John 3:32-33","John 5:31-36,39","John 8:17-19","John 10:38","Acts 5:32","Acts 17:31","Heb 2:4","Heb 6:18"]},{"a":"for","r":["Matt 3:16-17","Matt 17:5"]}],"eph.2.1":[{"a":"you","r":["Eph 2:5-6","Eph 1:19-20","John 5:25","John 10:10","John 11:25-26","John 14:6","Rom 8:2","1 Cor 15:45","Col 2:13","Col 3:1-4"]},{"a":"dead","r":["Eph 2:5","Eph 4:18","Eph 5:14","Matt 8:22","Luke 15:24,32","John 5:21","2 Cor 5:14","1 Tim 5:6","1 John 3:14","Rev 3:1"]}],"eph.2.10":[{"a":"we are","r":["Deut 32:6","Ps 100:3","Ps 138:8","Isa 19:25","Isa 29:23","Isa 43:21","Isa 44:21","Isa 60:21","Isa 61:3","Jer 31:33","Jer 32:39-40","John 3:3-6,21","1 Cor 3:9","2 Cor 5:5,17","Phil 1:6","Phil 2:13","Heb 13:21"]},{"a":"created","r":["Eph 4:24","Ps 51:10","2 Cor 5:17","Gal 6:15","Col 3:10"]},{"a":"good","r":["Matt 5:16","Acts 9:36","2 Cor 9:8","Col 1:10","2 Thess 2:17","1 Tim 2:10","1 Tim 5:10,25","1 Tim 6:18","2 Tim 2:21","2 Tim 3:17","Titus 2:7,14","Titus 3:1,8,14","Heb 10:24","Heb 13:21","1 Pet 2:12"]},{"a":"which","r":["Eph 1:4","Rom 8:29"]},{"a":"walk","r":["Eph 2:2","Eph 4:1","Deut 5:33","Ps 81:13","Ps 119:3","Isa 2:3-5","Acts 9:31","Rom 8:1","1 John 1:7","1 John 2:6"]}],"eph.2.11":[{"a":"remember","r":["Eph 5:8","Deut 5:15","Deut 8:2","Deut 9:7","Deut 15:15","Deut 16:12","Isa 51:1-2","Ezek 16:61-63","Ezek 20:43","Ezek 36:31","1 Cor 6:11","1 Cor 12:2","Gal 4:8-9"]},{"a":"Gentiles","r":["Rom 2:29","Gal 2:15","Gal 6:12","Col 1:21","Col 2:13"]},{"a":"Uncircumcision","r":["1 Sam 17:26,36","Jer 9:25-26","Phil 3:3","Col 3:11"]},{"a":"made","r":["Col 2:11"]}],"eph.2.12":[{"a":"without","r":["John 10:16","John 15:5","Col 1:21"]},{"a":"aliens","r":["Eph 4:18","Ezra 4:3","Isa 61:5","Ezek 13:9","Heb 11:34"]},{"a":"the covenants","r":["Gen 15:18","Gen 17:7-9","Exod 24:3-11","Num 18:19","Ps 89:3-18","Jer 31:31-34","Jer 33:20-26","Ezek 37:26","Luke 1:72","Acts 3:25","Rom 9:4-5,8","Gal 3:16-17"]},{"a":"having","r":["Jer 14:8","Jer 17:13","John 4:22","Acts 28:20","Col 1:5,27","1 Thess 4:13","2 Thess 2:16","1 Tim 1:1","Heb 6:18","1 Pet 1:3,21","1 Pet 3:15","1 John 3:3"]},{"a":"without","r":["2 Chr 15:3","Isa 44:6","Isa 45:20","Hos 3:4","Acts 14:15-16","Rom 1:28-32","1 Cor 8:4-6","1 Cor 10:19-20","Gal 4:8","1 Thess 4:5"]}],"eph.2.13":[{"a":"in","r":["Rom 8:1","1 Cor 1:30","2 Cor 5:17","Gal 3:28"]},{"a":"were","r":["Eph 2:12,17,19-22","Eph 3:5-8","Ps 22:7","Ps 73:27","Isa 11:10","Isa 24:15-16","Isa 43:6","Isa 49:12","Isa 57:19","Isa 60:4,9","Isa 66:19","Jer 16:19","Acts 2:39","Acts 15:14","Acts 22:21","Acts 26:18","Rom 15:8-12"]},{"a":"are","r":["Eph 2:16","Eph 1:7","Rom 3:23-30","Rom 5:9-10","1 Cor 6:11","2 Cor 5:20-21","Col 1:13-14,21-22","Heb 9:18","1 Pet 1:18-19","1 Pet 3:18","Rev 5:9"]}],"eph.2.14":[{"a":"our","r":["Isa 9:6-7","Ezek 34:24-25","Mic 5:5","Zech 6:13","Luke 1:79","Luke 2:14","John 16:33","Acts 10:36","Rom 5:1","Col 1:20","Heb 7:2","Heb 13:20"]},{"a":"both","r":["Eph 2:15","Eph 3:15","Eph 4:16","Isa 19:24-25","Ezek 37:19-20","John 10:16","John 11:52","1 Cor 12:12","Gal 3:28","Col 3:11"]},{"a":"the middle","r":["Esth 3:8","Acts 10:28","Col 2:10-14,20"]}],"eph.2.15":[{"a":"in his","r":["Col 1:22","Heb 10:19-22"]},{"a":"the law","r":["Gal 3:10","Col 2:14,20","Heb 7:16","Heb 8:13","Heb 9:9-10,23","Heb 10:1-10"]},{"a":"one","r":["Eph 4:16","2 Cor 5:17","Gal 6:15","Col 3:10"]}],"eph.2.16":[{"a":"reconcile","r":["Rom 5:10","2 Cor 5:18-21","Col 1:21-22"]},{"a":"having","r":["Eph 2:15","Rom 6:6","Rom 8:3,7","Gal 2:20","Col 2:14","1 Pet 4:1-2"]}],"eph.2.17":[{"a":"and preached","r":["Ps 85:10","Isa 27:5","Isa 52:7","Isa 57:19-21","Zech 9:10","Matt 10:13","Luke 2:14","Luke 15:5-6","Acts 2:39","Acts 10:36","Rom 5:1","2 Cor 5:20"]},{"a":"that","r":["Eph 2:13-14","Deut 4:7","Ps 75:1","Ps 76:1-2","Ps 147:19-20","Ps 148:14","Luke 10:9-11"]}],"eph.2.18":[{"a":"through","r":["Eph 3:12","John 10:7,9","John 14:6","Rom 5:2","Heb 4:15-16","Heb 7:19","Heb 10:19-20","1 Pet 1:21","1 Pet 3:18","1 John 2:1-2"]},{"a":"by","r":["Eph 4:4","Eph 6:18","Zech 12:10","Rom 8:15,26-27","1 Cor 12:13","Jude 1:20"]},{"a":"the","r":["Eph 3:14","Matt 28:19","John 4:21-23","1 Cor 8:6","Gal 4:6","Jas 3:9","1 Pet 1:17"]}],"eph.2.19":[{"a":"but","r":["Eph 3:6","Gal 3:26-28","Gal 4:26-31","Phil 3:20","Heb 12:22-24","Rev 21:12-26"]},{"a":"household","r":["Eph 3:15","Matt 10:25","Gal 6:10","1 John 3:1"]}],"eph.2.2":[{"a":"in time","r":["Eph 2:3","Eph 4:22","Job 31:7","Acts 19:35","1 Cor 6:11","Col 1:21","Col 3:7","1 Pet 4:3","1 John 5:19"]},{"a":"walked according","r":["Ps 17:14","Jer 23:10","Luke 16:8","John 7:7","John 8:23","John 15:19","Rom 12:2","1 Cor 5:10","Gal 1:4","2 Tim 4:10","Jas 1:7","Jas 4:4","1 John 2:15-17","1 John 5:4"]},{"a":"the prince","r":["Eph 6:12","John 8:44","John 12:31","John 14:30","John 16:11","1 John 5:19","Rev 12:9","Rev 13:8,14","Rev 20:2"]},{"a":"of the air","r":["Job 1:7,16,19","Rev 16:17"]},{"a":"the spirit","r":["Matt 12:43-45","Luke 11:21-26","Luke 22:2-3,31","John 13:2,27","Acts 5:3","2 Cor 4:4","1 John 3:8","1 John 4:4"]},{"a":"the children","r":["Eph 2:3","Eph 5:6","Isa 30:1","Isa 57:4","Hos 10:9","Matt 11:19","Matt 13:38","Col 3:6","1 Pet 1:14","2 Pet 2:14","1 John 3:10"]}],"eph.2.20":[{"a":"built","r":["Eph 4:12","1 Pet 2:4-5"]},{"a":"the foundation","r":["Eph 4:11-13","Isa 28:16","Matt 16:18","1 Cor 3:9-11","1 Cor 12:28","Gal 2:9","Rev 21:14"]},{"a":"Jesus","r":["Ps 118:22","Isa 28:16","Matt 21:42","Mark 12:10-11","Luke 20:17-18","Acts 4:11-12","1 Pet 2:7-8"]}],"eph.2.21":[{"a":"all","r":["Eph 4:13-16","Ezek 40:1-42","1 Cor 3:9","Heb 3:3-4"]},{"a":"fitly","r":["Exod 26:1-37","1 Kgs 6:7"]},{"a":"an","r":["Ps 93:5","Ezek 42:12","1 Cor 3:17","2 Cor 6:16"]}],"eph.2.22":[{"a":"an","r":["John 14:17-23","John 17:21-23","Rom 8:9-11","1 Cor 3:16","1 Cor 6:19","1 Pet 2:4-5","1 John 3:24","1 John 4:13,16"]}],"eph.2.3":[{"a":"we","r":["Isa 53:6","Isa 64:6-7","Dan 9:5-9","Rom 3:9-19","1 Cor 6:9-11","Gal 2:15-16","Gal 3:22","Titus 3:3","1 Pet 4:3","1 John 1:8-10"]},{"a":"in times","r":["Eph 4:17-19","Acts 14:16","Acts 17:30-31","Rom 11:30","1 Pet 2:10","1 John 2:8"]},{"a":"in the","r":["Eph 4:22","Mark 4:19","John 8:44","Rom 1:24","Rom 6:12","Rom 13:14","Gal 5:16-24","1 Tim 6:9","Jas 4:1-3","1 Pet 1:14","1 Pet 2:11","1 Pet 4:2","2 Pet 2:18","1 John 2:16","Jude 1:16-18"]},{"a":"fulfilling","r":["Rom 8:7-8","2 Cor 7:1","Gal 5:19-21"]},{"a":"desires","r":["John 1:13"]},{"a":"by","r":["Gen 5:3","Gen 6:5","Gen 8:21","Job 14:4","Job 15:14-16","Job 25:4","Ps 51:5","Mark 7:21-22","John 3:1-6","Rom 5:12-19","Rom 7:18","Gal 2:15-16"]},{"a":"children","r":["Eph 2:2","Rom 9:22"]},{"a":"even","r":["Rom 3:9,22-23","1 Cor 4:7"]}],"eph.2.4":[{"a":"who","r":["Eph 2:7","Eph 1:7","Eph 3:8","Exod 33:19","Exod 34:6-7","Neh 9:17","Ps 51:1","Ps 86:5,15","Ps 103:8-11","Ps 145:8","Isa 55:6-8","Dan 9:9","Jonah 4:2","Mic 7:18-20","Luke 1:78","Rom 2:4","Rom 5:20-21","Rom 9:23","Rom 10:12","1 Tim 1:14","1 Pet 1:3"]},{"a":"his","r":["Deut 7:7-8","Deut 9:5-6","Jer 31:3","Ezek 16:6-8","John 3:14-17","Rom 5:8","Rom 9:15-16","2 Thess 2:13","2 Tim 1:9","Titus 3:4-7","1 John 4:10-19"]}],"eph.2.5":[{"a":"dead","r":["Eph 2:1","Rom 5:6,8,10"]},{"a":"quickened","r":["Eph 2:1","Eph 5:14","John 5:21","John 6:63","Rom 8:2"]},{"a":"grace ye","r":["Eph 2:8","Acts 15:11","Rom 3:24","Rom 4:16","Rom 11:5-6","Rom 16:20","2 Cor 13:14","Titus 2:11","Titus 3:5","Rev 22:21"]}],"eph.2.6":[{"a":"hath","r":["Eph 1:19-20","Rom 6:4-5","Col 1:18","Col 2:12-13","Col 3:1-3"]},{"a":"sit","r":["Matt 26:29","Luke 12:37","Luke 22:29-30","John 12:26","John 14:3","John 17:21-26","Rev 3:20-21"]},{"a":"in","r":["Eph 1:3"]}],"eph.2.7":[{"a":"in the","r":["Eph 3:5,21","Ps 41:13","Ps 106:48","Isa 60:15","1 Tim 1:17"]},{"a":"shew","r":["Eph 2:4","2 Thess 1:12","1 Tim 1:16","1 Pet 1:12","Rev 5:9-14"]},{"a":"in his","r":["Titus 3:4"]}],"eph.2.8":[{"a":"by","r":["Eph 2:5","Rom 3:24","2 Thess 1:9"]},{"a":"through","r":["Mark 16:16","Luke 7:50","John 3:14-18,36","John 5:24","John 6:27-29,35,40","Acts 13:39","Acts 15:7-9","Acts 16:31","Rom 3:22-26","Rom 4:5,16","Rom 10:9-10","Gal 3:14,22","1 John 5:10-12"]},{"a":"that","r":["Eph 2:10","Eph 1:19","Matt 16:17","John 1:12-13","John 6:37,44,65","Acts 14:27","Acts 16:14","Rom 10:14,17","Phil 1:29","Col 2:12","Jas 1:16-18"]}],"eph.2.9":[{"a":"Not of works, lest any man should boast.","r":["Rom 3:20,27-28","Rom 4:2","Rom 9:11,16","Rom 11:6","1 Cor 1:29-31","2 Tim 1:9","Titus 3:3-5"]}],"gen.1.1":[{"a":"beginning","r":["Prov 8:22-24","Prov 16:4","Mark 13:19","John 1:1-3","Heb 1:10","1 John 1:1"]},{"a":"God","r":["Exod 20:11","Exod 31:18","1 Chr 16:26","Neh 9:6","Job 26:13","Job 38:4","Ps 8:3","Ps 33:6,9","Ps 89:11-12","Ps 96:5","Ps 102:25","Ps 104:24,30","Ps 115:15","Ps 121:2","Ps 124:8","Ps 134:3","Ps 136:5","Ps 146:6","Ps 148:4-5","Prov 3:19","Prov 8:22-30","Eccl 12:1","Isa 37:16","Isa 40:26","Isa 40:28","Isa 42:5","Isa 44:24","Isa 45:18","Isa 51:13,16","Isa 65:17","Jer 10:12","Jer 32:17","Jer 51:15","Zech 12:1","Matt 11:25","Acts 4:24","Acts 14:15","Acts 17:24","Rom 1:19-20","Rom 11:36","1 Cor 8:6","Eph 3:9","Col 1:16-17","Heb 1:2","Heb 3:4","Heb 11:3","2 Pet 3:5","Rev 3:14","Rev 4:11","Rev 10:6","Rev 14:7","Rev 21:6","Rev 22:13"]}],"gen.1.10":[{"a":"God saw","r":["Gen 1:4","Deut 32:4","Ps 104:31"]}],"gen.1.11":[{"a":"Let the","r":["Gen 2:5","Job 28:5","Ps 104:14-17","Ps 147:8","Matt 6:30","Heb 6:7"]},{"a":"fruit","r":["Gen 1:29","Gen 2:9,16","Ps 1:3","Jer 17:8","Matt 3:10","Matt 7:16-20","Mark 4:28","Luke 6:43-44","Jas 3:12"]}],"gen.1.12":[{"a":"earth","r":["Isa 61:11","Mark 4:28"]},{"a":"herb","r":["Isa 55:10-11","Matt 13:24-26","Luke 6:44","2 Cor 9:10","Gal 6:7"]}],"gen.1.14":[{"a":"Let there","r":["Deut 4:19","Job 25:3,5","Job 38:12-14","Ps 8:3-4","Ps 19:1-6","Ps 74:16-17","Ps 104:19-20","Ps 119:91","Ps 136:7-9","Ps 148:3,6","Isa 40:26","Jer 31:35","Jer 33:20,25"]},{"a":"lights","r":["Gen 8:22","Gen 9:13","Job 3:9","Job 38:31-32","Ps 81:3","Ezek 32:7-8","Ezek 46:1,6","Joel 2:10,30-31","Joel 3:15","Amos 5:8","Amos 8:9","Matt 2:2","Matt 16:2-3","Matt 24:29","Mark 13:24","Luke 21:25-26","Luke 23:45","Acts 2:19-20","Rev 6:12","Rev 8:12","Rev 9:2"]}],"gen.1.16":[{"a":"to rule","r":["Deut 4:19","Josh 10:12-14","Job 31:26","Job 38:7","Ps 8:3","Ps 19:6","Ps 74:16","Ps 136:7-9","Ps 148:3,5","Isa 13:10","Isa 24:23","Isa 45:7","Hab 3:11","Matt 24:29","Matt 27:45","1 Cor 15:41","Rev 16:8-9","Rev 21:23"]}],"gen.1.17":[{"a":"And God set them in the firmament of the heaven to give light upon the earth,","r":["Gen 9:13","Job 38:12","Ps 8:1,3","Acts 13:47"]}],"gen.1.18":[{"a":"And to rule over the day and over the night, and to divide the light from the darkness: and God saw that it was good.","r":["Ps 19:6","Jer 31:35"]}],"gen.1.2":[{"a":"without","r":["Job 26:7","Isa 45:18","Jer 4:23","Nah 2:10"]},{"a":"Spirit","r":["Job 26:14","Ps 33:6","Ps 104:30","Isa 40:12-14"]}],"gen.1.20":[{"a":"Let the waters","r":["Gen 1:22","Gen 2:19","Gen 8:17","Ps 104:24-25","Ps 148:10","Acts 17:25"]},{"a":"moving","r":["1 Kgs 4:33"]},{"a":"life","r":["Gen 1:30","Eccl 2:21"]},{"a":"open firmament","r":["Gen 1:7,14"]}],"gen.1.21":[{"a":"great","r":["Gen 6:20","Gen 7:14","Gen 8:19","Job 7:12","Job 26:5","Ps 104:24-26","Ezek 32:2","Jonah 1:17","Jonah 2:10","Matt 12:40"]},{"a":"brought","r":["Gen 8:17","Gen 9:7","Exod 1:7","Exod 8:3"]},{"a":"God saw","r":["Gen 1:18,25,31"]}],"gen.1.22":[{"a":"And God blessed them, saying, Be fruitful, and multiply, and fill the waters in the seas, and let fowl multiply in the earth.","r":["Gen 1:28","Gen 8:17","Gen 9:1","Gen 30:27,30","Gen 35:11","Lev 26:9","Job 40:15","Job 42:12","Ps 107:31,38","Ps 128:3","Ps 144:13-14","Prov 10:22"]}],"gen.1.24":[{"a":"Let","r":["Gen 6:20","Gen 7:14","Gen 8:19","Job 38:39-40","Job 39:1,5,9,19","Job 40:15","Ps 50:9-10","Ps 104:18,23","Ps 148:10"]}],"gen.1.25":[{"a":"And God made the beast of the earth after his kind, and cattle after their kind, and every thing that creepeth upon the earth after his kind: and God saw that it was good.","r":["Gen 2:19-20","Job 12:8-10","Job 26:13"]}],"gen.1.26":[{"a":"Let us","r":["Gen 3:22","Gen 11:7","Job 35:10","Ps 100:3","Ps 149:2","Isa 64:8","John 5:17","John 14:23","1 John 5:7"]},{"a":"in our","r":["Gen 5:1","Gen 9:6","Eccl 7:29","Acts 17:26,28-29","1 Cor 11:7","2 Cor 3:18","2 Cor 4:4","Eph 4:24","Col 1:15","Col 3:10","Jas 3:9"]},{"a":"have dominion","r":["Gen 9:2-4","Job 5:23","Ps 8:4-8","Ps 104:20-24","Jer 27:6","Heb 2:6-9","Jas 3:7,9"]}],"gen.1.27":[{"a":"in the image","r":["Ps 139:14","Isa 43:7","Rom 8:29","Eph 2:10","Eph 4:24","Col 1:15","Col 1:26"]},{"a":"male","r":["Gen 2:21-25","Gen 5:2","Mal 2:15","Matt 19:4","Mark 10:6","1 Cor 11:8-9"]}],"gen.1.28":[{"a":"And God blessed them, and God said unto them, Be fruitful, and multiply","r":["Gen 1:22","Gen 8:17","Gen 9:1,7","Gen 17:16,20","Gen 22:17-18","Gen 24:60","Gen 26:4,24","Gen 49:25","Lev 26:9","Ps 127:1-5","Ps 128:3-4"]},{"a":"replenish the earth","r":["Isa 45:18","Exod 1:7"]},{"a":"subdue it","r":["Heb 2:5-9","1 Cor 15:27-28","Dan 7:13-14"]},{"a":"have dominion over","r":["Ps 8:6-8","Rev 5:10"]}],"gen.1.29":[{"a":"I have","r":["Ps 24:1","Ps 115:16","Hos 2:8","Acts 17:24-25,28","1 Tim 6:17"]},{"a":"to you","r":["Gen 2:16","Gen 9:3","Job 36:31","Ps 104:14-15,27-28","Ps 111:5","Ps 136:25","Ps 145:15-16","Ps 146:7","Ps 147:9","Isa 33:16","Matt 6:11,25-26","Acts 14:17"]}],"gen.1.3":[{"a":"God","r":["Ps 33:6,9","Ps 148:5","Matt 8:3","John 11:43"]},{"a":"Let","r":["Job 36:30","Job 38:19","Ps 97:11","Ps 104:2","Ps 118:27","Isa 45:7","Isa 60:19","John 1:5,9","John 3:19","2 Cor 4:6","Eph 5:8,14","1 Tim 6:16","1 John 1:5","1 John 2:8"]}],"gen.1.30":[{"a":"And to every beast of the earth, and to every fowl of the air, and to every thing that creepeth upon the earth, wherein there is","r":["Gen 9:3","Job 38:39-41","Job 39:4,8,30","Job 40:15,20","Ps 104:14","Ps 145:15-16","Ps 147:9"]}],"gen.1.31":[{"a":"very good","r":["Job 38:7","Ps 19:1-2","Ps 104:24,31","Lam 3:38","1 Tim 4:4"]},{"a":"and the","r":["Gen 1:5,8,13,19,23","Gen 2:2","Exod 20:11"]}],"gen.1.4":[{"a":"that","r":["Gen 1:10,12,18,25,31","Eccl 2:13","Eccl 11:7"]}],"gen.1.5":[{"a":"Day, and","r":["Gen 8:22","Ps 19:2","Ps 74:16","Ps 104:20","Isa 45:7","Jer 33:20","1 Cor 3:13","Eph 5:13","1 Thess 5:5"]},{"a":"And the evening and the morning were","r":["Gen 1:8,13,19,23,31"]}],"gen.1.6":[{"a":"Let there","r":["Gen 1:14,20","Gen 7:11-12","Job 26:7-8,13","Job 37:11,18","Job 38:22-26","Ps 19:1","Ps 33:6,9","Ps 104:2","Ps 136:5-6","Ps 148:4","Ps 150:1","Eccl 11:3","Jer 10:10,12-13","Jer 51:15","Zech 12:1"]}],"gen.1.7":[{"a":"divided","r":["Prov 8:28-29"]},{"a":"above","r":["Job 26:8","Ps 104:10","Ps 148:4","Eccl 11:3"]},{"a":"and it","r":["Gen 1:9,11,15,24","Matt 8:27"]}],"gen.1.8":[{"a":"God","r":["Gen 1:5,10","Gen 5:2"]},{"a":"evening","r":["Gen 1:5,13,19,23,31"]}],"gen.1.9":[{"a":"And God said, Let the waters under the heaven be gathered together unto one place, and let the dry land appear: and it was so.","r":["Job 26:7,10","Job 38:8-11","Ps 24:1-2","Ps 33:7","Ps 95:5","Ps 104:3,5-9","Ps 136:5-6","Prov 8:28-29","Eccl 1:7","Jer 5:22","Jonah 1:9","2 Pet 3:5","Rev 10:6"]}],"gen.2.1":[{"a":"Thus","r":["Gen 2:4","Gen 1:1,10","Exod 20:11","Exod 31:17","2 Kgs 19:15","2 Chr 2:12","Neh 9:6","Job 12:9","Ps 89:11-13","Ps 104:2","Ps 136:5-8","Ps 146:6","Isa 42:5","Isa 45:18","Isa 48:13","Isa 55:9","Isa 65:17","Jer 10:12,16","Zech 12:1","Acts 4:24","Heb 4:3"]},{"a":"host","r":["Deut 4:19","Deut 17:3","2 Kgs 21:3-5","Ps 33:6,9","Isa 34:4","Isa 40:26-28","Isa 45:12","Jer 8:2","Luke 2:13","Acts 7:42"]}],"gen.2.10":[{"a":"a river","r":["Ps 46:4","Rev 22:1"]}],"gen.2.11":[{"a":"Havilah","r":["Gen 10:7,29","Gen 25:18","1 Sam 15:7"]}],"gen.2.12":[{"a":"And the gold of that land is good: there is bdellium and the","r":["Num 11:7"]},{"a":"onyx","r":["Exod 28:20","Exod 39:13","Job 28:16","Ezek 28:13"]}],"gen.2.13":[{"a":"Ethiopia","r":["Gen 10:6","Isa 11:11"]}],"gen.2.14":[{"a":"Hiddekel","r":["Dan 10:4"]},{"a":"toward the east of","r":["Gen 10:11,22","Gen 25:18"]},{"a":"Euphrates","r":["Gen 15:18","Deut 1:7","Deut 11:24","Rev 9:14"]}],"gen.2.15":[{"a":"the man","r":["Gen 2:2","Job 31:33"]},{"a":"put","r":["Gen 2:8","Ps 128:2","Eph 4:28"]}],"gen.2.16":[{"a":"God","r":["1 Sam 15:22"]},{"a":"thou mayest freely eat","r":["Gen 2:9","Gen 3:1-2","1 Tim 4:4","1 Tim 6:17"]}],"gen.2.17":[{"a":"of the tree","r":["Gen 2:9","Gen 3:1-3,11,17,19"]},{"a":"surely","r":["Gen 3:3-4,19","Gen 20:7","Num 26:65","Deut 27:26","1 Sam 14:39,44","1 Sam 20:31","1 Sam 22:16","1 Kgs 2:37,42","Jer 26:8","Ezek 3:18-20","Ezek 18:4,13,32","Ezek 33:8,14","Rom 1:32","Rom 5:12-21","Rom 6:16,23","Rom 7:10-13","Rom 8:2","1 Cor 15:22,56","Gal 3:10","Eph 2:1-6","Eph 5:14","Col 2:13","1 Tim 5:6","Jas 1:15","1 John 5:16","Rev 2:11","Rev 20:6,14","Rev 21:8"]}],"gen.2.18":[{"a":"good","r":["Gen 1:31","Gen 3:12","Ruth 3:1","Prov 18:22","Eccl 4:9-12","1 Cor 7:36"]},{"a":"I will","r":["Gen 3:12","1 Cor 11:7-12","1 Tim 2:11-13","1 Pet 3:7"]}],"gen.2.19":[{"a":"And out","r":["Gen 1:20-25"]},{"a":"brought","r":["Gen 2:22-23","Gen 1:26,28","Gen 6:20","Gen 9:2","Ps 8:4-8"]}],"gen.2.2":[{"a":"And on","r":["Gen 1:31","Exod 20:11","Exod 23:12","Exod 31:17","Deut 5:14","Isa 58:13","John 5:17","Heb 4:4"]}],"gen.2.21":[{"a":"And the LORD God caused a deep sleep to fall upon Adam, and he slept: and he took one of his ribs, and closed up the flesh instead thereof;","r":["Gen 15:12","1 Sam 26:12","Job 4:13","Job 33:15","Prov 19:15","Dan 8:18"]}],"gen.2.22":[{"a":"made","r":["Ps 127:1","1 Tim 2:13"]},{"a":"brought","r":["Gen 2:19","Prov 18:22","Prov 19:14","Heb 13:4"]}],"gen.2.23":[{"a":"bone","r":["Gen 29:14","Judg 9:2","2 Sam 5:1","2 Sam 19:13","Eph 5:30"]},{"a":"Woman","r":["1 Cor 11:8-9"]},{"a":"taken","r":["1 Cor 11:8"]}],"gen.2.24":[{"a":"leave","r":["Gen 24:58-59","Gen 31:14-15","Ps 45:10"]},{"a":"cleave","r":["Lev 22:12-13","Deut 4:4","Deut 10:20","Josh 23:8","Ps 45:10","Prov 12:4","Prov 31:10","Acts 11:23"]},{"a":"and they shall be one flesh","r":["Mal 2:14-16","Matt 19:3-9","Mark 10:6-12","Rom 7:2","1 Cor 6:16-17","1 Cor 7:2-4,10","1 Cor 7:11","Eph 5:28-31","1 Tim 5:14","1 Pet 3:1-7"]}],"gen.2.25":[{"a":"naked","r":["Gen 3:7,10-11"]},{"a":"ashamed","r":["Exod 32:25","Ps 25:3","Ps 31:17","Isa 44:9","Isa 47:3","Isa 54:4","Jer 6:15","Jer 17:13","Ezek 16:61","Joel 2:26","Mark 8:38","Luke 9:26","Rom 10:11"]}],"gen.2.3":[{"a":"blessed","r":["Exod 16:22-30","Exod 20:8-11","Exod 23:12","Exod 31:13-17","Exod 34:21","Exod 35:2-3","Lev 23:3","Lev 25:2-3","Deut 5:12-14","Neh 9:14","Neh 13:15-22","Prov 10:22","Isa 56:2-7","Isa 58:13-14","Jer 17:21-27","Ezek 20:12","Mark 2:27","Luke 23:56","Heb 4:4-10"]}],"gen.2.4":[{"a":"the generations","r":["Gen 1:4","Gen 5:1","Gen 10:1","Gen 11:10","Gen 25:12,19","Gen 36:1,9","Exod 6:16","Job 38:28","Ps 90:1-2"]},{"a":"Lord","r":["Exod 15:3","1 Kgs 18:39","2 Chr 20:6","Ps 18:31","Ps 86:10","Isa 44:6","Rev 1:4,8","Rev 11:17","Rev 16:5"]}],"gen.2.5":[{"a":"plant","r":["Gen 1:12","Ps 104:14"]},{"a":"had not","r":["Job 5:10","Job 38:26-28","Ps 65:9-11","Ps 135:7","Jer 14:22","Matt 5:45","Heb 6:7"]},{"a":"to till","r":["Gen 3:23","Gen 4:2,12"]}],"gen.2.7":[{"a":"formed man","r":["Ps 100:3","Ps 139:14-15","Isa 64:8"]},{"a":"dust","r":["Gen 3:19,23","Job 4:19","Job 33:6","Ps 103:14","Eccl 3:7,20","Eccl 12:7","Isa 64:8","Rom 9:20","1 Cor 15:47","2 Cor 4:7","2 Cor 5:1"]},{"a":"and breathed","r":["Job 27:3","Job 33:4","John 20:22","Acts 17:25"]},{"a":"nostrils","r":["Gen 7:22","Eccl 3:21","Isa 2:22"]},{"a":"a living","r":["Num 16:22","Num 27:16","Prov 20:27","Zech 12:1","1 Cor 15:45","Heb 12:9"]}],"gen.2.8":[{"a":"a garden","r":["Gen 13:10","Ezek 28:13","Ezek 31:8-9","Joel 2:3"]},{"a":"eastward","r":["Gen 3:24","Gen 4:16","2 Kgs 19:12","Ezek 27:23","Ezek 31:16,18"]}],"gen.2.9":[{"a":"every","r":["Ezek 31:8-9,16,18"]},{"a":"tree of life","r":["Gen 3:22","Prov 3:18","Prov 11:30","Ezek 47:12","John 6:48","Rev 2:7","Rev 22:2,14"]},{"a":"tree of knowledge","r":["Prov 3:5,7","Gen 2:17","Gen 3:3,22","Deut 6:25","Isa 44:25","Isa 47:10","1 Cor 8:1"]}],"gen.3.1":[{"a":"Now","r":["Gen 3:13-15","Isa 27:1","Matt 10:16","2 Cor 11:3,14","Rev 12:9","Rev 20:2"]},{"a":"he said","r":["Num 22:28-29","Eccl 4:10"]},{"a":"hath","r":["Matt 4:3,6,9"]}],"gen.3.10":[{"a":"and I was","r":["Gen 2:25","Exod 3:6","Job 23:15","Ps 119:120","Isa 33:14","Isa 57:11","1 John 3:20"]},{"a":"because","r":["Gen 3:7","Gen 2:25","Exod 32:25","Isa 47:3","Rev 3:17-18","Rev 16:15"]}],"gen.3.11":[{"a":"And he said, Who told thee that thou wast naked? Hast thou eaten of the tree, whereof I commanded thee that thou shouldest not eat?","r":["Gen 4:10","Ps 50:21","Rom 3:20"]}],"gen.3.12":[{"a":"And the man said, The woman whom thou gavest to be with me, she gave me of the tree, and I did eat.","r":["Gen 2:18,20,22","Exod 32:21-24","1 Sam 15:20-24","Job 31:33","Prov 19:3","Prov 28:13","Luke 10:29","Rom 10:3","Jas 1:13-15"]}],"gen.3.13":[{"a":"What","r":["Gen 4:10-12","Gen 44:15","1 Sam 13:11","2 Sam 3:24","2 Sam 12:9-12","John 18:35"]},{"a":"The serpent","r":["Gen 3:4-6","2 Cor 11:3","1 Tim 2:14"]}],"gen.3.14":[{"a":"thou art","r":["Gen 3:1","Gen 9:6","Exod 21:28-32","Lev 20:25"]},{"a":"dust","r":["Ps 72:9","Isa 29:4","Isa 65:25","Mic 7:17"]}],"gen.3.15":[{"a":"enmity","r":["Num 21:6-7","Amos 9:3","Mark 16:18","Luke 10:19","Acts 28:3-6","Rom 3:13"]},{"a":"thy seed","r":["Matt 3:7","Matt 12:34","Matt 13:38","Matt 23:33","John 8:44","Acts 13:10","1 John 3:8,10"]},{"a":"her seed","r":["Ps 132:11","Isa 7:14","Jer 31:22","Mic 5:3","Matt 1:23,25","Luke 1:31-35,76","Gal 4:4"]},{"a":"it shall","r":["Rom 16:20","Eph 4:8","Col 2:15","Heb 2:14-15","1 John 3:8","1 John 5:5","Rev 12:7-8,17","Rev 20:1-3,10"]},{"a":"thou","r":["Gen 49:17","Isa 53:3-4,12","Dan 9:26","Matt 4:1-10","Luke 22:39-44,53","John 12:31-33","John 14:30-31","Heb 2:18","Heb 5:7","Rev 2:10","Rev 12:9-13","Rev 13:7","Rev 15:1-6","Rev 20:7-8"]}],"gen.3.16":[{"a":"in sorrow","r":["Gen 35:16-18","1 Sam 4:19-21","Ps 48:6","Isa 13:8","Isa 21:3","Isa 26:17-18","Isa 53:11","Jer 4:31","Jer 6:24","Jer 13:21","Jer 22:23","Jer 49:24","Mic 4:9-10","John 16:21","1 Thess 5:3","1 Tim 2:15"]},{"a":"thy desire","r":["Gen 4:7"]},{"a":"rule","r":["Num 30:7-8,13","Esth 1:20","1 Cor 7:4","1 Cor 11:3","1 Cor 14:34","Eph 5:22-24","Col 3:18","1 Tim 2:11-12","Titus 2:5","1 Pet 3:1-6"]}],"gen.3.17":[{"a":"Because","r":["1 Sam 15:23-24","Matt 22:12","Matt 25:26-27,45","Luke 19:22","Rom 3:19"]},{"a":"and hast","r":["Gen 3:6,11","Gen 2:16-17","Jer 7:23-24"]},{"a":"cursed","r":["Gen 5:29","Ps 127:2","Eccl 1:2-3,13-14","Eccl 2:11,17","Isa 24:5-6","Rom 8:20-22"]},{"a":"in sorrow","r":["Job 5:6-7","Job 14:1","Job 21:17","Ps 90:7-9","Eccl 2:22-23","Eccl 5:17","John 16:33"]}],"gen.3.18":[{"a":"Thorns","r":["Josh 23:13","Job 5:5","Job 31:40","Prov 22:5","Prov 24:31","Isa 5:6","Isa 7:23","Isa 32:13","Jer 4:3","Jer 12:13","Matt 13:7","Heb 6:8"]},{"a":"herb","r":["Job 1:21","Ps 90:3","Ps 104:2,14-15","Rom 14:2"]}],"gen.3.19":[{"a":"In","r":["Eccl 1:3,13","Eph 4:28","1 Thess 2:9","2 Thess 3:10"]},{"a":"till","r":["Job 1:21","Ps 90:3","Ps 104:29","Eccl 5:15"]},{"a":"for dust","r":["Gen 2:7","Gen 18:27"]},{"a":"and","r":["Gen 23:4","Job 17:13-16","Job 19:26","Job 21:26","Job 34:15","Ps 22:15,29","Ps 104:29","Prov 21:16","Eccl 3:20","Eccl 12:7","Dan 12:2","Rom 5:12-21","1 Cor 15:21-22"]}],"gen.3.2":[{"a":"serpent","r":["Ps 58:4"]}],"gen.3.20":[{"a":"Adam","r":["Gen 2:20,23","Gen 5:29","Gen 16:11","Gen 29:32-35","Gen 35:18","Exod 2:10","1 Sam 1:20","Matt 1:21,23"]},{"a":"of","r":["Acts 17:26"]}],"gen.3.21":[{"a":"make","r":["Gen 3:7","Isa 61:10","Rom 3:22","2 Cor 5:2-3,21"]}],"gen.3.22":[{"a":"as one","r":["Gen 3:5","Gen 1:26","Gen 11:6-7","Isa 19:12-13","Isa 47:12-13","Jer 22:23"]},{"a":"tree","r":["Gen 2:9","Prov 3:18","Rev 2:7","Rev 22:2"]},{"a":"eat","r":["Ps 22:26","John 6:48-58"]}],"gen.3.23":[{"a":"till","r":["Gen 3:19","Gen 2:5","Gen 4:2,12","Gen 9:20","Eccl 5:9"]}],"gen.3.24":[{"a":"east","r":["Gen 2:8"]},{"a":"Cherubims","r":["Exod 25:2,20,22","1 Sam 4:4","1 Kgs 6:25-35","Ps 80:1","Ps 99:1","Ps 104:4","Ezek 10:2-22","Heb 1:7"]},{"a":"a flaming","r":["Num 22:23","Josh 5:13","1 Chr 21:16-17","Heb 1:7"]},{"a":"to keep","r":["John 14:6","Heb 10:18-22"]}],"gen.3.3":[{"a":"But","r":["Gen 2:16-17"]},{"a":"touch","r":["Gen 20:6","Exod 19:12-13","1 Chr 16:22","Job 1:11","Job 2:5","Job 19:21","1 Cor 7:1","2 Cor 6:17","Col 2:21"]}],"gen.3.4":[{"a":"serpent","r":["John 8:44"]},{"a":"Ye","r":["Gen 3:13","Deut 29:19","2 Kgs 1:4,6,16","2 Kgs 8:10","Ps 10:11","2 Cor 2:11","2 Cor 11:3","1 Tim 2:14"]}],"gen.3.5":[{"a":"God","r":["Exod 20:7","1 Kgs 22:6","Jer 14:13-14","Jer 28:2-3","Ezek 13:2-6,22","2 Cor 11:3","2 Cor 11:13-15"]},{"a":"your","r":["Gen 3:7,10","Matt 6:23","Acts 26:18"]},{"a":"as gods","r":["Exod 5:2","2 Chr 32:15","Ps 12:4","Ezek 28:2,9","Ezek 29:3","Dan 4:30","Dan 6:7","Acts 12:22-23","2 Cor 4:4","2 Thess 2:4","Rev 13:4,14"]},{"a":"knowing","r":["Gen 3:22","Gen 2:17"]}],"gen.3.6":[{"a":"saw","r":["Josh 7:21","Judg 16:1-2"]},{"a":"pleasant","r":["Ezek 24:16,21,25"]},{"a":"to the eyes","r":["1 John 2:16","Gen 6:2","Gen 39:7","Josh 7:21","2 Sam 11:2","Job 31:1","Matt 5:28"]},{"a":"and did","r":["1 Tim 2:14"]},{"a":"and he did eat","r":["Gen 3:12,17","Hos 6:7","Rom 5:12-19"]}],"gen.3.7":[{"a":"And the","r":["Gen 3:5","Deut 28:34","2 Kgs 6:20","Luke 16:23"]},{"a":"knew","r":["Gen 3:10-11","Gen 2:25"]},{"a":"and they","r":["Job 9:29-31","Isa 28:20","Isa 59:6"]}],"gen.3.8":[{"a":"And they","r":["Gen 3:10","Deut 4:33","Deut 5:25"]},{"a":"cool of the day","r":["Job 34:21-22","Job 38:1"]},{"a":"hid","r":["Job 22:14","Job 31:33","Job 34:22","Ps 139:1-12","Prov 15:3","Jer 23:24","Amos 9:2-3","Jonah 1:3,9-10","Rom 2:15","Heb 4:13"]}],"gen.3.9":[{"a":"And the LORD God called unto Adam, and said unto him, Where art thou?","r":["Gen 4:9","Gen 11:5","Gen 16:8","Gen 18:20-21","Josh 7:17-19","Rev 20:12-13"]}],"heb.11.1":[{"a":"faith","r":["Heb 11:13","Heb 10:22,39","Acts 20:21","1 Cor 13:13","Gal 5:6","Titus 1:1","1 Pet 1:7","2 Pet 1:1"]},{"a":"is the","r":["Ps 27:13","Ps 42:11"]},{"a":"substance","r":["Heb 2:3","Heb 3:14","2 Cor 9:4","2 Cor 11:17"]},{"a":"hoped","r":["Heb 6:12,18-19"]},{"a":"the evidence","r":["Heb 11:7,27","Rom 8:24-25","2 Cor 4:18","2 Cor 5:17","1 Pet 1:8"]}],"heb.11.10":[{"a":"he looked","r":["Heb 12:22,28","Heb 13:14","John 14:2","Phil 3:20","Rev 21:2,10-27"]},{"a":"whose","r":["Heb 3:4","Isa 14:32","2 Cor 5:1"]}],"heb.11.11":[{"a":"Sara","r":["Gen 17:17-19","Gen 18:11-14","Gen 21:1-2","Luke 1:36","1 Pet 3:5-6"]},{"a":"because","r":["Heb 10:23","Rom 4:20-21"]}],"heb.11.12":[{"a":"and him","r":["Rom 4:19"]},{"a":"as the stars","r":["Gen 15:5","Gen 22:17","Gen 26:4","Exod 32:13","Deut 1:10","Deut 28:62","1 Chr 27:23","Neh 9:23","Rom 4:17"]},{"a":"as the sand","r":["Gen 22:17","Gen 32:12","Josh 11:4","Judg 7:12","1 Sam 12:5","2 Sam 17:11","1 Kgs 4:20","Isa 10:22","Isa 48:19","Jer 33:22","Hos 1:10","Hab 1:9","Rom 4:18","Rom 9:27","Rev 20:8"]}],"heb.11.13":[{"a":"all died","r":["Gen 25:8","Gen 27:2-4","Gen 48:21","Gen 49:18,28,33","Gen 50:24"]},{"a":"but","r":["Heb 11:27","Gen 49:10","Num 24:17","Job 19:25","John 8:56","John 12:41","1 Pet 1:10-12"]},{"a":"and were","r":["Rom 4:21","Rom 8:24","1 John 3:19"]},{"a":"confessed","r":["Gen 23:4","Gen 47:9","1 Chr 29:14-15","Ps 39:12","Ps 119:19","1 Pet 1:17","1 Pet 2:11"]}],"heb.11.14":[{"a":"they seek","r":["Heb 11:16","Heb 13:14","Rom 8:23-25","2 Cor 4:18","2 Cor 5:1-7","Phil 1:23"]}],"heb.11.15":[{"a":"mindful","r":["Gen 11:31","Gen 12:10","Gen 24:6-8","Gen 31:18","Gen 32:9-11"]}],"heb.11.16":[{"a":"they desire","r":["Heb 11:14","Heb 12:22"]},{"a":"God is","r":["Heb 2:11"]},{"a":"to be","r":["Gen 17:7-8","Exod 3:6,15","Isa 41:8-10","Jer 31:1","Matt 22:31-32","Mark 12:26","Luke 20:37","Acts 7:32"]},{"a":"for","r":["Heb 11:10","Heb 13:14","Matt 25:34","Luke 12:32","Phil 3:20"]}],"heb.11.17":[{"a":"faith","r":["Gen 22:1-12","Jas 2:21-24"]},{"a":"when","r":["Deut 8:2","2 Chr 32:31","Job 1:11-12","Job 2:3-6","Prov 17:3","Dan 11:35","Zech 13:9","Mal 3:2-3","Jas 1:2-4","Jas 5:11","1 Pet 1:6-7","1 Pet 4:12","Rev 3:10"]},{"a":"received","r":["Heb 7:6"]},{"a":"offered","r":["2 Cor 8:12"]},{"a":"only","r":["Gen 22:2,16","John 3:16"]}],"heb.11.18":[{"a":"That","r":["Gen 17:19","Gen 21:12","Rom 9:7"]}],"heb.11.19":[{"a":"God","r":["Gen 22:5","Matt 9:28","Rom 4:17-21","Eph 3:20"]},{"a":"from the","r":["Heb 11:11-12","Heb 9:24","Gen 22:4,13","Rom 5:14"]}],"heb.11.20":[{"a":"By faith Isaac blessed Jacob and Esau concerning things to come.","r":["Gen 27:27-40","Gen 28:2-3"]}],"heb.11.21":[{"a":"faith","r":["Gen 48:5-22"]},{"a":"and worshipped","r":["Gen 47:31"]}],"heb.11.22":[{"a":"faith","r":["Gen 50:24-25","Exod 13:19","Josh 24:32","Acts 7:16"]}],"heb.11.23":[{"a":"faith","r":["Exod 2:2-10","Acts 7:20"]},{"a":"and they","r":["Heb 13:6","Ps 56:4","Ps 118:6","Isa 8:12-13","Isa 41:10,14","Isa 51:7,12","Dan 3:16-18","Dan 6:10","Matt 10:28","Luke 12:4-5"]},{"a":"the king's","r":["Exod 1:16,22"]}],"heb.11.24":[{"a":"when","r":["Exod 2:10","Acts 7:21-24"]}],"heb.11.25":[{"a":"Choosing","r":["Heb 10:32","Job 36:21","Ps 84:10","Matt 5:10-12","Matt 13:21","Acts 7:24-25","Acts 20:23-24","Rom 5:3","Rom 8:17-18,35-39","2 Cor 5:17","Col 1:24","2 Thess 1:3-6","2 Tim 1:8","2 Tim 2:3-10","2 Tim 3:11-12","Jas 1:20","1 Pet 1:6-7","1 Pet 4:12-16"]},{"a":"the people","r":["Heb 4:9","Ps 47:9","1 Pet 2:10"]},{"a":"the pleasures","r":["Job 20:5","Job 21:11-13","Ps 73:18-20","Isa 21:4","Isa 47:8-9","Luke 12:19-20","Luke 16:25","Jas 5:5","Rev 18:7"]}],"heb.11.26":[{"a":"the reproach","r":["Heb 10:33","Heb 13:13","Ps 69:7,20","Ps 89:50-51","Isa 51:7","Acts 5:41","2 Cor 12:10","2 Cor 12:10","1 Pet 1:11","1 Pet 4:14"]},{"a":"greater","r":["Ps 37:16","Jer 9:23-24","2 Cor 6:10","Eph 1:18","Eph 3:8","Rev 2:9","Rev 3:18"]},{"a":"for he had","r":["Heb 11:6","Heb 2:2","Heb 10:35","Ruth 2:12","Prov 11:18","Prov 23:18","Matt 5:12","Matt 6:1","Matt 10:41","Luke 14:14"]}],"heb.11.27":[{"a":"he forsook","r":["Exod 10:28-29","Exod 11:8","Exod 12:11,37-42","Exod 13:17-21"]},{"a":"not fearing","r":["Exod 2:14-15","Exod 4:19","Exod 14:10-13"]},{"a":"endured","r":["Heb 6:15","Heb 10:32","Heb 12:3","Matt 10:22","Matt 24:13","Mark 4:17","Mark 13:13","1 Cor 13:7","Jas 5:11"]},{"a":"seeing","r":["Heb 11:1,13","Heb 12:2","Ps 16:8","Acts 2:25","2 Cor 4:18","1 Tim 1:17","1 Tim 6:16","1 Pet 1:8"]}],"heb.11.28":[{"a":"he kept","r":["Exod 12:3-14,21-30"]},{"a":"the sprinkling","r":["Heb 9:19","Heb 12:24","Exod 12:7,13,23","1 Pet 1:2"]}],"heb.11.29":[{"a":"By faith they passed through the Red sea as by dry land: which the Egyptians assaying to do were drowned.","r":["Exod 14:13-31","Exod 15:1-21","Josh 2:10","Neh 9:11","Ps 66:6","Ps 78:13","Ps 106:9-11","Ps 114:1-5","Ps 136:13-15","Isa 11:15-16","Isa 51:9-10","Isa 63:11-16","Hab 3:8-10"]}],"heb.11.3":[{"a":"faith","r":["Heb 1:2","Gen 1:1-31","Gen 2:1","Ps 33:6","Isa 40:26","Jer 10:11,16","John 1:3","Acts 14:15","Acts 17:24","Rom 1:19-21","Rom 4:17","2 Pet 3:5","Rev 4:11"]}],"heb.11.30":[{"a":"By faith the walls of Jericho fell down, after they were compassed about seven days.","r":["Josh 6:3-20","2 Cor 10:4-5"]}],"heb.11.31":[{"a":"the harlot","r":["Josh 2:1-22","Josh 6:22-25","Matt 1:1,5","Jas 2:25"]},{"a":"believed not","r":["Heb 3:18","1 Pet 2:8","1 Pet 3:20"]},{"a":"she had","r":["Josh 1:1","Josh 2:4-24"]}],"heb.11.32":[{"a":"what shall","r":["Rom 3:5","Rom 4:1","Rom 6:1","Rom 7:7"]},{"a":"the time","r":["John 21:25"]},{"a":"Gedeon","r":["Judg 6:1-8"]},{"a":"Gideon","r":["1 Sam 12:11"]},{"a":"Barak","r":["Judg 4:1-5"]},{"a":"Samson","r":["Judg 13:1-16"]},{"a":"Jephthae","r":["Judg 11:1-12"]},{"a":"David","r":["1 Sam 16:1,13","1 Sam 17:1-18","Acts 2:29-31","Acts 13:22-36"]},{"a":"Samuel","r":["1 Sam 1:20","1 Sam 2:11,18","1 Sam 3:1-12","1 Sam 28:3-25","Ps 99:6","Jer 15:1","Acts 3:24","Acts 13:20"]},{"a":"the prophets","r":["Matt 5:12","Luke 13:28","Luke 16:31","Acts 10:43","Jas 5:10","1 Pet 1:10-12","2 Pet 1:21","2 Pet 3:2"]}],"heb.11.33":[{"a":"through","r":["Josh 6:1-13","2 Sam 5:4-25","2 Sam 8:1-14","Ps 18:32-34","Ps 44:2-6","Ps 144:1-2,10"]},{"a":"wrought","r":["Heb 11:4-8,17"]},{"a":"obtained","r":["Heb 6:12-15","Heb 10:36","2 Sam 7:11-17","Gal 3:16"]},{"a":"stopped","r":["Judg 14:5-6","1 Sam 17:33-36","Ps 91:13","Dan 6:20-23","2 Tim 4:17","1 Pet 5:8"]}],"heb.11.34":[{"a":"Quenched","r":["Ps 66:12","Isa 43:2","Dan 3:19-28","1 Pet 4:12"]},{"a":"escaped","r":["1 Sam 20:1","2 Sam 21:16-17","1 Kgs 19:3","2 Kgs 6:16-18,32","Job 5:20","Ps 144:10","Jer 26:24"]},{"a":"out of","r":["Judg 7:19-25","Judg 8:4-10","Judg 15:14-20","Judg 16:19-30","2 Kgs 20:7-11","Job 42:10","Ps 6:8","2 Cor 12:9-10"]},{"a":"turned","r":["1 Sam 14:13-15","1 Sam 17:51-52","2 Sam 8:1-18","2 Chr 14:11-14","2 Chr 16:1-9","2 Chr 20:6-25","2 Chr 32:20-22"]}],"heb.11.35":[{"a":"Women","r":["1 Kgs 17:22-24","2 Kgs 4:27-37","Luke 7:12-16","John 11:40-45","Acts 9:41"]},{"a":"tortured","r":["Acts 22:24-25,29"]},{"a":"not accepting","r":["Acts 4:19"]},{"a":"that they","r":["Matt 22:30","Mark 12:25","Luke 14:14","Luke 20:36","John 5:29","Acts 23:6","Acts 24:15","1 Cor 15:54","Phil 3:11"]}],"heb.11.36":[{"a":"mockings","r":["Judg 16:25","2 Kgs 2:23","2 Chr 30:10","2 Chr 36:16","Jer 20:7","Matt 20:19","Mark 10:34","Luke 18:32","Luke 23:11,36"]},{"a":"and scourgings","r":["1 Kgs 22:24","Jer 20:2","Jer 37:15","Matt 21:35","Matt 23:34","Matt 27:26","Acts 5:40","Acts 16:22-23","2 Cor 11:24-25"]},{"a":"bonds","r":["Heb 10:34","Gen 39:20","1 Kgs 22:27","2 Chr 16:10","Ps 105:17-18","Jer 20:2","Jer 29:26","Jer 32:2-3,8","Jer 36:6","Jer 37:15-21","Jer 38:6-13,28","Jer 39:15","Lam 3:52-55","Acts 4:3","Acts 5:18","Acts 8:3","Acts 12:4-19","Acts 16:24-40","Acts 21:33","Acts 24:27","2 Cor 11:23","Eph 3:1","Eph 4:1","2 Tim 1:16","2 Tim 2:9","Rev 2:10"]}],"heb.11.37":[{"a":"stoned","r":["1 Kgs 21:10,13-15","2 Chr 24:21","Matt 21:35","Matt 23:37","Luke 13:34","John 10:31-33","Acts 7:58-59","Acts 14:19","2 Cor 11:25"]},{"a":"were slain","r":["1 Sam 22:17-19","1 Kgs 18:4,13","1 Kgs 19:1,10,14","Jer 2:30","Jer 26:23","Lam 4:13-14","Matt 23:35-37","Luke 11:51-54","Acts 7:52","Acts 12:2-3"]},{"a":"in sheepskins","r":["2 Kgs 1:8","Matt 3:4","Rev 11:3"]},{"a":"being destitute","r":["Heb 12:1-3","Zech 13:9","Matt 8:20","1 Cor 4:9-13","2 Cor 11:23-27","2 Cor 12:10","Jas 5:10-11"]}],"heb.11.38":[{"a":"whom","r":["1 Kgs 14:12-13","2 Kgs 23:25-29","Isa 57:1"]},{"a":"wandered","r":["1 Sam 22:1","1 Sam 23:15,19,23","1 Sam 24:1-3","1 Sam 26:1","1 Kgs 17:3","1 Kgs 18:4,13","1 Kgs 19:9","Ps 142:1","Ps 142:2-7"]}],"heb.11.39":[{"a":"And these all, having obtained a good report through faith, received not the promise:","r":["Heb 11:2,13","Luke 10:23-24","1 Pet 1:12"]}],"heb.11.4":[{"a":"faith","r":["Gen 4:3-5,15,25","1 John 3:11-12"]},{"a":"a more","r":["Heb 9:22","Prov 15:8","Prov 21:27","Titus 1:16","Jude 1:11"]},{"a":"he obtained","r":["Lev 9:24","1 Kgs 18:38","Matt 23:35","Luke 11:51"]},{"a":"and by","r":["Heb 12:1,24","Gen 4:10","Matt 23:35"]}],"heb.11.40":[{"a":"better","r":["Heb 7:19,22","Heb 8:6","Heb 9:23","Heb 12:24"]},{"a":"they without","r":["Heb 9:8-15","Heb 10:11-14","Rom 3:25-26"]},{"a":"made","r":["Heb 5:9","Heb 12:23","Rev 6:11"]}],"heb.11.5":[{"a":"Enoch","r":["Gen 5:22-24","Luke 3:37","Jude 1:14"]},{"a":"translated","r":["2 Kgs 2:11","Ps 89:48","John 8:51-52"]},{"a":"and was","r":["2 Kgs 2:16-17","Jer 36:26","Rev 11:9-12"]},{"a":"this testimony","r":["Heb 11:3-4"]},{"a":"that he","r":["Heb 11:6","Gen 5:22","Rom 8:8-9","1 Thess 2:4","1 John 3:22"]}],"heb.11.6":[{"a":"without","r":["Heb 3:12,18-19","Heb 4:2,6","Num 14:11","Num 20:12","Ps 78:22,32","Ps 106:21-22,24","Isa 7:9","Mark 16:17","John 3:18-19","John 8:24","Gal 5:6","Rev 21:8"]},{"a":"he that","r":["Heb 7:25","Job 21:14","Ps 73:28","Isa 55:3","Jer 2:31","John 14:6"]},{"a":"must","r":["Rom 10:14"]},{"a":"a rewarder","r":["Heb 11:26","Gen 15:1","Ruth 2:12","Ps 58:11","Prov 11:18","Matt 5:12","Matt 6:1-2,5,16","Matt 10:41-42","Luke 6:35"]},{"a":"diligently","r":["1 Chr 28:9","Ps 105:3-4","Ps 119:10","Prov 8:17","Song 3:1-4","Jer 29:13-14","Matt 6:33","Luke 12:31","2 Pet 1:5,10","2 Pet 3:14"]}],"heb.11.7":[{"a":"Noah","r":["Gen 6:13,22","Gen 7:1,5","Matt 24:38","Luke 17:26"]},{"a":"Noe","r":["2 Pet 2:5"]},{"a":"warned","r":["Gen 6:13","Gen 19:14","Exod 9:18-21","Prov 22:3","Prov 27:12","Ezek 3:17-19","Matt 3:7","Matt 24:15,25","2 Pet 3:6"]},{"a":"moved with fear","r":["Heb 5:7"]},{"a":"prepared","r":["Gen 6:18","Gen 7:1,23","Gen 8:16","Ezek 14:14,20","1 Pet 3:20"]},{"a":"he condemned","r":["Matt 12:41-42","Luke 11:31-32"]},{"a":"righteousness","r":["Rom 1:17","Rom 3:22","Rom 4:11,13","Rom 9:30","Rom 10:6","Gal 5:5","Phil 3:9","2 Pet 1:1"]}],"heb.11.8":[{"a":"Abraham","r":["Gen 11:31","Gen 12:1-4","Josh 24:3","Neh 9:7-8","Isa 41:2","Isa 51:2","Acts 7:2-4"]},{"a":"which","r":["Gen 12:7","Gen 13:15-17","Gen 15:7-8","Gen 17:8","Gen 26:3","Deut 9:5","Ps 105:9-11","Ezek 36:24"]},{"a":"obeyed","r":["Heb 11:33","Heb 5:9","Gen 22:18","Gen 15:5","Matt 7:24-25","Rom 1:5","Rom 6:17","Rom 10:16","2 Cor 10:5","Jas 2:14-16","1 Pet 1:22","1 Pet 3:1","1 Pet 4:17"]}],"heb.11.9":[{"a":"he sojourned","r":["Gen 17:8","Gen 23:4","Gen 26:3","Gen 35:27","Acts 7:5-6"]},{"a":"dwelling","r":["Gen 12:8","Gen 13:3,18","Gen 18:1-2,6,9","Gen 25:27"]},{"a":"the heirs","r":["Heb 6:17","Gen 26:3-4","Gen 28:4,13-14","Gen 48:3-4"]}],"isa.53.1":[{"a":"Who","r":["John 1:7,12","John 12:38","Rom 10:16-17"]},{"a":"the","r":["Isa 51:9","Isa 52:10","Isa 62:8","Rom 1:16","1 Cor 1:18,24","Eph 1:18-19"]},{"a":"revealed","r":["Isa 40:5","Matt 11:25","Matt 16:17","Rom 1:17-18"]}],"isa.53.10":[{"a":"pleased","r":["Isa 42:1","Matt 3:17","Matt 17:5"]},{"a":"he hath","r":["Ps 69:26","Zech 13:7","Rom 8:32","Gal 3:13","1 John 4:9-10"]},{"a":"when thou shalt make his soul","r":["Dan 9:24","Rom 8:8","2 Cor 5:21","Eph 5:2","Heb 7:27","Heb 9:14,25-26","Heb 10:6-12","Heb 13:10-12","1 Pet 2:24"]},{"a":"he shall see","r":["Ps 22:30","Ps 45:16-17","Ps 110:3","John 12:24","Heb 2:13"]},{"a":"he shall prolong","r":["Isa 9:7","Ps 16:9-11","Ps 21:4","Ps 72:17","Ps 89:29,36","Ezek 37:25","Dan 7:13-14","Luke 1:33","Acts 2:24-28","Rom 6:9","Rev 1:18"]},{"a":"the pleasure","r":["Isa 55:11-13","Isa 62:3-5","Ps 72:7","Ps 85:10-12","Ps 147:11","Ps 149:4","Jer 32:41","Ezek 33:11","Mic 7:18","Zeph 3:17","Luke 15:5-7,23-24","John 6:37-40","Eph 1:5,9","2 Thess 1:11"]}],"isa.53.11":[{"a":"see","r":["Luke 22:44","John 12:24,27-32","John 16:21","Gal 4:19","Heb 12:2","Rev 5:9-10","Rev 7:9-17"]},{"a":"by his","r":["John 17:3","2 Cor 4:6","Phil 3:8-10","2 Pet 1:2-3","2 Pet 3:18"]},{"a":"my righteousness","r":["Isa 42:1","Isa 49:3","1 John 2:1","2 John 1:1,3"]},{"a":"justify","r":["Isa 45:25","Rom 3:22-24","Rom 4:24-25","Rom 5:1,9,18-19","1 Cor 6:11","Titus 3:6-7"]},{"a":"bear","r":["Isa 53:4-6,8,12","Matt 20:28","Heb 9:28","1 Pet 2:24","1 Pet 3:18"]}],"isa.53.12":[{"a":"will I","r":["Isa 49:24-25","Isa 52:15","Gen 3:15","Ps 2:8","Dan 2:45","Matt 12:28-29","Acts 26:18","Phil 2:8-11","Col 1:13-14","Col 2:15","Heb 2:14-15"]},{"a":"poured","r":["Ps 22:14","Phil 2:17","Heb 12:2"]},{"a":"and he was","r":["Mark 15:28","Luke 22:37","Luke 23:25,32-33"]},{"a":"he bare","r":["Isa 53:11","1 Tim 2:5-6","Titus 2:14","Heb 9:26,28"]},{"a":"made","r":["Luke 23:34","Rom 8:34","Heb 7:25","Heb 9:24","1 John 2:1,12"]}],"isa.53.2":[{"a":"he shall grow","r":["Isa 11:1","Jer 23:5","Ezek 17:22-24","Zech 6:12","Mark 6:3","Luke 2:7,39-40,51-52","Luke 9:58","Rom 8:3","Phil 2:6-7"]},{"a":"he hath no","r":["Isa 52:14","Mark 9:12","John 1:10-14","John 9:28-29","John 18:40","John 19:5,14-15","1 Pet 2:14"]}],"isa.53.3":[{"a":"despised","r":["Isa 49:7","Isa 50:6","Ps 22:6-8","Ps 69:10-12,19-20","Mic 5:1","Zech 11:8,12-13","Matt 26:67","Matt 27:39-44,63","Mark 9:12","Mark 15:19","Luke 8:53","Luke 9:22","Luke 16:14","Luke 23:18-25","John 8:48","Heb 12:2-3"]},{"a":"a man","r":["Isa 53:4,10","Ps 69:29","Matt 26:37-38","Mark 14:34","Luke 19:41","John 11:35","Heb 2:15-18","Heb 4:15","Heb 5:7"]},{"a":"we esteemed","r":["Deut 32:15","Zech 11:13","Matt 27:9-10","John 1:10-11","Acts 3:13-15"]}],"isa.53.4":[{"a":"he hath","r":["Isa 53:5-6,11-12","Matt 8:17","Gal 3:13","Heb 9:28","1 Pet 2:24","1 Pet 3:18","1 John 2:2"]},{"a":"yet","r":["Matt 26:37","John 19:7"]}],"isa.53.5":[{"a":"But he was","r":["Isa 53:6-8,11-12","Dan 9:24","Zech 13:7","Matt 20:28","Rom 3:24-26","Rom 4:25","Rom 5:6-10,15-21","1 Cor 15:3","2 Cor 5:21","Eph 5:2","Heb 9:12-15","Heb 10:10,14","1 Pet 3:18"]},{"a":"bruised","r":["Isa 53:10","Gen 3:15"]},{"a":"the chastisement","r":["1 Pet 2:24"]}],"isa.53.6":[{"a":"All we","r":["Ps 119:176","Matt 18:12-14","Luke 15:3-7","Rom 3:10-19","1 Pet 2:25"]},{"a":"his own","r":["Isa 55:7","Isa 56:11","Ezek 3:18","Rom 4:25","Jas 5:20","1 Pet 3:18"]},{"a":"laid on him the iniquity of us all","r":["Ps 69:4"]}],"isa.53.7":[{"a":"yet","r":["Matt 26:63","Matt 27:12-14","Mark 14:61","Mark 15:5","Luke 23:9","John 19:9","1 Pet 2:23"]},{"a":"he is","r":["Acts 8:32-33"]}],"isa.53.8":[{"a":"from prison and from judgment; and","r":["Ps 22:12-21","Ps 69:12","Matt 26:65-66","John 19:7"]},{"a":"who","r":["Matt 1:1","Acts 8:33","Rom 1:4"]},{"a":"cut off","r":["Dan 9:26","John 11:49-52"]},{"a":"was he stricken","r":["1 Pet 3:18"]}],"isa.53.9":[{"a":"made","r":["Matt 27:57-60","Mark 15:43-46","Luke 23:50-53","John 19:38-42","1 Cor 15:4"]},{"a":"deceit","r":["2 Cor 5:21","Heb 4:15","Heb 7:26","1 Pet 2:22","1 John 3:5"]}],"jhn.1.1":[{"a":"the beginning","r":["John 1:2","Gen 1:1","Prov 8:22-31","Eph 3:9","Col 1:17","Heb 1:10","Heb 7:3","Heb 13:8","Rev 1:2,8,11","Rev 2:8","Rev 21:6","Rev 22:13"]},{"a":"the Word","r":["John 1:14","1 John 1:1-2","1 John 5:7","Rev 19:13"]},{"a":"with","r":["John 1:18","John 16:28","John 17:5","Prov 8:22-30","1 John 1:2"]},{"a":"the Word was","r":["John 10:30-33","John 20:28","Ps 45:6","Isa 7:14","Isa 9:6","Isa 40:9-11","Matt 1:23","Rom 9:5","Phil 2:6","1 Tim 3:16","Titus 2:13","Heb 1:8-13","2 Pet 1:1","1 John 5:7,20"]}],"jhn.1.10":[{"a":"was in","r":["John 1:18","John 5:17","Gen 11:6-9","Gen 16:13","Gen 17:1","Gen 18:33","Exod 3:4-6","Acts 14:17","Acts 17:24-27","Heb 1:3"]},{"a":"and the world was","r":["Jer 10:11-12","Heb 1:2","Heb 11:3"]},{"a":"knew","r":["John 1:5","John 17:25","Matt 11:27","1 Cor 1:21","1 Cor 2:8","1 John 3:1"]}],"jhn.1.11":[{"a":"came","r":["Matt 15:24","Acts 3:25-26","Acts 13:26","Acts 13:26,46","Rom 9:1,5","Rom 15:8","Gal 4:4"]},{"a":"and","r":["John 3:32","Isa 53:2-3","Luke 19:14","Luke 20:13-15","Acts 7:51-52"]}],"jhn.1.12":[{"a":"received","r":["Matt 10:40","Matt 18:5","Col 2:6"]},{"a":"to them","r":["Isa 56:5","Jer 3:19","Hos 1:10","Rom 8:14","2 Cor 6:17-18","Gal 3:26","Gal 4:6","2 Pet 1:4","1 John 3:1"]},{"a":"even","r":["John 2:23","John 3:18","John 20:31","Matt 12:21","Acts 3:16","1 John 3:23","1 John 5:12"]}],"jhn.1.13":[{"a":"were","r":["John 3:3,5","Jas 1:18","1 Pet 1:3,23","1 Pet 2:2","1 John 3:9","1 John 4:7","1 John 5:1,4,18"]},{"a":"not","r":["John 8:33-41","Matt 3:9","Rom 9:7-9"]},{"a":"nor of the will of the","r":["Gen 25:22,28","Gen 27:4,33","Rom 9:10-16"]},{"a":"nor of the will of man","r":["Ps 110:3","Rom 9:1-5","Rom 10:1-3","1 Cor 3:6","Phil 2:13","Jas 1:18"]},{"a":"of God","r":["John 3:6-8","Titus 3:5","1 John 2:28-29"]}],"jhn.1.14":[{"a":"the Word","r":["John 1:1","Isa 7:14","Matt 1:16,20-23","Luke 1:31-35","Luke 2:7,11","Rom 1:3-4","Rom 9:5","1 Cor 15:47","Gal 4:4","Phil 2:6-8","1 Tim 3:16","Heb 2:11,14-17","Heb 10:5","1 John 4:2-3","2 John 1:7"]},{"a":"we","r":["John 2:11","John 11:40","John 12:40-41","John 14:9","Isa 40:5","Isa 53:2","Isa 60:1-2","Matt 17:1-5","2 Cor 4:4-6","Heb 1:3","1 Pet 2:4-7","2 Pet 1:17","1 John 1:1-2"]},{"a":"the only","r":["John 1:18","John 3:16,18","Ps 2:7","Acts 13:33","Heb 1:5","Heb 5:5","1 John 4:9"]},{"a":"full","r":["John 1:16-17","Ps 45:2","2 Cor 12:9","Eph 3:8,18-19","Col 1:19","Col 2:3,9","1 Tim 1:14-16"]}],"jhn.1.15":[{"a":"bare","r":["John 1:7-8,29-34","John 3:26-36","John 5:33-36","Matt 3:11,13-17","Mark 1:7","Luke 3:16"]},{"a":"he was","r":["John 1:1-2,30","John 8:58","John 17:5","Prov 8:22","Isa 9:6","Mic 5:2","Phil 2:6-7","Col 1:17","Heb 13:8","Rev 1:11,17-18","Rev 2:8"]}],"jhn.1.16":[{"a":"of his","r":["John 3:34","John 15:1-5","Matt 3:11,14","Luke 21:15","Acts 3:12-16","Rom 8:9","1 Cor 1:4-5","Eph 4:7-12","Col 1:19","Col 2:3,9-10","1 Pet 1:11"]},{"a":"and grace","r":["Zech 4:7","Matt 13:12","Rom 5:2,17,20","Eph 1:6-8","Eph 2:5-10","Eph 4:7","1 Pet 1:2"]}],"jhn.1.17":[{"a":"the law","r":["John 5:45","John 9:29","Exod 20:1-17","Deut 4:44","Deut 5:1","Deut 33:4","Acts 7:38","Acts 28:23","Rom 3:19-20","Rom 5:20-21","2 Cor 3:7-10","Gal 3:10-13,17","Heb 3:5-6","Heb 8:8-12"]},{"a":"grace","r":["John 8:32","John 14:6","Gen 3:15","Gen 22:18","Ps 85:10","Ps 89:1-2","Ps 98:3","Mic 7:20","Luke 1:54-55,68-79","Acts 13:34-39","Rom 3:21-26","Rom 5:21","Rom 6:14","Rom 15:8-12","2 Cor 1:20","Heb 9:22","Heb 10:4-10","Heb 11:39-40","Rev 5:8-10","Rev 7:9-17"]}],"jhn.1.18":[{"a":"seen","r":["John 6:46","Exod 33:20","Deut 4:12","Matt 11:27","Luke 10:22","Col 1:15","1 Tim 1:17","1 Tim 6:16","1 John 4:12,20"]},{"a":"the only","r":["John 1:14","John 3:16-18","1 John 4:9"]},{"a":"in the","r":["John 13:23","Prov 8:30","Isa 40:11","Lam 2:12","Luke 16:22-23"]},{"a":"he hath","r":["John 12:41","John 14:9","John 17:6,26","Gen 16:13","Gen 18:33","Gen 32:28-30","Gen 48:15-16","Exod 3:4-6","Exod 23:21","Exod 33:18-23","Exod 34:5-7","Num 12:8","Josh 5:13-15","Josh 6:1-2","Judg 6:12-26","Judg 13:20-23","Isa 6:1-3","Ezek 1:26-28","Hos 12:3-5","Matt 11:27","Luke 10:22","1 John 5:20"]}],"jhn.1.19":[{"a":"when","r":["John 5:33-36","Deut 17:9-11","Deut 24:8","Matt 21:23-32","Luke 3:15-18"]},{"a":"Who","r":["John 10:24","Acts 13:25","Acts 19:4"]}],"jhn.1.20":[{"a":"And he confessed, and denied not; but confessed, I am not the Christ.","r":["John 3:28-36","Matt 3:11-12","Mark 1:7-8","Luke 3:15-17"]}],"jhn.1.21":[{"a":"Art thou Elias","r":["Mal 4:5","Matt 11:14","Matt 17:10-12","Luke 1:17"]},{"a":"Art thou that","r":["John 1:25","John 7:40","Deut 18:15-18","Matt 11:9-11","Matt 16:14"]}],"jhn.1.22":[{"a":"that","r":["2 Sam 24:13"]}],"jhn.1.23":[{"a":"I am","r":["John 3:28","Matt 3:3","Mark 1:3","Luke 1:16-17,76-79","Luke 3:4-6"]},{"a":"as said","r":["Isa 40:3-5"]}],"jhn.1.24":[{"a":"were of","r":["John 3:1-2","John 7:47-49","Matt 23:13-15,26","Luke 7:30","Luke 11:39-44,53","Luke 16:14","Acts 23:8","Acts 26:5","Phil 3:5-6"]}],"jhn.1.25":[{"a":"Why","r":["Matt 21:23","Acts 4:5-7","Acts 5:28"]},{"a":"that Christ","r":["John 1:20-22","Dan 9:24-26"]}],"jhn.1.26":[{"a":"I","r":["Matt 3:11","Mark 1:8","Luke 3:16","Acts 1:5","Acts 11:16"]},{"a":"whom","r":["John 1:10-11","John 8:19","John 16:3","John 17:3,25","Mal 3:1-2","1 John 3:1"]}],"jhn.1.27":[{"a":"who","r":["John 1:15,30","Acts 19:4"]},{"a":"whose","r":["Matt 3:11","Mark 1:7","Luke 3:16"]}],"jhn.1.28":[{"a":"Bethabara","r":["John 10:40","Judg 7:24"]},{"a":"Bethbarah","r":["John 12:5"]},{"a":"where","r":["John 3:23"]}],"jhn.1.29":[{"a":"Behold","r":["John 1:36","Gen 22:7-8","Exod 12:3-13","Num 28:3-10","Isa 53:7","Acts 8:32","1 Pet 1:19","Rev 5:6,8,12-13","Rev 6:1,16","Rev 7:9-10,14,17","Rev 12:11","Rev 13:8","Rev 14:1,4,10","Rev 15:3","Rev 17:14","Rev 19:7,9","Rev 21:9,14,22-23,27","Rev 22:1-3"]},{"a":"which","r":["Isa 53:11","Hos 14:2","Matt 20:28","Acts 13:39","1 Cor 15:3","2 Cor 5:21","Gal 1:4","Gal 3:13","1 Tim 2:6","Titus 2:14","Heb 1:3","Heb 2:17","Heb 9:28","1 Pet 2:24","1 Pet 3:18","1 John 2:2","1 John 3:5","1 John 4:10","Rev 1:5"]},{"a":"taketh","r":["Exod 28:38","Lev 10:17","Lev 16:21-22","Num 18:1,23"]}],"jhn.1.3":[{"a":"All things were made by him; and without him was not any thing made that was made.","r":["John 1:10","John 5:17-19","Gen 1:1,26","Ps 33:6","Ps 102:25","Isa 45:12,18","Eph 3:9","Col 1:16-17","Heb 1:2-3,10-12","Heb 3:3-4","Rev 4:11"]}],"jhn.1.30":[{"a":"This is he of whom I said, After me cometh a man which is preferred before me: for he was before me.","r":["John 1:15,27","Luke 3:16"]}],"jhn.1.31":[{"a":"I knew","r":["John 1:33","Luke 1:80","Luke 2:39-42"]},{"a":"but","r":["John 1:7","Isa 40:3-5","Mal 3:1","Mal 4:2-5","Luke 1:17,76-79"]},{"a":"therefore","r":["Matt 3:6","Mark 1:3-5","Luke 3:3-4","Acts 19:4"]}],"jhn.1.32":[{"a":"I saw","r":["John 5:32","Matt 3:16","Mark 1:10","Luke 3:22"]}],"jhn.1.33":[{"a":"I knew","r":["John 1:31","Matt 3:13-15"]},{"a":"the same","r":["John 3:5,34","Matt 3:11,14","Mark 1:7-8","Luke 3:16","Acts 1:5","Acts 2:4","Acts 10:44-47","Acts 11:15-16","Acts 19:2-6","1 Cor 12:13","Titus 3:5-6"]}],"jhn.1.34":[{"a":"this","r":["John 1:18,49","John 3:16-18,35-36","John 5:23-27","John 6:69","John 10:30,36","John 11:27","John 19:7","John 20:28,31","Ps 2:7","Ps 89:26-27","Matt 3:17","Matt 4:3,6","Matt 8:29","Matt 11:27","Matt 16:16","Matt 17:5","Matt 26:63","Matt 27:40,43,54","Mark 1:1,11","Luke 1:35","Luke 3:22","Rom 1:4","2 Cor 1:19","Heb 1:1-2,5-6","Heb 7:3","1 John 2:23","1 John 3:8","1 John 4:9,14-15","1 John 5:9-13,20","2 John 1:9","Rev 2:18"]}],"jhn.1.35":[{"a":"and two","r":["John 3:25-26","Mal 3:16"]}],"jhn.1.36":[{"a":"Behold","r":["John 1:29","Isa 45:22","Isa 65:1-2","Heb 12:2","1 Pet 1:19-20"]}],"jhn.1.37":[{"a":"and they","r":["John 1:43","John 4:39-42","Prov 15:23","Zech 8:21","Rom 10:17","Eph 4:29","Rev 22:17"]}],"jhn.1.38":[{"a":"turned","r":["Luke 14:25","Luke 15:20","Luke 19:5","Luke 22:61"]},{"a":"What","r":["John 18:4,7","John 20:15-16","Luke 7:24-27","Luke 18:40-41","Acts 10:21,29"]},{"a":"Rabbi","r":["John 1:49","John 3:2,26","John 6:25","Matt 23:7-8"]},{"a":"where","r":["John 12:21","Ruth 1:16","1 Kgs 10:8","Ps 27:4","Prov 3:18","Prov 8:34","Prov 13:20","Song 1:7-8","Luke 8:38","Luke 10:39"]}],"jhn.1.39":[{"a":"Come","r":["John 1:46","John 6:37","John 14:22-23","Prov 8:17","Matt 11:28-30"]},{"a":"abode","r":["John 4:40","Acts 28:30-31","Rev 3:20"]},{"a":"about","r":["Luke 24:29"]}],"jhn.1.4":[{"a":"him","r":["John 5:21,26","John 11:25","John 14:6","1 Cor 15:45","Col 3:4","1 John 1:2","1 John 5:11","Rev 22:1"]},{"a":"the life","r":["John 1:8-9","John 8:12","John 9:5","John 12:35,46","Ps 84:11","Isa 35:4-5","Isa 42:6-7,16","Ps 49:6","Ps 60:1-3","Mal 4:2","Matt 4:16","Luke 1:78-79","Luke 2:32","Acts 26:23","Eph 5:14","1 John 1:5-7","Rev 22:16"]}],"jhn.1.40":[{"a":"Andrew","r":["John 6:8","Matt 4:18","Matt 10:2","Acts 1:13"]}],"jhn.1.41":[{"a":"first","r":["John 1:36-37,45","John 4:28-29","2 Kgs 7:9","Isa 2:3-5","Luke 2:17,38","Acts 13:32-33","1 John 1:3"]},{"a":"the Messias","r":["John 4:25","Dan 9:25-26"]},{"a":"Christ","r":["Ps 2:2","Ps 45:7","Ps 89:20","Isa 11:2","Isa 61:1","Luke 4:18-21","Acts 4:27","Acts 10:38","Heb 1:8-9"]}],"jhn.1.42":[{"a":"Thou art","r":["John 1:47-48","John 2:24-25","John 6:70-71","John 13:18"]},{"a":"the son","r":["John 21:15-17"]},{"a":"Jonas","r":["Matt 16:17"]},{"a":"Barjona","r":["1 Cor 1:12","1 Cor 3:22","1 Cor 9:5","1 Cor 15:5","Gal 2:9"]},{"a":"A stone","r":["John 21:2","Matt 10:2","Matt 16:18","Mark 3:16","Luke 5:8","Luke 6:14"]}],"jhn.1.43":[{"a":"and findeth","r":["Isa 65:1","Matt 4:18-21","Matt 9:9","Luke 19:10","Phil 3:12","1 John 4:19"]}],"jhn.1.44":[{"a":"Philip","r":["John 12:21","John 14:8-9","Matt 10:3","Mark 3:18","Luke 6:14","Acts 1:13"]},{"a":"Bethsaida","r":["Matt 11:21","Mark 6:45","Mark 8:22","Luke 9:10","Luke 10:13"]}],"jhn.1.45":[{"a":"Nathanael","r":["John 21:2"]},{"a":"of whom","r":["John 5:45-46","Gen 3:15","Gen 22:18","Gen 49:10","Deut 18:18-22","Luke 24:27,44"]},{"a":"and the","r":["Isa 4:2","Isa 7:14","Isa 9:6","Isa 53:2","Mic 5:2","Zech 6:12","Zech 9:9","Luke 24:27"]},{"a":"Jesus","r":["John 18:5,7","John 19:19","Matt 2:23","Matt 21:11","Mark 14:67","Luke 2:4","Acts 2:22","Acts 3:6","Acts 10:38","Acts 22:8","Acts 26:9"]},{"a":"the son","r":["Matt 13:55","Mark 6:3","Luke 4:22"]}],"jhn.1.46":[{"a":"Can","r":["John 7:41-42,52","Luke 4:28-29"]},{"a":"Come","r":["John 4:29","Luke 12:57","1 Thess 5:21"]}],"jhn.1.47":[{"a":"Behold","r":["John 8:31,39","Rom 2:28-29","Rom 9:6","Phil 3:3"]},{"a":"in","r":["Ps 32:2","Ps 73:1","1 Pet 2:1,22","Rev 14:5"]}],"jhn.1.48":[{"a":"when","r":["John 2:25","Gen 32:24-30","Ps 139:1-2","Isa 65:24","Matt 6:6","1 Cor 4:5","1 Cor 14:25","Rev 2:18-19"]}],"jhn.1.49":[{"a":"thou","r":["John 1:18,34","John 20:28-29","Matt 14:33"]},{"a":"the King","r":["John 12:13-15","John 18:37","John 19:19-22","Ps 2:6","Ps 110:1","Isa 9:7","Jer 23:5-6","Ezek 37:21-25","Dan 9:25","Hos 3:5","Mic 5:2","Zeph 3:15","Zech 6:12-13","Zech 9:9","Matt 2:2","Matt 21:5","Matt 27:11,42","Luke 19:38"]}],"jhn.1.5":[{"a":"And the light shineth in darkness; and the darkness comprehended it not.","r":["John 1:10","John 3:19-20","John 12:36-40","Job 24:13-17","Prov 1:22,29-30","Rom 1:28","1 Cor 2:14"]}],"jhn.1.50":[{"a":"Because","r":["John 20:29","Luke 1:45","Luke 7:9"]},{"a":"thou shalt","r":["John 11:40","Matt 13:12","Matt 25:29"]}],"jhn.1.51":[{"a":"Verily","r":["John 3:3,5","John 5:19,24-25","John 6:26,32,47,53","John 8:34,51,58","John 10:1,7","John 12:24","John 13:16","John 13:20-21,38","John 14:12","John 16:20,23","John 21:18"]},{"a":"Hereafter","r":["Ezek 1:1","Matt 3:16","Mark 1:10","Luke 3:21","Acts 7:56","Acts 10:11","Rev 4:1","Rev 19:11"]},{"a":"and the","r":["Gen 28:12","Dan 7:9-10","Matt 4:11","Luke 2:9,13","Luke 22:43","Luke 24:4","Acts 1:10-11","2 Thess 1:7","1 Tim 3:16","Heb 1:14","Jude 1:14"]},{"a":"the Son","r":["John 3:13-14","John 5:27","John 12:23-24","Dan 7:13-14","Zech 13:7","Matt 9:6","Matt 16:13-16","Matt 16:27-28","Matt 25:31","Matt 26:24","Mark 14:62","Luke 22:69"]}],"jhn.1.6":[{"a":"A. M. 3999. B.C. 5. a man","r":["John 1:33","John 3:28","Isa 40:3-5","Mal 3:1","Mal 4:5-6","Matt 3:1-11","Matt 11:10","Matt 21:25","Mark 1:1-8","Luke 1:15-17,76","Luke 3:2-20","Acts 13:24"]},{"a":"John","r":["Luke 1:13,61-63"]}],"jhn.1.7":[{"a":"a witness","r":["John 1:19,26-27,32-34,36","John 3:26-36","John 5:33-35","Acts 19:4"]},{"a":"that","r":["John 1:9","John 3:26","Eph 3:9","1 Tim 2:4","Titus 2:11","2 Pet 3:9"]}],"jhn.1.8":[{"a":"that light","r":["John 1:20","John 3:28","Acts 19:4"]}],"jhn.1.9":[{"a":"the true","r":["John 1:4","John 6:32","John 14:6","John 15:1","Isa 49:6","Matt 6:23","1 John 1:8","1 John 2:8","1 John 5:20"]},{"a":"every","r":["John 1:7","John 7:12","John 12:46","Isa 8:20","1 Thess 5:4-7"]}],"jhn.14.1":[{"a":"not","r":["John 14:27-28","John 11:33","John 12:27","John 16:3,6,22-23","Job 21:4-6","Job 23:15-16","Ps 42:5-6,8-11","Ps 43:5","Ps 77:2-3,10","Isa 43:1-2","Jer 8:18","Lam 3:17-23","2 Cor 2:7","2 Cor 4:8-10","2 Cor 12:9-10","1 Thess 3:3-4","2 Thess 2:2","Heb 12:12-13"]},{"a":"ye","r":["John 5:23","John 6:40","John 11:25-27","John 12:44","John 13:19","Isa 12:2-3","Isa 26:3","Acts 3:15-16","Eph 1:12-13,15","Eph 3:14-17","1 Pet 1:21","1 John 2:23-24","1 John 5:10-12"]}],"jhn.14.10":[{"a":"Believest","r":["John 14:20","John 1:1-3","John 10:30,38","John 11:26","John 17:21-23","1 John 5:7"]},{"a":"words","r":["John 3:32-34","John 5:19","John 6:38-40","John 7:16,28-29","John 8:28,38,40","John 12:49","John 17:8"]},{"a":"dwelleth","r":["Ps 68:16-18","2 Cor 5:19","Col 1:19","Col 2:9"]},{"a":"he","r":["John 5:17","Acts 10:38"]}],"jhn.14.11":[{"a":"or","r":["John 5:36","John 10:25,32,38","John 12:38-40","Matt 11:4-5","Luke 7:21-23","Acts 2:22","Heb 2:4"]}],"jhn.14.12":[{"a":"the","r":["Matt 21:21","Mark 11:13","Mark 16:17","Luke 10:17-19","Acts 3:6-8","Acts 4:9-12,16,33","Acts 8:7","Acts 9:34,40","Acts 16:18","1 Cor 12:10-11"]},{"a":"greater","r":["Acts 2:4-11,41","Acts 4:4","Acts 5:15","Acts 6:7","Acts 10:46","Acts 19:12","Rom 15:19"]},{"a":"because","r":["John 14:28","John 7:39","John 16:7","Acts 2:33"]}],"jhn.14.13":[{"a":"whatsoever","r":["John 15:7,16","John 16:23,26","Matt 7:7","Matt 21:22","Mark 11:24","Luke 11:9","Eph 3:20","Jas 1:5","Jas 5:16","1 John 3:22","1 John 5:14"]},{"a":"in my","r":["John 14:6","Eph 2:18","Eph 3:12,14,21","Col 3:17","Heb 4:15","Heb 7:25","Heb 13:15","1 Pet 2:5"]},{"a":"will","r":["John 14:14","John 4:10,14","John 5:19","John 7:37","John 10:30","John 16:7","2 Cor 12:8-10","Phil 4:13"]},{"a":"that","r":["John 12:44","John 13:31","John 17:4-5","Phil 2:9-11"]}],"jhn.14.15":[{"a":"If ye love me, keep my commandments.","r":["John 14:21-24","John 8:42","John 15:10-14","John 21:15-17","Matt 10:37","Matt 25:34-40","1 Cor 16:22","2 Cor 5:14-15","2 Cor 8:8-9","Gal 5:6","Eph 3:16-18","Eph 6:24","Phil 1:20-23","Phil 3:7-11","1 Pet 1:8","1 John 2:3-5","1 John 4:19-20","1 John 5:2-3"]}],"jhn.14.16":[{"a":"I will","r":["John 14:14","John 16:26-27","John 17:9-11,15,20","Rom 8:34","Heb 7:25","1 John 2:1"]},{"a":"another","r":["John 14:18,26","John 15:26","John 16:7-15","Acts 9:31","Acts 13:52","Rom 5:5","Rom 8:15-16,26-27","Rom 14:17","Rom 15:13","Gal 5:22","Phil 2:1"]},{"a":"abide","r":["John 4:14","John 16:22","Matt 28:20","Eph 1:13-14","Col 3:3-4","2 Thess 2:16"]}],"jhn.14.17":[{"a":"the Spirit","r":["John 15:26","John 16:13","1 John 2:27","1 John 4:6"]},{"a":"whom","r":["Prov 14:10","1 Cor 2:14","Rev 2:17"]},{"a":"but","r":["John 14:16,23","Isa 57:15","Isa 59:21","Ezek 36:27","Rom 8:9,11,13-14","1 Cor 3:16","1 Cor 6:19","2 Cor 6:16","Eph 2:22","Eph 3:17","2 Tim 1:14","1 John 2:27","1 John 3:24","1 John 4:12-13"]},{"a":"shall","r":["Matt 10:20","Rom 8:10","1 Cor 14:15","2 Cor 13:5","Gal 4:6","Col 1:27","1 John 4:4"]}],"jhn.14.18":[{"a":"will not","r":["John 14:16,27","John 16:33","Ps 23:4","Isa 43:1","Isa 51:12","Isa 66:11-13","2 Cor 1:2-6","2 Thess 2:16","Heb 2:18"]},{"a":"comfortless","r":["Lam 5:3","Hos 14:3"]},{"a":"will come","r":["John 14:3,28","Ps 101:2","Hos 6:3","Matt 18:20","Matt 28:20"]}],"jhn.14.19":[{"a":"a little","r":["John 7:33","John 8:21","John 12:35","John 13:33","John 16:16,22"]},{"a":"because","r":["John 14:6","John 6:56-58","John 11:25","Rom 5:10","Rom 8:34","1 Cor 15:20,45","2 Cor 4:10-12","Col 3:3-4","Heb 7:25","1 John 1:1-3"]}],"jhn.14.2":[{"a":"my","r":["2 Cor 5:1","Heb 11:10,14-16","Heb 13:14","Rev 3:12,21","Rev 21:10-27"]},{"a":"if","r":["John 12:25-26","John 16:4","Luke 14:26-33","Acts 9:16","1 Thess 3:3-4","1 Thess 5:9","2 Thess 1:4-10","Titus 1:2","Rev 1:5"]},{"a":"I go","r":["John 13:33,36","John 17:24","Heb 6:20","Heb 9:8,23-26","Heb 11:16","Rev 21:2"]}],"jhn.14.20":[{"a":"ye shall","r":["John 14:10","John 10:38","John 17:7,11,21-23,26","2 Cor 5:19","Col 1:19","Col 2:9"]},{"a":"ye in","r":["John 6:56","John 15:5-7","Rom 8:1","Rom 16:7","1 Cor 1:30","2 Cor 5:17","2 Cor 12:2","2 Cor 13:5","Gal 2:20","Eph 2:10","Col 1:27","1 John 4:12"]}],"jhn.14.21":[{"a":"that hath","r":["John 14:15,23-24","John 15:14","Gen 26:3-5","Deut 10:12-13","Deut 11:13","Deut 30:6-8","Ps 119:4-6","Jer 31:31,33-34","Ezek 36:25-27","Luke 11:28","2 Cor 5:14-15","Jas 2:23-24","1 John 2:5","1 John 3:18-24","1 John 5:3","2 John 1:6","Rev 22:14"]},{"a":"that loveth","r":["John 14:23","John 15:9-10","John 16:27","John 17:23","Ps 35:27","Isa 62:2-5","Zeph 3:17","2 Thess 2:16","1 John 3:1"]},{"a":"and will","r":["John 14:18,22-23","John 16:14","Acts 18:9-11","Acts 22:18","2 Cor 3:18","2 Cor 4:6","2 Cor 12:8","2 Tim 4:17-18,22","1 John 1:1-3","Rev 2:17","Rev 3:20"]}],"jhn.14.22":[{"a":"Judas","r":["Matt 10:3"]},{"a":"Lebbaeus, Thaddaeus","r":["Mark 3:18"]},{"a":"Thaddaeus","r":["Luke 6:16","Acts 1:13","Jude 1:1"]},{"a":"how","r":["John 3:4,9","John 4:11","John 6:52,60","John 16:17-18"]}],"jhn.14.23":[{"a":"If","r":["John 14:15,21"]},{"a":"make","r":["John 14:17","John 5:17-19","John 6:56","John 10:30","Gen 1:26","Gen 11:7","Ps 90:1","Ps 91:1","Isa 57:15","Rom 8:9-11","1 John 2:24","1 John 4:4,15-16","Rev 3:20-21","Rev 7:15-17","Rev 21:22","Rev 22:3"]}],"jhn.14.24":[{"a":"that","r":["John 14:15,21-23","Matt 19:21","Matt 25:41-46","2 Cor 8:8-9","1 John 3:16-20"]},{"a":"and","r":["John 14:10","John 3:34","John 5:19,38","John 7:16,28","John 8:26,28,38,42","John 12:44-50"]}],"jhn.14.25":[{"a":"have","r":["John 14:29","John 13:19","John 15:11","John 16:1-4,12","John 17:6-8"]}],"jhn.14.26":[{"a":"Holy Ghost","r":["John 7:39","John 20:22","Ps 51:11","Isa 63:10","Matt 1:18,20","Matt 3:11","Matt 28:19","Mark 12:36","Mark 13:11","Luke 1:15,35,41,67","Luke 2:25","Luke 3:22","Luke 11:13","Acts 1:2,8","Acts 2:4","Acts 5:3","Acts 7:51,55","Acts 13:2,4","Acts 15:8,28","Acts 16:6","Acts 20:28","Acts 28:25","Rom 5:5","Rom 14:17","Rom 15:13,16","1 Cor 2:13","1 Cor 6:19","1 Cor 12:3","2 Cor 6:6","2 Cor 13:14","Eph 1:13","Eph 4:30","1 Thess 1:5-6","1 Thess 4:8","2 Tim 1:14","Titus 3:5","Heb 2:4","Heb 3:7","Heb 9:8","Heb 10:15","1 Pet 1:12","2 Pet 1:21","1 John 5:7","Jude 1:20"]},{"a":"whom","r":["John 14:16","John 15:26","John 16:7","Luke 24:49","Acts 1:4"]},{"a":"he","r":["John 6:45","John 16:13-14","Ps 25:8-9,12-14","Isa 54:13","Jer 31:33-34","1 Cor 2:10-13","Eph 1:17","1 John 2:20,27","Rev 2:11"]},{"a":"bring","r":["John 2:22","John 12:16","Acts 11:16","Acts 20:35"]}],"jhn.14.27":[{"a":"Peace I leave","r":["John 16:33","John 20:19,21,26","Num 6:26","Ps 29:11","Ps 72:2,7","Ps 85:10","Isa 9:6","Isa 32:15-17","Isa 54:7-10,13","Isa 55:12","Isa 57:19","Zech 6:13","Luke 1:79","Luke 2:14","Luke 10:5","Acts 10:36","Rom 1:7","Rom 5:1,10","Rom 8:6","Rom 15:13","1 Cor 1:3","2 Cor 5:18-21","Gal 1:3","Gal 5:22","Gal 6:16","Eph 2:14-17","Phil 4:7","Col 1:2,20","Col 3:15","2 Thess 1:2","2 Thess 3:16","Heb 7:2","Heb 13:20","Rev 1:4"]},{"a":"not","r":["Job 34:29","Ps 28:3","Lam 3:17","Dan 4:1","Dan 6:25"]},{"a":"afraid","r":["Ps 11:1","Ps 27:1","Ps 56:3,11","Ps 91:5","Ps 112:7","Prov 3:25","Isa 12:2","Isa 41:10,14","Jer 1:8","Ezek 2:6","Matt 10:26","Luke 12:4","Acts 18:9","2 Tim 1:7","Rev 2:10","Rev 21:8"]}],"jhn.14.28":[{"a":"heard","r":["John 14:3,18","John 16:16-22"]},{"a":"If","r":["John 16:7","Ps 47:5-7","Ps 68:9,18","Luke 24:51-53","1 Pet 1:8"]},{"a":"I go","r":["John 14:12","John 16:16","John 20:17"]},{"a":"Father","r":["John 5:18","John 10:30,38","John 13:16","John 20:21","Isa 42:1","Isa 49:5-7","Isa 53:11","Matt 12:18","1 Cor 11:3","1 Cor 15:24-28","Phil 2:6-11","Heb 1:2-3","Heb 2:9-15","Heb 3:1-4","Rev 1:11,17","Rev 1:18"]}],"jhn.14.29":[{"a":"And now I have told you before it come to pass, that, when it is come to pass, ye might believe.","r":["John 13:19","John 16:4-31","Matt 24:24-25"]}],"jhn.14.3":[{"a":"I will","r":["John 14:18-23,28","John 12:26","John 17:24","Matt 25:32-34","Acts 1:11","Acts 7:59-60","Rom 8:17","2 Cor 5:6-8","Phil 1:23","1 Thess 4:16-17","2 Thess 1:12","2 Thess 2:1","2 Tim 2:12","Heb 9:28","1 John 3:2-3","Rev 3:21","Rev 21:22-23","Rev 22:3-5"]}],"jhn.14.30":[{"a":"I","r":["John 16:12","Luke 24:44-49","Acts 1:3"]},{"a":"the","r":["John 12:31","John 16:11","Luke 22:53","2 Cor 4:4","Eph 2:2","Eph 6:12","Col 1:13","1 John 4:4","1 John 5:19","Rev 12:9","Rev 20:2-3,7-8"]},{"a":"and","r":["Luke 1:35","2 Cor 5:21","Heb 4:15","Heb 7:26","1 Pet 1:19","1 Pet 2:22","1 John 3:5-8"]}],"jhn.14.31":[{"a":"that the","r":["John 4:34","John 10:18","John 12:27","John 15:9","John 18:11","Ps 40:8","Matt 26:39","Phil 2:8","Heb 5:7-8","Heb 10:5-9","Heb 12:2-3"]},{"a":"Arise","r":["John 18:1-4","Matt 26:46","Luke 12:50"]}],"jhn.14.4":[{"a":"whither","r":["John 14:2,28","John 13:3","John 16:28","Luke 24:26"]},{"a":"and the","r":["John 3:16-17,36","John 6:40,68-69","John 10:9","John 12:26"]}],"jhn.14.5":[{"a":"Thomas","r":["John 20:25-28"]},{"a":"we know not","r":["John 15:12","Mark 8:17-18","Mark 9:19","Luke 24:25","Heb 5:11-12"]}],"jhn.14.6":[{"a":"I am","r":["John 10:9","Isa 35:8-9","Matt 11:27","Acts 4:12","Rom 5:2","Eph 2:18","Heb 7:25","Heb 9:8","Heb 10:19-22","1 Pet 1:21"]},{"a":"the truth","r":["John 1:14,17","John 8:32","John 15:1","John 18:37","Rom 15:8-9","2 Cor 1:19-20","Col 2:9,17","1 John 1:8","1 John 5:6,20","Rev 1:5","Rev 3:7,14","Rev 19:11"]},{"a":"the life","r":["John 14:19","John 1:4","John 5:21,25-29","John 6:33,51,57,68","John 8:51","John 10:28","John 11:25-26","John 17:2-3","Acts 3:15","Rom 5:21","1 Cor 15:45","Col 3:4","1 John 1:1-2","1 John 5:11-12","Rev 22:1,17"]},{"a":"no","r":["John 10:7,9","Acts 4:12","Rom 15:16","1 Pet 2:4","1 Pet 3:18","1 John 2:23","2 John 1:9","Rev 5:8-9","Rev 7:9-17","Rev 13:7-8","Rev 20:15"]}],"jhn.14.7":[{"a":"ye","r":["John 14:9-10,20","John 1:18","John 8:19","John 15:24","John 16:3","John 17:3,21,23","Matt 11:27","Luke 10:22","2 Cor 4:6","Col 1:15-17","Col 2:2-3","Heb 1:3"]},{"a":"from","r":["John 14:16-20","John 16:13-16","John 17:6,8,26"]}],"jhn.14.8":[{"a":"Philip","r":["John 1:43-46","John 6:5-7","John 12:21-22"]},{"a":"shew","r":["John 16:25","Exod 33:18-23","Exod 34:5-7","Job 33:26","Ps 17:15","Ps 63:2","Matt 5:8","Rev 22:3-5"]}],"jhn.14.9":[{"a":"Have","r":["Mark 9:19"]},{"a":"he","r":["John 14:7,20","John 12:45","Col 1:15","Phil 2:6","Heb 1:3"]},{"a":"how","r":["Gen 26:9","Ps 11:1","Jer 2:23","Luke 12:56","1 Cor 15:12"]}],"jhn.15.1":[{"a":"true","r":["John 1:9,17","John 6:32,55","1 John 2:8"]},{"a":"vine","r":["Gen 49:10-11","Ps 80:8-19","Isa 4:2","Isa 5:1-7","Jer 2:21","Jer 12:10","Ezek 15:2-6","Hos 10:1","Zech 3:8","Matt 21:33","Luke 13:6"]},{"a":"husbandman","r":["Song 7:12","Song 8:11-12","Isa 27:2-3","Isa 60:21","Isa 61:3","Matt 20:1","Mark 12:1","1 Cor 3:9"]}],"jhn.15.10":[{"a":"ye keep","r":["John 14:15,21","1 Cor 7:19","1 Thess 4:1","2 Pet 2:21","1 John 2:5","1 John 3:21-24","1 John 5:3","Rev 22:14"]},{"a":"even","r":["John 4:34","John 8:29","John 12:49","John 14:31","John 17:4","Isa 42:1-4","Matt 3:15-17","Heb 7:26","Heb 10:5-10","1 John 2:1-2"]}],"jhn.15.11":[{"a":"my","r":["Isa 53:11","Isa 62:4","Jer 32:41","Jer 33:9","Zeph 3:17","Luke 15:5,9,23,32","1 John 1:4"]},{"a":"your","r":["John 16:24,33","John 17:13","Rom 15:13","2 Cor 1:24","Eph 5:18","Phil 1:25","1 Thess 5:16","1 Pet 1:8","2 John 1:12"]}],"jhn.15.12":[{"a":"This is my commandment, That ye love one another, as I have loved you.","r":["John 13:34","Rom 12:10","Eph 5:2","1 Thess 3:12","1 Thess 4:9","2 Thess 1:3","1 Pet 1:22","1 Pet 3:8","1 Pet 4:8","1 John 2:7-10","1 John 3:11-18,23","1 John 4:21"]}],"jhn.15.13":[{"a":"Greater love hath no man than this, that a man lay down his life for his friends.","r":["John 10:11,15","Rom 5:6-8","Eph 5:2","1 John 4:7-11"]}],"jhn.15.14":[{"a":"my","r":["John 14:15,28","2 Chr 20:7","Song 5:1","Isa 41:8","Matt 12:50","Luke 12:4","Jas 2:23"]},{"a":"if","r":["John 2:5","John 13:17","John 14:21","1 John 5:3"]}],"jhn.15.15":[{"a":"I call","r":["John 15:20","John 12:26","John 13:16","John 20:17","Gal 4:6","Phlm 1:16","Jas 1:1","2 Pet 1:1","Jude 1:1","Rev 1:1"]},{"a":"friends","r":["Jas 2:23"]},{"a":"all","r":["John 4:19","John 17:6-8,26","Gen 18:17-19","2 Kgs 6:8-12","Ps 25:14","Amos 3:7","Matt 13:11","Luke 10:23","Acts 20:27","Rom 16:25-26","1 Cor 2:9-12","Eph 1:9","Eph 3:5","Col 1:26","1 Pet 1:11"]}],"jhn.15.16":[{"a":"have not","r":["John 15:19","John 6:70","John 13:18","Luke 6:13","Acts 1:24","Acts 9:15","Acts 10:41","Acts 22:14","Rom 9:11-16,21","1 John 4:10,19"]},{"a":"ordained","r":["John 20:21-23","John 21:15-17","Isa 49:1-3","Jer 1:5-7","Matt 28:18-19","Mark 16:15-16","Luke 24:47-49","Acts 1:8","Rom 1:5","Rom 15:15-16","1 Cor 9:16-18","Gal 1:15","Eph 2:10","Col 1:23","1 Tim 2:7","2 Tim 1:11","2 Tim 2:2","Titus 1:5"]},{"a":"bring","r":["John 15:8","Prov 11:30","Isa 27:6","Isa 55:10-13","Mic 5:7","Rom 1:13","Rom 15:16-19","1 Cor 3:6-7","Col 1:6","Jas 3:18"]},{"a":"that your","r":["Gen 18:18","Ps 71:18","Ps 78:4-6","Ps 145:4","Zech 1:4-6","Acts 20:25-28","Rom 15:4","1 Cor 10:11","2 Tim 3:15-17","Heb 11:4","1 Pet 1:14-21","1 Pet 3:2,15"]},{"a":"that whatsoever","r":["John 15:7","John 14:13-14","John 16:23-24","Matt 21:22"]}],"jhn.15.17":[{"a":"These things I command you, that ye love one another.","r":["John 15:12","1 Pet 2:17","1 John 3:14-17"]}],"jhn.15.18":[{"a":"If the world hate you, ye know that it hated me before it hated you.","r":["John 15:23-25","John 3:20","John 7:7","1 Kgs 22:8","Isa 49:7","Isa 53:3","Zech 11:8","Matt 5:11","Matt 10:22","Matt 24:9","Mark 13:13","Luke 6:22","Heb 12:2","Jas 4:4","1 John 3:1,3,13"]}],"jhn.15.19":[{"a":"were of the world","r":["Luke 6:32","1 John 4:4-5"]},{"a":"because","r":["John 15:16","John 17:14-16","Eph 1:4-11","Eph 2:2-5","Titus 3:3-7","1 Pet 2:9-12","1 Pet 4:3","1 John 3:12","1 John 5:19-20","Rev 12:9,17","Rev 20:7-9"]}],"jhn.15.2":[{"a":"branch","r":["John 17:12","Matt 3:10","Matt 15:13","Matt 21:19","Luke 8:13","Luke 13:7-9","1 Cor 13:1","Heb 6:7-8","1 John 2:19"]},{"a":"and","r":["Job 17:9","Ps 51:7-13","Prov 4:18","Isa 27:9","Isa 29:19","Hos 6:3","Mal 3:3","Matt 3:12","Matt 13:12,33","Rom 5:3-5","Rom 8:28","2 Cor 4:17-18","Phil 1:9-11","1 Thess 5:23-24","Titus 2:14","Heb 6:7","Heb 12:10-11,15","Rev 3:19"]},{"a":"may","r":["John 15:8,16","Gal 5:22-23","Phil 1:11","Col 1:5-10"]}],"jhn.15.20":[{"a":"word","r":["John 5:16","John 7:32","John 8:59","John 10:31","John 11:57","John 13:16","Matt 10:24","Luke 2:34","Luke 6:40","Acts 4:27-30","Acts 7:52-60","1 Thess 2:15"]},{"a":"if they have kept","r":["1 Sam 8:7","Isa 53:1-3","Ezek 3:7"]}],"jhn.15.21":[{"a":"all","r":["John 16:3","Ps 69:7","Isa 66:5","Matt 5:11","Matt 10:18,22,39","Matt 24:9","Luke 6:22","Acts 9:16","1 Pet 4:13"]},{"a":"because","r":["John 8:19,54","Acts 17:23","Acts 28:25-27","Rom 1:28","1 Cor 2:8","1 Cor 15:34","2 Cor 4:3-6","2 Thess 1:8","1 John 2:3-4"]}],"jhn.15.22":[{"a":"they","r":["John 3:18-21","John 9:41","John 12:48","John 19:11","Ezek 2:5","Ezek 33:31-33","Luke 12:46","Acts 17:30","2 Cor 2:14-16","Heb 6:4-8","Jas 4:17"]},{"a":"cloke","r":["Rom 1:20","Rom 2:1","1 Pet 2:16"]}],"jhn.15.23":[{"a":"He that hateth me hateth my Father also.","r":["John 8:40-42","1 John 2:23","2 John 1:9"]}],"jhn.15.24":[{"a":"If","r":["John 3:2","John 5:36","John 7:31","John 9:32","John 10:32,37","John 11:47-50","John 12:10,37-40","Matt 9:33","Matt 11:5","Matt 11:20-24","Mark 2:12","Luke 10:12-16","Luke 19:37-40","Luke 24:19","Acts 2:22","Acts 10:38","Heb 2:3-4"]},{"a":"but","r":["John 6:36","John 12:45","John 14:9","Matt 21:32"]},{"a":"hated","r":["Exod 20:5","Deut 5:9","Ps 81:15","Prov 8:36","Rom 1:30","Rom 8:7-8","2 Tim 3:4","Jas 4:4"]}],"jhn.15.25":[{"a":"the","r":["John 10:34","John 19:36","Luke 24:44","Rom 3:19"]},{"a":"They","r":["Ps 7:4","Ps 35:19","Ps 69:4","Ps 109:3"]},{"a":"without","r":["Matt 10:8","Rom 3:24","2 Cor 11:7","Gal 2:21","2 Thess 3:8","Rev 21:6","Rev 22:17"]}],"jhn.15.26":[{"a":"when","r":["John 14:16-17,26","John 16:7,13-14","Luke 24:49","Acts 2:33"]},{"a":"which","r":["John 8:42","Rev 22:1"]},{"a":"he","r":["John 16:14-15","Acts 2:32-33","Acts 5:32","Acts 15:8","1 Cor 1:6","Heb 2:4","1 John 5:6-10"]}],"jhn.15.27":[{"a":"ye also","r":["John 21:24","Luke 24:48","Acts 1:8,21-22","Acts 3:15","Acts 4:20,33","Acts 10:39-42","Acts 13:31","Acts 18:5","Acts 23:11","1 Pet 5:1,12","2 Pet 1:16-18","Rev 1:2,9"]},{"a":"have","r":["Mark 1:1","Luke 1:2-3","1 John 1:1-2"]}],"jhn.15.3":[{"a":"Now ye are clean through the word which I have spoken unto you.","r":["John 13:10","John 17:17","Eph 5:26","1 Pet 1:22"]}],"jhn.15.4":[{"a":"Abide","r":["John 6:68-69","John 8:31","Song 8:5","Luke 8:15","Acts 11:23","Acts 14:22","Gal 2:20","Col 1:23","Col 2:6","1 Thess 3:5","Heb 10:39","1 John 2:6,24-28","2 John 1:9","Jude 1:20-21"]},{"a":"I","r":["John 6:56","John 14:20","John 17:23","Rom 8:9-10","2 Cor 13:5","Eph 3:17","Col 1:27"]},{"a":"As","r":["Isa 27:10-11","Ezek 15:2-5","Hos 14:8","2 Cor 12:8-10","Gal 2:20","Phil 1:11"]}],"jhn.15.5":[{"a":"vine","r":["Rom 12:5","1 Cor 10:16","1 Cor 12:12,27","1 Pet 2:4"]},{"a":"same","r":["John 12:24","Prov 11:30","Hos 4:8","Luke 13:6-9","Rom 6:22","Rom 7:4","2 Cor 9:10","Gal 5:22","Eph 5:9","Phil 1:11","Phil 4:13,17","Col 1:6,10","Jas 1:17","2 Pet 1:2-18","2 Pet 3:18"]},{"a":"without","r":["Acts 4:12"]},{"a":"can","r":["John 5:19","John 9:33","2 Cor 13:8","Phil 4:13"]}],"jhn.15.6":[{"a":"he","r":["Job 15:30","Ps 80:15","Isa 14:19","Isa 27:10","Ezek 15:3-7","Ezek 17:9","Ezek 19:12-14","Matt 3:10","Matt 7:19","Matt 13:41","Matt 27:5","Heb 6:7-8","Heb 10:27","2 Pet 2:20","1 John 2:19","Jude 1:12-13","Rev 20:15","Rev 21:8"]}],"jhn.15.7":[{"a":"my","r":["John 8:37","Deut 6:6","Job 23:12","Ps 119:11","Prov 4:4","Jer 15:16","Col 3:16","1 John 2:14,27","2 John 1:1-2"]},{"a":"ye shall","r":["John 15:16","John 14:13","John 16:23","Job 22:26","Ps 37:4","Prov 10:24","Isa 58:8","Gal 4:2","Gal 5:16","1 John 3:22","1 John 5:14"]}],"jhn.15.8":[{"a":"is","r":["Ps 92:12-15","Isa 60:21","Isa 61:3","Hag 1:8","Matt 5:16","1 Cor 6:20","1 Cor 10:31","2 Cor 9:10-15","Phil 1:11","Titus 2:5,10","1 Pet 2:12","1 Pet 4:11"]},{"a":"so","r":["John 8:31","John 13:35","Matt 5:44","Luke 6:35"]}],"jhn.15.9":[{"a":"the Father","r":["John 15:13","John 17:23,26","Eph 3:18","Rev 1:5"]},{"a":"continue","r":["John 15:11","1 John 2:28","Jude 1:20"]}],"jhn.16.1":[{"a":"These things have I spoken unto you, that ye should not be offended.","r":["John 16:4","John 15:11","Matt 11:6","Matt 13:21,57","Matt 24:10","Matt 26:31-33","Rom 14:21","Phil 1:10","1 Pet 2:8"]}],"jhn.16.10":[{"a":"righteousness","r":["Isa 42:21","Isa 45:24-25","Jer 23:5-6","Dan 9:24","Acts 2:32","Rom 1:17","Rom 3:21-26","Rom 5:17-21","Rom 8:33-34","Rom 10:3-4","1 Cor 1:30","1 Cor 15:14-20","2 Cor 5:21","Gal 5:5","Phil 3:7-9","1 Tim 3:16","Heb 10:5-13"]},{"a":"because","r":["John 3:14","John 5:32"]}],"jhn.16.11":[{"a":"judgment","r":["John 5:22-27","Matt 12:18,36","Acts 10:42","Acts 17:30-31","Acts 24:25","Acts 26:18","Rom 2:2-4,16","Rom 14:10-12","1 Cor 4:5","1 Cor 6:3-4","2 Cor 5:10-11","Heb 6:2","Heb 9:27","2 Pet 2:4-9","2 Pet 3:7","Rev 1:7","Rev 20:11-15"]},{"a":"the","r":["John 12:31","John 14:30","Gen 3:15","Ps 68:18","Isa 49:24-26","Luke 10:18","Rom 16:20","2 Cor 4:4","Eph 2:2","Col 2:15","Heb 2:14","1 John 3:8","Rev 12:7-10","Rev 20:2-3,10"]}],"jhn.16.12":[{"a":"yet","r":["John 14:30","John 15:15","Acts 1:3"]},{"a":"ye","r":["Mark 4:33","1 Cor 3:1-2","Heb 5:11-14"]}],"jhn.16.13":[{"a":"Spirit","r":["John 14:17","John 15:26","1 John 4:6"]},{"a":"will guide","r":["John 14:26","1 Cor 2:10-13","Eph 4:7-15","1 John 2:20,27"]},{"a":"for","r":["John 3:32","John 7:16-18","John 8:38","John 12:49"]},{"a":"he will shew","r":["Joel 2:28","Acts 2:17-18","Acts 11:28","Acts 20:23","Acts 21:9-11","Acts 27:24","2 Thess 2:3,12","1 Tim 4:1-3","2 Tim 3:1-5","2 Pet 2:1-22","Rev 1:1,19","Rev 6:1-17","Rev 22:1-21"]}],"jhn.16.14":[{"a":"glorify","r":["John 16:9-10","Acts 2:32-36","Acts 4:10-12","1 Cor 12:3","1 Pet 1:10-12","1 Pet 2:7","1 John 4:1-3,13-14","1 John 5:6"]},{"a":"for","r":["John 15:26","Zech 12:10","1 Cor 2:8-10","2 Cor 3:14-18","2 Cor 4:6","Gal 5:5","1 John 3:23-24","1 John 4:13-14","1 John 5:20","Rev 19:10"]}],"jhn.16.15":[{"a":"All things that the Father hath are mine: therefore said I, that he shall take of mine, and shall shew it unto you.","r":["John 3:35","John 10:29-30","John 13:3","John 17:2,10","Matt 11:27","Matt 28:18","Luke 10:22","Col 1:19","Col 2:3,9"]}],"jhn.16.16":[{"a":"a little while","r":["John 20:19-29","John 21:1-23","Acts 1:3","Acts 10:40-41","1 Cor 15:5-9"]},{"a":"because","r":["John 16:28","John 13:3","John 17:5,13","Mark 16:19","Heb 12:2"]}],"jhn.16.17":[{"a":"said","r":["John 16:1,5,19","John 12:16","John 14:5,22","Mark 9:10,32","Luke 9:45","Luke 18:34"]}],"jhn.16.18":[{"a":"we","r":["Matt 16:9-11","Luke 24:25","Heb 5:12"]}],"jhn.16.19":[{"a":"Jesus","r":["John 16:30","John 2:24-25","John 21:17","Ps 139:1-4","Matt 6:8","Matt 9:4","Mark 9:33-34","Heb 4:13","Rev 2:23"]},{"a":"A little","r":["John 16:16","John 7:33","John 13:33","John 14:19"]}],"jhn.16.2":[{"a":"shall","r":["John 9:22,34","John 12:42","Luke 6:22","1 Cor 4:13"]},{"a":"the time","r":["Isa 65:5","Matt 10:28","Matt 24:9","Acts 5:33","Acts 6:13-14","Acts 7:56-60","Acts 8:1-3","Acts 9:1-2","Acts 22:3-4,19-23","Acts 26:9-11","Rom 10:2-3","Gal 1:13-14","Phil 3:6"]}],"jhn.16.20":[{"a":"That","r":["John 16:6,33","John 19:25-27","Mark 14:72","Mark 16:10","Luke 22:45,62","Luke 23:47-49","Luke 24:17,21"]},{"a":"but the","r":["Job 20:5","Matt 21:38","Matt 27:39-44,62-66","Mark 15:29-32","Rev 11:10","Rev 18:7"]},{"a":"your","r":["Ps 30:5,11","Ps 40:1-3","Ps 97:11","Ps 126:5-6","Isa 12:1","Isa 25:8-9","Isa 61:3","Isa 66:5","Jer 31:9-14,25","Matt 5:4","Luke 6:21","Acts 2:46-47","Acts 5:41","Rom 5:2-3,11","2 Cor 6:10","Gal 5:22","1 Thess 1:6","2 Thess 2:16-17","Jas 1:2","1 Pet 1:6-8","Jude 1:24","Rev 7:14-17"]}],"jhn.16.21":[{"a":"woman","r":["Gen 3:16","Isa 26:16-18","Jer 30:6-7","Hos 13:13-14","Mic 4:10","Rev 12:2-5"]},{"a":"for","r":["Gen 21:6-7","Gen 30:23-24","1 Sam 1:26-27","Ps 113:9","Luke 1:57-58","Gal 4:27"]}],"jhn.16.22":[{"a":"ye now","r":["John 16:6,20"]},{"a":"But","r":["John 14:1,27","John 20:19-20","John 21:7","Isa 25:9","Isa 65:13-14","Isa 66:9-14","Matt 28:8","Luke 24:41,51-53","Acts 2:46","Acts 13:52","1 Pet 1:8"]},{"a":"and your","r":["John 4:14","Job 34:29","Ps 146:2","Isa 12:2-4","Isa 51:11-12","Isa 54:7-8","Isa 65:18-19","Hab 3:17-18","Luke 10:42","Luke 16:25","Luke 19:26","Acts 5:41","Acts 16:25","Acts 20:23-24","Rom 8:35-39","1 Thess 3:7-9","2 Thess 2:16","Heb 6:18","Heb 10:34","1 Pet 1:8","1 Pet 4:13-14"]}],"jhn.16.23":[{"a":"ask","r":["John 16:19","John 13:36-37","John 14:5,22","John 15:15","John 21:20-21"]},{"a":"Whatsoever","r":["John 14:13-14","John 15:7,16","Isa 65:24","Matt 7:7","Matt 21:22","Eph 2:18","Eph 3:14-20","1 Tim 2:5-6","Heb 4:14-16","Heb 7:25-26","Heb 10:19-23","1 John 2:1","1 John 5:14-16"]}],"jhn.16.24":[{"a":"in","r":["Gen 32:9","1 Kgs 18:36","2 Kgs 19:15","Matt 6:9","Eph 1:16-17","1 Thess 3:11-13","2 Thess 1:2","2 Thess 2:16-17"]},{"a":"ask","r":["Matt 7:7-8","Jas 4:2-3"]},{"a":"that","r":["John 16:23","John 15:11","1 John 1:3-4","2 John 1:12"]}],"jhn.16.25":[{"a":"proverbs","r":["John 16:12,16-17","Ps 49:4","Ps 78:2","Prov 1:6","Matt 13:10-11,34-35","Mark 4:13"]},{"a":"but","r":["John 16:28-29","Acts 2:33-36","2 Cor 3:12-18","2 Cor 4:2"]}],"jhn.16.26":[{"a":"that","r":["John 14:16","John 17:9,19,24","Rom 8:34"]}],"jhn.16.27":[{"a":"the Father","r":["John 14:21,23","John 17:23,26","Zeph 3:17","Heb 12:6","Jude 1:20-21","Rev 3:9,19"]},{"a":"because","r":["John 8:42","John 21:15-17","Matt 10:37","1 Cor 16:22","2 Cor 5:14","Eph 6:24","1 Pet 1:8","1 John 4:19"]},{"a":"and have","r":["John 16:30","John 3:13","John 7:29","John 17:7-8,25","Rom 8:3","1 Cor 15:47","Gal 4:4","1 Tim 1:15"]}],"jhn.16.28":[{"a":"came","r":["John 8:14","John 13:1,3"]},{"a":"I leave","r":["John 16:5,16","John 14:28","John 17:5,11,13","Luke 9:51","Luke 24:51","Acts 1:9-11"]}],"jhn.16.3":[{"a":"because","r":["John 8:19,55","John 15:21,23","John 17:3,25","Luke 10:22","1 Cor 2:8","2 Cor 4:3-6","2 Thess 1:8","2 Thess 2:10-12","1 Tim 1:13","1 John 3:1","1 John 4:8","1 John 5:20"]}],"jhn.16.30":[{"a":"are","r":["John 16:17","John 5:20","John 21:17","Heb 4:13"]},{"a":"by","r":["John 17:8"]}],"jhn.16.31":[{"a":"Do","r":["John 13:38","Luke 9:44-45"]}],"jhn.16.32":[{"a":"the hour","r":["John 4:21,23","John 5:25,28","John 12:23"]},{"a":"that","r":["Zech 13:7","Matt 26:31,56","Mark 14:27,50","Acts 8:1","2 Tim 4:16-17"]},{"a":"every","r":["John 20:10"]},{"a":"yet","r":["John 8:16,29","John 14:10-11","Isa 50:6-9"]}],"jhn.16.33":[{"a":"in me","r":["John 14:27","Ps 85:8-11","Isa 9:6-7","Mic 5:5","Luke 2:14","Luke 19:38","Rom 5:1-2","Eph 2:14-17","Phil 4:7","Col 1:20","2 Thess 3:16","Heb 7:2","Heb 13:20-21"]},{"a":"In the","r":["John 15:19-21","Acts 14:22","Rom 8:36","2 Cor 7:4","1 Thess 3:4","2 Tim 3:12","Heb 11:25","1 Pet 5:9","Rev 7:14"]},{"a":"but","r":["John 14:1","Acts 9:31","Acts 23:11","Acts 27:22,25","2 Cor 1:3","2 Cor 13:11","1 Thess 3:7"]},{"a":"I","r":["John 16:11","John 12:31","1 Sam 17:51-52","Ps 68:18","Rom 8:37","Gal 1:4","Gal 6:14","1 John 4:4","1 John 5:4"]}],"jhn.16.4":[{"a":"that when","r":["John 13:19","John 14:29","Isa 41:22-23","Matt 10:7","Matt 24:25","Mark 13:23","Luke 21:12-13","Acts 9:16","Acts 20:23-24","2 Pet 1:14"]},{"a":"because","r":["John 17:12-13","Matt 9:15","Mark 2:19"]}],"jhn.16.5":[{"a":"I","r":["John 16:10,16,28","John 6:62","John 7:33","John 13:3","John 14:28","John 17:4,13","Eph 4:7-11","Heb 1:3","Heb 12:2"]},{"a":"Whither","r":["John 13:36","John 14:4-6"]}],"jhn.16.6":[{"a":"But because I have said these things unto you, sorrow hath filled your heart.","r":["John 16:20-22","John 14:1,27-28","John 20:11-15","Luke 22:45","Luke 24:17"]}],"jhn.16.7":[{"a":"I tell","r":["John 8:45-46","Luke 4:25","Luke 9:27","Acts 10:34"]},{"a":"It","r":["John 11:50-52","John 14:3,28","Rom 8:28","2 Cor 4:17"]},{"a":"the Comforter","r":["John 7:39","John 14:16-17,26","John 15:26"]},{"a":"but","r":["Ps 68:18","Luke 24:49","Acts 1:4-5","Acts 2:33","Eph 4:8-13"]}],"jhn.16.8":[{"a":"he will","r":["Zech 12:10","Acts 2:37","Acts 16:29-30"]},{"a":"reprove","r":["John 8:9,46","1 Cor 14:24","Jude 1:15"]}],"jhn.16.9":[{"a":"Of sin, because they believe not on me;","r":["John 3:18-21","John 5:40-44","John 8:23-24,42-47","John 12:47-48","John 15:22-25","Mark 16:16","Acts 2:22-38","Acts 3:14-19","Acts 7:51-54","Acts 26:9-10","Rom 3:19-20","Rom 7:9","1 Thess 2:15-16","1 Tim 1:13","Heb 3:12","Heb 10:28-29"]}],"jhn.17.1":[{"a":"and lifted","r":["John 11:41","Ps 121:1-2","Ps 123:1","Isa 38:14","Luke 18:13"]},{"a":"the hour","r":["John 7:30","John 8:20","John 12:23,27-28","John 13:1","John 16:32","Mark 14:41","Luke 22:53"]},{"a":"glorify","r":["John 17:4-5","John 7:39","John 11:4","John 13:31-32","Acts 3:13","Phil 2:9-11","1 Pet 1:21"]}],"jhn.17.10":[{"a":"all","r":["John 10:30","John 16:14-15","1 Cor 3:21-23","Col 1:15-19","Col 2:9"]},{"a":"and I","r":["John 5:23","John 11:4","John 12:23","Acts 19:17","Gal 1:24","Phil 1:20","Phil 2:9-11","2 Thess 1:10,12","1 Pet 2:9","Rev 5:8-14"]}],"jhn.17.11":[{"a":"I am","r":["John 17:13","John 13:1,3","John 16:28","Acts 1:9-11","Acts 3:21","Heb 1:3","Heb 9:24"]},{"a":"but","r":["John 17:14-18","John 15:18-21","John 16:33","Matt 10:16","Jas 4:4","1 John 3:12","1 John 5:19"]},{"a":"Holy","r":["John 17:25","Matt 5:48","1 Pet 1:15-17","Rev 4:8","Rev 15:4"]},{"a":"keep","r":["John 17:12,15","John 10:29-30","Ps 17:8-9","Isa 27:3","1 Pet 1:5","Jude 1:1,24"]},{"a":"thine","r":["Ps 79:9","Prov 18:10","Isa 64:2","Jer 14:7,21","Ezek 20:9,22,44","Matt 6:9","Rom 9:17"]},{"a":"that","r":["John 17:21-22","John 10:30","John 14:20","Rom 15:5-6","1 Cor 1:10","1 Cor 12:12-13","Eph 4:4"]}],"jhn.17.12":[{"a":"I kept","r":["John 6:37,39-40","John 10:27-28","Heb 2:13"]},{"a":"and","r":["John 13:18","John 18:9","Luke 4:26-27","1 John 2:19"]},{"a":"the son","r":["John 6:70-71","John 13:18","2 Thess 2:3"]},{"a":"that","r":["Ps 109:6-19","Acts 1:16-20,25"]}],"jhn.17.13":[{"a":"come","r":["John 17:1","John 13:3","Heb 12:2"]},{"a":"that","r":["John 3:29","John 15:11","John 16:22-24,33","Neh 8:10","Ps 43:4","Ps 126:5","Acts 13:52","Rom 14:17","Gal 5:22","1 John 1:4","2 John 1:12"]}],"jhn.17.14":[{"a":"the world","r":["John 7:7","John 15:18-21","Gen 3:15","Prov 29:27","Zech 11:8","Matt 10:24-25","1 Pet 4:4-5","1 John 3:12"]},{"a":"they","r":["John 17:16","John 8:23","1 John 4:5-6","1 John 5:19-20"]}],"jhn.17.15":[{"a":"take","r":["Ps 30:9","Eccl 9:10","Isa 38:18-19","Isa 57:1","Luke 8:38-39","Phil 1:20-26"]},{"a":"keep","r":["Gen 48:16","1 Chr 4:10","Ps 121:7","Matt 6:13","Luke 11:4","Gal 1:4","2 Thess 3:3","2 Tim 4:8","1 John 5:18"]}],"jhn.17.17":[{"a":"Sanctify","r":["John 17:19","John 8:32","John 15:3","Ps 19:7-9","Ps 119:9,11,104","Luke 8:11,15","Acts 15:9","2 Cor 3:18","Eph 5:26","2 Thess 2:13","Jas 1:21","1 Pet 1:22-23"]},{"a":"word","r":["John 8:40","2 Sam 7:28","Ps 12:6","Ps 19:7","Ps 119:144,151-152","Eph 4:21","2 Tim 2:25-26"]}],"jhn.17.18":[{"a":"As thou hast sent me into the world, even so have I also sent them into the world.","r":["John 20:21","Isa 61:1-3","Matt 23:34","2 Cor 5:20","Eph 3:7"]}],"jhn.17.19":[{"a":"for","r":["Isa 62:1","2 Cor 4:15","2 Cor 8:9","1 Thess 4:7","2 Tim 2:10"]},{"a":"I sanctify","r":["John 10:36","Jer 1:5","1 Cor 1:2","Heb 2:11","Heb 9:13,18,26","Heb 10:5-10,29"]},{"a":"that","r":["John 17:17","Titus 2:14"]}],"jhn.17.2":[{"a":"As","r":["John 3:35","John 5:21-29","Ps 2:6-12","Ps 110:1","Dan 7:14","Matt 11:27","Matt 28:18","1 Cor 15:25","Eph 1:20","Phil 2:10","Heb 1:2","Heb 2:8-9","1 Pet 3:22"]},{"a":"give","r":["John 17:24","John 4:14","John 6:27,54-57","John 10:28","John 11:25-26","Rom 6:23","Col 3:3-4","1 Tim 1:16","1 John 1:2","1 John 2:25","1 John 5:20","Jude 1:21"]},{"a":"many","r":["John 6:37,39","John 10:29"]}],"jhn.17.20":[{"a":"pray","r":["John 17:6-11","Eph 4:11"]},{"a":"for them","r":["Acts 2:41","Acts 4:4","Rom 15:18-19","Rom 16:26","2 Tim 1:2"]}],"jhn.17.21":[{"a":"they all","r":["John 17:11,22-23","John 10:16","Jer 32:39","Ezek 37:16-19,22-25","Zeph 3:9","Zech 14:9","Acts 2:46","Acts 4:32","Rom 12:5","1 Cor 1:10","1 Cor 12:12,25-27","Gal 3:28","Eph 4:3-6","Phil 1:27","Phil 2:1-5","Col 3:11-14","1 Pet 3:8-9"]},{"a":"as","r":["John 5:23","John 10:30,38","John 14:9-11","Phil 2:6","1 John 5:7"]},{"a":"that the","r":["John 13:35"]}],"jhn.17.22":[{"a":"the glory","r":["John 1:16","John 15:18-19","John 20:21-23","Mark 6:7","Mark 16:17-20","Luke 22:30","Acts 5:41","Rom 15:15-20","2 Cor 3:18","2 Cor 5:20","2 Cor 6:1","Eph 2:20","Phil 1:29","Col 1:24","2 Thess 1:5-10","Rev 21:14"]},{"a":"that","r":["John 14:20","1 John 1:3","1 John 3:24"]}],"jhn.17.23":[{"a":"I","r":["John 6:56","John 14:10,23","Rom 8:10-11","1 Cor 1:30","2 Cor 5:21","Gal 3:28","1 John 1:3","1 John 4:12-16"]},{"a":"made","r":["Eph 4:12-16","Phil 3:15","Col 1:28","Col 2:2,9-10","Col 3:14","1 Pet 5:10"]},{"a":"the","r":["John 13:35"]},{"a":"and hast","r":["John 17:24","Eph 1:6-14","1 John 3:1","1 John 4:19"]}],"jhn.17.24":[{"a":"I will","r":["John 12:26","John 14:3","Matt 25:21,23","Matt 26:29","Luke 12:37","Luke 22:28-30","Luke 23:43","2 Cor 5:8","Phil 1:23","1 Thess 4:17","Rev 3:21","Rev 7:14-17"]},{"a":"may","r":["Gen 45:13","1 Cor 13:12","2 Cor 3:18","2 Cor 4:6","1 John 3:2","Rev 21:22"]},{"a":"for","r":["John 17:5","Prov 8:21-31"]}],"jhn.17.25":[{"a":"righteous","r":["John 17:11","Isa 45:21","Rom 3:26"]},{"a":"the world","r":["John 8:19,55","John 15:21","John 16:3","Matt 11:27","Luke 10:22","Acts 17:23","Acts 26:18","Rom 1:28","Rom 3:11","1 Cor 1:21","1 Cor 15:34","2 Cor 4:4","Gal 4:8-9","2 Thess 1:8","Heb 8:11","1 John 5:19-20","Rev 13:8"]},{"a":"but","r":["John 1:18","John 5:19-20","John 7:29","John 10:15"]},{"a":"these","r":["John 17:8","John 6:19","John 16:27,30","Matt 16:16"]}],"jhn.17.26":[{"a":"I have","r":["John 17:6","John 8:50","John 15:15","Ps 22:22","Heb 2:12"]},{"a":"that","r":["John 14:23","John 15:9","Eph 1:6,22-23","Eph 2:4-5","Eph 5:30,32","2 Thess 2:16"]},{"a":"and I","r":["John 17:23","John 6:56","John 14:20","John 15:4","Rom 8:10","1 Cor 1:30","1 Cor 12:12","Gal 2:20","Eph 3:17","Col 1:27","Col 2:10","Col 3:11","1 John 3:24","1 John 4:13-14"]}],"jhn.17.3":[{"a":"this","r":["John 17:25","John 8:19,54-55","1 Chr 28:9","Ps 9:10","Isa 53:11","Jer 9:23-24","Jer 31:33-34","Hos 6:3","1 Cor 15:34","2 Cor 4:6","2 Thess 1:8","Heb 8:11-12","1 John 4:6","1 John 5:11,20"]},{"a":"the only","r":["John 14:9-10","2 Chr 15:3","Jer 10:10","1 Cor 8:4","1 Thess 1:9","1 Tim 6:15-16","1 John 5:20"]},{"a":"and Jesus","r":["John 3:17,34","John 5:36-37","John 6:27-29,57","John 7:29","John 10:36","John 11:42","John 12:49-50","John 14:26","Isa 48:16","Isa 61:1","Mark 9:37","Luke 9:48","1 John 4:14-15","1 John 5:11-12"]}],"jhn.17.4":[{"a":"glorified","r":["John 12:28","John 13:31-32","John 14:13"]},{"a":"finished","r":["John 4:34","John 5:36","John 9:3","John 14:31","John 15:10","John 19:30","Acts 20:24","2 Tim 4:7"]}],"jhn.17.5":[{"a":"glorify","r":["John 17:24","John 1:18","John 3:13","John 10:30","John 14:9","Prov 8:22-31","Phil 2:6","Col 1:15-17","Heb 1:3,10","1 John 1:2","Rev 5:9-14"]},{"a":"before","r":["John 1:1-3","Matt 25:34","1 Pet 1:20","Rev 13:8"]}],"jhn.17.6":[{"a":"have manifested","r":["John 17:26","John 1:18","John 12:28","Exod 3:13-15","Exod 9:16","Exod 34:5-7","Ps 22:22","Ps 71:17-19","Matt 11:25-27","Luke 10:21-22","2 Cor 4:6","Heb 2:12","1 John 5:20"]},{"a":"the men","r":["John 17:2,9,11,14,16,24","John 6:37","John 10:27-29","John 15:19","John 18:9","Acts 13:48"]},{"a":"thine","r":["John 17:9-10","Rom 8:28-30","Rom 11:2","Eph 1:4-11","2 Thess 2:13-14","1 Pet 1:1"]},{"a":"they","r":["John 8:31-32","John 14:21-24","John 15:3,7","Ps 119:11","Prov 2:1-5,10","Prov 3:1-4","Prov 23:23","Col 3:16","2 Tim 1:13","Heb 3:6","Rev 2:13","Rev 3:8"]}],"jhn.17.7":[{"a":"they","r":["John 7:16-17","John 14:7-10,20","John 16:27-30"]},{"a":"are","r":["John 17:10","John 8:28","John 10:29-30","John 12:49-50","John 16:15"]}],"jhn.17.8":[{"a":"I have","r":["John 17:14","John 6:68","John 14:10","Prov 1:23","Matt 13:11","Eph 3:2-8","Eph 4:11-12"]},{"a":"received","r":["John 3:33","Prov 1:3","Prov 2:1","Prov 4:10","Prov 8:10","1 Cor 11:23","1 Cor 15:1","1 Thess 2:13","1 Thess 4:1"]},{"a":"and have","r":["John 17:6-7,25","John 16:27,30","1 John 4:14"]}],"jhn.17.9":[{"a":"pray for","r":["John 14:16","John 16:26-27","Luke 22:32","Luke 8:34","Heb 7:25","Heb 9:24","1 John 2:1-2","1 John 5:19","Rev 12:9","Rev 13:8","Rev 20:15"]}],"jhn.3.1":[{"a":"There was a man of the Pharisees, named Nicodemus, a ruler of the Jews:","r":["John 3:10","John 7:47-49"]}],"jhn.3.10":[{"a":"Art","r":["Isa 9:16","Isa 29:10-12","Isa 56:10","Jer 8:8-9","Matt 11:25","Matt 15:14","Matt 22:29"]},{"a":"and knowest","r":["Deut 10:16","Deut 30:6","1 Chr 29:19","Ps 51:6,10","Ps 73:1","Isa 11:6-9","Isa 66:7-9","Jer 31:33","Jer 32:39-40","Ezek 11:19","Ezek 18:31-32","Ezek 36:25-27","Ezek 37:23-24","Rom 2:28","Phil 3:3","Col 2:11"]}],"jhn.3.11":[{"a":"verily","r":["John 3:3,5"]},{"a":"We speak","r":["John 3:13,32-34","John 1:18","John 7:16","John 8:14,28-29,38","John 12:49","John 14:24","Isa 55:4","Matt 11:27","Luke 10:22","1 John 1:1-3","1 John 5:6-12","Rev 1:5","Rev 3:14"]},{"a":"ye","r":["John 3:32","John 1:11","John 5:31-40,43","John 12:37-38","Isa 50:2","Isa 53:1","Isa 65:2","Matt 23:37","Acts 22:18","Acts 28:23-27","2 Cor 4:4"]}],"jhn.3.12":[{"a":"earthly","r":["John 3:3,5,8","1 Cor 3:1-2","Heb 5:11","1 Pet 2:1-3"]},{"a":"heavenly","r":["John 3:13-17,31-36","John 1:1-14","1 Cor 2:7-9","1 Tim 3:16","1 John 4:10"]}],"jhn.3.13":[{"a":"no man","r":["John 1:18","John 6:46","Deut 30:12","Prov 30:4","Acts 2:34","Rom 10:6","Eph 4:9"]},{"a":"but","r":["John 6:33,38,51,62","John 8:42","John 13:3","John 16:28-30","John 17:5","1 Cor 15:47"]},{"a":"even","r":["John 1:18","Matt 28:20","Mark 16:19-20","Acts 20:28","Eph 1:23","Eph 4:10"]}],"jhn.3.14":[{"a":"as","r":["Num 21:7-9","2 Kgs 18:4"]},{"a":"even","r":["John 8:28","John 12:32-34","Ps 22:16","Matt 26:54","Luke 18:31-33","Luke 24:20,26-27,44-46","Acts 2:23","Acts 4:27-28"]}],"jhn.3.15":[{"a":"whosoever","r":["John 3:16,36","John 1:12","John 6:40,47","John 11:25-26","John 12:44-46","John 20:31","Isa 45:22","Mark 16:16","Acts 8:37","Acts 16:30-31","Rom 5:1-2","Rom 10:9-14","Gal 2:16,20","Heb 7:25","Heb 10:39","1 John 5:1,11-13"]},{"a":"not","r":["John 5:24","John 10:28-30","Matt 18:11","Luke 19:10","Acts 13:41","1 Cor 1:18","2 Cor 4:3"]},{"a":"eternal","r":["John 17:2-3","Rom 5:21","Rom 6:22-23","1 John 2:25","1 John 5:13,20"]}],"jhn.3.16":[{"a":"God","r":["Luke 2:14","Rom 5:8","2 Cor 5:19-21","Titus 3:4","1 John 4:9-10,19"]},{"a":"gave","r":["John 1:14,18","Gen 22:12","Mark 12:6","Rom 5:10","Rom 8:32"]},{"a":"that whosoever","r":["John 3:15","Matt 9:13","1 Tim 1:15-16"]}],"jhn.3.17":[{"a":"God","r":["John 5:45","John 8:15-16","John 12:47-48","Luke 9:56"]},{"a":"but","r":["John 1:29","John 6:40","Isa 45:21-23","Isa 49:6-7","Isa 53:10-12","Zech 9:9","Matt 1:23","Matt 18:11","Matt 1:23","Matt 18:11","Luke 2:10-11","Luke 19:10","1 Tim 2:5-6","1 John 2:2","1 John 4:14"]}],"jhn.3.18":[{"a":"is not","r":["John 3:36","John 5:24","John 6:40,47","John 20:31","Rom 5:1","Rom 8:1,34","1 John 5:12"]},{"a":"he that believeth not","r":["Mark 16:16","Heb 2:3","Heb 12:25","1 John 5:10"]}],"jhn.3.19":[{"a":"this","r":["John 1:4,9-11","John 8:12","John 9:39-41","John 15:22-25","Matt 11:20-24","Luke 10:11-16","Luke 12:47","Rom 1:32","2 Cor 2:15-16","2 Thess 2:12","Heb 3:12-13"]},{"a":"because","r":["John 5:44","John 7:17","John 8:44-45","John 10:26-27","John 12:43","Isa 30:9-12","Luke 16:14","Acts 24:21-26","Rom 2:8","1 Pet 2:8","2 Pet 3:3"]}],"jhn.3.2":[{"a":"came","r":["John 7:50-51","John 12:42-43","John 19:38-39","Judg 6:27","Isa 51:7","Phil 1:14"]},{"a":"Rabbi","r":["John 3:26","John 1:38","John 20:16"]},{"a":"we know","r":["Matt 22:16","Mark 12:14"]},{"a":"for","r":["John 5:36","John 7:31","John 9:16,30-33","John 11:47-48","John 12:37","John 15:24","Acts 2:22","Acts 4:16-17","Acts 10:38"]}],"jhn.3.20":[{"a":"every","r":["John 7:7","1 Kgs 22:8","Job 24:13-17","Ps 50:17","Prov 1:29","Prov 4:18","Prov 5:12","Prov 15:12","Amos 5:10-11","Luke 11:45","Jas 1:23-25"]},{"a":"reproved","r":["Eph 5:12-13"]}],"jhn.3.21":[{"a":"he that","r":["John 1:47","John 5:39","Ps 1:1-3","Ps 119:80,105","Ps 139:23-24","Isa 8:20","Acts 17:11-12","1 John 1:6"]},{"a":"that his","r":["John 15:4-5","Isa 26:12","Hos 14:8","1 Cor 15:10","2 Cor 1:12","Gal 5:22-23","Gal 6:8","Eph 5:9","Phil 1:11","Phil 2:13","Col 1:29","Heb 13:21","1 Pet 1:22","2 Pet 1:5-10","1 John 2:27-29","1 John 4:12-13,15-16","Rev 3:1-2,15"]},{"a":"they are","r":["3 John 1:11"]}],"jhn.3.22":[{"a":"these","r":["John 2:13","John 4:3","John 7:3"]},{"a":"and baptized","r":["John 3:26","John 4:1-2"]}],"jhn.3.23":[{"a":"near","r":["Gen 33:18"]},{"a":"Shalem","r":["1 Sam 9:4"]},{"a":"much","r":["Jer 51:13","Ezek 19:10","Ezek 43:2","Rev 1:15","Rev 14:2","Rev 19:6"]},{"a":"and they","r":["Matt 3:5-6","Mark 1:4-5","Luke 3:7"]}],"jhn.3.24":[{"a":"For John was not yet cast into prison.","r":["Matt 4:12","Matt 14:3","Mark 6:17","Luke 3:19-20","Luke 9:7-9"]}],"jhn.3.25":[{"a":"about","r":["John 2:6","Matt 3:11","Mark 7:2-5,8","Heb 6:2","Heb 9:10,13-14,23","1 Pet 3:21"]}],"jhn.3.26":[{"a":"he that","r":["Num 11:26-29","Eccl 4:4","1 Cor 3:3-5","Gal 5:20-21","Gal 6:12-13","Jas 3:14-18","Jas 4:5-6"]},{"a":"to whom","r":["John 1:7,15,26-36"]},{"a":"and all","r":["John 1:7,9","John 11:48","John 12:19","Ps 65:2","Isa 45:23","Acts 19:26-27"]}],"jhn.3.27":[{"a":"A man","r":["Num 16:9-11","Num 17:5","1 Chr 28:4-5","Jer 1:5","Jer 17:16","Amos 7:15","Matt 25:15","Mark 13:34","Rom 1:5","Rom 12:6","1 Cor 1:1","1 Cor 2:12-14","1 Cor 3:5","1 Cor 4:7","1 Cor 12:11","1 Cor 15:10","Gal 1:1","Eph 1:1","Eph 3:7-8","1 Tim 2:7","Jas 1:17","1 Pet 4:10-11"]},{"a":"receive","r":["Heb 5:4-5"]},{"a":"from","r":["Matt 21:25","Mark 11:30-31"]}],"jhn.3.28":[{"a":"I said","r":["John 1:20,25,27"]},{"a":"but","r":["John 1:23","Mal 3:1","Mal 4:4-5","Matt 3:3,11-12","Mark 1:2-3","Luke 1:16-17,76","Luke 3:4-6"]}],"jhn.3.29":[{"a":"hath","r":["Ps 45:9-17","Song 3:11","Song 4:8-12","Isa 54:5","Isa 62:4-5","Jer 2:2","Ezek 16:8","Hos 2:19","Matt 22:2","2 Cor 11:2","Eph 5:25-27","Rev 19:7-9","Rev 21:9"]},{"a":"the friend","r":["Judg 14:10-11","Ps 45:14","Song 5:1","Matt 9:15"]},{"a":"this","r":["Isa 66:11","Luke 2:10-14","Luke 15:6"]}],"jhn.3.3":[{"a":"Verily","r":["John 1:51","Matt 5:18","2 Cor 1:19-20","Rev 3:14"]},{"a":"Except","r":["John 3:5-6","John 1:13","Gal 6:15","Eph 2:1","Titus 3:5","Jas 1:18","1 Pet 1:3,23-25","1 John 2:29","1 John 3:9","1 John 5:1,18"]},{"a":"again","r":["Jas 1:17","Jas 3:17"]},{"a":"he cannot","r":["John 3:5","John 1:5","John 12:40","Deut 29:4","Jer 5:21","Matt 13:11-16","Matt 16:17","2 Cor 4:4"]}],"jhn.3.30":[{"a":"must increase","r":["Ps 72:17-19","Isa 9:7","Isa 53:2-3,12","Dan 2:34-35,44-45","Matt 13:31-33","Rev 11:15"]},{"a":"but","r":["Acts 13:36-37","1 Cor 3:5","2 Cor 3:7-11","Col 1:18","Heb 3:2-6"]}],"jhn.3.31":[{"a":"that cometh","r":["John 3:13","John 6:33","John 8:23","Eph 1:20-21","Eph 4:8-10"]},{"a":"is above","r":["John 1:15,27,30","John 5:21-25","Matt 28:18","Acts 10:36","Rom 9:5","Eph 1:21","Phil 2:9-11","1 Pet 3:22","Rev 19:16"]},{"a":"he that is","r":["John 3:12","1 Cor 15:47-48","Heb 9:1,9-10"]},{"a":"he that cometh","r":["John 6:33,51","John 16:27-28"]}],"jhn.3.32":[{"a":"what","r":["John 3:11","John 5:20","John 8:26","John 15:15"]},{"a":"and no","r":["John 3:26,33","John 1:11","Isa 50:2","Isa 53:1","Rom 10:16-21","Rom 11:2-6"]}],"jhn.3.33":[{"a":"hath set","r":["Rom 3:3-4","Rom 4:18-21","2 Cor 1:18","Titus 1:1-2","Heb 6:17","1 John 5:9-10"]}],"jhn.3.34":[{"a":"he","r":["John 7:16","John 8:26-28,40,47"]},{"a":"for God","r":["John 3:17","John 1:16","John 5:26","John 7:37-39","John 15:26","John 16:7","Num 11:25","2 Kgs 2:9","Ps 45:7","Isa 11:2-5","Isa 59:21","Isa 62:1-3","Rom 8:2","Eph 3:8","Eph 4:7-13","Col 1:19","Col 2:9","Rev 21:6","Rev 22:1,16-17"]}],"jhn.3.35":[{"a":"Father","r":["John 5:20,22","John 15:9","John 17:23,26","Prov 8:30","Isa 42:1","Matt 3:17","Matt 17:5"]},{"a":"and","r":["John 13:3","John 17:2","Gen 41:44,55","Ps 2:8","Isa 9:6-7","Matt 11:27","Matt 28:18","Luke 10:22","1 Cor 15:27","Eph 1:22","Phil 2:9-11","Heb 1:2","Heb 2:8-9","1 Pet 3:22"]}],"jhn.3.36":[{"a":"that believeth on","r":["John 3:15-16","John 1:12","John 5:24","John 6:47-54","John 10:28","Hab 2:4","Rom 1:17","Rom 8:1","1 John 3:14-15","1 John 5:10-13"]},{"a":"see","r":["John 3:3","John 8:51","Num 32:11","Job 33:28","Ps 36:9","Ps 49:19","Ps 106:4-5","Luke 2:30","Luke 3:6","Rom 8:24-25","Rev 21:8"]},{"a":"but","r":["Ps 2:12","Rom 1:18","Rom 4:15","Rom 5:9","Gal 3:10","Eph 5:6","1 Thess 1:10","1 Thess 5:9","Heb 2:3","Heb 10:29","Rev 6:16-17"]}],"jhn.3.4":[{"a":"How","r":["John 3:3","John 4:11-12","John 6:53,60","1 Cor 1:18","1 Cor 2:14"]}],"jhn.3.5":[{"a":"born","r":["John 3:3","Isa 44:3-4","Ezek 36:25-27","Matt 3:11","Mark 16:16","Acts 2:38","Eph 5:26","Titus 3:4-7","1 Pet 1:2","1 Pet 3:21","1 John 5:6-8"]},{"a":"and of","r":["John 1:13","Rom 8:2","1 Cor 2:12","1 Cor 6:11","1 John 2:29","1 John 5:1,6-8"]},{"a":"cannot","r":["Matt 5:20","Matt 18:3","Matt 28:19","Luke 13:3,5,24","Acts 2:38","Acts 3:19","Rom 14:17","2 Cor 5:17-18","Gal 6:15","Eph 2:4-10","2 Thess 2:13-14"]}],"jhn.3.6":[{"a":"born of the flesh","r":["Gen 5:3","Gen 6:5,12","Job 14:4","Job 15:14-16","Job 25:4","Ps 51:10","Rom 7:5,18,25","Rom 8:1,4-9,13","1 Cor 15:47-49","2 Cor 5:17","Gal 5:16-21,24","Eph 2:3","Col 2:11"]},{"a":"that","r":["Ezek 11:19-20","Ezek 36:26-27","Rom 8:5,9","1 Cor 6:17","Gal 5:17","1 John 3:9"]}],"jhn.3.7":[{"a":"Marvel","r":["John 3:12","John 5:28","John 6:61-63"]},{"a":"Ye","r":["John 3:3","Job 15:14","Matt 13:33-35","Rom 3:9-19","Rom 9:22-25","Rom 12:1-2","Eph 4:22-24","Col 1:12","Heb 12:14","1 Pet 1:14-16,22","Rev 21:27"]}],"jhn.3.8":[{"a":"wind","r":["Job 37:10-13,16-17,21-23","Ps 107:25,29","Eccl 11:4-5","Ezek 37:9","Acts 2:2","Acts 4:31","1 Cor 2:11","1 Cor 12:11"]},{"a":"so","r":["John 1:13","Isa 55:9-13","Mark 4:26-29","Luke 6:43-44","1 Cor 2:11","1 John 2:29","1 John 3:8-9"]}],"jhn.3.9":[{"a":"How","r":["John 3:4","John 6:52,60","Prov 4:18","Isa 42:16","Mark 8:24-25","Luke 1:34"]}],"mat.5.1":[{"a":"seeing","r":["Matt 4:25","Matt 13:2","Mark 4:1"]},{"a":"he went","r":["Matt 15:29","Mark 3:13,20","John 6:2-3"]},{"a":"his","r":["Matt 4:18-22","Matt 10:2-4","Luke 6:13-16"]}],"mat.5.10":[{"a":"are","r":["Matt 10:23","Ps 37:12","Mark 10:30","Luke 6:22","Luke 21:12","John 15:20","Acts 5:40","Acts 8:1","Rom 8:35-39","1 Cor 4:9-13","2 Cor 4:8-12,17","Phil 1:28","2 Tim 2:12","2 Tim 3:11","Jas 1:2-5","1 Pet 3:13-14","1 Pet 4:12-16","1 John 3:12","Rev 2:10"]},{"a":"for","r":["Matt 5:3","2 Thess 1:4-7","Jas 1:12"]}],"mat.5.11":[{"a":"when","r":["Matt 10:25","Matt 27:39","Ps 35:11","Isa 66:5","Luke 7:33-34","John 9:28","1 Pet 2:23"]},{"a":"falsely","r":["1 Pet 4:14"]},{"a":"for","r":["Matt 10:18,22,39","Matt 19:29","Matt 24:9","Ps 44:22","Mark 4:17","Mark 8:35","Mark 13:9,13","Luke 6:22","Luke 9:24","Luke 21:12,17","John 15:21","Acts 9:16","Rom 8:36","1 Cor 4:10","2 Cor 4:11","Rev 2:3"]}],"mat.5.12":[{"a":"Rejoice","r":["Luke 6:23","Acts 5:41","Acts 16:25","Rom 5:3","2 Cor 4:17","Phil 2:17","Col 1:24","Jas 1:2","1 Pet 4:13"]},{"a":"for great","r":["Matt 6:1-2,4-5,16","Matt 10:41-42","Matt 16:27","Gen 15:1","Ruth 2:12","Ps 19:11","Ps 58:11","Prov 11:18","Isa 3:10","Luke 6:23,35","1 Cor 3:8","Col 3:24","Heb 11:6,26"]},{"a":"for so","r":["Matt 21:34-38","Matt 23:31-37","1 Kgs 18:4,13","1 Kgs 19:2,10-14","1 Kgs 21:20","1 Kgs 22:8,26-27","2 Kgs 1:9","2 Chr 16:10","2 Chr 24:20-22","2 Chr 36:16","Neh 9:26","Jer 2:30","Jer 26:8,21-23","Luke 6:23","Luke 11:47-51","Luke 13:34","Acts 7:51","1 Thess 2:15"]}],"mat.5.13":[{"a":"the salt","r":["Lev 2:13","Col 4:6"]},{"a":"if","r":["Mark 9:49-50","Luke 14:34-35","Heb 6:4-6","2 Pet 2:20-21"]}],"mat.5.14":[{"a":"the light","r":["Prov 4:18","John 5:35","John 12:36","Rom 2:19-20","2 Cor 6:14","Eph 5:8-14","Phil 2:15","1 Thess 5:5","Rev 1:20","Rev 2:1"]},{"a":"a city","r":["Gen 11:4-8","Rev 21:14-27"]}],"mat.5.15":[{"a":"do","r":["Mark 4:21","Luke 8:16","Luke 11:33"]},{"a":"it giveth","r":["Exod 25:37","Num 8:2"]}],"mat.5.16":[{"a":"your light","r":["Prov 4:18","Isa 58:8","Isa 60:1-3","Rom 13:11-14","Eph 5:8","Phil 2:15-16","1 Thess 2:12","1 Thess 5:6-8","1 Pet 2:9","1 John 1:5-7"]},{"a":"that","r":["Matt 6:1-5,16","Matt 23:5","Acts 9:36","Eph 2:10","1 Tim 2:10","1 Tim 5:10,25","1 Tim 6:18","Titus 2:7,14","Titus 3:4,7-8,14","Heb 10:24","1 Pet 2:12","1 Pet 3:1,16"]},{"a":"and","r":["Isa 61:3","John 15:8","1 Cor 14:25","2 Cor 9:13","Gal 1:24","2 Thess 1:10-12","1 Pet 2:12","1 Pet 4:11,14"]},{"a":"your Father","r":["Matt 5:45","Matt 6:9","Matt 23:9","Luke 11:2"]}],"mat.5.17":[{"a":"to destroy the law","r":["Luke 16:17","John 8:5","Acts 6:13","Acts 18:13","Acts 21:28","Rom 3:31","Rom 10:4","Gal 3:17-24"]},{"a":"but","r":["Matt 3:15","Ps 40:6-8","Isa 42:21","Rom 8:4","Gal 4:4-5","Col 2:16-17","Heb 10:3-12"]}],"mat.5.18":[{"a":"verily","r":["Matt 5:26","Matt 6:2,16","Matt 8:10","Matt 10:15,23,42","Matt 11:11","Matt 13:17","Matt 16:28","Matt 17:20","Matt 18:3,18","Matt 19:23,28","Matt 21:21,31","Matt 23:36","Matt 24:2,34,47","Matt 25:12,40,45","Matt 26:13-14","Mark 3:28","Mark 6:11","Mark 8:12","Mark 9:1,41","Mark 10:15,29","Mark 11:23","Mark 12:43","Mark 13:30","Mark 14:9","Mark 14:18,25,30","Luke 4:24","Luke 11:51","Luke 12:37","Luke 13:35","Luke 18:17,29","Luke 21:32","Luke 23:43","John 1:51","John 3:3,5,11","John 5:19,24-25","John 6:26,32,47,53","John 8:34,51,58","John 10:1,7","John 12:24","John 13:16,20-21,38","John 14:12","John 16:20,23","John 21:18"]},{"a":"Till","r":["Matt 24:35","Ps 102:26","Isa 51:6","Luke 16:17","Luke 21:33","Heb 1:11-12","2 Pet 3:10-13","Rev 20:11"]},{"a":"pass","r":["Ps 119:89-90,152","Isa 40:8","1 Pet 1:25"]}],"mat.5.19":[{"a":"shall break","r":["Deut 27:26","Ps 119:6,128","Gal 3:10-13","Jas 2:10-11"]},{"a":"these","r":["Matt 23:23","Deut 12:32","Luke 11:42"]},{"a":"shall teach","r":["Matt 15:3-6","Matt 23:16-22","Mal 2:8-9","Rom 3:8","Rom 6:1,15","1 Tim 6:3-4","Rev 2:14-15,20"]},{"a":"the least","r":["Matt 11:11","1 Sam 2:30"]},{"a":"do","r":["Matt 28:20","Acts 1:1","Rom 13:8-10","Gal 5:14-24","Phil 3:17-18","Phil 4:8-9","1 Thess 2:10-12","1 Thess 4:1-7","1 Tim 4:11-12","1 Tim 6:11","Titus 2:8-10","Titus 3:8"]},{"a":"great","r":["Matt 19:28","Matt 20:26","Dan 12:3","Luke 1:15","Luke 9:48","Luke 22:24-26","1 Pet 5:4"]}],"mat.5.2":[{"a":"And he opened his mouth, and taught them, saying,","r":["Matt 13:35","Job 3:1","Ps 78:1-2","Prov 8:6","Prov 31:8-9","Luke 6:20-26","Acts 8:35","Acts 10:34","Acts 18:14","Eph 6:19"]}],"mat.5.20":[{"a":"exceed","r":["Matt 23:2-5,23-28","Luke 11:39-40,44","Luke 12:1","Luke 16:14-15","Luke 18:10-14","Luke 20:46-47","Rom 9:30-32","Rom 10:2-3","2 Cor 5:17","Phil 3:9"]},{"a":"ye","r":["Matt 3:10","Matt 7:21","Matt 18:5","Mark 10:15,25","Luke 18:17,24-25","John 3:3-5","Heb 12:14","Rev 21:27"]}],"mat.5.21":[{"a":"it","r":["Matt 5:27,33,43","2 Sam 20:18","Job 8:8-10"]},{"a":"Thou","r":["Gen 9:5-6","Exod 20:13","Deut 5:17"]},{"a":"and","r":["Exod 21:12-14","Num 35:12,16-21,30-34","Deut 21:7-9","1 Kgs 2:5-6,31-32"]}],"mat.5.22":[{"a":"I say","r":["Matt 5:28,34,44","Matt 3:17","Matt 17:5","Deut 18:18-19","Acts 3:20-23","Acts 7:37","Heb 5:9","Heb 12:25"]},{"a":"That","r":["Gen 4:5-6","Gen 37:4,8","1 Sam 17:27-28","1 Sam 18:8-9","1 Sam 20:30-33","1 Sam 22:12-23","1 Kgs 21:4","2 Chr 16:10","Esth 3:5-6","Ps 37:8","Dan 2:12-13","Dan 3:13,19","Eph 4:26-27"]},{"a":"his brother","r":["Matt 5:23-24","Matt 18:21,35","Deut 15:11","Neh 5:8","Obad 1:10,12","Rom 12:10","1 Cor 6:6","1 Thess 4:6","1 John 2:9","1 John 3:10,14-15","1 John 4:20-21","1 John 5:16"]},{"a":"without","r":["Ps 7:4","Ps 25:3","Ps 35:19","Ps 69:4","Ps 109:3","Lam 3:52","John 15:25"]},{"a":"Whosoever","r":["Matt 11:18-19","Matt 12:24","1 Sam 20:30","2 Sam 16:7","John 7:20","John 8:48","Acts 17:18","1 Cor 6:10","Eph 4:31-32","Titus 3:2","1 Pet 2:23","1 Pet 3:9","Jude 1:9"]},{"a":"Raca","r":["2 Sam 6:20","Jas 2:20"]},{"a":"the council","r":["Matt 10:17","Matt 26:59","Mark 14:55","Mark 15:1","John 11:47","Acts 5:27"]},{"a":"fool","r":["Ps 14:1","Ps 49:10","Ps 92:6","Prov 14:16","Prov 18:6","Jer 17:11"]},{"a":"hell","r":["Matt 5:29-30","Matt 10:28","Matt 18:8-9","Matt 25:41","Mark 9:47","Luke 12:5","Luke 16:23-24","Rev 20:14"]}],"mat.5.23":[{"a":"thou","r":["Matt 8:4","Matt 23:19","Deut 16:16-17","1 Sam 15:22","Isa 1:10-17","Hos 6:6","Amos 5:21-24"]},{"a":"rememberest","r":["Gen 41:9","Gen 42:21-22","Gen 50:15-17","Lev 6:2-6","1 Kgs 2:44","Lam 3:20","Ezek 16:63","Luke 19:8"]}],"mat.5.24":[{"a":"there","r":["Matt 18:15-17","Job 42:8","Prov 25:9","Mark 9:50","Rom 12:17-18","1 Cor 6:7-8","1 Tim 2:8","Jas 3:13-18","Jas 5:16","1 Pet 3:7-8"]},{"a":"and then","r":["Matt 23:23","1 Cor 11:28"]}],"mat.5.25":[{"a":"with","r":["Gen 32:3-8,13-22","Gen 33:3-11","1 Sam 25:17-35","Prov 6:1-5","Prov 25:8","Luke 12:58-59","Luke 14:31-32"]},{"a":"whiles","r":["Job 22:21","Ps 32:6","Isa 55:6-7","Luke 13:24-25","2 Cor 6:2","Heb 3:7,13","Heb 12:17"]},{"a":"and the","r":["1 Kgs 22:26-27"]}],"mat.5.26":[{"a":"Thou","r":["Matt 18:34","Matt 25:41,46","Luke 12:59","Luke 16:26","2 Thess 1:9","Jas 2:13"]}],"mat.5.27":[{"a":"Thou","r":["Exod 20:14","Lev 20:10","Deut 5:18","Deut 22:22-24","Prov 6:32"]}],"mat.5.28":[{"a":"I say","r":["Matt 5:22,39","Matt 7:28-29"]},{"a":"That","r":["Gen 34:2","Gen 39:7-23","Exod 20:17","2 Sam 11:2","Job 31:1,9","Prov 6:25","Jas 1:14-15","2 Pet 2:14","1 John 2:16"]},{"a":"hath","r":["Ps 119:96","Rom 7:7-8,14"]}],"mat.5.29":[{"a":"if","r":["Matt 18:8-9","Mark 9:43-48"]},{"a":"pluck","r":["Matt 19:12","Rom 6:6","Rom 8:13","1 Cor 9:27","Gal 5:24","Col 3:5","1 Pet 4:1-3"]},{"a":"for","r":["Matt 16:26","Prov 5:8-14","Mark 8:36","Luke 9:24-25"]}],"mat.5.3":[{"a":"Blessed","r":["Matt 5:4-11","Matt 11:6","Matt 13:16","Matt 24:46","Ps 1:1","Ps 2:12","Ps 32:1-2","Ps 41:1","Ps 84:12","Ps 112:1","Ps 119:1-2","Ps 128:1","Ps 146:5","Prov 8:32","Isa 30:18","Luke 6:20-26","Luke 11:28","John 20:29","Rom 4:6-9","Jas 1:12","Rev 19:9","Rev 22:14"]},{"a":"the poor","r":["Matt 11:25","Matt 18:1-3","Lev 26:41-42","Deut 8:2","2 Chr 7:14","2 Chr 33:12,19,23","2 Chr 34:27","Job 42:6","Ps 34:18","Ps 51:17","Prov 16:19","Prov 29:23","Isa 57:15","Isa 61:1","Isa 66:2","Jer 31:18-20","Dan 5:21-22","Mic 6:8","Luke 4:18","Luke 6:20","Luke 18:14","Jas 1:10","Jas 4:9-10"]},{"a":"for","r":["Matt 3:2","Matt 8:11","Mark 10:14","Jas 2:5"]}],"mat.5.30":[{"a":"offend","r":["Matt 11:6","Matt 13:21","Matt 16:23","Matt 18:6-7","Matt 26:31","Luke 17:2","Rom 9:33","Rom 14:20-21","1 Cor 8:13","Gal 5:11","1 Pet 2:8"]},{"a":"cast","r":["Matt 22:13","Matt 25:20","Luke 12:5"]}],"mat.5.31":[{"a":"whosoever","r":["Matt 19:3,7","Deut 24:1-4","Jer 3:1","Mark 10:2-9"]}],"mat.5.32":[{"a":"I say","r":["Matt 5:28","Luke 9:30,35"]},{"a":"whosoever","r":["Matt 19:8-9","Mal 2:14-16","Mark 10:5-12","Luke 16:18","Rom 7:3","1 Cor 7:4,10-11"]}],"mat.5.33":[{"a":"it hath","r":["Matt 23:16"]},{"a":"Thou","r":["Exod 20:7","Lev 19:12","Num 30:2-16","Deut 5:11","Deut 23:23","Ps 50:14","Ps 76:11","Eccl 5:4-6","Nah 1:15"]}],"mat.5.34":[{"a":"Swear","r":["Deut 23:21-23","Eccl 9:2","Jas 5:12"]},{"a":"heaven","r":["Matt 23:16-22","Isa 57:15","Isa 66:1"]}],"mat.5.35":[{"a":"the earth","r":["Ps 99:5"]},{"a":"the city","r":["2 Chr 6:6","Ps 48:2","Ps 87:2","Mal 1:14","Rev 21:2,10"]}],"mat.5.36":[{"a":"shalt","r":["Matt 23:16-21"]},{"a":"because","r":["Matt 6:27","Luke 12:25"]}],"mat.5.37":[{"a":"let","r":["2 Cor 1:17-20","Col 4:6","Jas 5:12"]},{"a":"cometh","r":["Matt 13:19","Matt 15:19","John 8:44","Eph 4:25","Col 3:9","Jas 5:12"]}],"mat.5.38":[{"a":"An eye","r":["Exod 21:22-27","Lev 24:19-20","Deut 19:19"]}],"mat.5.39":[{"a":"That","r":["Lev 19:18","1 Sam 24:10-15","1 Sam 25:31-34","1 Sam 26:8-10","Job 31:29-31","Prov 20:22","Prov 24:29","Luke 6:29","Rom 12:17-19","1 Cor 6:7","1 Thess 5:15","Heb 12:4","Jas 5:6","1 Pet 3:9"]},{"a":"whosoever","r":["1 Kgs 22:24","Job 16:10","Isa 50:6","Lam 3:30","Mic 5:1","Luke 6:29","Luke 22:64","1 Pet 2:20-23"]}],"mat.5.4":[{"a":"Blessed are they that mourn: for they shall be comforted.","r":["Ps 6:1-9","Ps 13:1-5","Ps 30:7-11","Ps 32:3-7","Ps 40:1-3","Ps 69:29-30","Ps 116:3-7","Ps 126:5-6","Isa 12:1","Isa 25:8","Isa 30:19","Isa 35:10","Isa 38:14-19","Isa 51:11-12","Isa 57:18","Isa 61:2-3","Isa 66:10","Jer 31:9-12,16-17","Ezek 7:16","Ezek 9:4","Zech 12:10-14","Zech 13:1","Luke 6:21,25","Luke 7:38,50","Luke 16:25","John 16:20-22","2 Cor 1:4-7","2 Cor 7:9-10","Jas 1:12","Rev 7:14-17","Rev 21:4"]}],"mat.5.40":[{"a":"And if any man will sue thee at the law, and take away thy coat, let him have thy cloke also.","r":["Luke 6:29","1 Cor 6:7"]}],"mat.5.41":[{"a":"compel","r":["Matt 27:32","Mark 15:21","Luke 23:26"]}],"mat.5.42":[{"a":"Give to him that asketh thee, and from him that would borrow of thee turn not thou away.","r":["Matt 25:35-40","Deut 15:7-14","Job 31:16-20","Ps 37:21,25-26","Ps 112:5-9","Prov 3:27-28","Prov 11:24-25","Prov 19:17","Eccl 11:1-2,6","Isa 58:6-12","Dan 4:27","Luke 6:30-36","Luke 11:41","Luke 14:12-14","Rom 12:20","2 Cor 9:6-15","1 Tim 6:17-19","Heb 6:10","Heb 13:16","Jas 1:27","Jas 2:15-16","1 John 3:16-18"]}],"mat.5.43":[{"a":"Thou","r":["Matt 19:19","Matt 22:39-40","Lev 19:18","Mark 12:31-34","Luke 10:27-29","Rom 13:8-10","Gal 5:13-14","Jas 2:8"]},{"a":"and hate","r":["Exod 17:14-16","Deut 23:6","Deut 25:17","Ps 41:10","Ps 139:21-22"]}],"mat.5.44":[{"a":"But I say unto you, Love your enemies, bless them that curse you, do good to them that hate you, and pray for them which despitefully use you, and persecute you;","r":["Exod 23:4-5","2 Kgs 6:22","2 Chr 28:9-15","Ps 7:4","Ps 35:13-14","Prov 25:21-22","Luke 6:27-28,34-35","Luke 23:34","Acts 7:60","Rom 12:14,20-21","1 Cor 4:12-13","1 Cor 13:4-8","1 Pet 2:23","1 Pet 3:9"]}],"mat.5.45":[{"a":"ye","r":["Matt 5:9","Luke 6:35","John 13:35","Eph 5:1","1 John 3:9"]},{"a":"for","r":["Job 25:3","Ps 145:9","Acts 14:17"]}],"mat.5.46":[{"a":"if","r":["Matt 6:1","Luke 6:32-35","1 Pet 2:20-23"]},{"a":"publicans","r":["Matt 9:10-11","Matt 11:19","Matt 18:17","Matt 21:31-32","Luke 15:1","Luke 18:13","Luke 19:2,7"]}],"mat.5.47":[{"a":"salute","r":["Matt 10:12","Luke 6:32","Luke 10:4-5"]},{"a":"what","r":["Matt 5:20","1 Pet 2:20"]}],"mat.5.48":[{"a":"ye","r":["Gen 17:1","Lev 11:44","Lev 19:2","Lev 20:26","Deut 18:13","Job 1:1-3","Ps 37:37","Luke 6:36,40","2 Cor 7:1","2 Cor 13:9,11","Phil 3:12-15","Col 1:28","Col 4:12","Jas 1:4","1 Pet 1:15-16"]},{"a":"even","r":["Matt 5:16,45","Eph 3:1","Eph 5:1-2","1 John 3:3"]}],"mat.5.5":[{"a":"the meek","r":["Matt 11:29","Matt 21:5","Num 12:3","Ps 22:26","Ps 25:9","Ps 69:32","Ps 147:6","Ps 149:4","Isa 11:4","Isa 29:19","Isa 61:1","Zeph 2:3","Gal 5:23","Eph 4:2","Col 3:12","1 Tim 6:11","2 Tim 2:25","Titus 3:2","Jas 1:21","Jas 3:13","1 Pet 3:4,15"]},{"a":"they","r":["Ps 25:13","Ps 37:9,11,22,29,34","Isa 60:21","Rom 4:13"]}],"mat.5.6":[{"a":"are","r":["Ps 42:1-2","Ps 63:1-2","Ps 84:2","Ps 107:9","Amos 8:11-13","Luke 1:53","Luke 6:21,25","John 6:27"]},{"a":"for","r":["Ps 4:6-7","Ps 17:15","Ps 63:5","Ps 65:4","Ps 145:19","Song 5:1","Isa 25:6","Isa 41:17","Isa 44:3","Isa 49:9-10","Isa 55:1-3","Isa 65:13","Isa 66:11","John 4:14","John 6:48-58","John 7:37","Rev 7:16"]}],"mat.5.7":[{"a":"are","r":["Matt 6:14-15","Matt 18:33-35","2 Sam 22:26","Job 31:16-22","Ps 18:25","Ps 37:26","Ps 41:1-4","Ps 112:4,9","Prov 11:17","Prov 14:21","Prov 19:17","Isa 57:1","Isa 58:6-12","Dan 4:27","Mic 6:8","Mark 11:25","Luke 6:35","Eph 4:32","Eph 5:1","Col 3:12","Jas 3:17"]},{"a":"for","r":["Hos 1:6","Hos 2:1,23","Rom 11:30","1 Cor 7:25","2 Cor 4:1","1 Tim 1:13,16","2 Tim 1:16-18","Heb 4:16","Heb 6:10","Jas 2:13","1 Pet 2:10"]}],"mat.5.8":[{"a":"are","r":["Matt 23:25-28","1 Chr 29:17-19","Ps 15:2","Ps 18:26","Ps 24:4","Ps 51:6,10","Ps 73:1","Prov 22:11","Ezek 36:25-27","Acts 15:9","2 Cor 7:1","Titus 1:15","Heb 9:14","Heb 10:22","Jas 3:17","Jas 4:8","1 Pet 1:22"]},{"a":"for","r":["Gen 32:30","Job 19:26-27","1 Cor 13:12","Heb 12:14","1 John 3:2-3"]}],"mat.5.9":[{"a":"are","r":["1 Chr 12:17","Ps 34:12","Ps 120:6","Ps 122:6-8","Acts 7:26","Rom 12:18","Rom 14:1-7","Rom 14:17-19","1 Cor 6:6","2 Cor 5:20","2 Cor 13:11","Gal 5:22","Eph 4:1","Phil 2:1-3","Phil 4:2","Col 3:13","2 Tim 2:22-24","Heb 12:14","Jas 1:19-20","Jas 3:16-18"]},{"a":"for","r":["Matt 5:45,48","Ps 82:6-7","Luke 6:35","Luke 20:36","Eph 5:1-2","Phil 2:15-16","1 Pet 1:14-16"]}],"mat.6.1":[{"a":"heed","r":["Matt 16:6","Mark 8:15","Luke 11:35","Luke 12:1,15","Heb 2:1"]},{"a":"alms","r":["Deut 24:13","Ps 112:9","Dan 4:27","2 Cor 9:9-10"]},{"a":"to be","r":["Matt 6:5,16","Matt 5:16","Matt 23:5,14,28-30","2 Kgs 10:16,31","Ezek 33:31","Zech 7:5","Zech 13:4","Luke 16:15","John 5:44","John 12:43","Gal 6:12"]},{"a":"otherwise","r":["Matt 6:4,6","Matt 5:46","Matt 10:41-42","Matt 16:27","Matt 25:40","1 Cor 9:17-18","Heb 6:10","Heb 11:26","2 John 1:8"]},{"a":"of your","r":["Matt 6:9","Matt 5:48"]}],"mat.6.10":[{"a":"Thy kingdom","r":["Matt 3:2","Matt 4:17","Matt 16:28","Ps 2:6","Isa 2:2","Jer 23:5","Dan 2:44","Dan 7:13,27","Zech 9:9","Mark 11:10","Luke 19:11,38","Col 1:13","Rev 11:15","Rev 12:10","Rev 19:6","Rev 20:4"]},{"a":"Thy will","r":["Matt 7:21","Matt 12:50","Matt 26:42","Ps 40:8","Mark 3:35","John 4:34","John 6:40","John 7:17","Acts 13:22","Acts 21:14","Acts 22:14","Rom 12:2","Eph 6:6","Col 1:9","1 Thess 4:3","1 Thess 5:18","Heb 10:7,36","Heb 13:21","1 Pet 2:15","1 Pet 4:2"]},{"a":"as","r":["Neh 9:6","Ps 103:19-21","Dan 4:35","Heb 1:14"]}],"mat.6.11":[{"a":"Give us this day our daily bread.","r":["Matt 4:4","Exod 16:16-35","Job 23:12","Ps 33:18-19","Ps 34:10","Prov 30:8","Isa 33:16","Luke 11:3","John 6:31-59","2 Thess 3:12","1 Tim 6:8"]}],"mat.6.12":[{"a":"forgive","r":["Exod 34:7","1 Kgs 8:30,34,39,50","Ps 32:1","Ps 130:4","Isa 1:18","Dan 9:19","Acts 13:38","Eph 1:7","1 John 1:7-9"]},{"a":"debts","r":["Matt 18:21-27,34","Luke 7:40-48","Luke 11:4"]},{"a":"as","r":["Matt 6:14-15","Matt 18:21-22,28-35","Neh 5:12-13","Mark 11:25-26","Luke 6:37","Luke 17:3-5","Eph 4:32","Col 3:13"]}],"mat.6.13":[{"a":"lead","r":["Matt 26:41","Gen 22:1","Deut 8:2,16","Prov 30:8","Luke 22:31-46","1 Cor 10:13","2 Cor 12:7-9","Heb 11:36","1 Pet 5:8","2 Pet 2:9","Rev 2:10","Rev 3:10"]},{"a":"deliver","r":["1 Chr 4:10","Ps 121:7-8","Jer 15:21","John 17:15","Gal 1:4","1 Thess 1:10","2 Tim 4:17-18","Heb 2:14-15","1 John 3:8","1 John 5:18-19","Rev 7:14-17","Rev 21:4"]},{"a":"thine","r":["Matt 6:10","Exod 15:18","1 Chr 29:11","Ps 10:16","Ps 47:2,7","Ps 145:10-13","Dan 4:25,34-35","Dan 7:18","1 Tim 1:17","1 Tim 6:15-17","Rev 5:13","Rev 19:1"]},{"a":"Amen","r":["Matt 28:20","Num 5:22","Deut 27:15-26","1 Kgs 1:36","1 Chr 16:36","Ps 41:13","Ps 72:19","Ps 89:52","Ps 106:48","Jer 28:6","1 Cor 14:16","2 Cor 1:20","Rev 1:18","Rev 3:14","Rev 19:4"]}],"mat.6.14":[{"a":"For if ye forgive men their trespasses, your heavenly Father will also forgive you:","r":["Matt 6:12","Matt 7:2","Matt 18:21-35","Prov 21:13","Mark 11:25-26","Eph 4:32","Col 3:13","Jas 2:13","1 John 3:10"]}],"mat.6.16":[{"a":"when","r":["Matt 9:14-15","2 Sam 12:16,21","Neh 1:4","Esth 4:16","Ps 35:13","Ps 69:10","Ps 109:24","Dan 9:3","Luke 2:37","Acts 10:30","Acts 13:2-3","Acts 14:23","1 Cor 7:5","2 Cor 6:5","2 Cor 11:27"]},{"a":"be","r":["Matt 6:2,5","1 Kgs 21:27","Isa 58:3-5","Zech 7:3-5","Mal 3:14","Mark 2:18","Luke 18:12"]}],"mat.6.17":[{"a":"anoint","r":["Ruth 3:3","2 Sam 14:2","Eccl 9:8","Dan 10:2-3"]}],"mat.6.18":[{"a":"appear","r":["2 Cor 5:9","2 Cor 10:18","Col 3:22-24","1 Pet 2:13"]},{"a":"shall","r":["Matt 6:4,6","Rom 2:6","1 Pet 1:7"]}],"mat.6.19":[{"a":"Lay not up for yourselves treasures upon earth, where moth and rust doth corrupt, and where thieves break through and steal:","r":["Job 31:24","Ps 39:6","Ps 62:10","Prov 11:4","Prov 16:16","Prov 23:5","Eccl 2:26","Eccl 5:10-14","Zeph 1:18","Luke 12:21","Luke 18:24","1 Tim 6:8-10,17","Heb 13:5","Jas 5:1-3","1 John 2:15-16"]}],"mat.6.2":[{"a":"when","r":["Job 31:16-20","Ps 37:21","Ps 112:9","Prov 19:17","Eccl 11:2","Isa 58:7,10-12","Luke 11:41","Luke 12:33","John 13:29","Acts 9:36","Acts 10:2,4,31","Acts 11:29","Acts 24:17","Rom 12:8","2 Cor 9:6-15","Gal 2:10","Eph 4:28","1 Tim 6:18","Phlm 1:7","Heb 13:16","Jas 2:15-16","1 Pet 4:11","1 John 3:17-19"]},{"a":"do not sound a trumpet","r":["Prov 20:6","Hos 8:1"]},{"a":"as","r":["Matt 6:5","Matt 7:5","Matt 15:7","Matt 16:3","Matt 22:18","Matt 23:13-29","Matt 24:51","Isa 9:17","Isa 10:6","Mark 7:6","Luke 6:42","Luke 12:56","Luke 13:15"]},{"a":"in the synagogues","r":["Matt 6:5","Matt 23:6","Mark 12:39","Luke 11:43","Luke 20:46"]},{"a":"glory","r":["1 Sam 15:30","John 5:41,44","John 7:18","1 Thess 2:6"]},{"a":"verily","r":["Matt 6:5,16","Matt 5:18"]}],"mat.6.20":[{"a":"But lay up for yourselves treasures in heaven, where neither moth nor rust doth corrupt, and where thieves do not break through nor steal:","r":["Matt 19:21","Isa 33:6","Luke 12:33","Luke 18:22","1 Tim 6:17","Heb 10:34","Heb 11:26","Jas 2:5","1 Pet 1:4","1 Pet 5:4","Rev 2:9"]}],"mat.6.21":[{"a":"where","r":["Isa 33:6","Luke 12:34","2 Cor 4:18"]},{"a":"there","r":["Matt 12:34","Prov 4:23","Jer 4:14","Jer 22:17","Acts 8:21","Rom 7:5-7","Phlm 1:3,19","Col 3:1-3","Heb 3:12"]}],"mat.6.22":[{"a":"light of","r":["Luke 11:34-36"]},{"a":"single","r":["Acts 2:46","2 Cor 11:3","Eph 6:5","Col 3:22"]}],"mat.6.23":[{"a":"thine","r":["Matt 20:15","Isa 44:18-20","Mark 7:22","Eph 4:18","Eph 5:8","1 John 2:11"]},{"a":"If","r":["Matt 23:16-28","Prov 26:12","Isa 5:20-21","Isa 8:20","Jer 4:22","Jer 8:8-9","Luke 8:10","John 9:39-41","Rom 1:22","Rom 2:17-23","1 Cor 1:18-20","1 Cor 2:14","1 Cor 3:18-19","Rev 3:17-18"]}],"mat.6.24":[{"a":"serve","r":["Matt 4:10","Josh 24:15,19-20","1 Sam 7:3","1 Kgs 18:21","2 Kgs 17:33-34,41","Ezek 20:39","Zeph 1:5","Luke 16:13","Rom 6:16-22","Gal 1:10","2 Tim 4:10","Jas 4:4","1 John 2:15-16"]},{"a":"mammon","r":["Luke 16:9,11,13","1 Tim 6:9-10,17"]}],"mat.6.25":[{"a":"I say","r":["Matt 5:22-28","Luke 12:4-5,8-9,22"]},{"a":"Take","r":["Matt 6:31,34","Matt 10:19","Matt 13:22","Ps 55:22","Mark 4:19","Mark 13:11","Luke 8:14","Luke 10:40-41","Luke 12:22-23,25-26,29","1 Cor 7:32","Phil 4:6","2 Tim 2:4","Heb 13:5-6","1 Pet 5:7"]},{"a":"Is not","r":["Luke 12:23","Rom 8:32"]}],"mat.6.26":[{"a":"the fowls","r":["Matt 10:29-31","Gen 1:29-31","Job 35:11","Job 38:41","Ps 104:11-12,27-28","Ps 145:15-16","Ps 147:9","Luke 12:6-7,24-31"]},{"a":"your","r":["Matt 6:32","Matt 7:9","Luke 12:32"]}],"mat.6.27":[{"a":"by","r":["Matt 5:36","Ps 39:6","Eccl 3:14","Luke 12:25-26","1 Cor 12:18"]}],"mat.6.28":[{"a":"why","r":["Matt 6:25,31","Matt 10:10","Luke 3:11","Luke 22:35-36"]},{"a":"the lilies","r":["Luke 12:27"]}],"mat.6.29":[{"a":"even","r":["1 Kgs 10:5-7","2 Chr 9:4-6,20-22","1 Tim 2:9-10","1 Pet 3:2-5"]}],"mat.6.3":[{"a":"let","r":["Matt 8:4","Matt 9:30","Matt 12:19","Mark 1:44","John 7:4"]}],"mat.6.30":[{"a":"clothe","r":["Ps 90:5-6","Ps 92:7","Isa 40:6-8","Luke 12:28","Jas 1:10-11","1 Pet 1:24"]},{"a":"O ye","r":["Matt 8:26","Matt 14:31","Matt 16:8","Matt 17:17","Mark 4:40","Mark 9:19","Luke 9:41","John 20:27","Heb 3:12"]}],"mat.6.31":[{"a":"What shall we eat","r":["Matt 4:4","Matt 15:33","Lev 25:20-22","2 Chr 25:9","Ps 37:3","Ps 55:22","Ps 78:18-31","Luke 12:29","1 Pet 5:7"]}],"mat.6.32":[{"a":"after","r":["Matt 5:46-47","Matt 20:25-26","Ps 17:14","Luke 12:30","Eph 4:17","1 Thess 4:5"]},{"a":"for your","r":["Matt 6:8","Ps 103:13","Luke 11:11-13","Luke 12:30"]}],"mat.6.33":[{"a":"seek","r":["1 Kgs 3:11-13","1 Kgs 17:13","2 Chr 1:7-12","2 Chr 31:20-21","Prov 2:1-9","Prov 3:9-10","Hag 1:2-11","Hag 2:16-19","Luke 12:31","John 6:27"]},{"a":"the kingdom","r":["Matt 3:2","Matt 4:17","Matt 13:44-46","Acts 20:25","Acts 28:31","Rom 14:17","Col 1:13-14","2 Thess 1:5","2 Pet 1:11"]},{"a":"his","r":["Matt 5:6","Isa 45:24","Jer 23:6","Luke 1:6","Rom 1:17","Rom 3:21-22","Rom 10:3","1 Cor 1:30","2 Cor 5:21","Phil 3:9","2 Pet 1:1"]},{"a":"and all","r":["Matt 19:29","Lev 25:20-21","Ps 34:9-10","Ps 37:3,18-19,25","Ps 84:11-12","Mark 10:30","Luke 18:29-30","Rom 8:31","1 Cor 3:22","1 Tim 4:8"]}],"mat.6.34":[{"a":"no","r":["Matt 6:11,25","Exod 16:18-20","Lam 3:23"]},{"a":"for","r":["Deut 33:25","1 Kgs 17:4-6,14-16","2 Kgs 7:1-2","Luke 11:3","Heb 13:5-6"]},{"a":"Sufficient","r":["John 14:27","John 16:33","Acts 14:22","1 Thess 3:3-4"]}],"mat.6.4":[{"a":"seeth","r":["Matt 6:6,18","Ps 17:3","Ps 44:21","Ps 139:1-3,12","Jer 17:10","Jer 23:24","Heb 4:13","Rev 2:23"]},{"a":"reward","r":["Matt 10:42","Matt 25:34-40","1 Sam 2:30","Luke 8:17","Luke 14:14","1 Cor 4:5","Jude 1:24"]}],"mat.6.5":[{"a":"when","r":["Matt 7:7-8","Matt 9:38","Matt 21:22","Ps 5:2","Ps 55:17","Prov 15:8","Isa 55:6-7","Jer 29:12","Dan 6:10","Dan 9:4-19","Luke 18:1","John 16:24","Eph 6:18","Col 4:2-3","1 Thess 5:17","Jas 5:15-16"]},{"a":"thou shalt not","r":["Matt 6:2","Matt 23:14","Job 27:8-10","Isa 1:15","Luke 18:10-11","Luke 20:47"]},{"a":"for","r":["Matt 23:6","Mark 12:38","Luke 11:43"]},{"a":"Verily","r":["Matt 6:2","Prov 16:5","Luke 14:12-14","Jas 4:6"]}],"mat.6.6":[{"a":"enter","r":["Matt 14:23","Matt 26:36-39","Gen 32:24-29","2 Kgs 4:33","Isa 26:20","John 1:48","Acts 9:40","Acts 10:9,30"]},{"a":"pray","r":["Ps 34:15","Isa 65:24","John 20:17","Rom 8:5","Eph 3:14"]}],"mat.6.7":[{"a":"use","r":["1 Kgs 18:26-29","Eccl 5:2-3,7","Acts 19:34"]},{"a":"repetitions","r":["Matt 26:39,42,44","1 Kgs 8:26-54","Dan 9:18-19"]},{"a":"the heathen","r":["Matt 6:32","Matt 18:17"]}],"mat.6.8":[{"a":"your","r":["Matt 6:32","Ps 38:9","Ps 69:17-19","Luke 12:30","John 16:23-27","Phil 4:6"]}],"mat.6.9":[{"a":"this","r":["Luke 11:1-2"]},{"a":"Our","r":["Matt 6:1,6,14","Matt 5:16,48","Matt 7:11","Matt 10:29","Matt 26:29,42","Isa 63:16","Isa 64:8","Luke 15:18,21","John 20:17","Rom 1:7","Rom 8:15","Gal 1:1","Gal 4:6","1 Pet 1:17"]},{"a":"which","r":["Matt 23:9","2 Chr 20:6","Ps 115:3","Isa 57:15","Isa 66:1"]},{"a":"Hallowed","r":["Lev 10:3","2 Sam 7:26","1 Kgs 8:43","1 Chr 17:24","Neh 9:5","Ps 72:18","Ps 111:9","Isa 6:3","Isa 37:20","Ezek 36:23","Ezek 38:23","Hab 2:14","Zech 14:9","Mal 1:11","Luke 2:14","Luke 11:2","1 Tim 6:16","Rev 4:11","Rev 5:12"]}],"mat.7.1":[{"a":"Judge not, that ye be not judged.","r":["Isa 66:5","Ezek 16:52-56","Luke 6:37","Rom 2:1-2","Rom 14:3-4,10-13","1 Cor 4:3-5","Jas 3:1","Jas 4:11-12"]}],"mat.7.11":[{"a":"being","r":["Gen 6:5","Gen 8:21","Job 15:16","Jer 17:9","Rom 3:9,19","Gal 3:22","Eph 2:1-3","Titus 3:3"]},{"a":"how","r":["Exod 34:6-7","2 Sam 7:19","Ps 86:5,15","Ps 103:11-13","Isa 49:15","Isa 55:8-9","Hos 11:8-9","Mic 7:18","Mal 1:6","Luke 11:11-13","John 3:16","Rom 5:8-10","Rom 8:32","Eph 2:4-5","1 John 3:1","1 John 4:10"]},{"a":"good","r":["Ps 84:11","Ps 85:12","Jer 33:14","Hos 14:2","Luke 2:10-11","Luke 11:13","2 Cor 9:8-15","Titus 3:4-7"]}],"mat.7.12":[{"a":"all","r":["Luke 6:31"]},{"a":"for","r":["Matt 22:39-40","Lev 19:18","Isa 1:17-18","Jer 7:5-6","Ezek 18:7-8,21","Amos 5:14-15","Mic 6:8","Zech 7:7-10","Zech 8:16-17","Mal 3:5","Mark 12:29-34","Rom 13:8-10","Gal 5:13-14","1 Tim 1:5","Jas 2:10-13"]}],"mat.7.13":[{"a":"at","r":["Matt 3:2,8","Matt 18:2-3","Matt 23:13","Prov 9:6","Isa 55:7","Ezek 18:27-32","Luke 9:33","Luke 13:24","Luke 13:25","Luke 14:33","John 10:9","John 14:6","Acts 2:38-40","Acts 3:19","2 Cor 6:17","Gal 5:24"]},{"a":"for","r":["Gen 6:5,12","Ps 14:2-3","Isa 1:9","Rom 3:9-19","2 Cor 4:4","Eph 2:2-3","1 John 5:19","Rev 12:9","Rev 13:8","Rev 20:3"]},{"a":"that","r":["Matt 25:41,46","Prov 7:27","Prov 16:25","Rom 9:22","Phil 3:19","2 Thess 1:8-9","1 Pet 4:17-18","Rev 20:15"]}],"mat.7.14":[{"a":"narrow","r":["Matt 16:24-25","Prov 4:26-27","Prov 8:20","Isa 30:21","Isa 35:8","Isa 57:14","Jer 6:16","Mark 8:34","John 15:18-20","John 16:2,33","Acts 14:22","1 Thess 3:2-5"]},{"a":"and few","r":["Matt 20:16","Matt 22:14","Matt 25:1-12","Luke 12:32","Luke 13:23-30","Rom 9:27-29,32","Rom 11:5-6","Rom 12:2","Eph 2:2-3","1 Pet 3:20-21"]}],"mat.7.15":[{"a":"Beware","r":["Matt 10:17","Matt 16:6,11","Mark 12:38","Luke 12:15","Acts 13:40","Phil 3:2","Col 2:8","2 Pet 3:17"]},{"a":"false","r":["Matt 24:4-5,11,24-25","Deut 13:1-3","Isa 9:15-16","Jer 14:14-16","Jer 23:13-16","Jer 28:15-17","Jer 29:21,32","Ezek 13:16,22","Mic 3:5-7,11","Mark 13:22-23","2 Pet 2:1-3","1 John 4:1","Rev 19:20"]},{"a":"which","r":["Zech 13:4","Mark 12:38-40","Rom 16:17-18","2 Cor 11:13-15","Gal 2:4","Eph 4:14","Eph 5:6","Col 2:8","1 Tim 4:1-3","2 Tim 3:5-9,13","2 Tim 4:3","2 Pet 2:1-3,18-19","Jude 1:4","Rev 13:11-17"]},{"a":"are","r":["Isa 56:10-11","Ezek 22:25","Mic 3:5","Zeph 3:3-4","Acts 20:29-31","Rev 17:6"]}],"mat.7.16":[{"a":"shall","r":["Matt 7:20","Matt 12:33","2 Pet 2:10-18","Jude 1:10-19"]},{"a":"Do","r":["Luke 6:43-45","Jas 3:12"]}],"mat.7.17":[{"a":"every","r":["Ps 1:3","Ps 92:13-14","Isa 5:3-5","Isa 61:3","Jer 11:19","Jer 17:8","Luke 13:6-9","Gal 5:22-24","Eph 5:9","Phil 1:11","Col 1:10","Jas 3:17-18"]},{"a":"but","r":["Matt 12:33-35","Jude 1:12"]}],"mat.7.18":[{"a":"cannot","r":["Gal 5:17","1 John 3:9-10"]}],"mat.7.19":[{"a":"bringeth","r":["Matt 3:10","Matt 21:19-20","Isa 5:5-7","Isa 27:11","Ezek 15:2-7","Luke 3:9","Luke 13:6-9","John 15:2-6","Heb 6:8","Jude 1:12"]}],"mat.7.2":[{"a":"For with what judgment ye judge, ye shall be judged: and with what measure ye mete, it shall be measured to you again.","r":["Judg 1:7","Ps 18:25-26","Ps 137:7-8","Jer 51:24","Obad 1:15","Mark 4:24","Luke 6:38","2 Cor 9:6","2 Thess 1:6-7","Jas 2:13","Rev 18:6"]}],"mat.7.20":[{"a":"Wherefore by their fruits ye shall know them.","r":["Matt 7:16","Acts 5:38"]}],"mat.7.21":[{"a":"saith","r":["Matt 25:11-12","Hos 8:2-3","Luke 6:46","Luke 13:25","Acts 19:13-20","Rom 2:13","Titus 1:16","Jas 1:22","Jas 2:20-26"]},{"a":"shall","r":["Matt 18:3","Matt 19:24","Matt 21:31","Matt 25:11-12,21","Isa 48:1-2","Mark 9:47","Mark 10:23-24","Luke 18:25","John 3:5","Acts 14:22","Heb 4:6"]},{"a":"that","r":["Matt 12:50","Matt 21:29-31","Mark 3:35","Luke 11:28","John 6:40","John 7:17","Rom 12:2","Eph 6:6","Col 4:12","1 Thess 4:3","1 Thess 5:18","Heb 13:21","1 Pet 2:15","1 Pet 4:2","1 John 3:21-24","Rev 22:14"]},{"a":"my","r":["Matt 10:32-33","Matt 16:17","Matt 18:10,19,35","Matt 26:39,42","John 5:17","John 10:29-30","John 14:7","John 15:23","Rev 2:27","Rev 3:5"]}],"mat.7.22":[{"a":"to me","r":["Matt 7:21","Matt 24:36","Isa 2:11,17","Mal 3:17-18","Luke 10:12","1 Thess 5:4","2 Thess 1:10","2 Tim 1:12,18","2 Tim 4:8"]},{"a":"have we","r":["Matt 10:5-8","Num 24:4","Num 31:8","1 Kgs 22:11-20","Jer 23:13-32","Luke 13:26","John 11:51","Acts 19:13-15","1 Cor 13:1-2","Heb 6:4-6"]}],"mat.7.23":[{"a":"I never","r":["Matt 25:12","John 10:14,27-30","2 Tim 2:19"]},{"a":"depart","r":["Matt 25:41","Ps 5:5","Ps 6:8","Luke 13:25,27","Rev 22:15"]}],"mat.7.24":[{"a":"whosoever","r":["Matt 7:7-8,13-14","Matt 5:3-12","Matt 5:28-32","Matt 6:14-15,19-21","Matt 12:50","Luke 6:47-49","Luke 11:28","John 13:17","John 14:15,22-24","John 15:10,14","Rom 2:6-9","Gal 5:6-7","Gal 6:7-8","Jas 1:21-27","Jas 2:17-26","1 John 2:3","1 John 3:22-24","1 John 5:3-5","Rev 22:14-15"]},{"a":"a wise","r":["Job 28:28","Ps 111:10","Ps 119:99,130","Prov 10:8","Prov 14:8","Jas 3:13-18"]},{"a":"which","r":["1 Cor 3:10-11"]}],"mat.7.25":[{"a":"the rain","r":["Ezek 13:11-16","Mal 3:3","Acts 14:22","1 Cor 3:13-15","Jas 1:12","1 Pet 1:7"]},{"a":"for","r":["Matt 16:18","Ps 92:13-15","Ps 125:1-2","Eph 3:17","Col 2:7","1 Pet 1:5","1 John 2:19"]}],"mat.7.26":[{"a":"doeth","r":["1 Sam 2:30","Prov 14:1","Jer 8:9","Luke 6:49","Jas 2:20"]}],"mat.7.27":[{"a":"And the rain descended, and the floods came, and the winds blew, and beat upon that house; and it fell: and great was the fall of it.","r":["Matt 12:43-45","Matt 13:19-22","Ezek 13:10-16","1 Cor 3:13","Heb 10:26-31","2 Pet 2:20-22"]}],"mat.7.28":[{"a":"the people","r":["Matt 13:54","Ps 45:2","Mark 1:22","Mark 6:2","Luke 4:22,32","Luke 19:48","John 7:15,46"]}],"mat.7.29":[{"a":"having","r":["Matt 5:20,28,32,44","Matt 21:23-27","Matt 28:18","Deut 18:18-19","Eccl 8:4","Isa 50:4","Jer 23:28-29","Mic 3:8","Luke 21:15","Acts 3:22-23","Acts 6:10","Heb 4:12-13"]},{"a":"and not","r":["Matt 15:1-9","Matt 23:2-6,15-24","Mark 7:5-13","Luke 20:8,46-47"]}],"mat.7.3":[{"a":"why","r":["Luke 6:41-42","Luke 18:11"]},{"a":"but","r":["2 Sam 12:5-6","2 Chr 28:9-10","Ps 50:16-21","John 8:7-9","Gal 6:1"]}],"mat.7.5":[{"a":"Thou hypocrite","r":["Matt 22:18","Matt 23:14-28","Luke 12:56","Luke 13:15"]},{"a":"first","r":["Ps 51:9-13","Luke 4:23","Luke 6:42","Acts 19:15"]}],"mat.7.6":[{"a":"that","r":["Matt 10:14-15","Matt 15:26","Prov 9:7-8","Prov 23:9","Prov 26:11","Acts 13:45-47","Phil 3:2","Heb 6:6","Heb 10:29","2 Pet 2:22"]},{"a":"cast","r":["Prov 11:22"]},{"a":"turn","r":["Matt 22:5-6","Matt 24:10","2 Cor 11:26","2 Tim 4:14-15"]}],"mat.7.7":[{"a":"and it","r":["Matt 7:11","Matt 21:22","1 Kgs 3:5","Ps 10:17","Ps 50:15","Ps 86:5","Ps 145:18-19","Isa 55:6-7","Jer 29:12-13","Jer 33:3","Mark 11:24","Luke 11:9-10,13","Luke 18:1","John 4:10","John 14:13-14","John 15:7,16","John 16:23-24","Jas 1:5-6","Jas 5:15","1 John 3:22","1 John 5:14-15","Rev 3:17-18"]},{"a":"seek","r":["Matt 6:33","Ps 10:4","Ps 27:8","Ps 69:32","Ps 70:4","Ps 105:3-4","Ps 119:12","Prov 8:17","Song 3:2","Amos 5:4","Rom 2:7","Rom 3:11","Heb 11:6"]},{"a":"knock","r":["Luke 13:25"]}],"mat.7.8":[{"a":"For every one that asketh receiveth; and he that seeketh findeth; and to him that knocketh it shall be opened.","r":["Matt 15:22-28","2 Chr 33:1-2,19","Ps 81:10,16","John 2:2","John 3:8-10","Luke 23:42-43","Acts 9:11"]}],"mat.7.9":[{"a":"Or what man is there of you, whom if his son ask bread, will he give him a stone?","r":["Luke 11:11-13"]}],"psa.1.1":[{"a":"Blessed","r":["Ps 2:12","Ps 32:1-2","Ps 34:8","Ps 84:12","Ps 106:3","Ps 112:1","Ps 115:12-15","Ps 119:1-2","Ps 144:15","Ps 146:5","Deut 28:2-68","Deut 33:29","Jer 17:7","Matt 16:17","Luke 11:28","John 13:17","John 20:29","Rev 22:14"]},{"a":"walketh","r":["Ps 81:12","Gen 5:24","Lev 26:27-28","1 Kgs 16:31","Job 31:5","Prov 1:15","Prov 4:14-15","Prov 13:20","Ezek 20:18","1 Pet 4:3"]},{"a":"counsel","r":["Ps 64:2","Gen 49:6","2 Chr 22:3","Job 10:3","Job 21:16","Luke 23:51"]},{"a":"standeth","r":["Ps 26:12","Rom 5:2","Eph 6:13"]},{"a":"way","r":["Ps 1:6","Ps 36:4","Ps 146:9","Prov 2:12","Prov 4:19","Prov 13:15","Matt 7:13-14"]},{"a":"sitteth","r":["Ps 26:4-5","Ps 119:115","Jer 15:17"]},{"a":"scornful","r":["Prov 1:22","Prov 3:34","Prov 9:12","Prov 19:29"]}],"psa.1.2":[{"a":"But his","r":["Ps 40:8","Ps 112:1","Ps 119:11,35,47-48,72,92","Job 23:12","Jer 15:16","Rom 7:22","1 John 5:3"]},{"a":"meditate","r":["Ps 104:34","Ps 119:11,15,97-99","Josh 1:8","1 Tim 4:15"]},{"a":"day","r":["Ps 88:1","Luke 2:37","Luke 18:7","1 Thess 2:9","2 Tim 1:3"]}],"psa.1.3":[{"a":"tree","r":["Job 14:9","Isa 44:4","Jer 17:8","Ezek 17:8","Ezek 19:10","Ezek 47:12","Rev 22:2"]},{"a":"bringeth","r":["Ps 92:14","Matt 21:34,41"]},{"a":"shall not","r":["Isa 27:11","Matt 13:6","Matt 21:19","John 15:6","Jude 1:12"]},{"a":"whatsoever","r":["Ps 128:2","Ps 129:8","Gen 39:3,23","Josh 1:7-8","1 Chr 22:11","2 Chr 31:21","2 Chr 32:23","Isa 3:10"]}],"psa.1.4":[{"a":"like","r":["Ps 35:5","Job 21:18","Isa 17:13","Isa 29:5","Hos 13:3","Matt 3:12"]}],"psa.1.5":[{"a":"shall","r":["Ps 5:5","Ps 24:3","Luke 21:36","Jude 1:15"]},{"a":"sinners","r":["Ps 26:9","Mal 3:18","Matt 13:49","Matt 25:32,41,46"]}],"psa.1.6":[{"a":"knoweth","r":["Ps 37:18-24","Ps 139:1-2","Ps 142:3","Job 23:10","Nah 1:7","John 10:14,27","2 Tim 2:19"]},{"a":"way of the ungodly","r":["Ps 112:10","Ps 146:9","Prov 14:12","Prov 15:9","Matt 7:13","2 Pet 2:12"]}],"psa.119.1":[{"a":"Blessed","r":["Ps 1:1-3","Ps 32:1-2","Ps 112:1","Ps 128:1","Matt 5:3-12","Luke 11:28","John 13:17","Jas 1:25","Rev 22:14"]},{"a":"undefiled","r":["2 Kgs 20:3","2 Chr 31:20-21","Job 1:1,8","John 1:47","Acts 24:16","2 Cor 1:12","Titus 2:11-12"]},{"a":"walk","r":["Ezek 11:20","Hos 14:9","Luke 1:6","1 Thess 4:1-2"]}],"psa.119.10":[{"a":"my whole","r":["Ps 119:2,34,58,69","Ps 78:37","1 Sam 7:3","2 Chr 15:15","Jer 3:10","Hos 10:2","Zeph 1:5-6","Matt 6:24","Col 3:22","1 John 2:15"]},{"a":"O let me","r":["Ps 119:21,118,133,176","Ps 23:3","Ps 125:5","Ps 143:8-10","Prov 2:13","Prov 21:16","Isa 35:8","Ezek 34:6","2 Pet 2:15-22"]}],"psa.119.100":[{"a":"understand","r":["1 Kgs 12:6-15","Job 12:12","Job 15:9-10","Job 32:4,10"]},{"a":"because","r":["Ps 111:10","Job 28:28","Jer 8:8-9","Matt 7:24","Jas 3:13"]}],"psa.119.101":[{"a":"refrained","r":["Ps 119:59-60,104,126","Ps 18:23","Prov 1:15","Isa 53:6","Isa 55:7","Jer 2:36","Titus 2:11-12","1 Pet 2:1-2","1 Pet 3:10-11"]}],"psa.119.102":[{"a":"departed","r":["Ps 18:21","Prov 5:7","Jer 32:40"]},{"a":"for thou","r":["Eph 4:20-24","1 Thess 2:13","1 John 2:19,27"]}],"psa.119.103":[{"a":"sweet","r":["Ps 19:10","Ps 63:5","Job 23:12","Prov 3:17","Prov 8:11","Prov 24:13-14","Song 1:2-4","Song 5:1"]}],"psa.119.104":[{"a":"Through","r":["Ps 119:98,100"]},{"a":"therefore","r":["Ps 119:128","Ps 36:4","Ps 97:10","Ps 101:3","Prov 8:13","Amos 5:15","Rom 12:9"]},{"a":"false way","r":["Ps 119:29-30","Prov 14:12","Matt 7:13"]}],"psa.119.105":[{"a":"word","r":["Ps 19:8","Ps 43:3","Prov 6:23","Eph 5:13","2 Pet 1:19"]},{"a":"lamp","r":["Ps 18:28","Job 29:3"]}],"psa.119.106":[{"a":"sworn","r":["Ps 56:12","Ps 66:13-14","2 Chr 15:13-14","Neh 10:29","Eccl 5:4-5","Matt 5:33","2 Cor 8:5"]},{"a":"that I will","r":["Ps 119:115","2 Kgs 23:3"]}],"psa.119.107":[{"a":"afflicted","r":["Ps 6:1","Ps 22:14-18","Ps 34:19"]},{"a":"quicken","r":["Ps 119:25,88","Ps 143:11"]}],"psa.119.108":[{"a":"Accept","r":["Num 29:39","Hos 14:2","Heb 13:15"]},{"a":"teach","r":["Ps 119:12,26,130,169"]}],"psa.119.109":[{"a":"My soul","r":["Judg 12:3","1 Sam 19:5","1 Sam 20:3","Job 13:14","Rom 8:36","1 Cor 15:31","2 Cor 11:23"]},{"a":"yet do I not","r":["Ps 119:83,117,152"]}],"psa.119.11":[{"a":"Thy word","r":["Ps 119:97","Ps 1:2","Ps 37:31","Ps 40:8","Job 22:22","Prov 2:1,10-11","Isa 51:7","Jer 15:16","Luke 2:19,51","Col 3:16"]},{"a":"that I","r":["Ps 19:13"]}],"psa.119.110":[{"a":"wicked","r":["Ps 119:85","Ps 10:8-18","Ps 124:6-7","Ps 140:5","Ps 141:9","Prov 1:11-12","Jer 18:22"]},{"a":"yet I erred","r":["Ps 119:10,21,51,87,95","Dan 6:10","Luke 20:19-26"]}],"psa.119.111":[{"a":"Thy testimonies","r":["Ps 119:14,127,162","Ps 16:5","Deut 33:4","Isa 54:17","Acts 26:18","Col 1:12","Heb 9:15","1 Pet 1:4"]},{"a":"for they","r":["Ps 119:74,92,174","Ps 19:8","Jer 15:16","1 Pet 1:8"]}],"psa.119.112":[{"a":"inclined","r":["Ps 119:36","Ps 141:4","Josh 24:23","1 Kgs 8:58","2 Chr 19:3","Phil 2:13"]},{"a":"the end","r":["Ps 119:33,44","1 Pet 1:13","Rev 2:10"]}],"psa.119.113":[{"a":"hate","r":["Ps 94:11","Isa 55:7","Jer 4:14","Mark 7:21","2 Cor 10:5"]},{"a":"thy law","r":["Ps 119:97,103"]}],"psa.119.114":[{"a":"my hiding","r":["Ps 32:7","Ps 91:1-2","Isa 32:2"]},{"a":"my shield","r":["Ps 3:3","Ps 84:11"]},{"a":"I hope","r":["Ps 119:81","Ps 130:5-6"]}],"psa.119.115":[{"a":"Depart","r":["Ps 6:8","Ps 26:5,9","Ps 139:19","Matt 7:23","Matt 25:41","1 Cor 15:33"]},{"a":"for I will","r":["Ps 119:106","Josh 24:15"]}],"psa.119.116":[{"a":"Uphold","r":["Ps 37:17,24","Ps 41:12","Ps 63:8","Ps 94:18","Isa 41:10","Isa 42:1"]},{"a":"and let me","r":["Ps 25:2","Isa 45:17","Rom 5:5","Rom 9:32","Rom 10:11","1 Pet 2:6"]}],"psa.119.117":[{"a":"Hold","r":["Ps 17:5","Ps 71:6","Ps 73:23","Ps 139:10","Isa 41:13","John 10:28-29","Rom 14:4","1 Pet 1:5","Jude 1:24"]},{"a":"and I will","r":["Ps 119:6,48,111-112"]}],"psa.119.118":[{"a":"trodden","r":["Isa 25:10","Isa 63:3","Mal 4:3","Luke 21:24","Rev 14:20"]},{"a":"err","r":["Ps 119:10,21","Ps 95:10"]},{"a":"their deceit","r":["Ps 119:29","Ps 78:36-37,57","Isa 44:20","Eph 4:22","Eph 5:6","2 Thess 2:9-11","2 Tim 3:13","1 John 2:21","Rev 18:23"]}],"psa.119.119":[{"a":"puttest away","r":["1 Sam 15:23","Jer 6:30","Ezek 22:18-22","Mal 3:2-3","Matt 3:12","Matt 7:23","Matt 13:40-42,49-50"]},{"a":"therefore","r":["Ps 119:111,126-128"]}],"psa.119.12":[{"a":"Blessed","r":["1 Tim 1:11","1 Tim 6:15"]},{"a":"teach","r":["Ps 119:26-27,33,64,66,68,71-72,108,124-125,135","Ps 86:11","Ps 143:10","Luke 24:45","John 14:26","1 John 2:27"]}],"psa.119.120":[{"a":"My flesh","r":["Ps 119:53","Lev 10:1-3","1 Sam 6:20","2 Sam 6:8-9","1 Chr 24:16-17,30","2 Chr 34:21,27","Isa 66:2","Dan 10:8-11","Hab 3:16","Phil 2:12","Heb 12:21,28-29","Rev 1:17-18"]}],"psa.119.121":[{"a":"I have","r":["Ps 7:3-5","Ps 18:20-24","Ps 75:2","1 Sam 24:11-15","1 Sam 25:28","2 Sam 8:15","Acts 21:16","Acts 25:10-11","2 Cor 1:12"]},{"a":"leave me","r":["Ps 37:33","Ps 57:3-4","2 Pet 2:9"]}],"psa.119.122":[{"a":"surety","r":["Gen 43:9","Prov 22:26-27","Isa 38:14","Phlm 1:18-19","Heb 7:22"]},{"a":"let not","r":["Ps 119:21","Ps 36:11"]}],"psa.119.123":[{"a":"Mine eyes fail for thy salvation, and for the word of thy righteousness.","r":["Ps 119:81-82","Ps 69:3","Ps 130:6","Ps 143:7","Lam 4:17"]}],"psa.119.124":[{"a":"Deal","r":["Ps 119:41,76-77,132","Ps 51:1","Ps 69:13,16","Ps 79:8","Ps 103:10","Ps 130:3-4,7","Dan 9:18","Luke 18:13","2 Tim 1:16-18"]},{"a":"teach","r":["Ps 119:12,26","Ps 143:10-12","Neh 9:20"]}],"psa.119.125":[{"a":"I am thy","r":["Ps 119:94","Ps 86:16","Ps 116:16","Rom 6:22"]},{"a":"give","r":["Ps 119:34,66","2 Chr 1:7-10","2 Cor 3:5-6","2 Tim 2:7","Jas 1:5","Jas 3:13-17"]},{"a":"that I","r":["Ps 119:11,18-19,29","Prov 9:10","Prov 14:8"]}],"psa.119.126":[{"a":"time","r":["Ps 9:19","Ps 102:13","Gen 22:10-11,14","Deut 32:36","Isa 42:14"]},{"a":"they","r":["Jer 8:8","Hab 1:4","Mal 2:8","Matt 15:6","Rom 3:31","Rom 4:14"]}],"psa.119.127":[{"a":"I love","r":["Ps 119:72","Ps 19:10","Prov 3:13-18","Prov 8:11","Prov 16:16","Matt 13:45-46","Eph 3:8"]}],"psa.119.128":[{"a":"I esteem","r":["Ps 119:6","Ps 19:7-8","Deut 4:8","Job 33:27","Prov 30:5","Rom 7:12,14,16,22"]},{"a":"and I","r":["Ps 119:104,118"]}],"psa.119.129":[{"a":"testimonies","r":["Ps 119:18","Ps 139:6","Isa 9:6","Isa 25:1","Rev 19:10"]},{"a":"doth","r":["Ps 119:2,31,146","Ps 25:10"]}],"psa.119.13":[{"a":"I declared","r":["Ps 119:46,172","Ps 34:11","Ps 37:30","Ps 40:9-10","Ps 71:15-18","Ps 118:17","Matt 10:27","Matt 12:34","Acts 4:20"]}],"psa.119.130":[{"a":"entrance","r":["Ps 119:105","Prov 6:23","Isa 8:20","Luke 1:77-79","Acts 26:18","2 Cor 4:4,6","Eph 5:13-14","2 Pet 1:19"]},{"a":"it giveth","r":["Ps 19:7","Prov 1:4,22-23","Prov 9:4-6","Rom 16:18-19","2 Tim 3:15-17"]}],"psa.119.131":[{"a":"opened","r":["Ps 119:20","Ps 42:1","Isa 26:8-9","1 Pet 2:2"]},{"a":"I longed","r":["Ps 119:40,162,174","Heb 12:14"]}],"psa.119.132":[{"a":"Look","r":["Ps 119:124","Ps 25:18","Exod 4:31","1 Sam 1:11","2 Sam 16:12","Isa 63:7-9"]},{"a":"as thou usest to do unto those","r":["Ps 106:4","2 Thess 1:6-7"]}],"psa.119.133":[{"a":"Order","r":["Ps 119:116","Ps 17:5","Ps 32:8","Ps 121:3","1 Sam 2:9"]},{"a":"let not","r":["Ps 19:13","Rom 6:12-14","Rom 7:23-24"]}],"psa.119.134":[{"a":"Deliver me from the oppression of man: so will I keep thy precepts.","r":["Ps 119:122","Ps 56:1-2,13","Ps 105:43-45","Ezek 11:17-20","Ezek 36:24-27","Luke 1:74-75","Acts 9:31"]}],"psa.119.135":[{"a":"Make","r":["Ps 4:6","Ps 80:1,3,7,19","Num 6:25-26","Job 33:26","Rev 22:4-5"]},{"a":"and teach","r":["Ps 119:12,26","Job 34:32","Job 35:11","Job 36:22","Luke 24:45"]}],"psa.119.136":[{"a":"Rivers of waters run down mine eyes, because they keep not thy law.","r":["Ps 119:53,158","1 Sam 15:11","Jer 9:1,18","Jer 13:17","Jer 14:17","Ezek 9:4","Luke 19:41","Rom 9:2-3"]}],"psa.119.137":[{"a":"TZADDI. Righteous art thou, O LORD, and upright are thy judgments.","r":["Ps 99:4","Ps 103:6","Ps 145:17","Deut 32:4","Ezra 9:15","Neh 9:33","Jer 12:1","Dan 9:7,14","Rom 2:5","Rom 3:5-6","Rom 9:14","Rev 15:3-4","Rev 16:7","Rev 19:2"]}],"psa.119.138":[{"a":"testimonies","r":["Ps 119:86,144","Ps 19:7-9","Deut 4:8,45"]}],"psa.119.139":[{"a":"zeal","r":["Ps 69:9","1 Kgs 19:10,14","John 2:17"]},{"a":"because","r":["Ps 53:4","Matt 9:13","Matt 12:3-5","Matt 15:4-6","Matt 21:13,16,42","Matt 22:29","Acts 13:27","Acts 28:23-27"]}],"psa.119.14":[{"a":"rejoiced","r":["Ps 119:47,72,77,111,127,162","Ps 19:9-10","Ps 112:1","Job 23:12","Jer 15:16","Matt 13:44","Acts 2:41-47"]}],"psa.119.140":[{"a":"pure","r":["Ps 119:128","Ps 12:6","Ps 18:30","Ps 19:8","Prov 30:5","Rom 7:12,16,22","1 Pet 2:2","2 Pet 1:21"]}],"psa.119.141":[{"a":"small","r":["Ps 22:6","Ps 40:17","Prov 15:16","Prov 16:8","Prov 19:1","Isa 53:3","Luke 6:20","Luke 9:58","2 Cor 8:9","Jas 2:5"]},{"a":"yet do","r":["Ps 119:109,176","Prov 3:1"]}],"psa.119.142":[{"a":"an everlasting","r":["Ps 119:144","Ps 36:6","Isa 51:6,8","Dan 9:24","2 Thess 1:6-10"]},{"a":"and thy","r":["Ps 119:151","Ps 19:9","John 17:17","Eph 4:21"]}],"psa.119.143":[{"a":"Trouble","r":["Ps 119:107","Ps 18:4-5","Ps 88:3-18","Ps 116:3","Ps 130:1","Mark 14:33-34"]},{"a":"yet thy","r":["Ps 119:16,47,77","Job 23:12","John 4:34"]}],"psa.119.144":[{"a":"righteousness","r":["Ps 119:138,152","Matt 5:18","1 Pet 1:23-25"]},{"a":"give me","r":["Ps 119:34,66,73,169","2 Cor 4:6","1 John 5:20-21"]},{"a":"understanding","r":["Prov 10:21","Isa 6:9-10","Isa 27:11","Jer 4:22","Dan 12:10","Hos 4:6","Matt 13:19","John 17:3"]}],"psa.119.145":[{"a":"cried","r":["Ps 119:10","Ps 61:1-2","Ps 62:8","Ps 86:4","Ps 102:1","Ps 142:1-2","1 Sam 1:10,15","Jer 29:13"]},{"a":"I will","r":["Ps 119:44,106,115"]}],"psa.119.146":[{"a":"and I shall keep","r":["Ps 119:134","Judg 10:15-16","Matt 1:21","Titus 2:14","Titus 3:4-8"]}],"psa.119.147":[{"a":"I prevented","r":["Ps 5:3","Ps 21:3","Ps 42:8","Ps 88:13","Ps 130:6","Isa 26:9","Mark 1:35"]},{"a":"hoped","r":["Ps 119:74,81","Ps 56:4","Ps 130:5","Heb 6:17-19"]}],"psa.119.148":[{"a":"eyes","r":["Ps 119:62","Ps 63:1,6","Ps 139:17-18","Lam 2:19","Luke 6:12"]}],"psa.119.149":[{"a":"Hear","r":["Ps 5:2-3","Ps 55:2","Ps 64:1"]},{"a":"according unto","r":["Ps 51:1","Ps 69:16","Ps 109:21","Isa 63:7"]},{"a":"quicken me","r":["Ps 119:25,40,154,156"]}],"psa.119.15":[{"a":"meditate","r":["Ps 119:23,48,78,97,131,148","Ps 1:2","Jas 1:25"]},{"a":"have respect","r":["Ps 119:6,117"]}],"psa.119.150":[{"a":"draw nigh","r":["Ps 22:11-13,16","Ps 27:2","1 Sam 23:16","2 Sam 17:16","Matt 26:46-47"]},{"a":"for from","r":["Ps 50:17","Job 21:14","Prov 1:7,22","Prov 28:9","Eph 2:13-14"]}],"psa.119.151":[{"a":"near","r":["Ps 46:1","Ps 75:1","Ps 139:2","Ps 145:18","Deut 4:7","Matt 1:23"]},{"a":"all","r":["Ps 119:138,142"]}],"psa.119.152":[{"a":"thy testimonies","r":["Ps 119:144,160","Ps 89:34-37","Ps 111:7-8","Eccl 3:14","Luke 21:33"]}],"psa.119.153":[{"a":"Consider","r":["Ps 119:159","Ps 9:13","Ps 13:3-4","Ps 25:19","Exod 3:7-8","Neh 9:32","Lam 2:20","Lam 5:1"]},{"a":"for I","r":["Ps 119:16,98,109,141,176"]}],"psa.119.154":[{"a":"Plead","r":["Ps 35:1","Ps 43:1","1 Sam 24:15","Job 5:8","Prov 22:23","Jer 11:20","Jer 50:34","Jer 51:36","Mic 7:9","1 John 2:1"]},{"a":"quicken","r":["Ps 119:25,40"]}],"psa.119.155":[{"a":"Salvation","r":["Ps 18:27","Job 5:4","Isa 46:12","Isa 57:19","Eph 2:17-18"]},{"a":"for they","r":["Ps 10:4","Job 21:14-15","Prov 1:7","Luke 16:24","Rom 3:11"]}],"psa.119.156":[{"a":"are thy","r":["Ps 51:1","Ps 86:5,13,15","1 Chr 21:13","Isa 55:7","Isa 63:7"]}],"psa.119.157":[{"a":"Many","r":["Ps 3:1-2","Ps 22:12,16","Ps 25:19","Ps 56:2","Ps 118:10-12","Matt 24:9","Matt 26:47","Acts 4:27"]},{"a":"yet do I","r":["Ps 119:51,110","Ps 44:17","Job 17:9","Job 23:11","Isa 42:4","Acts 20:23-24","1 Cor 15:58"]}],"psa.119.158":[{"a":"I beheld the transgressors, and was grieved; because they kept not thy word.","r":["Ps 119:53,136","Ezek 9:4","Mark 3:5"]}],"psa.119.159":[{"a":"Consider","r":["Ps 119:97,153","2 Kgs 20:3","Neh 5:19","Neh 13:22"]}],"psa.119.16":[{"a":"delight","r":["Ps 119:14,24,35,47,70,77,92","Ps 40:8","Rom 7:22","Heb 10:16-17"]},{"a":"not forget","r":["Ps 119:11,83,93,109,141,176","Prov 3:1","Jas 1:23-24"]}],"psa.119.160":[{"a":"Thy word is true from the beginning","r":["Ps 119:86,138","Prov 30:5","2 Tim 3:16"]},{"a":"and every one","r":["Ps 119:75,142,144,152","Eccl 3:14","Matt 5:18"]}],"psa.119.161":[{"a":"Princes","r":["Ps 119:23,157","1 Sam 21:15","1 Sam 24:9-15","1 Sam 26:18","John 15:25"]},{"a":"my heart","r":["Ps 4:4","Gen 39:9","Gen 42:18","2 Kgs 22:19","Neh 5:15","Job 31:23","Isa 66:2","Jer 36:23-25"]}],"psa.119.162":[{"a":"rejoice","r":["Ps 119:72,111","Jer 15:16"]},{"a":"as one","r":["1 Sam 30:16","Prov 16:19","Isa 9:3"]}],"psa.119.163":[{"a":"hate","r":["Ps 119:29,113,128","Ps 101:7","Prov 6:16-19","Prov 30:8","Amos 5:15","Rom 12:9","Eph 4:25","Rev 22:15"]}],"psa.119.164":[{"a":"Seven times","r":["Ps 119:62","Ps 55:17"]},{"a":"because","r":["Ps 48:11","Ps 97:8","Rev 19:2"]}],"psa.119.165":[{"a":"Great","r":["Prov 3:1-2,17","Isa 32:17","Isa 57:21","John 14:27","Gal 5:22-23","Gal 6:15-16","Phil 4:7"]},{"a":"nothing shall offend them","r":["Isa 8:13-15","Isa 28:13","Isa 57:14","Matt 13:21","Matt 24:24","1 Pet 2:6-8"]}],"psa.119.166":[{"a":"Lord","r":["Ps 119:81,174","Ps 130:5-7","Gen 49:18"]},{"a":"and done","r":["Ps 4:5","Ps 24:3-5","Ps 50:23","John 7:17","1 John 2:3-4"]}],"psa.119.167":[{"a":"soul","r":["Ps 119:6-8,97,111,159","John 14:21-24","John 15:9-10","Heb 10:16"]},{"a":"and I love","r":["Ps 40:8","Rom 7:22"]}],"psa.119.168":[{"a":"for all my","r":["Ps 44:20-21","Ps 98:8","Ps 139:3","Job 34:21","Prov 5:21","Jer 23:24","Heb 4:13","Rev 2:23"]}],"psa.119.169":[{"a":"Let my cry","r":["Ps 119:145","Ps 18:6","2 Chr 30:27"]},{"a":"give me","r":["Ps 119:144","1 Chr 22:12","2 Chr 1:10","Prov 2:3-5","Dan 2:21","Jas 1:5"]}],"psa.119.17":[{"a":"Deal","r":["Ps 119:65,124,132","Ps 13:6","Ps 116:7","John 1:16","2 Cor 9:7-11","Phil 4:19"]},{"a":"I may live","r":["Rom 8:2-4","Eph 2:4-5,10","Titus 2:11-12","1 John 2:29","1 John 5:3-4"]}],"psa.119.170":[{"a":"deliver me","r":["Ps 119:41","Ps 89:20-25","Gen 32:9-12","2 Sam 7:25"]}],"psa.119.171":[{"a":"My lips, etc.","r":["Ps 119:7","Ps 50:23","Ps 71:17,23-24"]}],"psa.119.172":[{"a":"tongue","r":["Ps 119:13,46","Ps 37:30","Ps 40:9-10","Ps 78:4","Deut 6:7","Matt 12:34-35","Eph 4:29","Col 4:6"]},{"a":"for all thy","r":["Ps 119:86,138,142","Rom 7:12,14"]}],"psa.119.173":[{"a":"Let","r":["Ps 119:94,117","Isa 41:10-14","Mark 9:24","2 Cor 12:9","Eph 6:10-20","Phil 4:13"]},{"a":"for","r":["Ps 119:30,35,40,111","Deut 30:19","Josh 24:15,22","1 Kgs 3:11-12","Prov 1:29","Luke 10:42"]}],"psa.119.174":[{"a":"longed","r":["Ps 119:81,166","Gen 49:18","2 Sam 23:5","Prov 13:12","Song 5:8","Rom 7:22-25","Rom 8:23-25","Phil 1:23"]},{"a":"and thy law","r":["Ps 119:16,24,47,77,111,162,167","Ps 1:2"]}],"psa.119.175":[{"a":"Let my","r":["Ps 9:13-14","Ps 30:9","Ps 51:14-15","Ps 118:18-19","Isa 38:19"]},{"a":"and let thy","r":["Ps 119:75","Isa 26:8-9","Rom 8:28","1 Cor 11:31-32","2 Cor 4:17"]}],"psa.119.176":[{"a":"gone astray","r":["Isa 53:6","Ezek 34:6,16","Matt 10:6","Matt 15:24","Matt 18:12-13","Luke 15:4-7","John 10:16","1 Pet 2:25"]},{"a":"seek","r":["Song 1:4","Jer 31:18","Luke 19:10","Gal 4:9","Phil 2:13","Jas 1:17"]},{"a":"for I do","r":["Ps 119:61,93","Hos 4:6"]}],"psa.119.18":[{"a":"Open","r":["Isa 29:10-12,18","Isa 32:3","Isa 35:5","Matt 13:13","Matt 16:17","John 9:39","Acts 26:18","2 Cor 3:14-18","2 Cor 4:4-6","Eph 1:17-18","Rev 3:18"]},{"a":"wondrous","r":["Ps 119:96","Hos 8:12","2 Cor 3:13","Heb 8:5","Heb 10:1"]}],"psa.119.19":[{"a":"a stranger","r":["Ps 39:12","Gen 47:9","1 Chr 29:15","2 Cor 5:6","Heb 11:13-16","1 Pet 2:11"]},{"a":"hide","r":["Ps 119:10","Job 39:17","Isa 63:17","Luke 9:45","Luke 24:45"]}],"psa.119.2":[{"a":"keep","r":["Ps 119:22,146","Ps 25:10","Ps 105:45","Deut 6:17","1 Kgs 2:3","Prov 23:26","Ezek 36:27","John 14:23","1 John 3:20"]},{"a":"seek","r":["Ps 119:10","Deut 4:29","2 Chr 31:21","Jer 29:13"]}],"psa.119.20":[{"a":"soul","r":["Ps 119:40,131,174","Ps 42:1","Ps 63:1","Ps 84:2","Prov 13:12","Song 5:8","Rev 3:15-16"]},{"a":"at all times","r":["Ps 106:3","Job 23:11-12","Job 27:10","Prov 17:17"]}],"psa.119.21":[{"a":"rebuked","r":["Ps 119:78","Ps 138:6","Exod 10:3","Exod 18:11","Job 40:11-12","Isa 2:11-12","Isa 10:12","Ezek 28:2-10","Dan 4:37","Dan 5:22-24","Mal 4:1","Luke 14:11","Luke 18:14","Jas 4:6","1 Pet 5:5"]},{"a":"cursed","r":["Ps 119:10,110,118","Deut 27:15-26","Deut 28:15","Deut 30:19","Neh 9:16,29","Isa 42:24","Isa 43:28","Jer 44:9-11,16,28-29","Gal 3:13"]}],"psa.119.22":[{"a":"Remove","r":["Ps 119:39,42","Ps 39:8","Ps 42:10","Ps 68:9-11,19-20","Ps 123:3-4","1 Sam 25:10,39","2 Sam 16:7-8","Job 16:20","Job 19:2-3","Heb 13:13"]},{"a":"for I have","r":["Ps 37:3,6","1 Pet 2:20","1 Pet 3:16-17","1 Pet 4:14-16"]}],"psa.119.23":[{"a":"Princes","r":["Ps 2:1-2","1 Sam 20:31","1 Sam 22:7-13","Luke 22:66","Luke 23:1-2,10-11"]}],"psa.119.24":[{"a":"testimonies","r":["Ps 119:16,77,92,143,162","Job 27:10","Jer 6:10"]},{"a":"my counsellors","r":["Ps 119:97-100,104-105","Ps 19:11","Deut 17:18-20","Josh 1:8","Prov 6:20-23","Isa 8:20","Col 3:16","2 Tim 3:15-17"]}],"psa.119.25":[{"a":"soul","r":["Ps 22:15","Ps 44:25","Isa 65:25","Matt 16:23","Rom 7:22-24","Phil 3:19","Col 3:2"]},{"a":"quicken","r":["Ps 119:37,40,88,93,107,149,156,159","Ps 71:20","Ps 80:18","Ps 143:11","Rom 8:2-3"]},{"a":"according","r":["Deut 30:6","2 Sam 7:27-29"]}],"psa.119.26":[{"a":"declared","r":["Ps 119:106","Ps 32:5","Ps 38:18","Ps 51:1-19","Prov 28:13"]},{"a":"teach","r":["Ps 119:12","Ps 25:4,8-9","Ps 27:11","Ps 86:11","Ps 143:8-10","1 Kgs 8:36"]}],"psa.119.27":[{"a":"so shall I talk","r":["Ps 71:17","Ps 78:4","Ps 105:2","Ps 111:4","Ps 145:5-6","Exod 13:14-15","Josh 4:6-7","Acts 2:11","Rev 15:3"]}],"psa.119.28":[{"a":"soul","r":["Ps 22:14","Ps 107:26","Josh 2:11,24"]},{"a":"strengthen","r":["Ps 27:14","Ps 29:11","Deut 33:25","Isa 40:29,31","Zech 10:12","Eph 3:16","Phil 4:13"]}],"psa.119.29":[{"a":"Remove","r":["Ps 119:37,104,128,163","Ps 141:3-4","Prov 30:8","Isa 44:20","Jer 16:19","Jonah 2:8","Eph 4:22-25","1 John 1:8","1 John 2:4","Rev 22:15"]},{"a":"grant me","r":["Ps 119:5","Jer 31:33-34","Heb 8:10-11"]}],"psa.119.3":[{"a":"They also do no iniquity: they walk in his ways.","r":["1 John 3:9","1 John 5:18"]}],"psa.119.30":[{"a":"chosen","r":["Ps 119:29,111,173","Josh 24:15","Prov 1:29","Luke 10:42","John 3:19-21","John 8:45","1 Pet 2:2","2 John 1:4"]},{"a":"thy judgments","r":["Ps 119:24,52","Deut 11:18-20"]}],"psa.119.31":[{"a":"stuck","r":["Ps 119:48,115","Deut 4:4","Deut 10:20","Prov 23:23","John 8:31","Acts 11:23"]},{"a":"put me","r":["Ps 119:6,80","Ps 25:2,20","Isa 45:17","Isa 49:23","Jer 17:18","Rom 5:5","1 John 2:28"]}],"psa.119.32":[{"a":"run","r":["Song 1:4","Isa 40:31","1 Cor 9:24-26","Heb 12:1"]},{"a":"enlarge","r":["Ps 119:45","Ps 18:36","1 Kgs 4:29","Job 36:15-16","Isa 60:5","Isa 61:1","Luke 1:74-75","John 8:32,36","2 Cor 3:17","2 Cor 6:11","1 Pet 2:16"]}],"psa.119.33":[{"a":"Teach","r":["Ps 119:12,26-27","Isa 54:13","John 6:45"]},{"a":"I shall keep","r":["Ps 119:8,112","Matt 10:22","Matt 24:13","1 Cor 1:7-8","Phil 1:6","1 John 2:19-20,27","Rev 2:26"]}],"psa.119.34":[{"a":"Give me","r":["Ps 119:73","Ps 111:10","Job 28:28","Prov 2:5-6","John 7:17","Jas 1:5","Jas 3:13-18"]},{"a":"I shall","r":["Deut 4:6","Matt 5:19","Matt 7:24","Jas 1:25","Jas 2:8-12","Jas 4:11"]},{"a":"observe","r":["Ps 119:10,58,69"]}],"psa.119.35":[{"a":"Make me","r":["Ps 119:27,36,173","Ezek 36:26-27","Phil 2:13","Heb 13:21"]},{"a":"the path","r":["Ps 23:3","Prov 3:17","Prov 4:11,18","Prov 8:20","Isa 2:3","Isa 48:17"]},{"a":"therein","r":["Ps 119:16","Isa 58:13-14","Rom 7:22","1 John 5:3"]}],"psa.119.36":[{"a":"Incline","r":["Ps 51:10","Ps 141:4","1 Kgs 8:58","Jer 32:39","Ezek 11:19-20"]},{"a":"and not to","r":["Ps 10:3","Exod 18:21","Ezek 33:31","Hab 2:9","Mark 7:21-22","Luke 12:15","Luke 16:14","Eph 5:3","Col 3:5","1 Tim 6:9-10,17","Heb 13:5","2 Pet 2:3,14"]}],"psa.119.37":[{"a":"Turn","r":["Num 15:39","Josh 7:21","2 Sam 11:2","Job 31:1","Prov 4:25","Prov 23:5","Isa 33:15","Matt 5:28","1 John 2:16"]},{"a":"quicken","r":["Ps 119:25,40"]}],"psa.119.38":[{"a":"Stablish","r":["Ps 119:49","2 Sam 7:25-29","2 Cor 1:20"]},{"a":"who is devoted","r":["Ps 103:11,13,17","Ps 145:19","Ps 147:11","Jer 32:39-41"]}],"psa.119.39":[{"a":"Turn","r":["Ps 119:22,31","Ps 39:8","Ps 57:3","2 Sam 12:14","1 Tim 3:7","1 Tim 5:14","Titus 2:8"]},{"a":"for thy","r":["Ps 119:20,43,75,123,131","Ps 19:9","Deut 4:8","Isa 26:8","Rom 2:2","Rev 19:2"]}],"psa.119.4":[{"a":"Thou hast commanded us to keep thy precepts diligently.","r":["Deut 4:1,9","Deut 5:29-33","Deut 6:17","Deut 11:13,22","Deut 12:32","Deut 28:1-14","Deut 30:16","Josh 1:7","Jer 7:23","Matt 28:20","John 14:15,21","Phil 4:8-9","1 John 5:3"]}],"psa.119.40":[{"a":"I have","r":["Ps 119:5,20","Matt 26:41","Rom 7:24","2 Cor 7:1","Gal 5:17","Phil 3:13-14"]},{"a":"quicken","r":["Ps 119:25,37,88,107,149,156,159","Mark 9:24","John 5:21","John 10:10","1 Cor 15:45","Eph 2:5","3 John 1:2"]}],"psa.119.41":[{"a":"VAU. Let thy mercies come also unto me, O LORD, even thy salvation, according to thy word.","r":["Ps 119:58,76-77,132","Ps 69:16","Ps 106:4-5","Luke 2:28-32"]}],"psa.119.42":[{"a":"So shall","r":["Ps 3:2","Ps 42:10","Ps 71:10-11","Ps 109:25","Matt 27:40-43,63"]},{"a":"have wherewith, etc","r":["2 Sam 16:7-8","2 Sam 19:18-20"]},{"a":"for I trust","r":["Ps 119:49,74,81","Ps 56:4,10-11","Ps 89:19-37","2 Sam 7:12-16","1 Chr 28:3-6","Acts 27:25"]}],"psa.119.43":[{"a":"take not","r":["Ps 119:13","Ps 50:16","Ps 51:14-15","Ps 71:17-18","Isa 59:21","Eph 1:13","Jas 1:18"]},{"a":"for I have","r":["Ps 119:52,120,175","Ps 7:6-9","Ps 9:4,16","Ps 43:1","1 Pet 2:23"]}],"psa.119.44":[{"a":"keep","r":["Ps 119:33-34","Rev 7:15","Rev 22:11"]}],"psa.119.45":[{"a":"And I will","r":["Ps 119:133","Luke 4:18","John 8:30-36","Jas 1:25","Jas 2:12","2 Pet 2:19"]},{"a":"for I seek","r":["Ps 119:19,71,94,148,162","Prov 2:4-5","Prov 18:1","Eccl 1:13","John 5:39","Eph 5:17"]}],"psa.119.46":[{"a":"speak","r":["Ps 138:1","Dan 3:16-18","Dan 4:1-3,25-27","Matt 10:18-19","Acts 26:1-2,24-29"]},{"a":"will not","r":["Mark 8:38","Rom 1:16","Phil 1:20","2 Tim 1:8,16","1 Pet 4:14-16","1 John 2:28"]}],"psa.119.47":[{"a":"I will delight","r":["Ps 119:16,24","Ps 112:1","John 4:34","Phil 2:5","1 Pet 2:21"]},{"a":"which","r":["Ps 119:48,97,127,140,167,174","Ps 19:7-10","Job 23:11-12","Rom 7:12,16,22"]}],"psa.119.48":[{"a":"hands","r":["Ps 10:12","Ezek 44:12","Mic 5:9"]},{"a":"unto thy","r":["Matt 7:21","John 13:17","John 15:14","Jas 1:22-25"]},{"a":"and I will","r":["Ps 119:15","Ps 1:2"]}],"psa.119.49":[{"a":"Remember","r":["Ps 105:2,42","Ps 106:4,45","Gen 8:1","Gen 32:9","Job 7:7","Isa 62:6"]},{"a":"upon which","r":["Ps 119:43,74,81,147","Ps 71:14","2 Sam 5:2","2 Sam 7:25","Rom 15:13","1 Pet 1:13,21"]}],"psa.119.5":[{"a":"O that my ways were directed to keep thy statutes!","r":["Ps 119:32,36,44-45,131,159,173","Ps 51:10","Jer 31:33","Rom 7:22-24","2 Thess 3:5","Heb 13:21"]}],"psa.119.50":[{"a":"This","r":["Ps 27:13","Ps 28:7","Ps 42:8,11","Ps 94:19","Jer 15:16","Rom 5:3-5","Rom 15:4","Heb 6:17-19","Heb 12:11-12"]},{"a":"for thy","r":["Ps 119:25","Ezek 37:10","John 6:63","Jas 1:18","1 Pet 1:3","1 Pet 2:2"]}],"psa.119.51":[{"a":"proud","r":["Ps 119:21,69","Ps 123:3-4","Jer 20:7","Luke 16:14-15","Luke 23:35"]},{"a":"yet have","r":["Ps 119:31,157","Ps 44:18","Job 23:11","Isa 38:3","Isa 42:4","Acts 20:23-24","Heb 12:1-3"]}],"psa.119.52":[{"a":"remembered","r":["Ps 77:5,11-12","Ps 105:5","Ps 143:5","Exod 14:29-30","Num 16:3-35","Deut 1:35-36","Deut 4:3-4","2 Pet 2:4-9"]}],"psa.119.53":[{"a":"horror","r":["Ps 119:136,158","Ezra 9:3,14","Ezra 10:6","Jer 13:17","Dan 4:19","Hab 3:16","Luke 19:41-42","Rom 9:1-3","2 Cor 12:21","Phil 3:18"]}],"psa.119.54":[{"a":"Thy statutes have been my songs in the house of my pilgrimage.","r":["Ps 89:1","Ps 10:1","Gen 47:9","Heb 11:13-16"]}],"psa.119.55":[{"a":"night","r":["Ps 42:8","Ps 63:6","Ps 77:6","Ps 139:18","Gen 32:24-28","Job 35:9-10","Isa 26:9","Luke 6:12","Acts 16:25"]},{"a":"kept","r":["Ps 119:17,34","John 14:21","John 15:10"]}],"psa.119.56":[{"a":"because","r":["Ps 119:165","Ps 18:18-22","1 John 3:19-24"]}],"psa.119.57":[{"a":"my portion","r":["Ps 16:5","Ps 73:26","Ps 142:5","Jer 10:16","Lam 3:24"]},{"a":"I have","r":["Ps 119:106,115","Ps 66:14","Deut 26:17-18","Josh 24:15,18,21,24-27","Neh 10:29-39"]}],"psa.119.58":[{"a":"I intreated","r":["Ps 119:10","Ps 4:6","Ps 51:1-3","Ps 86:1-3","Hos 7:14","Heb 10:22"]},{"a":"favour","r":["Ps 27:8","Job 11:19"]},{"a":"be merciful","r":["Ps 119:41,65,76,170","Ps 56:4,10","Ps 138:2","Matt 24:35"]}],"psa.119.59":[{"a":"thought","r":["Lam 3:40","Ezek 18:28,30","Hag 1:5,7","Luke 15:17-20","2 Cor 13:5"]},{"a":"turned","r":["Deut 4:30-31","Jer 8:4-6","Jer 31:18-19","Ezek 33:14-16,19","Joel 2:13","2 Cor 12:21"]}],"psa.119.6":[{"a":"shall I","r":["Ps 119:31,80","Job 22:26","Dan 12:2-3","1 John 2:28","1 John 3:20-21"]},{"a":"I have","r":["Ps 119:128","John 15:14","Jas 2:10"]}],"psa.119.60":[{"a":"made","r":["Ps 95:7-8","Ezek 10:6-8","Prov 27:1","Eccl 9:10","Gal 1:16"]}],"psa.119.61":[{"a":"The bands","r":["Ps 119:95","Ps 3:1","1 Sam 30:3-5","Job 1:17","Hos 6:9"]},{"a":"but I","r":["Ps 119:176","1 Sam 24:9-11","1 Sam 26:9-11","Prov 24:29","Rom 12:17-21"]}],"psa.119.62":[{"a":"midnight","r":["Ps 119:147,164","Ps 42:8","Mark 1:35","Acts 16:25"]},{"a":"thy","r":["Ps 119:7,75,106,137","Ps 19:9","Deut 4:8","Rom 7:12"]}],"psa.119.63":[{"a":"a companion","r":["Ps 119:79,115","Ps 16:3","Ps 101:6","Ps 142:7","Prov 13:20","Mal 3:16-18","2 Cor 6:14-17","1 John 1:3","1 John 3:14"]}],"psa.119.64":[{"a":"earth","r":["Ps 33:5","Ps 104:13","Ps 145:9"]},{"a":"teach","r":["Ps 119:12,26","Ps 27:11","Isa 2:3","Isa 48:17-18","Matt 11:29"]}],"psa.119.65":[{"a":"dealt well","r":["Ps 119:17","Ps 13:6","Ps 16:5-6","Ps 18:35","Ps 23:5-6","Ps 30:11","Ps 116:7","1 Chr 29:14"]}],"psa.119.66":[{"a":"Teach me","r":["Ps 119:34","Ps 72:1-2","1 Kgs 3:9,28","Prov 2:1-9","Prov 8:20","Isa 11:2-4","Judg 3:15","Matt 13:11","Phil 1:9","Jas 3:13-18"]},{"a":"I Have","r":["Ps 119:128,160,172","Neh 9:13-14"]}],"psa.119.67":[{"a":"Before","r":["Ps 119:176","Ps 73:5-28","Deut 32:15","2 Sam 10:19","2 Sam 11:2-27","2 Chr 33:9-13","Prov 1:32","Jer 22:21"]},{"a":"but now","r":["Ps 119:71,75","Jer 31:18-19","Hos 2:6-7","Hos 5:15","Hos 6:1","Heb 12:10-11","Rev 3:10"]}],"psa.119.68":[{"a":"good","r":["Ps 86:5","Ps 106:1","Ps 107:1","Ps 145:7-9","Exod 33:18-19","Exod 34:6-7","Isa 63:7","Matt 5:45","Matt 19:17","Mark 10:18","Luke 18:19"]},{"a":"teach","r":["Ps 119:12,26","Ps 25:8-9"]}],"psa.119.69":[{"a":"proud","r":["Ps 35:11","Ps 109:2-3","Job 13:4","Jer 43:2-3","Matt 5:11-12","Matt 26:59-68","Acts 24:5,13"]},{"a":"I will","r":["Ps 119:51,157"]},{"a":"with my whole","r":["Ps 119:34,58","Matt 6:24","Jas 1:8"]}],"psa.119.7":[{"a":"I will","r":["Ps 119:171","Ps 9:1","Ps 86:12-13","1 Chr 29:13-17"]},{"a":"when","r":["Ps 119:12,18-19,27,33-34,64,73,124","Ps 25:4-5,8-10","Ps 143:10","Isa 48:17","John 6:45"]}],"psa.119.70":[{"a":"heart is as fat","r":["Ps 17:10","Ps 73:7","Isa 6:10","Acts 28:27"]},{"a":"but I","r":["Ps 119:16,35","Ps 40:8","Rom 7:22"]}],"psa.119.71":[{"a":"good","r":["Ps 119:67","Ps 94:12-13","Isa 27:9","1 Cor 11:32","Heb 12:10-11"]}],"psa.119.72":[{"a":"better","r":["Ps 119:14,111,127,162","Ps 19:10","Prov 3:14-15","Prov 8:10-11,19","Prov 16:16","Matt 13:44-46"]}],"psa.119.73":[{"a":"Thy hands","r":["Ps 100:3","Ps 111:10","Ps 138:8","Ps 139:14-16","Job 10:8-11"]},{"a":"give me","r":["Ps 119:34,125,144,169","1 Chr 22:12","2 Chr 2:12","Job 32:8","2 Tim 2:7","1 John 5:20"]},{"a":"that I may","r":["Ps 111:10","Jas 3:18"]}],"psa.119.74":[{"a":"fear thee","r":["Ps 119:79","Ps 34:2-6","Ps 66:16","Mal 3:16"]},{"a":"I have","r":["Ps 119:42,147","Ps 108:7","Gen 32:11-12","Luke 21:33"]}],"psa.119.75":[{"a":"I know","r":["Ps 119:7,62,128,160","Deut 32:4","Job 34:23","Jer 12:1"]},{"a":"right","r":["Gen 18:25","Rom 3:4-5"]},{"a":"thou in","r":["Ps 25:10","Ps 89:30-33","Heb 12:10-11","Rev 3:19"]}],"psa.119.76":[{"a":"merciful","r":["Ps 86:5","Ps 106:4-5","2 Cor 1:3-5"]}],"psa.119.77":[{"a":"thy tender","r":["Ps 119:41","Ps 51:1-3","Lam 3:22-23","Dan 9:18"]},{"a":"for thy","r":["Ps 119:24,47,174","Ps 1:2","Heb 8:10-12"]}],"psa.119.78":[{"a":"the proud","r":["Ps 119:21,51,85","Ps 35:26"]},{"a":"without","r":["Ps 119:86","Ps 7:3-5","Ps 25:3","Ps 35:7","Ps 69:4","Ps 109:3","1 Sam 24:10-12,17","1 Sam 26:18","John 15:25","1 Pet 2:20"]},{"a":"but I will","r":["Ps 119:23","Ps 1:2"]}],"psa.119.79":[{"a":"Let those","r":["Ps 119:63,74","Ps 7:7","Ps 142:7"]}],"psa.119.8":[{"a":"I will","r":["Ps 119:16,106,115","Josh 24:15"]},{"a":"O forsake","r":["Ps 119:116-117,176","Ps 38:21-22","Ps 51:11","Phil 4:13"]}],"psa.119.80":[{"a":"sound","r":["Ps 25:21","Ps 32:2","Deut 26:16","2 Chr 12:14","2 Chr 15:17","2 Chr 25:2","2 Chr 31:20-21","Prov 4:23","Ezek 11:9","John 1:47","2 Cor 1:12"]},{"a":"that I be","r":["Ps 119:6","Ps 25:2-3","1 John 2:28"]}],"psa.119.81":[{"a":"fainteth","r":["Ps 119:20,40","Ps 42:1-2","Ps 73:26","Ps 84:2","Song 5:8","Rev 3:15-16"]},{"a":"but I","r":["Ps 119:42,74,77,114"]}],"psa.119.82":[{"a":"eyes","r":["Ps 119:123","Ps 69:3","Deut 28:32","Prov 13:12","Isa 38:11"]},{"a":"When wilt","r":["Ps 86:17","Ps 90:13-15"]}],"psa.119.83":[{"a":"like a bottle in the smoke","r":["Ps 22:15","Ps 102:3-4","Job 30:30"]},{"a":"yet do I","r":["Ps 119:16,61,176"]}],"psa.119.84":[{"a":"How","r":["Ps 39:4-5","Ps 89:47-48","Ps 90:12","Job 7:6-8"]},{"a":"when","r":["Ps 7:6","Rev 6:10-11"]}],"psa.119.85":[{"a":"The proud","r":["Ps 119:78","Ps 7:15","Ps 35:7","Ps 36:11","Prov 16:27","Jer 18:20"]},{"a":"which","r":["Ps 58:1-2"]}],"psa.119.86":[{"a":"All thy","r":["Ps 119:128,138,142,151","Ps 19:9","Rom 7:12"]},{"a":"they","r":["Ps 119:78","Ps 7:1-5","Ps 35:7,19","Ps 38:19","Ps 59:3-4","Jer 18:20"]},{"a":"help","r":["Ps 70:5","Ps 142:4-6","Ps 143:9"]}],"psa.119.87":[{"a":"almost","r":["1 Sam 20:3","1 Sam 23:26-27","2 Sam 17:16","Matt 10:28"]},{"a":"but I forsook","r":["Ps 119:51,61","1 Sam 24:6-7","1 Sam 26:9,24"]}],"psa.119.88":[{"a":"Quicken","r":["Ps 119:25,40,159"]},{"a":"so shall I","r":["Ps 119:2,146","Ps 25:10","Ps 78:5","Ps 132:12"]}],"psa.119.89":[{"a":"For ever","r":["Ps 119:152,160","Ps 89:2","Matt 5:18","Matt 24:34-35","1 Pet 1:25","2 Pet 3:13"]}],"psa.119.9":[{"a":"shall","r":["Ps 25:7","Ps 34:11","Job 1:5","Job 13:26","Prov 1:4,10","Prov 4:1,10-17","Prov 5:7-23","Prov 6:20-35","Prov 7:7","Eccl 11:9-10","Eccl 12:1","Luke 15:13","2 Tim 2:22","Titus 2:4-6"]},{"a":"by taking","r":["Ps 119:11,97-105","Ps 1:1-3","Ps 19:7-11","Ps 78:4-8","Deut 6:6-9","Deut 17:18","Josh 1:7","John 15:3","2 Tim 3:15-17","Jas 1:21-25"]}],"psa.119.90":[{"a":"faithfulness","r":["Deut 7:9","Mic 7:20"]},{"a":"unto all generations","r":["Ps 89:1-2","Ps 100:5","Ps 89:11","Ps 93:1","Ps 104:5","Job 38:4-7","2 Pet 3:5-7"]}],"psa.119.91":[{"a":"They continue this","r":["Ps 148:5-6","Gen 8:22","Isa 48:13","Jer 33:25"]},{"a":"all are","r":["Deut 4:19","Josh 10:12-13","Judg 5:20","Matt 5:45","Matt 8:9"]}],"psa.119.92":[{"a":"thy law","r":["Ps 119:24,77,143","Rom 15:4"]},{"a":"I should","r":["Ps 27:13","Ps 94:18-19","Prov 6:22-23"]}],"psa.119.93":[{"a":"will never","r":["Ps 119:16,50","John 6:63","1 Pet 1:23"]}],"psa.119.94":[{"a":"I am thine","r":["Ps 86:2","Josh 10:4-6","Isa 41:8-10","Isa 44:2,5","Isa 64:8-10","Zeph 3:17","Acts 27:23-24"]},{"a":"for I have","r":["Ps 119:27,40,173"]}],"psa.119.95":[{"a":"wicked","r":["Ps 119:61,69,85-87","Ps 10:8-10","Ps 27:2","Ps 37:32","Ps 38:12","1 Sam 23:20-23","2 Sam 17:1-4","Matt 26:3-5","Acts 12:11","Acts 23:21","Acts 25:3"]},{"a":"but I","r":["Ps 119:24,31,111,125,129,167"]}],"psa.119.96":[{"a":"I have seen","r":["Ps 39:5-6","1 Sam 9:2","1 Sam 17:8,49-51","1 Sam 31:4-5","2 Sam 14:25","2 Sam 16:23","2 Sam 17:23","2 Sam 18:14,17","Eccl 1:2-3","Eccl 2:11","Eccl 7:20","Eccl 12:8","Matt 5:18","Matt 24:35"]},{"a":"but thy","r":["Ps 19:7-8","Matt 5:28","Matt 22:37-40","Mark 12:29-34","Rom 7:7-12,14","Heb 4:12-13"]}],"psa.119.97":[{"a":"O how","r":["Ps 119:48,113,127,159,165,167","Ps 1:2","Deut 6:6-9","Deut 17:19","Josh 1:8","Prov 2:10","Prov 18:1"]}],"psa.119.98":[{"a":"through","r":["Ps 119:104","Deut 4:6,8","1 Sam 18:5,14,30","Prov 2:6","Col 3:16"]},{"a":"they are ever","r":["Ps 119:11,30,105","Jas 1:25"]}],"psa.119.99":[{"a":"than all","r":["Deut 4:6-8","2 Sam 15:24-26","1 Chr 15:11-13","2 Chr 29:15-36","2 Chr 30:22","Jer 2:8","Jer 8:8-9","Matt 11:25","Matt 13:11","Matt 15:6-9,14","Matt 23:24-36","Heb 5:12"]},{"a":"for thy","r":["Ps 119:24","2 Tim 3:15-17"]}],"psa.23.1":[{"a":"my shepherd","r":["Ps 79:13","Ps 80:1","Ps 95:6-7","Isa 40:11","Jer 23:3-4","Ezek 34:11-12,23-24","Mic 5:2,4","John 10:11,14,27-30","Heb 13:20","1 Pet 2:25","1 Pet 5:4","Rev 7:17"]},{"a":"I shall not want","r":["Ps 34:9-10","Ps 84:11","Matt 6:33","Luke 12:30-32","Rom 8:32","Phil 4:19","Heb 13:5-6"]}],"psa.23.2":[{"a":"green pastures","r":["Isa 30:23","Ezek 34:13-14"]},{"a":"leadeth me","r":["Ps 46:4","Isa 49:9-10","Rev 7:17","Rev 21:6","Rev 22:1,17"]},{"a":"still waters","r":["Job 34:29","Isa 8:6"]}],"psa.23.3":[{"a":"restoreth my soul","r":["Ps 19:7","Ps 51:10,12","Ps 85:4-7","Ps 119:176","Job 33:30","Jer 32:37-42","Hos 14:4-9","Mic 7:8-9,18-19","Luke 22:31-32","Rev 3:19"]},{"a":"leadeth","r":["Ps 5:8","Ps 143:8-10","Prov 8:20","Isa 42:16","Jer 31:8"]},{"a":"for his name's sake.","r":["Ps 34:3","Ps 79:9","Ezek 20:14","Eph 1:6"]}],"psa.23.4":[{"a":"through","r":["Ps 44:19","Job 3:5","Job 10:21-22","Job 24:17","Jer 2:6","Luke 1:79"]},{"a":"I will","r":["Ps 3:6","Ps 27:1-4","Ps 46:1-3","Ps 118:6","Ps 138:7","Isa 41:10","1 Cor 15:55-57"]},{"a":"for thou","r":["Ps 14:5","Ps 46:11","Isa 8:9-10","Isa 43:1-2","Zech 8:23","Matt 1:23","Matt 28:20","Acts 18:9-10","2 Tim 4:22"]},{"a":"thy rod","r":["Ps 110:2","Mic 7:14","Zech 11:10,14"]}],"psa.23.5":[{"a":"preparest","r":["Ps 22:26,29","Ps 31:19-20","Ps 104:15","Job 36:16","Isa 25:6","John 6:53-56","John 10:9-10","John 16:22"]},{"a":"thou anointest","r":["Ps 45:7","Ps 92:10","Amos 6:6","Matt 6:17","2 Cor 1:21","1 John 2:20,27"]},{"a":"my cup","r":["Ps 16:5","Ps 116:13","1 Cor 10:16","Eph 3:20"]}],"psa.23.6":[{"a":"goodness","r":["Ps 30:11-12","Ps 36:7-10","Ps 103:17","2 Cor 1:10","2 Tim 4:18"]},{"a":"and I","r":["Ps 16:11","Ps 17:15","Ps 73:24-26","2 Cor 5:1","Phil 1:23"]},{"a":"for ever","r":["Ps 21:4"]}],"psa.51.1":[{"a":"when","r":["2 Sam 12:1-13"]},{"a":"after","r":["2 Sam 11:2-27"]},{"a":"O God","r":["Ps 25:6-7","Ps 109:21","Ps 119:124","Exod 34:6-7","Num 14:18-19","Dan 9:9,18","Mic 7:18","Mic 7:19","Rom 5:20-21","Eph 1:6-8","Eph 2:4-7"]},{"a":"multitude","r":["Ps 5:7","Ps 69:13,16","Ps 106:7,45","Isa 63:7,15","Lam 3:32"]},{"a":"tender","r":["Ps 40:11","Ps 77:9","Ps 145:9"]},{"a":"blot","r":["Ps 51:9","Neh 4:5","Isa 43:25","Isa 44:22","Jer 18:23","Acts 3:19","Col 2:14"]}],"psa.51.10":[{"a":"Create","r":["2 Cor 5:17","Eph 2:10"]},{"a":"clean","r":["Ps 73:1","Prov 20:9","Jer 13:27","Jer 32:39","Ezek 11:19","Ezek 18:31","Ezek 36:25-27,37","Matt 5:8","Acts 15:9","1 Pet 1:22"]},{"a":"renew","r":["Rom 12:2","Eph 4:22-24","Col 3:10","Titus 3:5"]},{"a":"right","r":["Ps 78:8,37","Josh 14:14","1 Kgs 15:3-5","Acts 11:23","1 Cor 15:58","Jas 1:8"]}],"psa.51.11":[{"a":"Cast","r":["Ps 43:2","Ps 71:9,18","Gen 4:14","2 Kgs 13:23","2 Kgs 17:18-23","2 Kgs 23:27","2 Thess 1:9"]},{"a":"take","r":["Gen 6:3","Judg 13:25","Judg 15:14","Judg 16:20","1 Sam 10:10","1 Sam 16:14","2 Sam 7:15","Isa 63:10-11"]},{"a":"holy","r":["Luke 11:13","John 14:26","Rom 1:4","Rom 8:9","Eph 4:30"]}],"psa.51.12":[{"a":"Restore","r":["Ps 85:6-8","Job 29:2-3","Isa 57:17-18","Jer 31:9-14"]},{"a":"joy","r":["Ps 13:5","Ps 21:1","Ps 35:9","Isa 49:13","Isa 61:10","Luke 1:47","Rom 5:2-11"]},{"a":"uphold","r":["Ps 17:5","Ps 19:13","Ps 119:116-117,133","Isa 41:10","Jer 10:23","Rom 14:4","1 Pet 1:5","Jude 1:24"]},{"a":"free","r":["Rom 8:15","2 Cor 3:17","Gal 4:6-7"]}],"psa.51.13":[{"a":"Then","r":["Ps 32:5,8-10","Zech 3:1-8","Luke 22:32","John 21:15-17","Acts 2:38-41","Acts 9:19-22","2 Cor 5:8-20"]},{"a":"ways","r":["Ps 25:4,8","Isa 2:3","Acts 13:10"]},{"a":"converted","r":["Ps 19:7","Isa 6:10","Jer 31:18","Matt 18:3","Acts 3:19","Acts 15:3","Acts 26:18-20","Jas 5:19-20"]}],"psa.51.14":[{"a":"Deliver","r":["Ps 26:9","Ps 55:23","Gen 9:6","Gen 42:22","2 Sam 3:28","2 Sam 11:15-17","2 Sam 12:9","2 Sam 21:1"]},{"a":"bloodguiltiness","r":["Ezek 33:8","Hos 4:2","Acts 18:6","Acts 20:26"]},{"a":"thou God","r":["Ps 38:22","Ps 68:20","Ps 88:1","Isa 12:2","Isa 45:17","Hab 3:18"]},{"a":"tongue","r":["Ps 35:28","Ps 71:15-24","Ps 86:12-13"]},{"a":"righteousness","r":["Ezra 9:13","Neh 9:33","Dan 9:7,16","Rom 10:3"]}],"psa.51.15":[{"a":"O Lord","r":["Gen 44:16","1 Sam 2:9","Ezek 16:63","Matt 22:12","Rom 3:19"]},{"a":"open","r":["Exod 4:11","Ezek 3:27","Ezek 29:21","Mark 7:34"]},{"a":"mouth","r":["Ps 63:3-5","Ps 119:13","Heb 13:15"]}],"psa.51.16":[{"a":"desirest","r":["Ps 51:6","Exod 21:14","Num 15:27,30-31","Num 35:31","Deut 22:22","Hos 6:6"]},{"a":"delightest","r":["Ps 40:6","Ps 50:8","Prov 15:8","Prov 21:27","Isa 1:11-15","Jer 7:22-23,27","Amos 5:21-23","Heb 10:5-6"]}],"psa.51.17":[{"a":"sacrifices","r":["Ps 107:22","Mark 12:33","Rom 12:1","Phil 4:18","Heb 13:16","1 Pet 2:5"]},{"a":"a broken spirit","r":["Ps 34:18","Ps 147:3","2 Kgs 22:19","Isa 57:15","Isa 61:1-3","Isa 66:2","Ezek 9:3-4,6","Matt 5:3","Luke 18:11-14"]},{"a":"thou","r":["Ps 22:24","Ps 102:17","2 Chr 33:12-13","Amos 5:21","Luke 7:39-50","Luke 15:2-7,10,21-32"]}],"psa.51.18":[{"a":"Do","r":["Ps 25:22","Ps 102:16","Ps 122:6-9","Ps 137:5-6","Isa 62:1,6-7","Jer 51:50","2 Cor 11:28-29"]},{"a":"thy","r":["Luke 12:32","Eph 1:5,9","Phil 2:13","2 Thess 1:11"]},{"a":"build","r":["Neh 2:17","Isa 58:12","Dan 9:25","Mic 7:11","Zech 2:5"]}],"psa.51.19":[{"a":"pleased","r":["Ps 66:13-15","Ps 118:27","Eph 5:2"]},{"a":"sacrifices","r":["Ps 4:5","Mal 3:3","Rom 12:1"]}],"psa.51.2":[{"a":"Wash","r":["Ps 51:7","Ezek 36:25","Zech 13:1","1 Cor 6:11","Heb 9:13-14","Heb 10:21-22","1 John 1:7-9","Rev 1:5","Rev 7:14"]},{"a":"cleanse","r":["Ps 51:7","Ps 19:12"]}],"psa.51.3":[{"a":"For I","r":["Ps 32:5","Ps 38:18","Lev 26:40-41","Neh 9:2","Job 33:27","Prov 28:13","Luke 15:18-21"]},{"a":"my sin","r":["Ps 40:12","Isa 59:12","Jer 3:25"]}],"psa.51.4":[{"a":"Against","r":["Gen 9:6","Gen 20:6","Gen 39:9","Lev 5:19","Lev 6:2-7","2 Sam 12:9-10,13-14","Jas 2:9,11"]},{"a":"evil","r":["Gen 38:7","2 Kgs 17:17","2 Kgs 21:6","Luke 15:21"]},{"a":"that thou","r":["Ps 50:4,6","Luke 7:29","Rom 3:4"]},{"a":"when","r":["Acts 17:31","Rom 2:5","Rev 15:3-4","Rev 16:5","Rev 19:11"]}],"psa.51.5":[{"a":"shapen","r":["Ps 58:3","Gen 5:3","Gen 8:21","Job 14:4","Job 15:14-16","John 3:6","Rom 5:12","Eph 2:3"]}],"psa.51.6":[{"a":"Behold","r":["Ps 26:2","Ps 125:4","Gen 20:5-6","2 Kgs 20:3","1 Chr 29:17","2 Chr 31:20-21","Prov 2:21","Jer 5:3","John 4:23-24","2 Cor 1:12","Jas 4:8"]},{"a":"inward","r":["Ps 5:9","1 Sam 16:7","Job 38:36","Luke 11:39","Rom 7:22"]},{"a":"in the hidden","r":["Job 32:8","Jer 31:33","Jer 32:40","1 Pet 3:4"]}],"psa.51.7":[{"a":"Purge","r":["Lev 14:4-7,49-52","Num 19:18-20","Heb 9:19"]},{"a":"and","r":["Heb 9:13-14","1 John 1:7","Rev 1:5"]},{"a":"whiter","r":["Isa 1:18","Eph 5:26-27","Rev 7:13-14"]}],"psa.51.8":[{"a":"Make","r":["Ps 13:5","Ps 30:11","Ps 119:81-82","Ps 126:5-6","Matt 5:4"]},{"a":"bones","r":["Ps 6:2-3","Ps 38:3","Job 5:17-18","Isa 57:15-18","Hos 6:1-2","Luke 4:18","Acts 2:37-41","Acts 16:29-34"]}],"psa.51.9":[{"a":"Hide","r":["Isa 38:17","Jer 16:17","Mic 7:18-19"]},{"a":"blot","r":["Ps 51:1","Col 2:14"]}],"rev.21.1":[{"a":"a new","r":["Rev 21:5","Isa 65:17-19","Isa 66:22","2 Pet 3:13"]},{"a":"for","r":["Rev 20:11"]},{"a":"and there","r":["Rev 13:1","Isa 27:1","Isa 57:20","Dan 7:3"]}],"rev.21.10":[{"a":"he carried","r":["Rev 1:10","Rev 4:2","Rev 17:3","1 Kgs 18:12","2 Kgs 2:16","Ezek 3:14","Ezek 8:3","Ezek 11:1,24","Ezek 40:1-3","Acts 8:39","2 Cor 12:2-4"]},{"a":"that","r":["Rev 21:2","Ezek 40:1-49","Ezek 48:15-22"]}],"rev.21.11":[{"a":"the glory","r":["Rev 21:22-23","Rev 22:5","Isa 4:5","Isa 60:1-2,19-20","Ezek 48:35"]},{"a":"her","r":["Rev 21:19","Ezek 1:26","Ezek 28:13-14,16"]},{"a":"clear","r":["Rev 21:18","Rev 4:6","Rev 22:1","Job 28:17","Ezek 1:22"]}],"rev.21.12":[{"a":"a wall","r":["Rev 21:17-20","Ezra 9:9","Neh 12:27","Ps 51:18","Ps 122:7"]},{"a":"twelve gates","r":["Rev 21:21,25","Isa 54:12","Isa 60:18","Ezek 48:31-34"]},{"a":"twelve angels","r":["Matt 18:10","Luke 15:10","Luke 16:22","Heb 1:14"]},{"a":"and names","r":["Rev 7:4-8","Num 2:2-32","Acts 26:7"]}],"rev.21.13":[{"a":"On the east three gates; on the north three gates; on the south three gates; and on the west three gates.","r":["Ezek 48:31-34"]}],"rev.21.14":[{"a":"foundations","r":["Rev 21:19-21","Isa 54:11","Heb 11:10"]},{"a":"and in","r":["Rev 18:20","Matt 10:2-4","Matt 16:18","1 Cor 3:10-11","Gal 2:9","Eph 2:20","Eph 3:5","Eph 4:11","Jude 1:17"]}],"rev.21.15":[{"a":"a golden","r":["Rev 11:1-2","Exod 40:3-5","Ezek 41:1-5","Zech 2:1"]}],"rev.21.16":[{"a":"four square","r":["Ezek 48:17-18,20,35"]},{"a":"twelve","r":["Ezek 48:8-19"]}],"rev.21.17":[{"a":"an","r":["Rev 7:4","Rev 14:3"]}],"rev.21.18":[{"a":"was of","r":["Rev 21:11,19"]},{"a":"like","r":["Rev 21:11,21"]}],"rev.21.19":[{"a":"the foundations","r":["Job 28:16-19","Prov 3:15","Isa 54:11-12"]},{"a":"sapphire","r":["Exod 28:17-21","Exod 29:10-14"]}],"rev.21.2":[{"a":"I","r":["Rev 1:1,4,9"]},{"a":"the holy","r":["Rev 3:12","Ps 48:1-3","Ps 87:3","Isa 1:21","Isa 52:1","Jer 31:23","Heb 11:10","Heb 12:22","Heb 13:14"]},{"a":"coming","r":["Rev 21:10","Gal 4:25-26"]},{"a":"as","r":["Rev 19:7-8","Ps 45:9-14","Isa 54:5","Isa 61:10","Isa 62:4","John 3:29","2 Cor 11:2","Eph 5:25-27,30-32"]}],"rev.21.20":[{"a":"The fifth, sardonyx; the sixth, sardius; the seventh, chrysolite; the eighth, beryl; the ninth, a topaz; the tenth, a chrysoprasus; the eleventh, a jacinth; the twelfth, an amethyst.","r":["Rev 21:20"]}],"rev.21.21":[{"a":"the twelve","r":["Rev 21:12","Rev 17:4","Matt 13:45-46"]},{"a":"pure","r":["Rev 21:18","Rev 17:4","Rev 18:16","Rev 22:2","1 Kgs 6:20","Isa 60:17-18"]},{"a":"as it","r":["Rev 21:11,18"]}],"rev.21.22":[{"a":"I saw","r":["Rev 21:4-5","1 Kgs 8:27","2 Chr 2:6","2 Chr 6:18","Isa 66:1","John 4:23"]},{"a":"the Lord","r":["Rev 1:8","Rev 4:8","Rev 11:17","Rev 15:3","Rev 16:7,14","Rev 19:15"]},{"a":"the Lamb","r":["John 2:19-21","John 10:30","Col 1:19","Col 2:9","Heb 9:1-12"]}],"rev.21.23":[{"a":"the city","r":["Rev 21:11","Rev 22:5","Isa 24:23","Isa 60:19-20"]},{"a":"for","r":["Rev 21:11","Rev 18:1","Isa 2:10,19,21","Hab 3:3","Matt 16:27","Mark 8:38","John 17:24","Acts 22:11"]},{"a":"the Lamb","r":["Luke 2:32","John 1:4,9,14,18","John 5:23"]}],"rev.21.24":[{"a":"the nations","r":["Rev 22:2","Deut 32:43","Ps 22:27","Isa 2:2","Isa 52:15","Isa 55:5,10","Isa 66:12,18","Jer 4:2","Zech 2:11","Zech 8:22-23","Rom 15:10-12,16,26"]},{"a":"walk","r":["Isa 2:5"]},{"a":"the kings","r":["Ps 72:10-11","Isa 60:3-10,13","Isa 66:11-12"]}],"rev.21.25":[{"a":"the gates","r":["Isa 60:11"]},{"a":"for","r":["Rev 22:5","Isa 60:20","Zech 14:7"]}],"rev.21.26":[{"a":"the glory","r":["Rev 21:24"]}],"rev.21.27":[{"a":"there","r":["Lev 13:46","Num 5:3","Num 12:15","Ps 101:8","Isa 35:8","Isa 52:1","Isa 60:21","Joel 3:17","Matt 13:41","1 Cor 6:9-10","Gal 5:19-21","Eph 5:5","Heb 12:14"]},{"a":"worketh","r":["Rev 17:4-5"]},{"a":"or maketh","r":["Rev 21:8","Rev 22:14-15"]},{"a":"they","r":["Rev 3:5","Rev 13:8","Rev 20:12,15","Phil 4:3"]}],"rev.21.3":[{"a":"a great","r":["Rev 10:4,8","Rev 12:10"]},{"a":"Behold","r":["Rev 7:15","Lev 26:11-12","1 Kgs 8:27","2 Chr 6:18","Isa 12:6","Ezek 37:27","Ezek 43:7","John 1:14","John 14:23","2 Cor 6:16"]},{"a":"they shall","r":["Rev 21:7","Gen 17:7-8","Jer 31:33","Jer 32:38","Zech 13:9","2 Cor 6:18","Heb 8:10","Heb 11:16"]},{"a":"God himself","r":["Zech 8:8"]}],"rev.21.4":[{"a":"God shall","r":["Rev 7:17","Isa 25:8"]},{"a":"no","r":["Rev 20:14","Rev 22:3","Isa 25:8","Hos 13:14","1 Cor 15:26,54-58","Heb 2:14-15"]},{"a":"neither sorrow","r":["Isa 30:19","Isa 35:10","Isa 60:20","Isa 61:3","Isa 65:18-19","Jer 31:13"]},{"a":"the former","r":["Rev 21:1","Ps 144:4","Matt 24:35","1 Cor 7:31","2 Cor 6:17","2 Pet 3:10","1 John 2:17"]}],"rev.21.5":[{"a":"that sat","r":["Rev 4:2,9","Rev 5:1","Rev 20:11"]},{"a":"Behold","r":["Isa 42:9","Isa 43:19","2 Cor 5:17"]},{"a":"Write","r":["Rev 1:11,19"]},{"a":"these","r":["Rev 19:9"]}],"rev.21.6":[{"a":"It is","r":["Rev 16:17"]},{"a":"I am","r":["Rev 1:8,11,17","Rev 22:13"]},{"a":"I will","r":["Rev 7:17","Rev 22:17","Isa 12:3","Isa 55:1-3","John 4:10,14","John 7:37-38"]},{"a":"the fountain","r":["Ps 36:9","Jer 2:13","Joel 3:18"]},{"a":"freely","r":["Hos 14:4","Rom 3:24","Rom 8:32","1 Cor 2:12","1 Cor 3:5,12,21","1 John 5:4-5"]}],"rev.21.7":[{"a":"overcometh","r":["Rev 2:11,17,25"]},{"a":"inherit","r":["1 Sam 2:8","Prov 3:35","Isa 65:9","Matt 19:29","Matt 25:34","Mark 10:17","1 Cor 3:21-23","1 Pet 1:3-4","1 Pet 3:9"]},{"a":"and I","r":["Rev 21:3","Zech 8:8","Rom 8:15-17","Heb 8:10","1 John 3:1-3"]}],"rev.21.8":[{"a":"the fearful","r":["Deut 20:8","Judg 7:3","Isa 51:12","Isa 57:11","Matt 8:26","Matt 10:28","Luke 12:4-9","John 12:42-43","1 Pet 3:14-15","1 John 5:4-5,10"]},{"a":"and the","r":["Rev 22:15","Mal 3:5","1 Cor 6:9-10","Gal 5:19-21","Eph 5:5-6","1 Tim 1:9-10","Heb 12:24","Heb 13:4","1 John 3:15"]},{"a":"and idolaters","r":["1 Cor 10:20-21"]},{"a":"and all","r":["Rev 2:2","Prov 19:5,9","Isa 9:15","John 8:44","2 Thess 2:9","1 Tim 4:2","1 John 2:22"]},{"a":"the lake","r":["Rev 19:20","Rev 20:14-15"]},{"a":"which is","r":["Rev 20:14"]}],"rev.21.9":[{"a":"which","r":["Rev 15:1-7","Rev 16:1-17"]},{"a":"the Lamb's","r":["Rev 21:2","Rev 19:7"]}],"rev.22.1":[{"a":"A pure","r":["Ps 36:8","Ps 46:4","Isa 41:18","Isa 48:18","Isa 66:12","Ezek 47:1-9","Zech 14:8","John 7:38-39"]},{"a":"water","r":["Rev 7:17","Rev 21:6","Ps 36:9","Jer 2:13","Jer 17:13","John 4:10-11,14"]},{"a":"clear","r":["Rev 21:11"]},{"a":"proceeding","r":["Rev 3:21","Rev 4:5","Rev 5:6,13","Rev 7:10-11,17","John 14:16-18","John 15:26","John 16:7-15","Acts 1:4-5","Acts 2:33"]}],"rev.22.10":[{"a":"he saith","r":["Rev 22:12-13,16,20"]},{"a":"Seal","r":["Rev 5:1","Rev 10:4","Isa 8:16","Dan 8:26","Dan 12:4,9","Matt 10:27"]},{"a":"for","r":["Rev 1:3","Isa 13:6","Ezek 12:23","Rom 13:12","2 Thess 2:3","1 Pet 4:7"]}],"rev.22.11":[{"a":"that is unjust","r":["Rev 16:8-11,21","Ps 81:12","Prov 1:24-33","Prov 14:32","Eccl 11:3","Ezek 3:27","Dan 12:10","Matt 15:14","Matt 21:19","Matt 25:10","John 8:21","2 Tim 3:13"]},{"a":"and he that","r":["Rev 22:3","Rev 7:13-15","Job 17:9","Prov 4:18","Matt 5:6","Eph 5:27","Col 1:22","Jude 1:24"]}],"rev.22.12":[{"a":"I come","r":["Rev 22:7","Zeph 1:14"]},{"a":"and my","r":["Rev 11:18","Isa 3:10-11","Isa 40:10","Isa 62:11","1 Cor 3:8,14","1 Cor 9:17-18"]},{"a":"to give","r":["Rev 20:12","Matt 16:27","Rom 2:6-11","Rom 14:12"]}],"rev.22.13":[{"a":"I am Alpha and Omega, the beginning and the end, the first and the last.","r":["Rev 1:8,11","Rev 21:6","Isa 41:4","Isa 44:6","Isa 48:12"]}],"rev.22.14":[{"a":"Blessed","r":["Rev 22:7","Ps 106:3-5","Ps 112:1","Ps 119:1-6","Isa 56:1-2","Dan 12:12","Matt 7:21-27","Luke 12:37-38","John 14:15,21-23","John 15:10-14","1 Cor 7:19","Gal 5:6","1 John 3:3,23-24","1 John 5:3"]},{"a":"may have","r":["John 4:12","1 Cor 8:9","1 Cor 9:5"]},{"a":"to the","r":["Rev 22:2","Rev 2:7"]},{"a":"and may","r":["Rev 21:27","John 10:7,9","John 14:6"]}],"rev.22.15":[{"a":"without","r":["Rev 9:20-21","Rev 21:8,27","1 Cor 6:9-10","Gal 5:19-21","Eph 5:3-6","Col 3:6"]},{"a":"dogs","r":["Phil 3:2"]},{"a":"sorcerers","r":["Rev 9:21","Rev 18:23","Isa 47:9,12","Isa 57:3","Mal 3:5","Acts 8:11","Acts 13:6-11"]},{"a":"whoremongers","r":["Rev 17:1-6"]},{"a":"whosoever","r":["Rev 21:8,27","1 Kgs 22:8,21-23","Isa 9:15-16","Jer 5:31","John 3:18-21","John 8:46","2 Thess 2:10-12"]}],"rev.22.16":[{"a":"I Jesus","r":["Rev 22:6","Rev 1:1"]},{"a":"to testify","r":["Rev 22:20"]},{"a":"in the churches","r":["Rev 22:1,11","Rev 2:7,11,17,29","Rev 3:6,13,22"]},{"a":"I am","r":["Rev 5:5","Isa 11:1","Zech 6:12","Matt 22:42,45","Rom 1:3-4","Rom 9:5"]},{"a":"the bright","r":["Rev 2:28","Num 24:17","Matt 2:2,7-10","Luke 1:78","2 Pet 1:19"]}],"rev.22.17":[{"a":"the Spirit","r":["Rev 22:16","Isa 55:1-3","John 16:7-15"]},{"a":"the bride","r":["Rev 21:2,9"]},{"a":"Come","r":["Isa 2:5"]},{"a":"let him that heareth","r":["Ps 34:8","Isa 2:3,5","Isa 48:16-18","Jer 50:5","Mic 4:2","Zech 8:21-23","John 1:39-46","John 4:29","1 Thess 1:5-8"]},{"a":"let him that is athirst","r":["Rev 21:6","Isa 55:1","John 7:37"]},{"a":"let him take","r":["Isa 12:3","John 4:10,14"]},{"a":"freely","r":["Rom 3:24","1 Cor 2:12"]}],"rev.22.18":[{"a":"testify","r":["Rev 22:16","Rev 3:14","Eph 4:17","1 Thess 4:6"]},{"a":"heareth","r":["Rev 1:3"]},{"a":"If","r":["Deut 4:2","Deut 12:32","Prov 30:6","Matt 15:6-9,13"]},{"a":"God","r":["Rev 14:10-11","Rev 15:1","Rev 16:1","Rev 19:20","Rev 20:10,15","Lev 26:18,24-25,28,37"]}],"rev.22.19":[{"a":"take","r":["Rev 2:18","Luke 11:52"]},{"a":"God","r":["Rev 3:5","Rev 13:8","Exod 32:33","Ps 69:28"]},{"a":"out of the book of life","r":["Rev 22:2","Rev 2:7","Rev 20:15"]},{"a":"and out","r":["Rev 21:2,22-27"]},{"a":"and from","r":["Rev 22:12","Rev 1:3","Rev 2:7,11,17,26","Rev 3:4-5,12,21","Rev 7:9-17","Rev 14:13"]}],"rev.22.2":[{"a":"the midst","r":["Rev 22:1","Rev 21:21","Ezek 47:1,12"]},{"a":"the tree of life","r":["Rev 22:14","Rev 2:7","Gen 2:9","Gen 3:22-24","Prov 3:18"]},{"a":"healing","r":["Rev 21:24","Ps 147:3","Isa 6:10","Isa 57:18-19","Jer 17:14","Ezek 47:8-11","Hos 14:4","Mal 4:2","Luke 4:18","1 Pet 2:24"]}],"rev.22.20":[{"a":"which","r":["Rev 22:18"]},{"a":"Surely","r":["Rev 22:7,10,12"]},{"a":"Amen","r":["Rev 1:18","Song 8:14","Isa 25:9","John 21:25","2 Tim 4:8","Heb 9:28","2 Pet 3:12-14"]}],"rev.22.21":[{"a":"The grace of our Lord Jesus Christ be with you all. Amen.","r":["Rev 1:4","Rom 1:7","Rom 16:20,24","2 Cor 13:14","Eph 6:23-24","2 Thess 3:18"]}],"rev.22.3":[{"a":"there","r":["Rev 21:4","Deut 27:26","Zech 14:11","Matt 25:41","Gen 3:10-13","Ezek 37:27"]},{"a":"but","r":["Rev 7:15-17","Rev 21:22-23","Ps 16:11","Ps 17:15","Isa 12:6","Ezek 48:35","Matt 25:21","John 14:3","John 17:24"]},{"a":"his","r":["Rev 7:15","John 12:26"]}],"rev.22.4":[{"a":"they","r":["Ezek 33:18-20,23","Job 33:26","Ps 4:6","Isa 33:17","Isa 35:2","Isa 40:5","Matt 5:8","John 12:26","John 17:24","1 Cor 13:12","Heb 12:14","1 John 3:2-3"]},{"a":"and his","r":["Rev 3:12","Rev 14:1"]}],"rev.22.5":[{"a":"no night","r":["Rev 18:23","Rev 21:22-25","Ps 36:9","Ps 84:11","Prov 4:18-19","Isa 60:19-20"]},{"a":"and they","r":["Rev 3:21","Rev 11:15","Dan 7:18,27","Matt 25:34,46","Rom 5:17","2 Tim 2:12","1 Pet 1:3-4"]}],"rev.22.6":[{"a":"These","r":["Rev 19:9","Rev 21:5"]},{"a":"the holy","r":["Rev 18:20","Luke 1:70","Luke 16:16","Acts 3:18","Rom 1:2","1 Pet 1:11-12","2 Pet 1:21","2 Pet 3:2"]},{"a":"sent","r":["Rev 1:1","Dan 3:28","Dan 6:22","Matt 13:41","Acts 12:11","2 Thess 1:7"]},{"a":"which","r":["Rev 22:7","Gen 41:32","1 Cor 7:29","2 Pet 3:8-9"]}],"rev.22.7":[{"a":"I come","r":["Rev 22:10,12,20","Rev 3:11"]},{"a":"blessed","r":["Rev 22:9","Rev 1:3"]}],"rev.22.8":[{"a":"I fell","r":["Rev 19:10,19"]}],"rev.22.9":[{"a":"See","r":["Rev 19:10","Deut 4:19","Col 2:18-19","1 John 5:20"]},{"a":"worship God","r":["Rev 4:10","Rev 9:20","Rev 14:7","Rev 15:4","Exod 34:14","2 Kgs 17:36","Ps 45:11","Matt 4:9","Luke 4:7","John 4:22-23"]}],"rom.3.1":[{"a":"advantage","r":["Rom 2:25-29","Gen 25:32","Eccl 6:8,11","Isa 1:11-15","Mal 3:14","1 Cor 15:32","Heb 13:9"]}],"rom.3.10":[{"a":"As it is","r":["Rom 3:4","Rom 11:8","Rom 15:3-4","Isa 8:20","1 Pet 1:16"]},{"a":"There","r":["Ps 14:1-3","Ps 53:1-3"]},{"a":"none","r":["Rom 3:23","Job 14:4","Job 15:14,16","Job 25:4","Jer 17:9","Matt 15:19","Mark 7:21-22","Mark 10:18","1 Cor 6:9-10","Gal 5:19-21","Eph 2:1-3","Eph 5:3-6","Col 3:5-9","1 Tim 1:9-10","2 Tim 3:2-5","Titus 3:3","1 John 1:8-10","Rev 21:8","Rev 22:15"]}],"rom.3.11":[{"a":"none that understandeth","r":["Rom 1:22,28","Ps 14:2-4","Ps 53:2,4","Ps 94:8","Prov 1:7,22,29-30","Isa 27:11","Jer 4:22","Hos 4:6","Matt 13:13-14,19","Titus 3:3","1 John 5:20"]},{"a":"seeketh","r":["Rom 8:7","Job 21:15-16","Isa 9:13","Isa 31:1","Isa 55:6","Isa 65:1","Hos 7:10"]}],"rom.3.12":[{"a":"They are","r":["Exod 32:8","Ps 14:3","Eccl 7:29","Isa 53:6","Isa 59:8","Jer 2:13","Eph 2:3","1 Pet 2:25"]},{"a":"become","r":["Gen 1:31","Gen 6:6-7","Matt 25:30","Phlm 1:11"]},{"a":"there is none","r":["Ps 53:1","Eccl 7:20","Isa 64:6","Eph 2:8-10","Phil 2:12-13","Titus 2:13-14","Jas 1:16-17"]}],"rom.3.13":[{"a":"throat","r":["Ps 5:9","Jer 5:16","Matt 23:27-28"]},{"a":"with their","r":["Rom 3:4","Ps 5:9","Ps 12:3-4","Ps 36:3","Ps 52:2","Ps 57:4","Isa 59:3","Jer 9:3-5","Ezek 13:7","Matt 12:34-35","Jas 3:5-8"]},{"a":"the poison","r":["Deut 32:33","Job 20:14-16","Ps 140:3"]}],"rom.3.14":[{"a":"Whose mouth is full of cursing and bitterness:","r":["Ps 10:7","Ps 59:12","Ps 109:17-18","Jas 3:10"]}],"rom.3.15":[{"a":"Their feet are swift to shed blood:","r":["Prov 1:16","Prov 6:18","Isa 59:7-8"]}],"rom.3.17":[{"a":"And the way of peace have they not known:","r":["Rom 5:1","Isa 57:21","Isa 59:8","Matt 7:14","Luke 1:79"]}],"rom.3.18":[{"a":"There is no fear of God before their eyes.","r":["Gen 20:11","Ps 36:1","Prov 8:13","Prov 16:6","Prov 23:17","Luke 23:40","Rev 19:5"]}],"rom.3.19":[{"a":"what things","r":["Rom 3:2","Rom 2:12-18","John 10:34-35","John 15:25","1 Cor 9:20-21","Gal 3:23","Gal 4:5,21","Gal 5:18"]},{"a":"that","r":["Rom 3:4","Rom 1:20","Rom 2:1","1 Sam 2:9","Job 5:16","Job 9:2-3","Ps 107:42","Ezek 16:63","Matt 22:12-13","John 8:9","1 Cor 1:29"]},{"a":"and all the","r":["Rom 3:9,23","Rom 2:1-2","Gal 3:10,22"]}],"rom.3.2":[{"a":"Much","r":["Rom 3:3","Rom 11:1-2,15-23,28-29"]},{"a":"because","r":["Rom 2:18","Rom 9:4","Deut 4:7-8","Neh 9:13-14","Ps 78:4-7","Ps 147:19-20","Isa 8:20","Ezek 20:11-12","Luke 16:29-31","John 5:39","2 Tim 3:15-17","2 Pet 1:19-21","Rev 19:10"]},{"a":"committed","r":["1 Cor 9:17","2 Cor 5:19","Gal 2:7","1 Tim 6:20"]},{"a":"the oracles","r":["Rom 1:2","Ps 119:140","Dan 10:21","Acts 7:38","2 Tim 3:15-16","Heb 5:12","1 Pet 4:11","2 Pet 1:20-21","Rev 22:6"]}],"rom.3.20":[{"a":"Therefore","r":["Rom 3:28","Rom 2:13","Rom 4:13","Rom 9:32","Acts 13:39","Gal 2:16,19","Gal 3:10-13","Gal 5:4","Eph 2:8-9","Titus 3:5-7","Jas 2:9-10"]},{"a":"no flesh","r":["Job 25:4","Ps 130:3","Ps 143:2","Jas 2:20-26"]},{"a":"in his sight","r":["Job 15:15","Job 25:5"]},{"a":"for by the","r":["Rom 7:7-9","Gal 2:19"]}],"rom.3.21":[{"a":"righteousness","r":["Rom 1:17","Rom 5:19,21","Rom 10:3-4","Gen 15:6","Isa 45:24-25","Isa 46:13","Isa 51:8","Isa 54:17","Isa 61:10","Jer 23:5-6","Jer 33:16","Dan 9:24","Acts 15:11","1 Cor 1:30","2 Cor 5:21","Gal 5:5","Phil 3:9","Heb 11:4-40","2 Pet 1:1"]},{"a":"being","r":["Deut 18:15-19","Luke 24:44","John 1:45","John 3:14-15","John 5:46-47","Acts 26:22","Heb 10:1-14"]},{"a":"and the","r":["Rom 1:2","Rom 16:26","Acts 3:21-25","Acts 10:43","Acts 28:23","Gal 3:8","1 Pet 1:10"]}],"rom.3.22":[{"a":"which is","r":["Rom 4:3-13,20-22","Rom 5:1-11","Rom 8:1","Phil 3:9"]},{"a":"unto all","r":["Rom 4:6,11,22","Gal 2:16","Gal 3:6","Jas 2:23"]},{"a":"and upon","r":["Isa 61:10","Matt 22:11-12","Luke 15:22","Gal 3:7-9"]},{"a":"for there","r":["Rom 2:1","Rom 10:12","Acts 15:9","1 Cor 4:7","Gal 3:28","Col 3:11"]}],"rom.3.23":[{"a":"all have","r":["Rom 3:9,19","Rom 1:28-32","Rom 2:1-16","Rom 11:32","Eccl 7:20","Gal 3:22","1 John 1:8-10"]},{"a":"come","r":["Heb 4:1"]},{"a":"of","r":["Rom 5:2","1 Thess 2:12","2 Thess 2:14","1 Pet 4:13","1 Pet 5:1,10"]}],"rom.3.24":[{"a":"justified","r":["Rom 4:16","Rom 5:16-19","1 Cor 6:11","Eph 2:7-10","Titus 3:5-7"]},{"a":"through","r":["Rom 5:9","Isa 53:11","Matt 20:28","Eph 1:6-7","Col 1:14","1 Tim 2:6","Titus 2:14","Heb 9:2-14","1 Pet 1:18-19","Rev 5:9","Rev 7:14"]}],"rom.3.25":[{"a":"set forth","r":["Acts 2:23","Acts 3:18","Acts 4:28","Acts 15:18","1 Pet 1:18-20","Rev 13:8"]},{"a":"to be","r":["Exod 25:17-22","Lev 16:15","Heb 9:5","1 John 2:2","1 John 4:10"]},{"a":"through","r":["Rom 5:1,9,11","Isa 53:11","John 6:47,53-58","Col 1:20-23","Heb 10:19-20"]},{"a":"to declare","r":["Rom 3:26","Ps 22:31","Ps 40:10","Ps 50:6","Ps 97:6","Ps 119:142","1 John 1:10"]},{"a":"remission","r":["Rom 3:23-24","Rom 4:1-8","Acts 13:38-39","Acts 17:30","1 Tim 1:15","Heb 9:15-22,25-26","Heb 10:4","Heb 11:7,14,17,39-40","Rev 5:9","Rev 13:8","Rev 20:15"]}],"rom.3.26":[{"a":"that he","r":["Deut 32:4","Ps 85:10-11","Isa 42:21","Isa 45:21","Zeph 3:5,15","Zech 9:9","Acts 13:38-39","Rev 15:3"]},{"a":"and","r":["Rom 3:30","Rom 4:5","Rom 8:33","Gal 3:8-14"]}],"rom.3.27":[{"a":"Where","r":["Rom 3:19","Rom 2:17,23","Rom 4:2","Ezek 16:62-63","Ezek 36:31-32","Zeph 3:11","Luke 18:9-14","1 Cor 1:29-31","1 Cor 4:7","Eph 2:8-10"]},{"a":"of works","r":["Rom 9:11,32","Rom 10:5","Rom 11:6","Gal 2:16"]},{"a":"but by","r":["Rom 7:21,23,25","Rom 8:2","Mark 16:16","John 3:36","Gal 3:22","1 John 5:11-12"]}],"rom.3.28":[{"a":"Therefore we conclude that a man is justified by faith without the deeds of the law.","r":["Rom 3:20-22,26","Rom 4:5","Rom 5:1","Rom 8:3","John 3:14-18","John 5:24","John 6:40","Acts 13:38-39","1 Cor 6:11","Gal 2:16","Gal 3:8,11-14,24","Phil 3:9","Titus 3:7"]}],"rom.3.29":[{"a":"Is he the God of the Jews only? is he not also of the Gentiles? Yes, of the Gentiles also:","r":["Rom 1:16","Rom 9:24-26","Rom 11:12-13","Rom 15:9-13,16","Gen 17:7-8,18","Ps 22:7","Ps 67:2","Ps 72:17","Isa 19:23-25","Isa 54:5","Jer 16:19","Jer 31:33","Hos 1:10","Zech 2:11","Zech 8:20-23","Mal 1:11","Matt 22:32","Matt 28:19","Mark 16:15-16","Luke 24:46-47","Acts 9:15","Acts 22:21","Acts 26:17","Gal 3:14,25-29","Eph 3:6","Col 3:11"]}],"rom.3.3":[{"a":"if some","r":["Rom 9:6","Rom 10:16","Rom 11:1-7","Heb 4:2"]},{"a":"shall","r":["Rom 11:29","Num 23:19","1 Sam 15:29","Isa 54:9-10","Isa 55:11","Isa 65:15-16","Jer 33:24-26","Matt 24:35","2 Tim 2:13","Heb 6:13-18"]},{"a":"faith","r":["Ps 84:7","John 1:16","2 Cor 3:18","2 Thess 1:3","Titus 1:1-2"]}],"rom.3.30":[{"a":"Seeing it is one God, which shall justify the circumcision by faith, and uncircumcision through faith.","r":["Rom 3:28","Rom 4:11-12","Rom 10:12-13","Gal 2:14-16","Gal 3:8,20,28","Gal 5:6","Gal 6:15","Phil 3:3","Col 2:10-11"]}],"rom.3.31":[{"a":"do we","r":["Rom 4:14","Ps 119:126","Jer 8:8-9","Matt 5:17","Matt 15:6","Gal 2:21","Gal 3:17-19"]},{"a":"yea","r":["Rom 7:7-14,22,25","Rom 8:4","Rom 10:4","Rom 13:8-10","Ps 40:8","Isa 42:21","Jer 31:33-34","Matt 3:15","Matt 5:20","1 Cor 9:21","Gal 2:19","Gal 5:18-23","Heb 10:15-16","Jas 2:8-12"]}],"rom.3.4":[{"a":"God forbid","r":["Rom 3:6,31","Rom 6:2,15","Rom 7:7,13","Rom 9:14","Rom 11:1,11","Luke 20:16","1 Cor 6:15","Gal 2:17","Gal 2:21","Gal 6:14"]},{"a":"let God","r":["Deut 32:4","Job 40:8","Ps 100:5","Ps 119:160","Ps 138:2","Mic 7:20","John 3:33","2 Cor 1:18","Titus 1:2","Heb 6:18","1 John 5:10,20","Rev 3:7"]},{"a":"but every","r":["Ps 62:9","Ps 116:11"]},{"a":"That thou","r":["Job 36:3","Ps 51:4","Matt 11:19"]}],"rom.3.5":[{"a":"But if","r":["Rom 3:7,25-26","Rom 8:20-21"]},{"a":"what shall","r":["Rom 4:1","Rom 6:1","Rom 7:7","Rom 9:13-14"]},{"a":"Is God","r":["Rom 2:5","Rom 3:19","Rom 9:18-20","Rom 12:19","Deut 32:39-43","Ps 58:10-11","Ps 94:1-2","Nah 1:2,6-8","2 Thess 1:6-9","Rev 15:3","Rev 16:5-7","Rev 18:20"]},{"a":"I speak","r":["Rom 6:19","1 Cor 9:8","Gal 3:15"]}],"rom.3.6":[{"a":"for then","r":["Gen 18:25","Job 8:3","Job 34:17-19","Ps 9:8","Ps 11:5-7","Ps 50:6","Ps 96:13","Ps 98:9","Acts 17:31"]}],"rom.3.7":[{"a":"if the truth","r":["Gen 37:8-9,20","Gen 44:1-14","Gen 50:18-20","Exod 3:19","Exod 14:5,30","1 Kgs 13:17-18,26-32","2 Kgs 8:10-15","Matt 26:34,69-75"]},{"a":"why yet","r":["Rom 9:19-20","Isa 10:6-7","Acts 2:23","Acts 13:27-29"]}],"rom.3.8":[{"a":"we be","r":["Matt 5:11","1 Pet 3:16-17"]},{"a":"Let us","r":["Rom 5:20","Rom 6:1,15","Rom 7:7","Jude 1:4"]}],"rom.3.9":[{"a":"what then","r":["Rom 3:5","Rom 6:15","Rom 11:7","1 Cor 10:19","1 Cor 14:15","Phil 1:18"]},{"a":"are we","r":["Rom 3:22-23","Isa 65:5","Luke 7:39","Luke 18:9-14","1 Cor 4:7"]},{"a":"proved","r":["Rom 1:28-32","Rom 2:1-16"]},{"a":"that they","r":["Gal 3:10,22"]}],"rom.5.1":[{"a":"being","r":["Rom 5:9,18","Rom 1:17","Rom 3:22,26-28,30","Rom 4:5,24-25","Rom 9:30","Rom 10:10","Hab 2:4","John 3:16-18","John 5:24","Acts 13:38-39","Gal 2:16","Gal 3:11-14,25","Gal 5:4-6","Phil 3:9","Jas 2:23-26"]},{"a":"we have","r":["Rom 5:10","Rom 1:7","Rom 10:15","Rom 14:17","Rom 15:13,33","Job 21:21","Ps 85:8-10","Ps 122:6","Isa 27:5","Isa 32:17","Isa 54:13","Isa 55:12","Isa 57:19-21","Zech 6:13","Luke 2:14","Luke 10:5-6","Luke 19:38,42","John 14:27","John 16:33","Acts 10:36","2 Cor 5:18-20","Eph 2:14-17","Col 1:20","Col 3:15","1 Thess 5:23","2 Thess 3:16","Heb 13:20","Jas 2:23"]},{"a":"through","r":["Rom 6:23","John 20:31","Eph 2:7"]}],"rom.5.10":[{"a":"when","r":["Rom 8:7","2 Cor 5:18-19,21","Col 1:20-21"]},{"a":"reconciled","r":["Rom 5:11","Rom 8:32","Lev 6:30","2 Chr 29:24","Ezek 45:20","Dan 9:24","Eph 2:16","Heb 2:17"]},{"a":"we shall","r":["John 5:26","John 6:40,57","John 10:28-29","John 11:25-26","John 14:19","2 Cor 4:10-11","Col 3:3-4","Heb 7:25","Rev 1:18"]}],"rom.5.11":[{"a":"but we","r":["Rom 2:17","Rom 3:29-30","1 Sam 2:1","Ps 32:11","Ps 33:1","Ps 43:4","Ps 104:34","Ps 149:2","Isa 61:10","Hab 3:17-18","Luke 1:46","Gal 4:9","Gal 5:22","Phil 3:1,3","Phil 4:4","1 Pet 1:8"]},{"a":"by whom","r":["John 1:12","John 6:50-58","1 Cor 10:16","Col 2:6"]},{"a":"atonement","r":["Rom 5:10","2 Cor 5:18-19"]}],"rom.5.12":[{"a":"as by","r":["Rom 5:19","Gen 3:6"]},{"a":"and death","r":["Rom 6:23","Gen 2:17","Gen 3:19,22-24","Ezek 18:4","1 Cor 15:21","Jas 1:15","Rev 20:14-15"]},{"a":"all","r":["Rom 3:23","Jas 3:2","1 John 1:8-10"]}],"rom.5.13":[{"a":"until","r":["Gen 4:7-11","Gen 6:5-6,11","Gen 8:21","Gen 13:13","Gen 18:20","Gen 19:4,32,36","Gen 38:7,10"]},{"a":"but sin","r":["Rom 4:15","1 Cor 15:56","1 John 3:4,14"]}],"rom.5.14":[{"a":"death","r":["Rom 5:17,21","Gen 4:8","Gen 5:5-31","Gen 7:22","Gen 19:25","Exod 1:6","Heb 9:27"]},{"a":"even","r":["Rom 8:20,22","Exod 1:22","Exod 12:29-30","Jonah 4:11"]}],"rom.5.15":[{"a":"But not","r":["Rom 5:16-17,20","Isa 55:8-9","John 3:16","John 4:10"]},{"a":"many","r":["Rom 5:12,18","Dan 12:2","Matt 20:28","Matt 26:28"]},{"a":"much","r":["Eph 2:8"]},{"a":"and the gift","r":["Rom 6:23","2 Cor 9:15","Heb 2:9","1 John 4:9-10","1 John 5:11"]},{"a":"hath","r":["Rom 5:20","Isa 53:11","Isa 55:7","1 John 2:2","Rev 7:9-10,14-17"]}],"rom.5.16":[{"a":"for the","r":["Gen 3:6-19","Gal 3:10","Jas 2:10"]},{"a":"but the free","r":["Isa 1:18","Isa 43:25","Isa 44:22","Luke 7:47-50","Acts 13:38-39","1 Cor 6:9-11","1 Tim 1:13-16"]}],"rom.5.17":[{"a":"For if","r":["Rom 5:12","Gen 3:6,19","1 Cor 15:21-22,49"]},{"a":"abundance","r":["Rom 5:20","John 10:10","1 Tim 1:14"]},{"a":"gift","r":["Rom 6:23","Isa 61:10","Phil 3:9"]},{"a":"shall reign","r":["Rom 8:39","Matt 25:34","1 Cor 4:8","2 Tim 2:12","Jas 2:5","1 Pet 2:9","Rev 1:6","Rev 3:21","Rev 5:9-10","Rev 20:4,6","Rev 22:5"]}],"rom.5.18":[{"a":"upon","r":["Rom 5:12,15,19","Rom 3:19-20"]},{"a":"the righteousness","r":["Rom 3:21-22","2 Pet 1:1"]},{"a":"all men","r":["John 1:7","John 3:26","John 12:32","Acts 13:39","1 Cor 15:22","1 Tim 2:4-6","Heb 2:9","1 John 2:20"]}],"rom.5.19":[{"a":"so by","r":["Isa 53:10-12","Dan 9:24","2 Cor 5:21","Eph 1:6","Rev 7:9-17"]}],"rom.5.2":[{"a":"By whom","r":["John 10:7,9","John 14:6","Acts 14:27","Eph 2:18","Eph 3:12","Heb 10:19-20","1 Pet 3:18"]},{"a":"wherein","r":["Rom 5:9-10","Rom 8:1,30-39","Rom 14:4","John 5:24","1 Cor 15:1","Eph 6:13","1 Pet 1:4"]},{"a":"and rejoice","r":["Rom 5:5","Rom 8:24","Rom 12:12","Rom 15:13","Job 19:25-27","Ps 16:9-11","Ps 17:15","Prov 14:32","2 Thess 2:16","Heb 3:6","Heb 6:18","1 Pet 1:3-9","1 John 3:1-3"]},{"a":"the glory","r":["Rom 2:7","Rom 3:23","Rom 8:17-18","Exod 33:18-20","Ps 73:24","Matt 25:21","John 5:24","2 Cor 3:18","2 Cor 4:17","Rev 3:21","Rev 21:3,11,23","Rev 22:4-5"]}],"rom.5.20":[{"a":"the law","r":["Rom 3:19-20","Rom 4:15","Rom 6:14","Rom 7:5-13","John 15:22","2 Cor 3:7-9","Gal 3:19-25"]},{"a":"But","r":["Rom 6:1","2 Chr 33:9-13","Ps 25:11","Isa 1:18","Isa 43:24-25","Jer 3:8-14","Ezek 16:52,60-63","Ezek 36:25-32","Mic 7:18-19","Matt 9:13","Luke 7:47","Luke 23:39-43","John 10:10","1 Cor 6:9-11","Eph 1:6-8","Eph 2:1-5","1 Tim 1:13-16","Titus 3:3-7"]}],"rom.5.21":[{"a":"That","r":["Rom 5:14","Rom 6:12,14,16"]},{"a":"grace","r":["John 1:16-17","Titus 2:11","Heb 4:16","1 Pet 5:10"]},{"a":"through","r":["Rom 5:17","Rom 4:13","Rom 8:10","2 Pet 1:1"]},{"a":"unto","r":["Rom 6:23","John 10:28","1 John 2:25","1 John 5:11-13"]}],"rom.5.3":[{"a":"but we","r":["Rom 8:35-37","Matt 5:10-12","Luke 6:22-23","Acts 5:41","2 Cor 11:23-30","2 Cor 12:9-10","Eph 3:13","Phil 1:29","Phil 2:17-18","Jas 1:2-3,12","1 Pet 3:14","1 Pet 4:16-17"]},{"a":"knowing","r":["2 Cor 4:17","Heb 12:10-11"]}],"rom.5.4":[{"a":"patience","r":["Rom 15:4","2 Cor 1:4-6","2 Cor 4:8-12","2 Cor 6:9-10","Jas 1:12","1 Pet 1:6-7","1 Pet 5:10"]},{"a":"and experience","r":["Josh 10:24-25","1 Sam 17:34-37","Ps 27:2-3","Ps 42:4-5","Ps 71:14,18-24","2 Cor 4:8-10","2 Tim 4:16-18"]}],"rom.5.5":[{"a":"hope","r":["Job 27:8","Ps 22:4-5","Isa 28:15-18","Isa 45:16-17","Isa 49:23","Jer 17:5-8","Phil 1:20","2 Thess 2:16","2 Tim 1:12","Heb 6:18-19"]},{"a":"because","r":["Rom 8:14-17,28","Matt 22:36-37","1 Cor 8:3","Heb 8:10-12","1 John 4:19"]},{"a":"shed","r":["Isa 44:3-5","Ezek 36:25","2 Cor 1:22","2 Cor 3:18","2 Cor 4:6","Gal 4:6","Gal 5:22","Eph 1:13","Eph 3:16-19","Eph 4:30","Titus 3:5"]}],"rom.5.6":[{"a":"For","r":["Ezek 16:4-8","Eph 2:1-5","Col 2:13","Titus 3:3-5"]},{"a":"without","r":["Lam 1:6","Dan 11:15"]},{"a":"in due time","r":["Gal 4:4","Heb 9:26","1 Pet 1:20"]},{"a":"Christ","r":["Rom 5:8","Rom 4:25","1 Thess 5:9"]},{"a":"ungodly","r":["Rom 4:5","Rom 11:26","Ps 1:1","1 Tim 1:9","Titus 2:12","2 Pet 2:5-6","2 Pet 3:7","Jude 1:4,15,18"]}],"rom.5.7":[{"a":"scarcely","r":["John 15:13","1 John 3:16"]},{"a":"a good","r":["2 Sam 18:27","Ps 112:5","Acts 11:24"]},{"a":"some","r":["Rom 16:4","2 Sam 18:3","2 Sam 23:14-17"]}],"rom.5.8":[{"a":"commendeth","r":["Rom 5:20","Rom 3:5","John 15:13","Eph 1:6-8","Eph 2:7","1 Tim 1:16"]},{"a":"in that","r":["Isa 53:6","1 Pet 3:18","1 John 3:16","1 John 4:9-10"]}],"rom.5.9":[{"a":"being","r":["Rom 5:1","Rom 3:24-26","Eph 2:13","Heb 9:14,22","1 John 1:7"]},{"a":"we shall","r":["Rom 5:10","Rom 1:18","Rom 8:1,30","John 5:24","1 Thess 1:10"]}],"rom.8.1":[{"a":"no","r":["Rom 4:7-8","Rom 5:1","Rom 7:17,20","Isa 54:17","John 3:18-19","John 5:24","Gal 3:13"]},{"a":"in","r":["Rom 16:7","John 14:20","John 15:4","1 Cor 1:30","1 Cor 15:22","2 Cor 5:17","2 Cor 12:2","Gal 3:28","Phil 3:9"]},{"a":"who","r":["Rom 8:4,14","Gal 5:16,25","Titus 2:11-14"]}],"rom.8.10":[{"a":"if Christ","r":["John 6:56","John 14:20,23","John 15:5","John 17:23","2 Cor 13:5","Eph 3:17","Col 1:27"]},{"a":"the body","r":["Rom 8:11","Rom 5:12","2 Cor 4:11","2 Cor 5:1-4","1 Thess 4:16","Heb 9:27","2 Pet 1:13-14","Rev 14:13"]},{"a":"but","r":["John 4:14","John 6:54","John 11:25-26","John 14:19","1 Cor 15:45","2 Cor 5:6-8","Phil 1:23","Col 3:3-4","Heb 12:23","Rev 7:14-17"]},{"a":"life","r":["Rom 5:21","2 Cor 5:21","Phil 3:9"]}],"rom.8.11":[{"a":"him","r":["Rom 8:9","Rom 4:24-25","Acts 2:24,32-33","Eph 1:19-20","Heb 13:20","1 Pet 1:21"]},{"a":"he that raised","r":["Rom 8:2","Rom 6:4-5","Isa 26:19","Ezek 37:14","John 5:28-29","1 Cor 6:14","1 Cor 15:16,20-22","1 Cor 15:51-57","2 Cor 4:14","Eph 2:5","Phil 3:21","1 Thess 4:14-17","1 Pet 3:18","Rev 1:18","Rev 11:11","Rev 20:11-13"]},{"a":"mortal","r":["Rom 6:12","1 Cor 15:53","2 Cor 4:11","2 Cor 5:4"]},{"a":"dwelleth","r":["Rom 8:9","John 7:38-39","John 14:17"]}],"rom.8.12":[{"a":"we are","r":["Rom 6:2-15","Ps 116:16","1 Cor 6:19-20","1 Pet 4:2-3"]}],"rom.8.13":[{"a":"ye live","r":["Rom 8:1,4-6","Rom 6:21,23","Rom 7:5","Gal 5:19-21","Gal 6:8","Eph 5:3-5","Col 3:5-6","Jas 1:14-15"]},{"a":"but if","r":["Rom 8:2","1 Cor 9:27","Gal 5:24","Eph 4:22","Col 3:5-8","Titus 2:12","1 Pet 2:11"]},{"a":"through","r":["Rom 8:1","Eph 4:30","Eph 5:18","1 Pet 1:22"]}],"rom.8.14":[{"a":"led","r":["Rom 8:5,9","Ps 143:10","Prov 8:20","Isa 48:16-17","Gal 4:6","Gal 5:16,18,22-25","Eph 5:9"]},{"a":"they are","r":["Rom 8:17","2 Cor 6:18","Gal 3:26","Eph 1:5","1 John 3:1","Rev 21:7"]}],"rom.8.15":[{"a":"the spirit","r":["Exod 20:19","Num 17:12","Luke 8:28,37","John 16:8","Acts 2:37","Acts 16:29","1 Cor 2:12","2 Tim 1:7","Heb 2:15","Heb 12:18-24","Jas 2:19","1 John 4:18"]},{"a":"the Spirit","r":["Rom 8:16","Isa 56:5","Jer 3:19","1 Cor 2:12","Gal 4:5-7","Eph 1:5,11-14"]},{"a":"Abba","r":["Mark 14:36","Luke 11:2","Luke 22:42","John 20:17"]}],"rom.8.16":[{"a":"Spirit","r":["Rom 8:23,26","2 Cor 1:22","2 Cor 5:5","Eph 1:13","Eph 4:30","1 John 4:13"]},{"a":"with our","r":["2 Cor 1:12","1 John 3:19-22","1 John 5:10"]}],"rom.8.17":[{"a":"if children","r":["Rom 8:3,29-30","Rom 5:9-10,17","Luke 12:32","Acts 26:18","Gal 3:29","Gal 4:7","Eph 3:6","Titus 3:7","Heb 1:14","Heb 6:17","Jas 2:5","1 Pet 1:4"]},{"a":"heirs of","r":["Matt 25:21","Luke 22:29-30","John 17:24","1 Cor 2:9","1 Cor 3:22-23","Rev 3:21","Rev 21:7"]},{"a":"if so be","r":["Matt 16:24","Luke 24:26","John 12:25-26","Acts 14:22","2 Cor 4:8-12","Phil 1:29","2 Tim 2:10-14"]}],"rom.8.18":[{"a":"I reckon","r":["Matt 5:11-12","Acts 20:24","2 Cor 4:17-18","Heb 11:25-26,35","1 Pet 1:6-7"]},{"a":"the glory","r":["Col 3:4","2 Thess 1:7-12","2 Thess 2:14","1 Pet 1:13","1 Pet 4:13","1 Pet 5:1","1 John 3:2"]}],"rom.8.19":[{"a":"the earnest","r":["Rom 8:23","Phil 1:20"]},{"a":"expectation","r":["Isa 65:17","Acts 3:21","2 Pet 3:11-13","Rev 21:1-5"]},{"a":"the manifestation","r":["Mal 3:17-18","Matt 25:31-46","1 John 3:2"]}],"rom.8.2":[{"a":"For","r":["Rom 3:27","John 8:36"]},{"a":"Spirit","r":["Rom 8:10-11","John 4:10,14","John 6:63","John 7:38-39","1 Cor 15:45","2 Cor 3:6","Rev 11:11","Rev 22:1"]},{"a":"hath","r":["Rom 6:18,22","Ps 51:12","John 8:32","2 Cor 3:17","Gal 2:19","Gal 5:1"]},{"a":"from","r":["Rom 5:21","Rom 7:21,24-25"]}],"rom.8.20":[{"a":"the creature","r":["Rom 8:22","Gen 3:17-19","Gen 5:29","Gen 6:13","Job 12:6-10","Isa 24:5-6","Jer 12:4,11","Jer 14:5-6","Hos 4:3","Joel 1:18"]}],"rom.8.21":[{"a":"Because","r":["2 Pet 3:13"]},{"a":"into the glorious","r":["Rom 8:19","Rev 22:3-5"]}],"rom.8.22":[{"a":"the, etc","r":["Rom 8:20","Mark 16:15","Col 1:23"]},{"a":"groaneth","r":["Ps 48:6","Jer 12:11","John 16:21","Rev 12:2"]}],"rom.8.23":[{"a":"which have","r":["Rom 8:15-16","Rom 5:5","2 Cor 5:5","Gal 5:22-23","Eph 1:14","Eph 5:9"]},{"a":"even we","r":["Rom 8:26","Rom 7:24","2 Cor 5:2-4","2 Cor 7:5","Phil 1:21-23","1 Pet 1:7"]},{"a":"waiting","r":["Rom 8:19,25","Luke 20:36","Phil 3:20-21","2 Tim 4:8","Titus 2:13","Heb 9:28","1 John 3:2"]},{"a":"the redemption","r":["Luke 21:28","Eph 1:14","Eph 4:30"]}],"rom.8.24":[{"a":"saved","r":["Rom 5:2","Rom 12:12","Rom 15:4,13","Ps 33:18,22","Ps 146:5","Prov 14:32","Jer 17:7","Zech 9:12","1 Cor 13:13","Gal 5:5","Col 1:5,23,27","1 Thess 5:8","2 Thess 2:16","Titus 2:11-13","Heb 6:18-19","1 Pet 1:3,21","1 John 3:3"]},{"a":"but hope","r":["2 Cor 4:18","2 Cor 5:7","Heb 11:1","1 Pet 1:10-11"]}],"rom.8.25":[{"a":"with patience","r":["Rom 8:23","Rom 2:7","Rom 12:12","Gen 49:18","Ps 27:14","Ps 37:7-9","Ps 62:1,5-6","Ps 130:5-7","Isa 25:9","Isa 26:8","Lam 3:25-26","Luke 8:15","Luke 21:19","Col 1:11","1 Thess 1:3","2 Thess 3:5","Heb 6:12,15","Heb 10:36","Heb 12:1-3","Jas 1:3-4","Jas 5:7-11","Rev 1:9","Rev 13:10","Rev 14:12"]}],"rom.8.26":[{"a":"infirmities","r":["Rom 15:1","2 Cor 12:5-10","Heb 4:15","Heb 5:2"]},{"a":"for we","r":["Matt 20:22","Luke 11:1-13","Jas 4:3"]},{"a":"but","r":["Rom 8:15","Ps 10:17","Zech 12:10","Matt 10:20","Gal 4:6","Eph 2:18","Eph 6:18","Jude 1:20-21"]},{"a":"with","r":["Rom 7:24","Ps 6:3,9","Ps 42:1-5","Ps 55:1-2","Ps 69:3","Ps 77:1-3","Ps 88:1-3","Ps 102:5,20","Ps 119:81","Ps 119:82","Ps 143:4-7","Luke 22:44","2 Cor 5:2,4","2 Cor 12:8"]}],"rom.8.27":[{"a":"And he","r":["1 Chr 28:9","1 Chr 29:17","Ps 7:9","Ps 44:21","Prov 17:3","Jer 11:20","Jer 17:10","Jer 20:12","Matt 6:8","John 21:17","Acts 1:24","Acts 15:8","1 Thess 2:4","Heb 4:13","Rev 2:23"]},{"a":"knoweth","r":["Ps 38:9","Ps 66:18-19","Jas 5:16"]},{"a":"he maketh","r":["Rom 8:34","Eph 2:18"]},{"a":"according","r":["Jer 29:12-13","John 14:13","Jas 1:5-6","1 John 3:21-22","1 John 5:14-15"]}],"rom.8.28":[{"a":"we know","r":["Rom 8:35-39","Rom 5:3-4","Gen 50:20","Deut 8:2-3,16","Ps 46:1-2","Jer 24:5-7","Zech 13:9","2 Cor 4:15-17","2 Cor 5:1","Phil 1:19-23","2 Thess 1:5-7","Heb 12:6-12","Jas 1:3-4","1 Pet 1:7-8","Rev 3:19"]},{"a":"them","r":["Rom 5:5","Exod 20:6","Deut 6:5","Neh 1:5","Ps 69:36","Mark 12:30","1 Cor 2:9","Jas 1:12","Jas 2:5","1 John 4:10,19","1 John 5:2-3"]},{"a":"the called","r":["Rom 8:30","Rom 1:6-7","Rom 9:11,23-24","Jer 51:29","Acts 13:48","Gal 1:15","Eph 1:9-10","Eph 3:11","1 Thess 5:9","2 Thess 2:13-14","2 Tim 2:19","1 Pet 5:10"]}],"rom.8.29":[{"a":"whom","r":["Rom 11:2","Exod 33:12,17","Ps 1:6","Jer 1:5","Matt 7:23","2 Tim 2:19","1 Pet 1:2","Rev 13:8"]},{"a":"he also","r":["Eph 1:5,11","1 Pet 1:20"]},{"a":"to be","r":["Rom 13:14","John 17:16,19,22-23,26","1 Cor 15:49","2 Cor 3:18","Eph 1:4","Eph 4:24","Phil 3:21","1 John 3:2"]},{"a":"that he might","r":["Ps 89:27","Matt 12:50","Matt 25:40","John 20:17","Col 1:15-18","Heb 1:5-6","Heb 2:11-15","Rev 1:5-6"]}],"rom.8.3":[{"a":"For what","r":["Rom 3:20","Rom 7:5-11","Acts 13:39","Gal 3:21","Heb 7:18-19","Heb 10:1-10,14"]},{"a":"God","r":["Rom 8:32","John 3:14-17","Gal 4:4-5","1 John 4:10-14"]},{"a":"in the","r":["Rom 9:3","Mark 15:27-28","John 9:24"]},{"a":"for sin","r":["2 Cor 5:21","Gal 3:13"]},{"a":"condemned","r":["Rom 6:6","1 Pet 2:24","1 Pet 4:1-2"]}],"rom.8.30":[{"a":"Moreover","r":["Rom 8:28","Rom 1:6","Rom 9:23-24","Isa 41:9","1 Cor 1:2,9","Eph 4:4","Heb 9:15","1 Pet 2:9","2 Pet 1:10","Rev 17:14","Rev 19:9"]},{"a":"he called","r":["Rom 3:22-26","1 Cor 6:11","Titus 3:4-7"]},{"a":"he justified","r":["Rom 8:1,17-18,33-35","Rom 5:8-10","John 5:24","John 6:39-40","John 17:22,24","2 Cor 4:17","Eph 2:6","Col 3:4","1 Thess 2:12","2 Thess 1:10-12","2 Thess 2:13-14","2 Tim 2:11","Heb 9:15","1 Pet 3:9","1 Pet 4:13-14","1 Pet 5:10"]}],"rom.8.31":[{"a":"What","r":["Rom 4:1"]},{"a":"If","r":["Gen 15:1","Num 14:9","Deut 33:29","Josh 10:42","1 Sam 14:6","1 Sam 17:45-47","Ps 27:1-3","Ps 46:1-3,7,11","Ps 56:4,11","Ps 84:11-12","Ps 118:6","Isa 50:7-9","Isa 54:17","Jer 1:19","Jer 20:11","John 10:28-30","1 John 4:4"]}],"rom.8.32":[{"a":"that","r":["Rom 5:6-10","Rom 11:21","Gen 22:12","Isa 53:10","Matt 3:17","John 3:16","2 Cor 5:21","2 Pet 2:4-5","1 John 4:10"]},{"a":"delivered","r":["Rom 4:25"]},{"a":"how","r":["Rom 8:28","Rom 6:23","Ps 84:11","1 Cor 2:12","1 Cor 3:21-23","2 Cor 4:15","Rev 21:7"]}],"rom.8.33":[{"a":"Who","r":["Rom 8:1","Job 1:9-11","Job 2:4-6","Job 22:6-30","Job 34:8-9","Job 42:7-9","Ps 35:11","Isa 54:17","Zech 3:1-4","Rev 12:10-11"]},{"a":"of God's","r":["Isa 42:1","Matt 24:24","Luke 18:7","1 Thess 1:4","Titus 1:1","1 Pet 1:2"]},{"a":"It is","r":["Rom 3:26","Isa 50:8-9","Gal 3:8","Rev 12:10-11"]}],"rom.8.34":[{"a":"Who","r":["Rom 8:1","Rom 14:13","Job 34:29","Ps 37:33","Ps 109:31","Jer 50:20"]},{"a":"It is Christ","r":["Rom 4:25","Rom 5:6-10","Rom 14:9","Job 33:24","Matt 20:28","John 14:19","Gal 3:13-14","Heb 1:3","Heb 9:10-14","Heb 10:10-14,19-22","Heb 12:2","1 Pet 3:18","Rev 1:18"]},{"a":"who is even","r":["Mark 16:19","Acts 7:56-60","Col 3:1","Heb 8:1-2","Heb 12:1","1 Pet 3:22"]},{"a":"who also","r":["Rom 8:27","Isa 53:12","John 16:23,26-27","John 17:20-24","Heb 4:14-15","Heb 7:25","Heb 9:24","1 John 2:1-2"]}],"rom.8.35":[{"a":"shall separate","r":["Rom 8:39","Ps 103:17","Jer 31:3","John 10:28","John 13:1","2 Thess 2:13-14,16","Rev 1:5"]},{"a":"shall tribulation","r":["Rom 8:17","Rom 5:3-5","Matt 5:10-12","Matt 10:28-31","Luke 21:12-18","John 16:33","Acts 14:22","Acts 20:23-24","2 Cor 4:17","2 Cor 6:4-10","2 Cor 11:23-27","2 Tim 1:12","2 Tim 4:16-18","Heb 12:3-11","Jas 1:2-4","1 Pet 1:5-7","1 Pet 4:12-14","Rev 7:14-17"]}],"rom.8.36":[{"a":"For thy","r":["Ps 44:22","Ps 141:7","John 16:2","1 Cor 15:30","2 Cor 4:11"]},{"a":"as sheep","r":["Isa 53:7","Jer 11:19","Jer 12:3","Jer 51:40","Acts 8:32"]}],"rom.8.37":[{"a":"Nay","r":["2 Chr 20:25-27","Isa 25:8","1 Cor 15:54,57","2 Cor 2:14","2 Cor 12:9,19","1 John 4:4","1 John 5:4-5","Rev 7:9-10","Rev 11:7-12","Rev 12:11","Rev 17:14","Rev 21:7"]},{"a":"him","r":["Gal 2:20","Eph 5:2,25-27","2 Thess 2:16","1 John 4:10,19","Jude 1:24","Rev 1:5"]}],"rom.8.38":[{"a":"For I","r":["Rom 4:21","2 Cor 4:13","2 Tim 1:12","Heb 11:13"]},{"a":"that","r":["Rom 14:8","John 10:28","1 Cor 3:22-23","1 Cor 15:54-58","2 Cor 5:4-8","Phil 1:20-23"]},{"a":"nor","r":["2 Cor 11:14","Eph 1:21","Eph 6:11-12","Col 1:16","Col 2:15","1 Pet 3:22","1 Pet 5:8-10"]}],"rom.8.39":[{"a":"Nor","r":["Eph 3:18-19"]},{"a":"height","r":["Exod 9:16-17","Ps 93:3-4","Isa 10:10-14,33","Isa 24:21","Dan 4:11","Dan 5:18-23","2 Thess 2:4","Rev 13:1-8"]},{"a":"depth","r":["Rom 11:33","Ps 64:6","Prov 20:5","Matt 24:24","2 Cor 2:11","2 Cor 11:3","2 Thess 2:9-12","Rev 2:24","Rev 12:9","Rev 13:14","Rev 19:20","Rev 20:3,7"]},{"a":"shall be","r":["John 10:28-30","Col 3:3-4"]},{"a":"love","r":["Rom 8:35","Rom 5:8","John 3:16","John 16:27","John 17:26","Eph 1:4","Eph 2:4-7","Titus 3:4-7","1 John 4:9-10,16,19"]}],"rom.8.4":[{"a":"That","r":["Gal 5:22-24","Eph 5:26-27","Col 1:22","Heb 12:23","1 John 3:2","Jude 1:24","Rev 14:5"]}],"rom.8.5":[{"a":"For they","r":["Rom 8:12-13","John 3:6","1 Cor 15:48","2 Cor 10:3","2 Pet 2:10"]},{"a":"mind","r":["Rom 8:6-7","Mark 8:33","1 Cor 2:14","Phil 3:18-19"]},{"a":"of the Spirit","r":["Rom 8:9,14","1 Cor 2:14","Gal 5:22-25","Eph 5:9","Col 3:1-3"]}],"rom.8.6":[{"a":"to be carnally minded","r":["Rom 8:7,13","Rom 6:21,23","Rom 7:5,11","Rom 13:14","Gal 6:8","Jas 1:14-15"]},{"a":"to be spiritually minded","r":["Rom 5:1,10","Rom 14:17","John 14:6,27","John 17:5","Gal 5:22"]}],"rom.8.7":[{"a":"the carnal mind","r":["Rom 1:28,30","Rom 5:10","Exod 20:5","2 Chr 19:2","Ps 53:1","John 7:7","John 15:23-24","Eph 4:18-19","Col 1:21","2 Tim 3:4","Jas 4:4","1 John 2:15-16"]},{"a":"for it","r":["Rom 8:4","Rom 3:31","Rom 7:7-14,22","Matt 5:19","1 Cor 9:21","Gal 5:22-23","Heb 8:10"]},{"a":"neither","r":["Jer 13:23","Matt 12:34","1 Cor 2:14","2 Pet 2:14"]}],"rom.8.8":[{"a":"they that","r":["Rom 8:9","Rom 7:5","John 3:3,5-6"]},{"a":"please","r":["Matt 3:17","John 8:29","1 Cor 7:32","Phil 4:18","Col 1:10","Col 3:20","1 Thess 4:1","Heb 11:5-6","Heb 13:16,21","1 John 3:22"]}],"rom.8.9":[{"a":"But ye","r":["Rom 8:2","Ezek 11:19","Ezek 36:26-27","John 3:6"]},{"a":"if so be","r":["Rom 8:11","Luke 11:13","1 Cor 3:16","1 Cor 6:19","2 Cor 6:16","Gal 4:6","Eph 1:13,17-18","Eph 2:22","2 Tim 1:14","1 John 3:24","1 John 4:4","Jude 1:19-21"]},{"a":"the Spirit","r":["John 3:34","Gal 4:6","Phil 1:19","1 Pet 1:11"]},{"a":"he is","r":["John 17:9-10","1 Cor 3:21-23","1 Cor 15:23","2 Cor 10:7","Gal 5:24","Rev 13:8","Rev 20:15"]}]};

async function openCrossRefs(key) {
  let refs = await storage.getCrossRefs(key);
  let tskGroups = await storage.getTskForVerse(key); // full pack if installed
  if (!tskGroups || !tskGroups.length) {
    tskGroups = STARTER_TSK[key] || [];
  }
  const hasTsk = tskGroups && tskGroups.length > 0;

  function renderPersonalHtml(items) {
    if (!items.length) {
      if (hasTsk) return '<p style="color:var(--text-dim);font-size:0.9em;margin-bottom:0.6rem">No personal cross-references yet. Phrase-level TSK groups appear below.</p>';
      return '<p style="color:var(--text-dim)">No cross-references yet. Import the TSK pack (Menu) or add one below.</p>';
    }
    return items.map((r, i) => `
      <div class="xref-row" style="display:flex;gap:0.4rem;margin-bottom:0.45rem;align-items:stretch">
        <button type="button" class="xref-item" data-target="${escapeHtml(r.target)}" data-idx="${i}"
          style="flex:1;text-align:left">${escapeHtml(r.label || r.target)}</button>
        <button type="button" class="xref-del" data-idx="${i}" title="Delete"
          style="flex:0 0 auto;min-width:52px;min-height:48px;background:#8b2e2e;color:#fff;font-weight:700">✕</button>
      </div>
    `).join('');
  }

  function renderTskHtml(groups) {
    if (!groups || !groups.length) return '';
    return groups.map((g, gi) => {
      const anchor = escapeHtml(g.a || g.anchor || '');
      const list = (g.r || g.refs || []).map((refStr, ri) => {
        const safe = escapeHtml(refStr);
        return `<button type="button" class="tsk-ref" data-ref="${safe}" data-gi="${gi}" data-ri="${ri}"
          style="display:block;width:100%;text-align:left;margin:0.25rem 0;padding:0.55rem 0.7rem;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.95em">${safe}</button>`;
      }).join('');
      return `<div style="margin:0.9rem 0 0.4rem">
        <div style="font-size:0.85em;color:var(--accent);font-weight:600;margin-bottom:0.25rem">“${anchor}”</div>
        ${list}
      </div>`;
    }).join('');
  }

  const overlay = showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>Cross-references</h2>
      <div id="xref-list">${renderPersonalHtml(refs)}</div>
      ${hasTsk ? `<hr style="border-color:var(--border);margin:1rem 0">
        <div style="font-size:0.9em;color:var(--text-dim);margin-bottom:0.4rem">TSK phrase anchors (tap a reference to open; long-press or use “Add” to keep it in your personal list)</div>
        <div id="tsk-list">${renderTskHtml(tskGroups)}</div>` : ''}
      <hr style="border-color:var(--border);margin:1rem 0">
      <label style="display:block;margin-bottom:0.4rem">Add new (e.g. jhn.3.16 or John 3:16)</label>
      <input type="text" id="new-xref" placeholder="book.chapter.verse or Book ch:vs"
        style="width:100%;padding:0.7rem;font-size:1.1rem;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
      <button type="button" id="add-xref" style="width:100%;margin-top:0.6rem">Add Cross-ref</button>
      ${navStack.length ? '<button type="button" id="xref-back" style="width:100%;margin-top:0.6rem">← Back to previous</button>' : ''}
    </div>
  `);
  $('.close', overlay).onclick = async () => {
    closeOverlay(overlay);
    if (currentBookId) await renderChapter(currentBookId, currentChapter, { scrollToKey: key });
  };

  function bindList() {
    $$('.xref-item', overlay).forEach(btn => {
      btn.onclick = async () => {
        const main = document.getElementById('main');
        const book = await storage.getBook(currentBookId);
        const label = book ? `${book.name} ${currentChapter}` : `${currentBookId} ${currentChapter}`;
        navStack.push({
          bookId: currentBookId,
          chapter: currentChapter,
          verseKey: key,
          scrollTop: main ? main.scrollTop : 0,
          label
        });
        updateNavBackButton();
        closeOverlay(overlay);
        await jumpToRef(btn.dataset.target);
      };
    });
    $$('.xref-del', overlay).forEach(btn => {
      btn.onclick = async () => {
        const idx = +btn.dataset.idx;
        if (!confirm('Delete this cross-reference?')) return;
        refs.splice(idx, 1);
        await storage.setCrossRefs(key, refs);
        $('#xref-list', overlay).innerHTML = renderPersonalHtml(refs);
        bindList();
      };
    });
    // TSK taps: open the reference (and optionally offer to keep)
    $$('.tsk-ref', overlay).forEach(btn => {
      btn.onclick = async () => {
        const refStr = btn.dataset.ref;
        const parsed = parseUserRef(refStr);
        if (!parsed) {
          // try a looser parse for ranges like "John 1:1-3"
          const m = refStr.match(/^([1-3]?\s*[A-Za-z]+)\s+(\d+)\s*:\s*(\d+)/);
          if (m) {
            const abbrev = simpleAbbrev(m[1].trim());
            if (abbrev) {
              const target = `${abbrev}.${m[2]}.${m[3]}`;
              const main = document.getElementById('main');
              navStack.push({
                bookId: currentBookId,
                chapter: currentChapter,
                verseKey: key,
                scrollTop: main ? main.scrollTop : 0,
                label: `${currentBookId} ${currentChapter}`
              });
              updateNavBackButton();
              closeOverlay(overlay);
              await jumpToRef(target);
              return;
            }
          }
          alert('Could not open “' + refStr + '”. Try adding it manually.');
          return;
        }
        const main = document.getElementById('main');
        navStack.push({
          bookId: currentBookId,
          chapter: currentChapter,
          verseKey: key,
          scrollTop: main ? main.scrollTop : 0,
          label: `${currentBookId} ${currentChapter}`
        });
        updateNavBackButton();
        closeOverlay(overlay);
        await jumpToRef(parsed.key);
      };
      // double-tap / long-press alternative: add to personal list
      btn.ondblclick = async (e) => {
        e.preventDefault();
        const refStr = btn.dataset.ref;
        const parsed = parseUserRef(refStr) || (() => {
          const m = refStr.match(/^([1-3]?\s*[A-Za-z]+)\s+(\d+)\s*:\s*(\d+)/);
          if (!m) return null;
          const abbrev = simpleAbbrev(m[1].trim());
          return abbrev ? { key: `${abbrev}.${m[2]}.${m[3]}`, label: refStr } : null;
        })();
        if (!parsed) return;
        if (refs.some(r => r.target === parsed.key)) return;
        refs.push({ target: parsed.key, label: parsed.label || refStr });
        await storage.setCrossRefs(key, refs);
        $('#xref-list', overlay).innerHTML = renderPersonalHtml(refs);
        bindList();
      };
    });
  }
  bindList();

  $('#add-xref', overlay).onclick = async () => {
    const raw = $('#new-xref', overlay).value.trim();
    if (!raw) return;
    const parsed = parseUserRef(raw);
    if (!parsed) {
      alert('Could not parse reference. Try format like “jhn.3.16” or “John 3:16”.');
      return;
    }
    refs.push({ target: parsed.key, label: parsed.label });
    await storage.setCrossRefs(key, refs);
    $('#new-xref', overlay).value = '';
    $('#xref-list', overlay).innerHTML = renderPersonalHtml(refs);
    bindList();
  };

  const backBtn = $('#xref-back', overlay);
  if (backBtn) {
    backBtn.onclick = async () => {
      const prev = navStack.pop();
      closeOverlay(overlay);
      if (prev) await renderChapter(prev.bookId, prev.chapter);
    };
  }
}

function parseUserRef(raw) {
  // Accept "jhn.3.16" or "John 3:16" / "Gen 1:1"
  let m = raw.match(/^([a-z0-9]+)\.(\d+)\.(\d+)$/i);
  if (m) {
    return { key: `${m[1].toLowerCase()}.${m[2]}.${m[3]}`, label: raw };
  }
  m = raw.match(/^([1-3]?\s*[A-Za-z]+)\s+(\d+)\s*:\s*(\d+)$/);
  if (m) {
    const abbrev = simpleAbbrev(m[1].trim());
    if (abbrev) return { key: `${abbrev}.${m[2]}.${m[3]}`, label: raw };
  }
  return null;
}

function simpleAbbrev(name) {
  const map = {
    'genesis':'gen','gen':'gen',
    'exodus':'exo','exo':'exo','exod':'exo',
    'leviticus':'lev','lev':'lev',
    'numbers':'num','num':'num',
    'deuteronomy':'deu','deut':'deu','deu':'deu',
    'joshua':'jos','josh':'jos','jos':'jos',
    'judges':'jdg','judg':'jdg','jdg':'jdg',
    'ruth':'rut','rut':'rut',
    '1 samuel':'1sa','1 sam':'1sa','1sa':'1sa',
    '2 samuel':'2sa','2 sam':'2sa','2sa':'2sa',
    '1 kings':'1ki','1 kgs':'1ki','1ki':'1ki',
    '2 kings':'2ki','2 kgs':'2ki','2ki':'2ki',
    '1 chronicles':'1ch','1 chr':'1ch','1ch':'1ch',
    '2 chronicles':'2ch','2 chr':'2ch','2ch':'2ch',
    'ezra':'ezr','ezr':'ezr',
    'nehemiah':'neh','neh':'neh',
    'esther':'est','esth':'est','est':'est',
    'job':'job',
    'psalm':'psa','psalms':'psa','ps':'psa','psa':'psa',
    'proverbs':'pro','prov':'pro','pro':'pro',
    'ecclesiastes':'ecc','eccl':'ecc','ecc':'ecc',
    'song of solomon':'sng','song':'sng','sng':'sng',
    'isaiah':'isa','isa':'isa',
    'jeremiah':'jer','jer':'jer',
    'lamentations':'lam','lam':'lam',
    'ezekiel':'eze','ezek':'eze','eze':'eze',
    'daniel':'dan','dan':'dan',
    'hosea':'hos','hos':'hos',
    'joel':'jol','jol':'jol',
    'amos':'amo','amo':'amo',
    'obadiah':'oba','obad':'oba','oba':'oba',
    'jonah':'jon','jon':'jon',
    'micah':'mic','mic':'mic',
    'nahum':'nam','nah':'nam','nam':'nam',
    'habakkuk':'hab','hab':'hab',
    'zephaniah':'zep','zeph':'zep','zep':'zep',
    'haggai':'hag','hag':'hag',
    'zechariah':'zec','zech':'zec','zec':'zec',
    'malachi':'mal','mal':'mal',
    'matthew':'mat','matt':'mat','mat':'mat',
    'mark':'mrk','mrk':'mrk',
    'luke':'luk','luk':'luk',
    'john':'jhn','jhn':'jhn','jn':'jhn',
    'acts':'act','act':'act',
    'romans':'rom','rom':'rom',
    '1 corinthians':'1co','1 cor':'1co','1co':'1co',
    '2 corinthians':'2co','2 cor':'2co','2co':'2co',
    'galatians':'gal','gal':'gal',
    'ephesians':'eph','eph':'eph',
    'philippians':'php','phil':'php','php':'php',
    'colossians':'col','col':'col',
    '1 thessalonians':'1th','1 thess':'1th','1th':'1th',
    '2 thessalonians':'2th','2 thess':'2th','2th':'2th',
    '1 timothy':'1ti','1 tim':'1ti','1ti':'1ti',
    '2 timothy':'2ti','2 tim':'2ti','2ti':'2ti',
    'titus':'tit','tit':'tit',
    'philemon':'phm','phlm':'phm','phm':'phm',
    'hebrews':'heb','heb':'heb',
    'james':'jas','jas':'jas',
    '1 peter':'1pe','1 pet':'1pe','1pe':'1pe',
    '2 peter':'2pe','2 pet':'2pe','2pe':'2pe',
    '1 john':'1jn','1 jn':'1jn','1jn':'1jn',
    '2 john':'2jn','2 jn':'2jn','2jn':'2jn',
    '3 john':'3jn','3 jn':'3jn','3jn':'3jn',
    'jude':'jud','jud':'jud',
    'revelation':'rev','rev':'rev'
  };
  return map[name.toLowerCase()] || name.toLowerCase().replace(/\s+/g, '').slice(0, 3);
}

async function jumpToRef(targetKey) {
  const { bookId, chapter, verse } = bible.parseKey(targetKey);
  // If the target book is not loaded, just inform the user
  if (!books.find(b => b.id === bookId)) {
    alert(`Book “${bookId}” is not loaded yet. Import it first, then the cross-reference will work.`);
    // undo stack push if we cannot complete the jump
    if (navStack.length) navStack.pop();
    updateNavBackButton();
    return;
  }
  await renderChapter(bookId, chapter, { scrollToKey: targetKey });
  updateNavBackButton();
  setTimeout(() => {
    const t = document.getElementById('v-' + targetKey.replace(/\./g, '-'));
    if (t) {
      t.scrollIntoView({ behavior: 'smooth', block: 'center' });
      t.style.outline = '2px solid var(--accent)';
      setTimeout(() => { t.style.outline = ''; }, 2500);
    }
  }, 80);
}

// ---------- Search (sticky header + hierarchical book → verse) ----------
function openSearch() {
  const overlay = showOverlay(`
    <div class="panel search-panel">
      <div class="search-header">
        <div class="search-header-top">
          <h2 class="search-title">Search (loaded books only)</h2>
          <button type="button" class="close search-close" aria-label="Close">×</button>
        </div>
        <input type="search" class="search-box" id="search-input" placeholder="Type at least 2 characters…" autocomplete="off" enterkeyhint="search">
      </div>
      <div id="search-results" class="search-body"></div>
    </div>
  `);
  $('.search-close', overlay).onclick = () => closeOverlay(overlay);

  const input = $('#search-input', overlay);
  const resultsEl = $('#search-results', overlay);
  let timer = null;
  let lastResults = [];   // flat matches from last search
  let viewMode = 'books'; // 'books' | 'verses'
  let selectedBookId = null;

  // Canonical order index for stable sorting
  const canonIndex = new Map(bible.CANONICAL_BOOKS.map((b, i) => [b.id, i]));

  function groupByBook(results) {
    const map = new Map();
    for (const r of results) {
      if (!map.has(r.bookId)) {
        map.set(r.bookId, { bookId: r.bookId, bookName: r.bookName, matches: [] });
      }
      map.get(r.bookId).matches.push(r);
    }
    // Sort groups by canonical order; verses already in chapter/verse order from search
    return Array.from(map.values()).sort((a, b) => {
      const ia = canonIndex.has(a.bookId) ? canonIndex.get(a.bookId) : 999;
      const ib = canonIndex.has(b.bookId) ? canonIndex.get(b.bookId) : 999;
      return ia - ib;
    });
  }

  function bindVerseClicks(container) {
    $$('.search-result', container).forEach(row => {
      row.onclick = async () => {
        // Push origin so the chrome ← Back can return to this chapter/verse
        // (same pattern as Cross-ref jumps in openCrossRefs).
        if (currentBookId) {
          const main = document.getElementById('main');
          const book = books.find(b => b.id === currentBookId);
          const label = book ? `${book.name} ${currentChapter}` : `${currentBookId} ${currentChapter}`;
          navStack.push({
            bookId: currentBookId,
            chapter: currentChapter,
            verseKey: getNearestVerseKey() || null,
            scrollTop: main ? main.scrollTop : 0,
            label
          });
          updateNavBackButton();
        }
        closeOverlay(overlay);
        await jumpToRef(row.dataset.key);
      };
    });
  }

  function renderBookList() {
    viewMode = 'books';
    selectedBookId = null;
    const groups = groupByBook(lastResults);
    if (!groups.length) {
      const q = input.value.trim();
      resultsEl.innerHTML = q.length >= 2 ? '<p style="color:var(--text-dim);padding:0.5rem 0">No matches.</p>' : '';
      return;
    }
    resultsEl.innerHTML = groups.map(g => `
      <div class="search-book-row" data-book-id="${escapeHtml(g.bookId)}" role="button" tabindex="0">
        <span class="book-name">${escapeHtml(g.bookName)}</span>
        <span class="match-count">${g.matches.length}</span>
      </div>
    `).join('');
    $$('.search-book-row', resultsEl).forEach(row => {
      const go = () => {
        selectedBookId = row.dataset.bookId;
        renderVerseList();
      };
      row.onclick = go;
      row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
  }

  function renderVerseList() {
    viewMode = 'verses';
    const groups = groupByBook(lastResults);
    const group = groups.find(g => g.bookId === selectedBookId);
    if (!group) {
      renderBookList();
      return;
    }
    const verseHtml = group.matches.map(r => `
      <div class="search-result" data-key="${r.key}">
        <span class="ref">${escapeHtml(r.bookName)} ${r.chapter}:${r.verse}</span>
        ${escapeHtml(r.snippet)}
      </div>
    `).join('');
    resultsEl.innerHTML = `
      <div class="search-back-row">
        <button type="button" class="search-back-btn" id="search-back">← Back to books</button>
      </div>
      <p style="font-size:0.9em;color:var(--text-dim);margin:0 0 0.5rem">${escapeHtml(group.bookName)} · ${group.matches.length} match${group.matches.length === 1 ? '' : 'es'}</p>
      ${verseHtml}
    `;
    $('#search-back', resultsEl).onclick = () => renderBookList();
    bindVerseClicks(resultsEl);
  }

  input.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      lastResults = await bible.searchBooks(q, books);
      // Any new search returns to book-list view
      renderBookList();
    }, 220);
  };

  setTimeout(() => { try { input.focus(); } catch (_) {} }, 100);
}


// ---------- Menu (Import, Settings, About) ----------
function openMenu() {
  const overlay = showOverlay(`
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem">
        <h2 style="margin:0;border:none;padding:0">Menu</h2>
        <button type="button" class="close" style="float:none;min-width:52px;min-height:52px;font-size:1.5rem">×</button>
      </div>
      <button type="button" id="menu-help" style="width:100%;margin-bottom:0.5rem;min-height:52px">Help / How to use</button>
      <button type="button" id="menu-export" style="width:100%;margin-bottom:0.5rem;min-height:52px">Export study data</button>
      <button type="button" id="menu-import-data" style="width:100%;margin-bottom:0.5rem;min-height:52px">Import study data</button>
      <button type="button" id="menu-import-lex" style="width:100%;margin-bottom:0.5rem;min-height:52px">Import Dictionary (Strong's)</button>
      <button type="button" id="menu-import-tsk" style="width:100%;margin-bottom:0.5rem;min-height:52px">Load More Cross-References (optional)</button>
      <button type="button" id="menu-import" style="width:100%;margin-bottom:0.5rem;min-height:52px">Import Book (JSON)</button>
      <button type="button" id="menu-settings" style="width:100%;margin-bottom:0.5rem;min-height:52px">Settings</button>
      <button type="button" id="menu-about" style="width:100%;margin-bottom:0.5rem;min-height:52px">About / Privacy</button>
      <button type="button" id="menu-lock" style="width:100%;margin-bottom:0.5rem;min-height:52px">Lock app (require password)</button>
      <button type="button" id="menu-clear-sample" style="width:100%;margin-bottom:0.5rem;min-height:52px;color:var(--danger)">Remove sample book</button>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);
  $('#menu-help', overlay).onclick = () => { closeOverlay(overlay); openHelp(); };
  $('#menu-export', overlay).onclick = () => { closeOverlay(overlay); doExportData(); };
  $('#menu-import-data', overlay).onclick = () => { closeOverlay(overlay); openImportData(); };
  $('#menu-import-lex', overlay).onclick = () => { closeOverlay(overlay); openImportLexicon(); };
  $('#menu-import-tsk', overlay).onclick = () => { closeOverlay(overlay); openImportTsk(); };
  $('#menu-import', overlay).onclick = () => { closeOverlay(overlay); openImport(); };
  $('#menu-settings', overlay).onclick = () => { closeOverlay(overlay); openSettings(); };
  $('#menu-about', overlay).onclick = () => { closeOverlay(overlay); openAbout(); };
  $('#menu-force-refresh', overlay).onclick = async () => {
    closeOverlay(overlay);
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (_) {}
    location.reload(true);
  };
  $('#menu-lock', overlay).onclick = () => {
    localStorage.removeItem('kjv-unlocked');
    location.reload();
  };
  $('#menu-clear-sample', overlay).onclick = async () => {
    if (confirm('Remove the public-domain sample Genesis book? Your highlights/notes for it will remain in storage but the text will be gone until re-imported.')) {
      await storage.deleteBook('gen');
      books = await storage.getAllBooks();
      closeOverlay(overlay);
      if (books.length) {
        currentBookId = books[0].id;
        currentChapter = 1;
        await renderChapter(currentBookId, currentChapter);
      } else {
        currentBookId = null;
        showEmptyState();
      }
    }
  };
}

function openImport() {
  const overlay = showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>Import Book</h2>
      <p style="margin-bottom:0.8rem;font-size:0.95em;line-height:1.5">
        Select a JSON file matching the required schema (one book or multiple).
        The file never leaves this device.
      </p>
      <div class="import-zone">
        <p>Choose .json file</p>
        <input type="file" id="file-input" accept=".json,application/json">
      </div>
      <details style="margin-top:1rem">
        <summary style="cursor:pointer;padding:0.5rem 0">JSON schema (tap to expand)</summary>
        <pre style="font-size:0.8rem;overflow:auto;background:var(--bg);padding:0.8rem;border-radius:8px;margin-top:0.5rem;white-space:pre-wrap">{
  "id": "gen",
  "name": "Genesis",
  "abbrev": "Gen",
  "testament": "OT",
  "chapters": [
    {
      "number": 1,
      "verses": [
        { "number": 1, "text": "In the beginning…" }
      ]
    }
  ]
}</pre>
      </details>
      <p style="margin-top:1rem;font-size:0.9em;color:var(--text-dim)">
        You may also wrap multiple books: <code>{ "books": [ … ] }</code>
      </p>
    </div>
  `, { center: true });
  $('.close', overlay).onclick = () => closeOverlay(overlay);
  $('#file-input', overlay).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const imported = await bible.importBookJSON(json);
      books = await storage.getAllBooks();
      closeOverlay(overlay);
      alert(`Imported ${imported.length} book(s) successfully.`);
      if (imported.length) {
        // Stay on current book if still available; otherwise open first imported
        const stillHere = currentBookId && books.find(b => b.id === currentBookId);
        if (!stillHere) {
          currentBookId = imported[0].id;
          currentChapter = 1;
        }
        await renderChapter(currentBookId, currentChapter);
      }
    } catch (err) {
      console.error('Import failed', err);
      alert('Import failed: ' + (err.message || err) + '\n\nYour existing books and notes are unchanged.');
    }
  };
}

function openSettings() {
  const overlay = showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>Settings</h2>
      <div class="settings-row">
        <label>Font size</label>
        <div class="font-controls">
          <button type="button" id="set-font-down">A−</button>
          <span id="font-val">${settings.fontSize.toFixed(2)}</span>
          <button type="button" id="set-font-up">A+</button>
        </div>
      </div>
      <div class="settings-row">
        <label>Line spacing</label>
        <div class="font-controls">
          <button type="button" id="set-lh-down">−</button>
          <span id="lh-val">${settings.lineHeight.toFixed(2)}</span>
          <button type="button" id="set-lh-up">+</button>
        </div>
      </div>
      <div class="settings-row">
        <label for="hc-toggle">High contrast</label>
        <input type="checkbox" id="hc-toggle" ${settings.highContrast ? 'checked' : ''} style="width:24px;height:24px">
      </div>
      <p style="margin-top:1.2rem;font-size:0.9em;color:var(--text-dim)">
        All settings and study data are stored only on this device (IndexedDB).
      </p>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);

  const update = async () => {
    applySettings();
    await storage.saveSettings(settings);
    $('#font-val', overlay).textContent = settings.fontSize.toFixed(2);
    $('#lh-val', overlay).textContent = settings.lineHeight.toFixed(2);
  };

  $('#set-font-down', overlay).onclick = () => { settings.fontSize = Math.max(0.95, +(settings.fontSize - 0.1).toFixed(2)); update(); };
  $('#set-font-up', overlay).onclick = () => { settings.fontSize = Math.min(2.4, +(settings.fontSize + 0.1).toFixed(2)); update(); };
  $('#set-lh-down', overlay).onclick = () => { settings.lineHeight = Math.max(1.3, +(settings.lineHeight - 0.1).toFixed(2)); update(); };
  $('#set-lh-up', overlay).onclick = () => { settings.lineHeight = Math.min(2.6, +(settings.lineHeight + 0.1).toFixed(2)); update(); };
  $('#hc-toggle', overlay).onchange = (e) => { settings.highContrast = e.target.checked; update(); };
}



async function doExportData() {
  try {
    const data = await storage.exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `kjv-study-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    alert('Backup downloaded. Keep this file private — it contains your notes and highlights.');
  } catch (e) {
    alert('Export failed: ' + (e.message || e));
  }
}

function openImportData() {
  const overlay = showOverlay(`
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem">
        <h2 style="margin:0;border:none;padding:0">Import study data</h2>
        <button type="button" class="close" style="float:none;min-width:52px;min-height:52px;font-size:1.5rem">×</button>
      </div>
      <p style="margin-bottom:0.9rem;line-height:1.5;font-size:0.95em">
        Choose a backup file previously exported from this app
        (<code>kjv-study-backup-….json</code>).
        This restores highlights, notes, cross-references, learning data, settings, and any books in the backup.
      </p>
      <div class="import-zone">
        <p>Select backup .json file</p>
        <input type="file" id="data-file-input" accept=".json,application/json">
      </div>
      <p style="margin-top:0.9rem;font-size:0.9em;color:var(--text-dim)">
        Existing data with the same keys will be overwritten. Everything stays on this device only.
      </p>
    </div>
  `, { center: true });
  $('.close', overlay).onclick = () => closeOverlay(overlay);
  $('#data-file-input', overlay).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      await storage.importAllData(json);
      books = await storage.getAllBooks();
      settings = await storage.getSettings();
      applySettings();
      closeOverlay(overlay);
      alert('Import complete.');
      if (books.length) {
        const last = await storage.getLastPosition();
        if (last && books.find(b => b.id === last.bookId)) {
          currentBookId = last.bookId;
          currentChapter = last.chapter || 1;
        } else {
          currentBookId = books[0].id;
          currentChapter = 1;
        }
        await renderChapter(currentBookId, currentChapter);
      } else {
        showEmptyState();
      }
    } catch (err) {
      alert('Import failed: ' + (err.message || err));
    }
  };
}





async function openDictionary(prefill) {
  const pack = await storage.getLexiconPack();
  const hasLex = !!(pack && pack.entries);

  const overlay = showOverlay(`
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem">
        <h2 style="margin:0;border:none;padding:0">Dictionary</h2>
        <button type="button" class="close" style="float:none;min-width:52px;min-height:52px;font-size:1.5rem">×</button>
      </div>
      ${hasLex
        ? `<p style="font-size:0.9em;color:var(--text-dim);margin-bottom:0.6rem">${pack.name || "Strong's"} · ${pack.entryCount || ''} entries<br>Search a word (e.g. love) or number (H1, G26)</p>
           <input type="search" id="dict-q" placeholder="Word or Strong's number"
             style="width:100%;padding:0.7rem;font-size:1.05rem;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);min-height:48px"
             value="${escapeHtml(prefill || '')}">
           <button type="button" id="dict-go" style="width:100%;margin-top:0.5rem;min-height:48px;background:var(--accent);color:#111;font-weight:600">Search</button>
           <div id="dict-results" style="margin-top:1rem"></div>
           <p style="margin-top:1rem;font-size:0.8em;color:var(--text-dim)">${escapeHtml(pack.attribution || '')}</p>`
        : `<p style="line-height:1.55;margin-bottom:1rem">No dictionary installed yet.</p>
           <p style="line-height:1.55;margin-bottom:1rem">Install the free <strong>Strong's</strong> pack (Hebrew &amp; Greek word meanings):</p>
           <p style="line-height:1.55;margin-bottom:1rem">Menu → <strong>Import Dictionary (Strong's)</strong> → choose the lexicon file.</p>
           <button type="button" id="dict-import-now" style="width:100%;min-height:52px">Import Dictionary now</button>`}
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);

  if (!hasLex) {
    $('#dict-import-now', overlay).onclick = () => { closeOverlay(overlay); openImportLexicon(); };
    return;
  }

  async function runSearch() {
    const q = $('#dict-q', overlay).value.trim();
    const box = $('#dict-results', overlay);
    if (!q) { box.innerHTML = ''; return; }
    box.innerHTML = '<p style="color:var(--text-dim)">Searching…</p>';
    const hits = await storage.searchLexicon(q);
    if (!hits.length) {
      box.innerHTML = '<p style="color:var(--text-dim)">No matches.</p>';
      return;
    }
    box.innerHTML = hits.map(h => `
      <div style="padding:0.75rem 0;border-bottom:1px solid var(--border)">
        <div style="font-weight:600;color:var(--accent)">${escapeHtml(h.id)}
          <span style="color:var(--text);font-weight:500"> ${escapeHtml(h.lemma || '')}</span>
          <span style="color:var(--text-dim);font-weight:400;font-size:0.9em"> ${escapeHtml(h.xlit || '')}</span>
        </div>
        ${h.pron ? `<div style="font-size:0.9em;color:var(--text-dim)">${escapeHtml(h.pron)}</div>` : ''}
        <div style="margin-top:0.35rem">${escapeHtml(h.gloss || '')}</div>
        ${h.kjv ? `<div style="margin-top:0.25rem;font-size:0.9em;color:var(--text-dim)">KJV: ${escapeHtml(h.kjv)}</div>` : ''}
      </div>
    `).join('');
  }

  $('#dict-go', overlay).onclick = runSearch;
  $('#dict-q', overlay).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });
  if (prefill) runSearch();
  setTimeout(() => $('#dict-q', overlay).focus(), 100);
}


/** Load TSK cross-references for one book and merge into the stored pack.
 *  Tries (1) already-imported full pack, (2) fetch of ./crossrefs-kjv-tsk.json.
 *  Once loaded, data stays on the device.
 */
async function loadCrossRefsForBook(bookId, bookName) {
  const prefix = bookId + '.';
  const existing = await storage.getTskPack();
  const loadedBooks = (existing && Array.isArray(existing.loadedBooks))
    ? existing.loadedBooks.slice()
    : [];

  // Count how many this book already has in the stored pack
  let already = 0;
  if (existing && existing.verses) {
    for (const k of Object.keys(existing.verses)) {
      if (k.startsWith(prefix)) already++;
    }
  }

  // If this book was already marked loaded and has data, just return the count
  if (loadedBooks.includes(bookId) && already > 0) {
    return already;
  }

  // Try to get source data: existing full pack first, else fetch the shipped file
  let sourceVerses = (existing && existing.verses) ? existing.verses : null;

  if (!sourceVerses || already === 0) {
    try {
      const resp = await fetch('./crossrefs-kjv-tsk.json', { cache: 'force-cache' });
      if (!resp.ok) throw new Error('not reachable');
      const json = await resp.json();
      if (!json || !json.verses) throw new Error('invalid file');
      sourceVerses = json.verses;
    } catch (e) {
      throw new Error('Could not reach the cross-reference file. If you are on a phone, open the app from the same folder that contains crossrefs-kjv-tsk.json, or use Menu → Load More Cross-References (optional) once.');
    }
  }

  // Merge this book's verses into the pack
  const merged = (existing && existing.verses) ? { ...existing.verses } : {};
  let count = 0;
  for (const [k, v] of Object.entries(sourceVerses)) {
    if (k.startsWith(prefix)) {
      merged[k] = v;
      count++;
    }
  }
  if (!count) throw new Error('No cross-references found for ' + (bookName || bookId));

  if (!loadedBooks.includes(bookId)) loadedBooks.push(bookId);

  await storage.saveTskPack({
    source: (existing && existing.source) || 'CrossReferences.org / TSK',
    version: (existing && existing.version) || 1,
    verses: merged,
    loadedBooks
  });
  return count;
}

async function openImportTsk() {
  const existing = await storage.getTskPack();
  const status = existing && existing.verses
    ? `<p style="color:var(--accent);margin-bottom:0.8rem;font-size:1.05em">Already loaded (${Object.keys(existing.verses).length.toLocaleString()} verses). You can load it again if needed.</p>`
    : `<p style="line-height:1.6;margin-bottom:1rem;font-size:1.1em">
        Many cross-references already work without this step.<br><br>
        To load the <strong>complete</strong> list for the whole Bible, tap the button below and choose the file named:<br>
        <code style="font-size:1.05em">crossrefs-kjv-tsk.json</code>
      </p>`;

  const overlay = showOverlay(`
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem">
        <h2 style="margin:0;border:none;padding:0">Load More Cross-References</h2>
        <button type="button" class="close" style="float:none;min-width:52px;min-height:52px;font-size:1.5rem">×</button>
      </div>
      ${status}
      <div class="import-zone">
        <p style="font-size:1.1em;margin-bottom:0.6rem">Tap here and choose the file</p>
        <input type="file" id="tsk-file" accept=".json,application/json" style="font-size:1.05em">
      </div>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);
  $('#tsk-file', overlay).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      let rawText;
      if (file.name.endsWith('.gz') || file.type === 'application/gzip') {
        // Decompress with browser DecompressionStream if available
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('This browser cannot decompress .gz files. Please use the uncompressed .json version.');
        }
        const ds = new DecompressionStream('gzip');
        const decompressed = file.stream().pipeThrough(ds);
        rawText = await new Response(decompressed).text();
      } else {
        rawText = await file.text();
      }
      const json = JSON.parse(rawText);
      if (!json.verses || typeof json.verses !== 'object') {
        throw new Error('Not a valid TSK cross-reference pack for this app');
      }
      await storage.saveTskPack({
        source: json.source || 'CrossReferences.org / TSK',
        version: json.version || 1,
        verses: json.verses
      });
      closeOverlay(overlay);
      alert(`TSK pack installed: ${Object.keys(json.verses).length.toLocaleString()} verses with phrase-level cross-references.`);
    } catch (err) {
      alert('Import failed: ' + (err.message || err));
    }
  };
}

function openImportLexicon() {
  const overlay = showOverlay(`
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem">
        <h2 style="margin:0;border:none;padding:0">Import Dictionary</h2>
        <button type="button" class="close" style="float:none;min-width:52px;min-height:52px;font-size:1.5rem">×</button>
      </div>
      <p style="line-height:1.55;margin-bottom:0.9rem">
        Choose the <code>strongs-lexicon.json</code> file (Strong's Hebrew &amp; Greek, public domain).
        Import once; it stays on this device.
      </p>
      <div class="import-zone">
        <p>Select strongs-lexicon.json</p>
        <input type="file" id="lex-file" accept=".json,application/json">
      </div>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);
  $('#lex-file', overlay).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if ((json.format !== 'kjv-study-lexicon' && json.format !== 'nasb-study-lexicon') || !json.entries) {
        throw new Error('Not a valid Strong\'s lexicon file for this app');
      }
      await storage.saveLexiconPack(json);
      closeOverlay(overlay);
      alert(`Dictionary installed: ${json.entryCount || Object.keys(json.entries).length} entries.`);
      // Re-render current chapter so Tap-a-word wrappers become active
      if (currentBookId && currentChapter) {
        await renderChapter(currentBookId, currentChapter, { preserveScroll: document.getElementById('main')?.scrollTop || 0 });
      }
    } catch (err) {
      alert('Import failed: ' + (err.message || err));
    }
  };
}


/**
 * Tap-a-word Strong's (v6.24.0 – user-controlled marks)
 * Uses only the installed lexicon pack + loaded book text. Fully offline.
 * Shows Strong's number, gloss, transliteration/pron, other verses with the
 * same English word, and a Mark / Remove mark button for this occurrence.
 * Marks are per occurrence (verseKey + character start offset), not global.
 */
async function openStrongsForWord(word, verseKey, startOffset) {
  const clean = (word || '').trim();
  if (!clean) return;

  const pack = await storage.getLexiconPack();
  if (!pack || !pack.entries) {
    const overlay = showOverlay(`
      <div class="panel">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem">
          <h2 style="margin:0;border:none;padding:0">Strong's</h2>
          <button type="button" class="close" style="float:none;min-width:52px;min-height:52px;font-size:1.5rem">×</button>
        </div>
        <p style="line-height:1.55;margin-bottom:1rem">No dictionary installed yet.</p>
        <p style="line-height:1.55;margin-bottom:1rem">Install the free Strong's pack via Menu → Import Dictionary (Strong's).</p>
        <button type="button" id="strong-import-now" style="width:100%;min-height:52px">Import Dictionary now</button>
      </div>
    `);
    $('.close', overlay).onclick = () => closeOverlay(overlay);
    $('#strong-import-now', overlay).onclick = () => { closeOverlay(overlay); openImportLexicon(); };
    return;
  }

  const hits = await storage.searchLexicon(clean);
  // Prefer an entry whose KJV forms include the exact word (case-insensitive)
  let best = hits[0] || null;
  if (hits.length > 1) {
    const lower = clean.toLowerCase();
    const exact = hits.find(h => {
      const kjv = (h.kjv || '').toLowerCase();
      return kjv.split(/[,;/\s]+/).some(w => w === lower);
    });
    if (exact) best = exact;
  }

  // Other occurrences: text search across loaded books for the same English word
  let occHtml = '';
  try {
    const allHits = await bible.searchBooks(clean, books);
    const others = allHits
      .filter(r => r.key !== verseKey)
      .slice(0, 6);
    if (others.length) {
      occHtml = `
        <p style="margin:1rem 0 0.5rem;font-size:0.9em;color:var(--text-dim);font-weight:600">Other verses with this word</p>
        ${others.map(r => `
          <button type="button" class="strong-occ" data-key="${escapeHtml(r.key)}">
            <div class="ref">${escapeHtml(r.bookName)} ${r.chapter}:${r.verse}</div>
            <div class="snip">${escapeHtml(r.snippet || r.text.slice(0, 90))}</div>
          </button>
        `).join('')}
      `;
    } else {
      occHtml = `<p style="margin-top:1rem;font-size:0.9em;color:var(--text-dim)">No other loaded verses contain “${escapeHtml(clean)}”.</p>`;
    }
  } catch (_) {
    occHtml = '';
  }

  // Mark state for this specific occurrence (verse + start offset)
  const hasStart = Number.isFinite(startOffset) && startOffset >= 0 && verseKey;
  let isMarked = false;
  if (hasStart) {
    const existing = await storage.getWordMarks(verseKey);
    isMarked = existing.includes(startOffset);
  }

  let body;
  if (!best) {
    body = `
      <p style="line-height:1.55;margin-bottom:0.8rem">No Strong's entry found for <strong>“${escapeHtml(clean)}”</strong>.</p>
      <p style="font-size:0.9em;color:var(--text-dim);margin-bottom:1rem">Try the full Dictionary for related forms or a Strong's number.</p>
      <button type="button" id="strong-open-dict" style="width:100%;min-height:52px;margin-bottom:0.5rem">Open Dictionary</button>
      ${occHtml}
    `;
  } else {
    const lemma = best.lemma ? escapeHtml(best.lemma) : '';
    const xlit = best.xlit ? escapeHtml(best.xlit) : '';
    const pron = best.pron ? escapeHtml(best.pron) : '';
    const gloss = best.gloss ? escapeHtml(best.gloss) : '';
    const kjv = best.kjv ? escapeHtml(best.kjv) : '';
    body = `
      <div style="margin-bottom:0.9rem">
        <div style="font-weight:700;font-size:1.15em;color:var(--accent);margin-bottom:0.25rem">${escapeHtml(best.id)}
          ${lemma ? `<span style="color:var(--text);font-weight:500"> ${lemma}</span>` : ''}
        </div>
        ${xlit || pron ? `<div style="font-size:0.95em;color:var(--text-dim);margin-bottom:0.35rem">${xlit}${pron && xlit ? ' · ' : ''}${pron}</div>` : ''}
        ${gloss ? `<div style="line-height:1.5;margin-bottom:0.35rem">${gloss}</div>` : ''}
        ${kjv ? `<div style="font-size:0.9em;color:var(--text-dim)">KJV: ${kjv}</div>` : ''}
      </div>
      ${hits.length > 1 ? `<p style="font-size:0.85em;color:var(--text-dim);margin-bottom:0.6rem">${hits.length} related entries — showing best match. Use Dictionary for full list.</p>` : ''}
      ${occHtml}
    `;
  }

  // Mark / Remove mark button (only when we know the occurrence)
  let markHtml = '';
  if (hasStart) {
    markHtml = isMarked
      ? `<button type="button" id="strong-mark-btn" class="strong-mark-btn is-marked">Remove mark</button>`
      : `<button type="button" id="strong-mark-btn" class="strong-mark-btn">Mark this word</button>`;
  }

  const overlay = showOverlay(`
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem">
        <h2 style="margin:0;border:none;padding:0">Strong's · ${escapeHtml(clean)}</h2>
        <button type="button" class="close" style="float:none;min-width:52px;min-height:52px;font-size:1.5rem">×</button>
      </div>
      ${body}
      ${markHtml}
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);

  const dictBtn = $('#strong-open-dict', overlay);
  if (dictBtn) {
    dictBtn.onclick = () => { closeOverlay(overlay); openDictionary(clean); };
  }

  const markBtn = $('#strong-mark-btn', overlay);
  if (markBtn && hasStart) {
    markBtn.onclick = async () => {
      const current = await storage.getWordMarks(verseKey);
      let next;
      if (isMarked) {
        next = current.filter(s => s !== startOffset);
      } else {
        next = current.includes(startOffset) ? current : [...current, startOffset];
      }
      await storage.setWordMarks(verseKey, next);
      closeOverlay(overlay);
      // Re-render so the outline appears / disappears; preserve scroll
      const main = document.getElementById('main');
      const scrollTop = main ? main.scrollTop : 0;
      if (currentBookId && currentChapter) {
        await renderChapter(currentBookId, currentChapter, { preserveScroll: scrollTop });
      }
    };
  }

  $$('.strong-occ', overlay).forEach(btn => {
    btn.onclick = async () => {
      const key = btn.dataset.key;
      if (!key) return;
      if (currentBookId) {
        const main = document.getElementById('main');
        const book = books.find(b => b.id === currentBookId);
        const label = book ? `${book.name} ${currentChapter}` : `${currentBookId} ${currentChapter}`;
        navStack.push({
          bookId: currentBookId,
          chapter: currentChapter,
          verseKey: getNearestVerseKey() || null,
          scrollTop: main ? main.scrollTop : 0,
          label
        });
        updateNavBackButton();
      }
      closeOverlay(overlay);
      await jumpToRef(key);
    };
  });
}



// ---------- Context panel (offline book/chapter overview) ----------
function openContext() {
  if (!currentBookId || !currentChapter) {
    alert("Open a chapter first, then use Context.");
    return;
  }
  const bookMeta = bible.CANONICAL_BOOKS.find(b => b.id === currentBookId);
  const bookName = bookMeta ? bookMeta.name : currentBookId;
  const ctx = getChapterContext(currentBookId, currentChapter);

  const themesHtml = (ctx.themes && ctx.themes.length)
    ? `<ul class="context-themes">${ctx.themes.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
    : `<p class="context-dim">—</p>`;

  const outlineHtml = (ctx.outline && ctx.outline.length)
    ? `<ul class="context-outline">${ctx.outline.map(o => `<li>${escapeHtml(o)}</li>`).join("")}</ul>`
    : `<p class="context-dim">—</p>`;

  const overlay = showOverlay(`
    <div class="panel context-panel">
      <div class="context-header">
        <h2 class="context-title">Context – ${escapeHtml(bookName)} ${currentChapter}</h2>
        <button type="button" class="close context-close" aria-label="Close">×</button>
      </div>
      <div class="context-body">
        <section class="context-section">
          <h3>Book purpose</h3>
          <p>${escapeHtml(ctx.purpose || "")}</p>
        </section>
        <section class="context-section">
          <h3>Key themes</h3>
          ${themesHtml}
        </section>
        <section class="context-section">
          <h3>This chapter</h3>
          ${outlineHtml}
        </section>
        <section class="context-section">
          <h3>Where this chapter sits</h3>
          <p>${escapeHtml(ctx.place || "")}</p>
        </section>
        <p class="context-footer">Offline overview · not a commentary. Read the text itself.</p>
      </div>
    </div>
  `);
  const closeBtn = overlay.querySelector(".context-close") || overlay.querySelector(".close");
  if (closeBtn) closeBtn.onclick = () => closeOverlay(overlay);
}

// ---------- Research / Commentary (bible.helloao.org – Adam Clarke + Tyndale) ----------
const COMMENTARY_SOURCES = [
  { id: "adam-clarke", label: "Adam Clarke", short: "Clarke" },
  { id: "tyndale", label: "Tyndale Open Study Notes", short: "Tyndale" }
];




async function openResearch() {
  if (!currentBookId || !currentChapter) {
    alert("Open a chapter first, then use Research.");
    return;
  }
  const apiBook = bible.toApiBookCode(currentBookId);
  const bookMeta = bible.CANONICAL_BOOKS.find(b => b.id === currentBookId);
  const bookName = bookMeta ? bookMeta.name : currentBookId;

  let preferred = localStorage.getItem("kjv-research-source") || "tyndale";

  function scrollKey(src) {
    return `${src}:${currentBookId}:${currentChapter}`;
  }
  function loadScrollMap() {
    try {
      return JSON.parse(localStorage.getItem("kjv-research-scroll") || "{}") || {};
    } catch (_) { return {}; }
  }
  function saveScrollPos(src, top) {
    const map = loadScrollMap();
    map[scrollKey(src)] = Math.max(0, Math.round(top || 0));
    const keys = Object.keys(map);
    if (keys.length > 80) {
      keys.slice(0, keys.length - 80).forEach(k => delete map[k]);
    }
    try { localStorage.setItem("kjv-research-scroll", JSON.stringify(map)); } catch (_) {}
  }
  function getSavedScroll(src) {
    return loadScrollMap()[scrollKey(src)] || 0;
  }

  // Layout: panel is flex column. Header (title + X) never scrolls.
  // Only #research-body scrolls. That is the single scroll container we track.
  const overlay = showOverlay(`
    <div class="panel research-panel">
      <div class="research-header">
        <h2 class="research-title">Research – ${escapeHtml(bookName)} ${currentChapter}</h2>
        <button type="button" class="close research-close" aria-label="Close">×</button>
      </div>
      <div class="research-sources">
        ${COMMENTARY_SOURCES.map(s => `
          <button type="button" class="research-src" data-id="${s.id}"
            style="background:${s.id === preferred ? "var(--accent)" : "var(--bg)"};color:${s.id === preferred ? "#111" : "var(--text)"}">
            ${s.short}
          </button>`).join("")}
      </div>
      <div id="research-status" class="research-status">Loading…</div>
      <div id="research-body" class="research-body"></div>
      <p class="research-footer">
        Sources: public-domain / CC via <a href="https://bible.helloao.org" target="_blank" rel="noopener">bible.helloao.org</a>.
        Place in notes is remembered.
      </p>
    </div>
  `);

  const panelEl = overlay.querySelector(".panel");
  const bodyEl = $("#research-body", overlay);
  const statusEl = $("#research-status", overlay);
  const closeBtn = $(".research-close", overlay) || $(".close", overlay);
  let activeSource = preferred;
  let scrollTimer = null;

  // True only after commentary HTML has been rendered into bodyEl
  let bodyHasContent = false;

  function persistCurrentScroll() {
    // Never write 0 over a real saved position when the body is empty
    // (that was wiping memory every time Research opened).
    if (!bodyEl || !bodyHasContent) return;
    saveScrollPos(activeSource, bodyEl.scrollTop);
  }

  // Only the commentary body scrolls — track it
  bodyEl.addEventListener("scroll", () => {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(persistCurrentScroll, 60);
  }, { passive: true });

  function doClose() {
    persistCurrentScroll();
    closeOverlay(overlay);
  }

  if (closeBtn) {
    const onClose = (e) => {
      e.preventDefault();
      e.stopPropagation();
      doClose();
    };
    closeBtn.onclick = onClose;
    closeBtn.addEventListener('touchend', onClose, { passive: false });
  }

  // Backdrop tap: save first (showOverlay also closes on backdrop)
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      persistCurrentScroll();
    }
  }, true);

  function restoreScroll(src) {
    const saved = getSavedScroll(src);
    if (!saved || !bodyEl) return;

    const tryRestore = (attempt) => {
      if (!bodyEl) return;
      // Wait until content has real height so iOS does not clamp scrollTop to 0
      const ready = bodyEl.scrollHeight > bodyEl.clientHeight + 20 || attempt >= 12;
      if (!ready) {
        setTimeout(() => tryRestore(attempt + 1), 40);
        return;
      }
      bodyEl.scrollTop = saved;
      if (Math.abs(bodyEl.scrollTop - saved) > 2 && attempt < 15) {
        setTimeout(() => tryRestore(attempt + 1), 50);
      }
    };
    requestAnimationFrame(() => tryRestore(0));
  }

  async function loadSource(sourceId) {
    // Save previous source position only if we actually had content on screen
    if (bodyHasContent && bodyEl) {
      saveScrollPos(activeSource, bodyEl.scrollTop);
    }
    activeSource = sourceId;
    preferred = sourceId;
    localStorage.setItem("kjv-research-source", sourceId);
    bodyHasContent = false;

    overlay.querySelectorAll(".research-src").forEach(btn => {
      const active = btn.dataset.id === sourceId;
      btn.style.background = active ? "var(--accent)" : "var(--bg)";
      btn.style.color = active ? "#111" : "var(--text)";
    });

    statusEl.textContent = "Loading…";
    bodyEl.innerHTML = "";

    const cacheKey = `${sourceId}:${apiBook}:${currentChapter}`;
    let data = null;
    let fromCache = false;

    try {
      const cached = await storage.getCachedCommentary(cacheKey);
      if (cached && cached.payload) {
        data = cached.payload;
        fromCache = true;
      }
    } catch (_) {}

    if (!data) {
      try {
        const url = `https://bible.helloao.org/api/c/${sourceId}/${apiBook}/${currentChapter}.json`;
        const resp = await fetch(url, { mode: "cors" });
        if (!resp.ok) {
          if (resp.status === 404) {
            statusEl.textContent = "No notes available for this book/chapter in the selected commentary.";
            bodyEl.innerHTML = `<p style="color:var(--text-dim)">The free commentary source does not currently have notes for <strong>${escapeHtml(apiBook)} ${currentChapter}</strong>.</p>`;
            return;
          }
          throw new Error(`HTTP ${resp.status}`);
        }
        data = await resp.json();
        try {
          await storage.saveCachedCommentary(cacheKey, { payload: data, sourceId, book: apiBook, chapter: currentChapter });
        } catch (e) {
          console.warn("Could not cache commentary", e);
        }
      } catch (err) {
        console.error(err);
        statusEl.textContent = "Could not load commentary.";
        bodyEl.innerHTML = `<p style="color:var(--danger)">Network error or offline. Connect once to download this chapter, then it will work offline.</p>
          <p style="font-size:0.9em;color:var(--text-dim)">${escapeHtml(String(err.message || err))}</p>`;
        return;
      }
    }

    const srcLabel = (COMMENTARY_SOURCES.find(s => s.id === sourceId) || {}).label || sourceId;
    statusEl.textContent = fromCache
      ? `${srcLabel} · cached on this device`
      : `${srcLabel} · just downloaded & cached`;

    const ch = data.chapter || {};
    let html = "";
    if (ch.introduction) {
      html += `<div class="research-intro">
        <strong>Chapter introduction</strong>
        <div style="margin-top:0.35rem;white-space:pre-wrap">${escapeHtml(ch.introduction)}</div>
      </div>`;
    }

    const verses = Array.isArray(ch.content) ? ch.content.filter(v => v && v.type === "verse") : [];
    if (!verses.length && !ch.introduction) {
      html += `<p style="color:var(--text-dim)">No verse notes found for this chapter.</p>`;
    } else {
      for (const v of verses) {
        const num = v.number;
        const notes = Array.isArray(v.content) ? v.content : (v.content ? [v.content] : []);
        if (!notes.length) continue;
        html += `<div class="research-verse" data-verse="${num}">
          <div class="research-verse-num">Verse ${escapeHtml(String(num))}</div>
          ${notes.map(n => `<div class="research-note">${escapeHtml(String(n))}</div>`).join("")}
        </div>`;
      }
    }
    bodyEl.innerHTML = html || `<p style="color:var(--text-dim)">No content.</p>`;
    bodyHasContent = true;
    restoreScroll(sourceId);
  }

  overlay.querySelectorAll(".research-src").forEach(btn => {
    btn.onclick = () => loadSource(btn.dataset.id);
  });

  loadSource(preferred);
}

function openHelp() {
  const overlay = showOverlay(`
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem">
        <h2 style="margin:0;border:none;padding:0">How to use</h2>
        <button type="button" class="close" style="float:none;min-width:52px;min-height:52px;font-size:1.5rem">×</button>
      </div>
      <div style="line-height:1.65;font-size:1.02em">
        <p style="margin-bottom:1rem"><strong>Which Bible text am I reading?</strong><br>
        The built-in sample is <strong>public-domain KJV</strong> (Genesis 1–2 only).<br>
        To use the full free KJV (or any compatible public-domain text): prepare a JSON file of the book(s), then Menu → <strong>Import Book (JSON)</strong>.<br>
        Highlights and notes are stored by verse reference (e.g. gen.1.1). They stay when you replace or add text for the same book/chapter/verse numbers.</p>

        <p style="margin-bottom:1rem"><strong>Color a few words (segment)</strong><br>
        1. Long-press the verse and drag to select only the words you want.<br>
        2. Lift your finger (keep the selection visible a moment).<br>
        3. Tap <strong>Color</strong> → choose color → <strong>Apply Color</strong>.<br>
        The app remembers the selection even after the blue highlight disappears on phones.</p>

        <p style="margin-bottom:1rem"><strong>Shared notes</strong><br>
        Note → type → add other refs (gen.1.3 or Genesis 1:3) → Add links → Save Note.</p>

        <p style="margin-bottom:1rem"><strong>Chapters</strong><br>
        ◀ ▶ move chapters. Dim at first/last. Sample has Gen 1–2.</p>

        <p style="margin-bottom:1rem"><strong>Context (offline)</strong><br>
        Tap <strong>Context</strong> while viewing a chapter for a short overview: book purpose, key themes, simple chapter outline, and where the chapter sits in the larger story. Fully offline.</p>

        <p style="margin-bottom:1rem"><strong>Research / Commentary</strong><br>
        Tap <strong>Research</strong> while viewing a chapter. Choose Adam Clarke or Tyndale Open Study Notes.
        Notes are fetched from the free bible.helloao.org API and cached on this device so they work offline afterward.</p>

        <p style="margin-bottom:1rem"><strong>Tap-a-word Strong's</strong><br>
        With the dictionary installed, tap any word to open Strong's (number, gloss, transliteration, other verses).<br>
        Use <strong>Mark this word</strong> inside the panel to put a thin outline on that occurrence only.<br>
        <strong>Remove mark</strong> clears it. Long-press + drag still selects text for Color as before.</p>

        <p style="margin-bottom:1rem"><strong>Backup</strong><br>
        Menu → Export / Import study data.</p>

        <p style="margin-bottom:0.5rem"><strong>Version</strong> 6.24.0</p>
      </div>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);
}

function openAbout() {
  showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>About – KJV Study v6.24.0</h2>
      <p style="line-height:1.65;margin-bottom:0.8rem">
        Strictly private, local-only Progressive Web App for personal Bible study.
        Designed for comfortable long sessions and deep color-index thematic study.
      </p>
      <p style="line-height:1.65;margin-bottom:0.8rem">
        <strong>Privacy:</strong> No accounts, no servers, no analytics, no sync.
        All Bible text you import, all highlights, notes, cross-references and
        Analyze learning data remain on this device only (IndexedDB).
      </p>
      <p style="line-height:1.65;margin-bottom:0.8rem">
        <strong>Text:</strong> This app is for free public-domain Bible text (KJV).
        A public-domain KJV Genesis sample is included for testing.
        Import your own free KJV (or other public-domain) text in the documented JSON format.
      </p>
      <p style="line-height:1.65;margin-bottom:0.8rem">
        <strong>Context:</strong> Offline book purpose, key themes, chapter outline, and place in the story for the current chapter.<br><br>
        <strong>Research:</strong> Adam Clarke’s Commentary and Tyndale Open Study Notes
        (via the free bible.helloao.org API). Chapters are cached locally after first load.
      </p>
      <p style="line-height:1.65;margin-bottom:0.8rem">
        <strong>Install:</strong> On supported browsers (Chrome, Edge, Safari on iOS/iPadOS,
        Chromebook) use the browser’s “Add to Home Screen” / “Install app” option
        for a full-screen, offline-capable experience.
      </p>
      <p style="font-size:0.9em;color:var(--text-dim)">Version 6.24.0 – personal data stays on device</p>
    </div>
  `).querySelector('.close').onclick = function () {
    closeOverlay(this.closest('.overlay'));
  };
}

// ---------- Start ----------
document.addEventListener('DOMContentLoaded', init);
