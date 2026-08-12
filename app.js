/* app.js – Main application controller. KJV Study PWA v6.20.0
   Client-side only. Personal data never leaves the device.
   Highlight system: solid background fills + mandatory pure black/white contrast text.
*/

import * as storage from './storage.js';
import * as bible from './bible.js';
import * as analyze from './analyze.js';

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
      const reg = await navigator.serviceWorker.register('./sw.js?v=6.20.0', {
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
        <span class="spacer"></span>
        <button type="button" id="btn-prev-ch" aria-label="Previous chapter">◀</button>
        <button type="button" id="btn-next-ch" aria-label="Next chapter">▶</button>
      </div>
      <div class="version-bar">v6.20.0</div>
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
  main.innerHTML = `<div class="chapter-header">${book.name} ${chapterNum}</div>`;

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
      xrefMap[k] = Array.isArray(xrefs) && xrefs.length > 0;
      wordMarkMap[k] = marks;
    })
  ]);
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
   Full pack (~29k verses) remains optional via Menu → Load All Cross-References.
*/
const STARTER_TSK = {"1jn.4.1":[{"a":"believe not","r":["Deut 13:1-5","Prov 14:15","Jer 5:31","Jer 29:8-9","Matt 7:15-16","Matt 24:4-5","Rom 16:18","2 Pet 2:1"]},{"a":"try","r":["Luke 12:57","Acts 17:11","Rom 16:19","1 Cor 14:29","1 Thess 5:21","Rev 2:2"]},{"a":"many","r":["1 John 2:18","Matt 24:5,23-26","Mark 13:21","Luke 21:8","Acts 20:29","1 Tim 4:1","2 Tim 3:13","2 Pet 2:1","2 John 1:7"]}],"1jn.4.10":[{"a":"Herein","r":["1 John 4:8-9","1 John 3:1"]},{"a":"not","r":["1 John 4:19","Deut 7:7-8","John 15:16","Rom 5:8-10","Rom 8:29-30","2 Cor 5:19-21","Eph 2:4-5","Titus 3:3-5"]},{"a":"and sent","r":["1 John 2:2","Dan 9:24","Rom 3:25-26","1 Pet 2:24","1 Pet 3:18"]}],"1jn.4.11":[{"a":"Beloved, if God so loved us, we ought also to love one another.","r":["1 John 3:16-17,23","Matt 18:32-33","Luke 10:37","John 13:34","John 15:12-13","2 Cor 8:8-9","Eph 4:31-32","Eph 5:1-2","Col 3:13"]}],"1jn.4.12":[{"a":"seen","r":["1 John 4:20","Gen 32:30","Exod 33:20","Num 12:8","John 1:18","1 Tim 1:17","1 Tim 6:16","Heb 11:27"]},{"a":"love one","r":["1 John 4:6","1 John 3:24"]},{"a":"and his","r":["1 John 4:17-18","1 John 2:5","1 Cor 13:13"]}],"1jn.4.13":[{"a":"Hereby know we that we dwell in him, and he in us, because he hath given us of his Spirit.","r":["1 John 4:15-16","1 John 3:24","John 14:20-26","Rom 8:9-17","1 Cor 2:12","1 Cor 3:16-17","1 Cor 6:19","Gal 5:22-25","Eph 2:20-22"]}],"1jn.4.14":[{"a":"we have","r":["1 John 1:1-3","1 John 5:9","John 1:14","John 3:11,32","John 5:39","John 15:26-27","Acts 18:5","1 Pet 5:12"]},{"a":"the Father","r":["1 John 4:10","John 3:34","John 5:36-37","John 10:36"]},{"a":"the Saviour","r":["1 John 2:1-2","John 1:29","John 3:16-17","John 4:42","John 12:47"]}],"1jn.4.15":[{"a":"confess","r":["1 John 4:2","1 John 5:1,5","Matt 10:32","Luke 12:8","Rom 10:9","Phil 2:11","2 John 1:7"]},{"a":"God dwelleth","r":["1 John 4:12","1 John 3:24"]}],"1jn.4.16":[{"a":"we","r":["1 John 4:9-10","1 John 3:1,16","Ps 18:1-3","Ps 31:19","Ps 36:7-9","Isa 64:4","1 Cor 2:9"]},{"a":"God is love","r":["1 John 4:8,12-13"]},{"a":"and he","r":["1 John 4:12","1 John 3:24"]}],"1jn.4.17":[{"a":"made","r":["1 John 4:12","1 John 2:5","Jas 2:22"]},{"a":"we may","r":["1 John 2:28","1 John 3:19-21","Jas 2:13"]},{"a":"the day","r":["Matt 10:15","Matt 11:22,24","Matt 12:36","2 Pet 2:9","2 Pet 3:7"]},{"a":"as","r":["1 John 3:3","Matt 10:25","John 15:20","Rom 8:29","Heb 12:2-3","1 Pet 3:16-18","1 Pet 4:1-3,13-14"]}],"1jn.4.18":[{"a":"is no","r":["Luke 1:74-75","Rom 8:15","2 Tim 1:7","Heb 12:28"]},{"a":"fear hath","r":["Job 15:21","Ps 73:19","Ps 88:15-16","Ps 119:120","Jas 2:19"]},{"a":"He that","r":["1 John 4:12"]}],"1jn.4.19":[{"a":"We love him, because he first loved us.","r":["1 John 4:10","Luke 7:47","John 3:16","John 15:16","2 Cor 5:14-15","Gal 5:22","Eph 2:3-5","Titus 3:3-5"]}],"1jn.4.2":[{"a":"Every","r":["1 John 5:1","John 16:13-15","1 Cor 12:3"]},{"a":"come","r":["1 John 4:3","John 1:14","1 Tim 3:16"]}],"1jn.4.20":[{"a":"a man","r":["1 John 2:4","1 John 3:17"]},{"a":"not","r":["1 John 4:12"]}],"1jn.4.21":[{"a":"And this commandment have we from him, That he who loveth God love his brother also.","r":["1 John 4:11","1 John 3:11,14,18,23","Lev 19:18","Matt 22:37-39","Mark 12:29-33","Luke 10:37","John 13:34-35","John 15:12","Rom 12:9-10","Rom 13:9-10","Gal 5:6,14","1 Thess 4:9","1 Pet 3:8","1 Pet 4:8"]}],"1jn.4.3":[{"a":"and this","r":["1 John 2:18,22","2 Thess 2:7-8","2 John 1:7"]}],"1jn.4.4":[{"a":"are","r":["1 John 4:6,16","1 John 3:9-10","1 John 5:19"]},{"a":"and have","r":["1 John 2:13","1 John 5:4","Rom 8:37","Eph 6:10,13","Rev 12:11"]},{"a":"greater","r":["1 John 4:13,16","1 John 3:24","John 10:28-30","John 14:17-23","John 17:23","Rom 8:10-11","1 Cor 6:13","2 Cor 6:16","Eph 3:17"]},{"a":"than","r":["1 John 5:19","John 12:31","John 14:30","John 16:11","1 Cor 2:12","2 Cor 4:4","Eph 2:2","Eph 6:12"]}],"1jn.4.5":[{"a":"are","r":["Ps 17:4","Luke 16:8","John 3:31","John 7:6-7","John 8:23","John 15:19-20","John 17:14,16","Rev 12:9"]},{"a":"and","r":["Isa 30:10-11","Jer 5:31","Jer 29:8","Mic 2:11","John 15:19","John 17:14","2 Tim 4:3","2 Pet 2:2-3"]}],"1jn.4.6":[{"a":"We are","r":["1 John 4:4","Mic 3:8","Rom 1:1","1 Cor 2:12-14","2 Pet 3:2","Jude 1:17"]},{"a":"he that knoweth","r":["1 John 4:8","Luke 10:22","John 8:19,45-50","John 10:27","John 13:20","John 18:37","John 20:21","1 Cor 14:37","2 Cor 10:7","2 Thess 1:8"]},{"a":"Hereby","r":["1 John 4:1","Isa 8:20"]},{"a":"the spirit of truth","r":["John 14:17","John 15:26"]},{"a":"and","r":["Isa 29:10","Hos 4:12","Mic 2:11","Rom 11:8","2 Thess 2:9-11"]}],"1jn.4.7":[{"a":"let","r":["1 John 4:20-21","1 John 2:10","1 John 3:10-23","1 John 5:1"]},{"a":"love is","r":["1 John 4:8","Deut 30:6","Gal 5:22","1 Thess 4:9-10","2 Tim 1:7","1 Pet 1:22"]},{"a":"every","r":["1 John 4:12","1 John 2:29","1 John 3:14","1 John 5:1"]},{"a":"and knoweth","r":["John 17:3","2 Cor 4:6","Gal 4:9"]}],"1jn.4.8":[{"a":"knoweth","r":["1 John 2:4,9","1 John 3:6","John 8:54-55"]},{"a":"God is","r":["1 John 1:5","Exod 34:6-7","Ps 86:5,15","2 Cor 13:11","Eph 2:4","Heb 12:29"]}],"1jn.4.9":[{"a":"was","r":["1 John 3:16","John 3:16","Rom 5:8-10","Rom 8:32"]},{"a":"God sent","r":["1 John 4:10","Luke 4:18","John 5:23","John 6:29","John 8:29,42"]},{"a":"only","r":["Ps 2:7","Mark 12:6","John 1:14-18","John 3:18","Heb 1:5"]},{"a":"we","r":["1 John 5:11","John 6:51,57","John 10:10,28-30","John 11:25-26","John 14:6","Col 3:3-4"]}],"gen.1.1":[{"a":"beginning","r":["Prov 8:22-24","Prov 16:4","Mark 13:19","John 1:1-3","Heb 1:10","1 John 1:1"]},{"a":"God","r":["Exod 20:11","Exod 31:18","1 Chr 16:26","Neh 9:6","Job 26:13","Job 38:4","Ps 8:3","Ps 33:6,9","Ps 89:11-12","Ps 96:5","Ps 102:25","Ps 104:24,30","Ps 115:15","Ps 121:2","Ps 124:8","Ps 134:3","Ps 136:5","Ps 146:6","Ps 148:4-5","Prov 3:19","Prov 8:22-30","Eccl 12:1","Isa 37:16","Isa 40:26","Isa 40:28","Isa 42:5","Isa 44:24","Isa 45:18","Isa 51:13,16","Isa 65:17","Jer 10:12","Jer 32:17","Jer 51:15","Zech 12:1","Matt 11:25","Acts 4:24","Acts 14:15","Acts 17:24","Rom 1:19-20","Rom 11:36","1 Cor 8:6","Eph 3:9","Col 1:16-17","Heb 1:2","Heb 3:4","Heb 11:3","2 Pet 3:5","Rev 3:14","Rev 4:11","Rev 10:6","Rev 14:7","Rev 21:6","Rev 22:13"]}],"gen.1.10":[{"a":"God saw","r":["Gen 1:4","Deut 32:4","Ps 104:31"]}],"gen.1.11":[{"a":"Let the","r":["Gen 2:5","Job 28:5","Ps 104:14-17","Ps 147:8","Matt 6:30","Heb 6:7"]},{"a":"fruit","r":["Gen 1:29","Gen 2:9,16","Ps 1:3","Jer 17:8","Matt 3:10","Matt 7:16-20","Mark 4:28","Luke 6:43-44","Jas 3:12"]}],"gen.1.12":[{"a":"earth","r":["Isa 61:11","Mark 4:28"]},{"a":"herb","r":["Isa 55:10-11","Matt 13:24-26","Luke 6:44","2 Cor 9:10","Gal 6:7"]}],"gen.1.14":[{"a":"Let there","r":["Deut 4:19","Job 25:3,5","Job 38:12-14","Ps 8:3-4","Ps 19:1-6","Ps 74:16-17","Ps 104:19-20","Ps 119:91","Ps 136:7-9","Ps 148:3,6","Isa 40:26","Jer 31:35","Jer 33:20,25"]},{"a":"lights","r":["Gen 8:22","Gen 9:13","Job 3:9","Job 38:31-32","Ps 81:3","Ezek 32:7-8","Ezek 46:1,6","Joel 2:10,30-31","Joel 3:15","Amos 5:8","Amos 8:9","Matt 2:2","Matt 16:2-3","Matt 24:29","Mark 13:24","Luke 21:25-26","Luke 23:45","Acts 2:19-20","Rev 6:12","Rev 8:12","Rev 9:2"]}],"gen.1.16":[{"a":"to rule","r":["Deut 4:19","Josh 10:12-14","Job 31:26","Job 38:7","Ps 8:3","Ps 19:6","Ps 74:16","Ps 136:7-9","Ps 148:3,5","Isa 13:10","Isa 24:23","Isa 45:7","Hab 3:11","Matt 24:29","Matt 27:45","1 Cor 15:41","Rev 16:8-9","Rev 21:23"]}],"gen.1.17":[{"a":"And God set them in the firmament of the heaven to give light upon the earth,","r":["Gen 9:13","Job 38:12","Ps 8:1,3","Acts 13:47"]}],"gen.1.18":[{"a":"And to rule over the day and over the night, and to divide the light from the darkness: and God saw that it was good.","r":["Ps 19:6","Jer 31:35"]}],"gen.1.2":[{"a":"without","r":["Job 26:7","Isa 45:18","Jer 4:23","Nah 2:10"]},{"a":"Spirit","r":["Job 26:14","Ps 33:6","Ps 104:30","Isa 40:12-14"]}],"gen.1.20":[{"a":"Let the waters","r":["Gen 1:22","Gen 2:19","Gen 8:17","Ps 104:24-25","Ps 148:10","Acts 17:25"]},{"a":"moving","r":["1 Kgs 4:33"]},{"a":"life","r":["Gen 1:30","Eccl 2:21"]},{"a":"open firmament","r":["Gen 1:7,14"]}],"gen.1.21":[{"a":"great","r":["Gen 6:20","Gen 7:14","Gen 8:19","Job 7:12","Job 26:5","Ps 104:24-26","Ezek 32:2","Jonah 1:17","Jonah 2:10","Matt 12:40"]},{"a":"brought","r":["Gen 8:17","Gen 9:7","Exod 1:7","Exod 8:3"]},{"a":"God saw","r":["Gen 1:18,25,31"]}],"gen.1.22":[{"a":"And God blessed them, saying, Be fruitful, and multiply, and fill the waters in the seas, and let fowl multiply in the earth.","r":["Gen 1:28","Gen 8:17","Gen 9:1","Gen 30:27,30","Gen 35:11","Lev 26:9","Job 40:15","Job 42:12","Ps 107:31,38","Ps 128:3","Ps 144:13-14","Prov 10:22"]}],"gen.1.24":[{"a":"Let","r":["Gen 6:20","Gen 7:14","Gen 8:19","Job 38:39-40","Job 39:1,5,9,19","Job 40:15","Ps 50:9-10","Ps 104:18,23","Ps 148:10"]}],"gen.1.25":[{"a":"And God made the beast of the earth after his kind, and cattle after their kind, and every thing that creepeth upon the earth after his kind: and God saw that it was good.","r":["Gen 2:19-20","Job 12:8-10","Job 26:13"]}],"gen.1.26":[{"a":"Let us","r":["Gen 3:22","Gen 11:7","Job 35:10","Ps 100:3","Ps 149:2","Isa 64:8","John 5:17","John 14:23","1 John 5:7"]},{"a":"in our","r":["Gen 5:1","Gen 9:6","Eccl 7:29","Acts 17:26,28-29","1 Cor 11:7","2 Cor 3:18","2 Cor 4:4","Eph 4:24","Col 1:15","Col 3:10","Jas 3:9"]},{"a":"have dominion","r":["Gen 9:2-4","Job 5:23","Ps 8:4-8","Ps 104:20-24","Jer 27:6","Heb 2:6-9","Jas 3:7,9"]}],"gen.1.27":[{"a":"in the image","r":["Ps 139:14","Isa 43:7","Rom 8:29","Eph 2:10","Eph 4:24","Col 1:15","Col 1:26"]},{"a":"male","r":["Gen 2:21-25","Gen 5:2","Mal 2:15","Matt 19:4","Mark 10:6","1 Cor 11:8-9"]}],"gen.1.28":[{"a":"And God blessed them, and God said unto them, Be fruitful, and multiply","r":["Gen 1:22","Gen 8:17","Gen 9:1,7","Gen 17:16,20","Gen 22:17-18","Gen 24:60","Gen 26:4,24","Gen 49:25","Lev 26:9","Ps 127:1-5","Ps 128:3-4"]},{"a":"replenish the earth","r":["Isa 45:18","Exod 1:7"]},{"a":"subdue it","r":["Heb 2:5-9","1 Cor 15:27-28","Dan 7:13-14"]},{"a":"have dominion over","r":["Ps 8:6-8","Rev 5:10"]}],"gen.1.29":[{"a":"I have","r":["Ps 24:1","Ps 115:16","Hos 2:8","Acts 17:24-25,28","1 Tim 6:17"]},{"a":"to you","r":["Gen 2:16","Gen 9:3","Job 36:31","Ps 104:14-15,27-28","Ps 111:5","Ps 136:25","Ps 145:15-16","Ps 146:7","Ps 147:9","Isa 33:16","Matt 6:11,25-26","Acts 14:17"]}],"gen.1.3":[{"a":"God","r":["Ps 33:6,9","Ps 148:5","Matt 8:3","John 11:43"]},{"a":"Let","r":["Job 36:30","Job 38:19","Ps 97:11","Ps 104:2","Ps 118:27","Isa 45:7","Isa 60:19","John 1:5,9","John 3:19","2 Cor 4:6","Eph 5:8,14","1 Tim 6:16","1 John 1:5","1 John 2:8"]}],"gen.1.30":[{"a":"And to every beast of the earth, and to every fowl of the air, and to every thing that creepeth upon the earth, wherein there is","r":["Gen 9:3","Job 38:39-41","Job 39:4,8,30","Job 40:15,20","Ps 104:14","Ps 145:15-16","Ps 147:9"]}],"gen.1.31":[{"a":"very good","r":["Job 38:7","Ps 19:1-2","Ps 104:24,31","Lam 3:38","1 Tim 4:4"]},{"a":"and the","r":["Gen 1:5,8,13,19,23","Gen 2:2","Exod 20:11"]}],"gen.1.4":[{"a":"that","r":["Gen 1:10,12,18,25,31","Eccl 2:13","Eccl 11:7"]}],"gen.1.5":[{"a":"Day, and","r":["Gen 8:22","Ps 19:2","Ps 74:16","Ps 104:20","Isa 45:7","Jer 33:20","1 Cor 3:13","Eph 5:13","1 Thess 5:5"]},{"a":"And the evening and the morning were","r":["Gen 1:8,13,19,23,31"]}],"gen.1.6":[{"a":"Let there","r":["Gen 1:14,20","Gen 7:11-12","Job 26:7-8,13","Job 37:11,18","Job 38:22-26","Ps 19:1","Ps 33:6,9","Ps 104:2","Ps 136:5-6","Ps 148:4","Ps 150:1","Eccl 11:3","Jer 10:10,12-13","Jer 51:15","Zech 12:1"]}],"gen.1.7":[{"a":"divided","r":["Prov 8:28-29"]},{"a":"above","r":["Job 26:8","Ps 104:10","Ps 148:4","Eccl 11:3"]},{"a":"and it","r":["Gen 1:9,11,15,24","Matt 8:27"]}],"gen.1.8":[{"a":"God","r":["Gen 1:5,10","Gen 5:2"]},{"a":"evening","r":["Gen 1:5,13,19,23,31"]}],"gen.1.9":[{"a":"And God said, Let the waters under the heaven be gathered together unto one place, and let the dry land appear: and it was so.","r":["Job 26:7,10","Job 38:8-11","Ps 24:1-2","Ps 33:7","Ps 95:5","Ps 104:3,5-9","Ps 136:5-6","Prov 8:28-29","Eccl 1:7","Jer 5:22","Jonah 1:9","2 Pet 3:5","Rev 10:6"]}],"jhn.1.1":[{"a":"the beginning","r":["John 1:2","Gen 1:1","Prov 8:22-31","Eph 3:9","Col 1:17","Heb 1:10","Heb 7:3","Heb 13:8","Rev 1:2,8,11","Rev 2:8","Rev 21:6","Rev 22:13"]},{"a":"the Word","r":["John 1:14","1 John 1:1-2","1 John 5:7","Rev 19:13"]},{"a":"with","r":["John 1:18","John 16:28","John 17:5","Prov 8:22-30","1 John 1:2"]},{"a":"the Word was","r":["John 10:30-33","John 20:28","Ps 45:6","Isa 7:14","Isa 9:6","Isa 40:9-11","Matt 1:23","Rom 9:5","Phil 2:6","1 Tim 3:16","Titus 2:13","Heb 1:8-13","2 Pet 1:1","1 John 5:7,20"]}],"jhn.1.10":[{"a":"was in","r":["John 1:18","John 5:17","Gen 11:6-9","Gen 16:13","Gen 17:1","Gen 18:33","Exod 3:4-6","Acts 14:17","Acts 17:24-27","Heb 1:3"]},{"a":"and the world was","r":["Jer 10:11-12","Heb 1:2","Heb 11:3"]},{"a":"knew","r":["John 1:5","John 17:25","Matt 11:27","1 Cor 1:21","1 Cor 2:8","1 John 3:1"]}],"jhn.1.11":[{"a":"came","r":["Matt 15:24","Acts 3:25-26","Acts 13:26","Acts 13:26,46","Rom 9:1,5","Rom 15:8","Gal 4:4"]},{"a":"and","r":["John 3:32","Isa 53:2-3","Luke 19:14","Luke 20:13-15","Acts 7:51-52"]}],"jhn.1.12":[{"a":"received","r":["Matt 10:40","Matt 18:5","Col 2:6"]},{"a":"to them","r":["Isa 56:5","Jer 3:19","Hos 1:10","Rom 8:14","2 Cor 6:17-18","Gal 3:26","Gal 4:6","2 Pet 1:4","1 John 3:1"]},{"a":"even","r":["John 2:23","John 3:18","John 20:31","Matt 12:21","Acts 3:16","1 John 3:23","1 John 5:12"]}],"jhn.1.13":[{"a":"were","r":["John 3:3,5","Jas 1:18","1 Pet 1:3,23","1 Pet 2:2","1 John 3:9","1 John 4:7","1 John 5:1,4,18"]},{"a":"not","r":["John 8:33-41","Matt 3:9","Rom 9:7-9"]},{"a":"nor of the will of the","r":["Gen 25:22,28","Gen 27:4,33","Rom 9:10-16"]},{"a":"nor of the will of man","r":["Ps 110:3","Rom 9:1-5","Rom 10:1-3","1 Cor 3:6","Phil 2:13","Jas 1:18"]},{"a":"of God","r":["John 3:6-8","Titus 3:5","1 John 2:28-29"]}],"jhn.1.14":[{"a":"the Word","r":["John 1:1","Isa 7:14","Matt 1:16,20-23","Luke 1:31-35","Luke 2:7,11","Rom 1:3-4","Rom 9:5","1 Cor 15:47","Gal 4:4","Phil 2:6-8","1 Tim 3:16","Heb 2:11,14-17","Heb 10:5","1 John 4:2-3","2 John 1:7"]},{"a":"we","r":["John 2:11","John 11:40","John 12:40-41","John 14:9","Isa 40:5","Isa 53:2","Isa 60:1-2","Matt 17:1-5","2 Cor 4:4-6","Heb 1:3","1 Pet 2:4-7","2 Pet 1:17","1 John 1:1-2"]},{"a":"the only","r":["John 1:18","John 3:16,18","Ps 2:7","Acts 13:33","Heb 1:5","Heb 5:5","1 John 4:9"]},{"a":"full","r":["John 1:16-17","Ps 45:2","2 Cor 12:9","Eph 3:8,18-19","Col 1:19","Col 2:3,9","1 Tim 1:14-16"]}],"jhn.1.15":[{"a":"bare","r":["John 1:7-8,29-34","John 3:26-36","John 5:33-36","Matt 3:11,13-17","Mark 1:7","Luke 3:16"]},{"a":"he was","r":["John 1:1-2,30","John 8:58","John 17:5","Prov 8:22","Isa 9:6","Mic 5:2","Phil 2:6-7","Col 1:17","Heb 13:8","Rev 1:11,17-18","Rev 2:8"]}],"jhn.1.16":[{"a":"of his","r":["John 3:34","John 15:1-5","Matt 3:11,14","Luke 21:15","Acts 3:12-16","Rom 8:9","1 Cor 1:4-5","Eph 4:7-12","Col 1:19","Col 2:3,9-10","1 Pet 1:11"]},{"a":"and grace","r":["Zech 4:7","Matt 13:12","Rom 5:2,17,20","Eph 1:6-8","Eph 2:5-10","Eph 4:7","1 Pet 1:2"]}],"jhn.1.17":[{"a":"the law","r":["John 5:45","John 9:29","Exod 20:1-17","Deut 4:44","Deut 5:1","Deut 33:4","Acts 7:38","Acts 28:23","Rom 3:19-20","Rom 5:20-21","2 Cor 3:7-10","Gal 3:10-13,17","Heb 3:5-6","Heb 8:8-12"]},{"a":"grace","r":["John 8:32","John 14:6","Gen 3:15","Gen 22:18","Ps 85:10","Ps 89:1-2","Ps 98:3","Mic 7:20","Luke 1:54-55,68-79","Acts 13:34-39","Rom 3:21-26","Rom 5:21","Rom 6:14","Rom 15:8-12","2 Cor 1:20","Heb 9:22","Heb 10:4-10","Heb 11:39-40","Rev 5:8-10","Rev 7:9-17"]}],"jhn.1.18":[{"a":"seen","r":["John 6:46","Exod 33:20","Deut 4:12","Matt 11:27","Luke 10:22","Col 1:15","1 Tim 1:17","1 Tim 6:16","1 John 4:12,20"]},{"a":"the only","r":["John 1:14","John 3:16-18","1 John 4:9"]},{"a":"in the","r":["John 13:23","Prov 8:30","Isa 40:11","Lam 2:12","Luke 16:22-23"]},{"a":"he hath","r":["John 12:41","John 14:9","John 17:6,26","Gen 16:13","Gen 18:33","Gen 32:28-30","Gen 48:15-16","Exod 3:4-6","Exod 23:21","Exod 33:18-23","Exod 34:5-7","Num 12:8","Josh 5:13-15","Josh 6:1-2","Judg 6:12-26","Judg 13:20-23","Isa 6:1-3","Ezek 1:26-28","Hos 12:3-5","Matt 11:27","Luke 10:22","1 John 5:20"]}],"jhn.1.19":[{"a":"when","r":["John 5:33-36","Deut 17:9-11","Deut 24:8","Matt 21:23-32","Luke 3:15-18"]},{"a":"Who","r":["John 10:24","Acts 13:25","Acts 19:4"]}],"jhn.1.20":[{"a":"And he confessed, and denied not; but confessed, I am not the Christ.","r":["John 3:28-36","Matt 3:11-12","Mark 1:7-8","Luke 3:15-17"]}],"jhn.1.21":[{"a":"Art thou Elias","r":["Mal 4:5","Matt 11:14","Matt 17:10-12","Luke 1:17"]},{"a":"Art thou that","r":["John 1:25","John 7:40","Deut 18:15-18","Matt 11:9-11","Matt 16:14"]}],"jhn.1.22":[{"a":"that","r":["2 Sam 24:13"]}],"jhn.1.23":[{"a":"I am","r":["John 3:28","Matt 3:3","Mark 1:3","Luke 1:16-17,76-79","Luke 3:4-6"]},{"a":"as said","r":["Isa 40:3-5"]}],"jhn.1.24":[{"a":"were of","r":["John 3:1-2","John 7:47-49","Matt 23:13-15,26","Luke 7:30","Luke 11:39-44,53","Luke 16:14","Acts 23:8","Acts 26:5","Phil 3:5-6"]}],"jhn.1.25":[{"a":"Why","r":["Matt 21:23","Acts 4:5-7","Acts 5:28"]},{"a":"that Christ","r":["John 1:20-22","Dan 9:24-26"]}],"jhn.1.26":[{"a":"I","r":["Matt 3:11","Mark 1:8","Luke 3:16","Acts 1:5","Acts 11:16"]},{"a":"whom","r":["John 1:10-11","John 8:19","John 16:3","John 17:3,25","Mal 3:1-2","1 John 3:1"]}],"jhn.1.27":[{"a":"who","r":["John 1:15,30","Acts 19:4"]},{"a":"whose","r":["Matt 3:11","Mark 1:7","Luke 3:16"]}],"jhn.1.28":[{"a":"Bethabara","r":["John 10:40","Judg 7:24"]},{"a":"Bethbarah","r":["John 12:5"]},{"a":"where","r":["John 3:23"]}],"jhn.1.29":[{"a":"Behold","r":["John 1:36","Gen 22:7-8","Exod 12:3-13","Num 28:3-10","Isa 53:7","Acts 8:32","1 Pet 1:19","Rev 5:6,8,12-13","Rev 6:1,16","Rev 7:9-10,14,17","Rev 12:11","Rev 13:8","Rev 14:1,4,10","Rev 15:3","Rev 17:14","Rev 19:7,9","Rev 21:9,14,22-23,27","Rev 22:1-3"]},{"a":"which","r":["Isa 53:11","Hos 14:2","Matt 20:28","Acts 13:39","1 Cor 15:3","2 Cor 5:21","Gal 1:4","Gal 3:13","1 Tim 2:6","Titus 2:14","Heb 1:3","Heb 2:17","Heb 9:28","1 Pet 2:24","1 Pet 3:18","1 John 2:2","1 John 3:5","1 John 4:10","Rev 1:5"]},{"a":"taketh","r":["Exod 28:38","Lev 10:17","Lev 16:21-22","Num 18:1,23"]}],"jhn.1.3":[{"a":"All things were made by him; and without him was not any thing made that was made.","r":["John 1:10","John 5:17-19","Gen 1:1,26","Ps 33:6","Ps 102:25","Isa 45:12,18","Eph 3:9","Col 1:16-17","Heb 1:2-3,10-12","Heb 3:3-4","Rev 4:11"]}],"jhn.1.30":[{"a":"This is he of whom I said, After me cometh a man which is preferred before me: for he was before me.","r":["John 1:15,27","Luke 3:16"]}],"jhn.1.31":[{"a":"I knew","r":["John 1:33","Luke 1:80","Luke 2:39-42"]},{"a":"but","r":["John 1:7","Isa 40:3-5","Mal 3:1","Mal 4:2-5","Luke 1:17,76-79"]},{"a":"therefore","r":["Matt 3:6","Mark 1:3-5","Luke 3:3-4","Acts 19:4"]}],"jhn.1.32":[{"a":"I saw","r":["John 5:32","Matt 3:16","Mark 1:10","Luke 3:22"]}],"jhn.1.33":[{"a":"I knew","r":["John 1:31","Matt 3:13-15"]},{"a":"the same","r":["John 3:5,34","Matt 3:11,14","Mark 1:7-8","Luke 3:16","Acts 1:5","Acts 2:4","Acts 10:44-47","Acts 11:15-16","Acts 19:2-6","1 Cor 12:13","Titus 3:5-6"]}],"jhn.1.34":[{"a":"this","r":["John 1:18,49","John 3:16-18,35-36","John 5:23-27","John 6:69","John 10:30,36","John 11:27","John 19:7","John 20:28,31","Ps 2:7","Ps 89:26-27","Matt 3:17","Matt 4:3,6","Matt 8:29","Matt 11:27","Matt 16:16","Matt 17:5","Matt 26:63","Matt 27:40,43,54","Mark 1:1,11","Luke 1:35","Luke 3:22","Rom 1:4","2 Cor 1:19","Heb 1:1-2,5-6","Heb 7:3","1 John 2:23","1 John 3:8","1 John 4:9,14-15","1 John 5:9-13,20","2 John 1:9","Rev 2:18"]}],"jhn.1.35":[{"a":"and two","r":["John 3:25-26","Mal 3:16"]}],"jhn.1.36":[{"a":"Behold","r":["John 1:29","Isa 45:22","Isa 65:1-2","Heb 12:2","1 Pet 1:19-20"]}],"jhn.1.37":[{"a":"and they","r":["John 1:43","John 4:39-42","Prov 15:23","Zech 8:21","Rom 10:17","Eph 4:29","Rev 22:17"]}],"jhn.1.38":[{"a":"turned","r":["Luke 14:25","Luke 15:20","Luke 19:5","Luke 22:61"]},{"a":"What","r":["John 18:4,7","John 20:15-16","Luke 7:24-27","Luke 18:40-41","Acts 10:21,29"]},{"a":"Rabbi","r":["John 1:49","John 3:2,26","John 6:25","Matt 23:7-8"]},{"a":"where","r":["John 12:21","Ruth 1:16","1 Kgs 10:8","Ps 27:4","Prov 3:18","Prov 8:34","Prov 13:20","Song 1:7-8","Luke 8:38","Luke 10:39"]}],"jhn.1.39":[{"a":"Come","r":["John 1:46","John 6:37","John 14:22-23","Prov 8:17","Matt 11:28-30"]},{"a":"abode","r":["John 4:40","Acts 28:30-31","Rev 3:20"]},{"a":"about","r":["Luke 24:29"]}],"jhn.1.4":[{"a":"him","r":["John 5:21,26","John 11:25","John 14:6","1 Cor 15:45","Col 3:4","1 John 1:2","1 John 5:11","Rev 22:1"]},{"a":"the life","r":["John 1:8-9","John 8:12","John 9:5","John 12:35,46","Ps 84:11","Isa 35:4-5","Isa 42:6-7,16","Ps 49:6","Ps 60:1-3","Mal 4:2","Matt 4:16","Luke 1:78-79","Luke 2:32","Acts 26:23","Eph 5:14","1 John 1:5-7","Rev 22:16"]}],"jhn.1.40":[{"a":"Andrew","r":["John 6:8","Matt 4:18","Matt 10:2","Acts 1:13"]}],"jhn.1.41":[{"a":"first","r":["John 1:36-37,45","John 4:28-29","2 Kgs 7:9","Isa 2:3-5","Luke 2:17,38","Acts 13:32-33","1 John 1:3"]},{"a":"the Messias","r":["John 4:25","Dan 9:25-26"]},{"a":"Christ","r":["Ps 2:2","Ps 45:7","Ps 89:20","Isa 11:2","Isa 61:1","Luke 4:18-21","Acts 4:27","Acts 10:38","Heb 1:8-9"]}],"jhn.1.42":[{"a":"Thou art","r":["John 1:47-48","John 2:24-25","John 6:70-71","John 13:18"]},{"a":"the son","r":["John 21:15-17"]},{"a":"Jonas","r":["Matt 16:17"]},{"a":"Barjona","r":["1 Cor 1:12","1 Cor 3:22","1 Cor 9:5","1 Cor 15:5","Gal 2:9"]},{"a":"A stone","r":["John 21:2","Matt 10:2","Matt 16:18","Mark 3:16","Luke 5:8","Luke 6:14"]}],"jhn.1.43":[{"a":"and findeth","r":["Isa 65:1","Matt 4:18-21","Matt 9:9","Luke 19:10","Phil 3:12","1 John 4:19"]}],"jhn.1.44":[{"a":"Philip","r":["John 12:21","John 14:8-9","Matt 10:3","Mark 3:18","Luke 6:14","Acts 1:13"]},{"a":"Bethsaida","r":["Matt 11:21","Mark 6:45","Mark 8:22","Luke 9:10","Luke 10:13"]}],"jhn.1.45":[{"a":"Nathanael","r":["John 21:2"]},{"a":"of whom","r":["John 5:45-46","Gen 3:15","Gen 22:18","Gen 49:10","Deut 18:18-22","Luke 24:27,44"]},{"a":"and the","r":["Isa 4:2","Isa 7:14","Isa 9:6","Isa 53:2","Mic 5:2","Zech 6:12","Zech 9:9","Luke 24:27"]},{"a":"Jesus","r":["John 18:5,7","John 19:19","Matt 2:23","Matt 21:11","Mark 14:67","Luke 2:4","Acts 2:22","Acts 3:6","Acts 10:38","Acts 22:8","Acts 26:9"]},{"a":"the son","r":["Matt 13:55","Mark 6:3","Luke 4:22"]}],"jhn.1.46":[{"a":"Can","r":["John 7:41-42,52","Luke 4:28-29"]},{"a":"Come","r":["John 4:29","Luke 12:57","1 Thess 5:21"]}],"jhn.1.47":[{"a":"Behold","r":["John 8:31,39","Rom 2:28-29","Rom 9:6","Phil 3:3"]},{"a":"in","r":["Ps 32:2","Ps 73:1","1 Pet 2:1,22","Rev 14:5"]}],"jhn.1.48":[{"a":"when","r":["John 2:25","Gen 32:24-30","Ps 139:1-2","Isa 65:24","Matt 6:6","1 Cor 4:5","1 Cor 14:25","Rev 2:18-19"]}],"jhn.1.49":[{"a":"thou","r":["John 1:18,34","John 20:28-29","Matt 14:33"]},{"a":"the King","r":["John 12:13-15","John 18:37","John 19:19-22","Ps 2:6","Ps 110:1","Isa 9:7","Jer 23:5-6","Ezek 37:21-25","Dan 9:25","Hos 3:5","Mic 5:2","Zeph 3:15","Zech 6:12-13","Zech 9:9","Matt 2:2","Matt 21:5","Matt 27:11,42","Luke 19:38"]}],"jhn.1.5":[{"a":"And the light shineth in darkness; and the darkness comprehended it not.","r":["John 1:10","John 3:19-20","John 12:36-40","Job 24:13-17","Prov 1:22,29-30","Rom 1:28","1 Cor 2:14"]}],"jhn.1.50":[{"a":"Because","r":["John 20:29","Luke 1:45","Luke 7:9"]},{"a":"thou shalt","r":["John 11:40","Matt 13:12","Matt 25:29"]}],"jhn.1.51":[{"a":"Verily","r":["John 3:3,5","John 5:19,24-25","John 6:26,32,47,53","John 8:34,51,58","John 10:1,7","John 12:24","John 13:16","John 13:20-21,38","John 14:12","John 16:20,23","John 21:18"]},{"a":"Hereafter","r":["Ezek 1:1","Matt 3:16","Mark 1:10","Luke 3:21","Acts 7:56","Acts 10:11","Rev 4:1","Rev 19:11"]},{"a":"and the","r":["Gen 28:12","Dan 7:9-10","Matt 4:11","Luke 2:9,13","Luke 22:43","Luke 24:4","Acts 1:10-11","2 Thess 1:7","1 Tim 3:16","Heb 1:14","Jude 1:14"]},{"a":"the Son","r":["John 3:13-14","John 5:27","John 12:23-24","Dan 7:13-14","Zech 13:7","Matt 9:6","Matt 16:13-16","Matt 16:27-28","Matt 25:31","Matt 26:24","Mark 14:62","Luke 22:69"]}],"jhn.1.6":[{"a":"A. M. 3999. B.C. 5. a man","r":["John 1:33","John 3:28","Isa 40:3-5","Mal 3:1","Mal 4:5-6","Matt 3:1-11","Matt 11:10","Matt 21:25","Mark 1:1-8","Luke 1:15-17,76","Luke 3:2-20","Acts 13:24"]},{"a":"John","r":["Luke 1:13,61-63"]}],"jhn.1.7":[{"a":"a witness","r":["John 1:19,26-27,32-34,36","John 3:26-36","John 5:33-35","Acts 19:4"]},{"a":"that","r":["John 1:9","John 3:26","Eph 3:9","1 Tim 2:4","Titus 2:11","2 Pet 3:9"]}],"jhn.1.8":[{"a":"that light","r":["John 1:20","John 3:28","Acts 19:4"]}],"jhn.1.9":[{"a":"the true","r":["John 1:4","John 6:32","John 14:6","John 15:1","Isa 49:6","Matt 6:23","1 John 1:8","1 John 2:8","1 John 5:20"]},{"a":"every","r":["John 1:7","John 7:12","John 12:46","Isa 8:20","1 Thess 5:4-7"]}],"jhn.14.1":[{"a":"not","r":["John 14:27-28","John 11:33","John 12:27","John 16:3,6,22-23","Job 21:4-6","Job 23:15-16","Ps 42:5-6,8-11","Ps 43:5","Ps 77:2-3,10","Isa 43:1-2","Jer 8:18","Lam 3:17-23","2 Cor 2:7","2 Cor 4:8-10","2 Cor 12:9-10","1 Thess 3:3-4","2 Thess 2:2","Heb 12:12-13"]},{"a":"ye","r":["John 5:23","John 6:40","John 11:25-27","John 12:44","John 13:19","Isa 12:2-3","Isa 26:3","Acts 3:15-16","Eph 1:12-13,15","Eph 3:14-17","1 Pet 1:21","1 John 2:23-24","1 John 5:10-12"]}],"jhn.14.10":[{"a":"Believest","r":["John 14:20","John 1:1-3","John 10:30,38","John 11:26","John 17:21-23","1 John 5:7"]},{"a":"words","r":["John 3:32-34","John 5:19","John 6:38-40","John 7:16,28-29","John 8:28,38,40","John 12:49","John 17:8"]},{"a":"dwelleth","r":["Ps 68:16-18","2 Cor 5:19","Col 1:19","Col 2:9"]},{"a":"he","r":["John 5:17","Acts 10:38"]}],"jhn.14.11":[{"a":"or","r":["John 5:36","John 10:25,32,38","John 12:38-40","Matt 11:4-5","Luke 7:21-23","Acts 2:22","Heb 2:4"]}],"jhn.14.12":[{"a":"the","r":["Matt 21:21","Mark 11:13","Mark 16:17","Luke 10:17-19","Acts 3:6-8","Acts 4:9-12,16,33","Acts 8:7","Acts 9:34,40","Acts 16:18","1 Cor 12:10-11"]},{"a":"greater","r":["Acts 2:4-11,41","Acts 4:4","Acts 5:15","Acts 6:7","Acts 10:46","Acts 19:12","Rom 15:19"]},{"a":"because","r":["John 14:28","John 7:39","John 16:7","Acts 2:33"]}],"jhn.14.13":[{"a":"whatsoever","r":["John 15:7,16","John 16:23,26","Matt 7:7","Matt 21:22","Mark 11:24","Luke 11:9","Eph 3:20","Jas 1:5","Jas 5:16","1 John 3:22","1 John 5:14"]},{"a":"in my","r":["John 14:6","Eph 2:18","Eph 3:12,14,21","Col 3:17","Heb 4:15","Heb 7:25","Heb 13:15","1 Pet 2:5"]},{"a":"will","r":["John 14:14","John 4:10,14","John 5:19","John 7:37","John 10:30","John 16:7","2 Cor 12:8-10","Phil 4:13"]},{"a":"that","r":["John 12:44","John 13:31","John 17:4-5","Phil 2:9-11"]}],"jhn.14.15":[{"a":"If ye love me, keep my commandments.","r":["John 14:21-24","John 8:42","John 15:10-14","John 21:15-17","Matt 10:37","Matt 25:34-40","1 Cor 16:22","2 Cor 5:14-15","2 Cor 8:8-9","Gal 5:6","Eph 3:16-18","Eph 6:24","Phil 1:20-23","Phil 3:7-11","1 Pet 1:8","1 John 2:3-5","1 John 4:19-20","1 John 5:2-3"]}],"jhn.14.16":[{"a":"I will","r":["John 14:14","John 16:26-27","John 17:9-11,15,20","Rom 8:34","Heb 7:25","1 John 2:1"]},{"a":"another","r":["John 14:18,26","John 15:26","John 16:7-15","Acts 9:31","Acts 13:52","Rom 5:5","Rom 8:15-16,26-27","Rom 14:17","Rom 15:13","Gal 5:22","Phil 2:1"]},{"a":"abide","r":["John 4:14","John 16:22","Matt 28:20","Eph 1:13-14","Col 3:3-4","2 Thess 2:16"]}],"jhn.14.17":[{"a":"the Spirit","r":["John 15:26","John 16:13","1 John 2:27","1 John 4:6"]},{"a":"whom","r":["Prov 14:10","1 Cor 2:14","Rev 2:17"]},{"a":"but","r":["John 14:16,23","Isa 57:15","Isa 59:21","Ezek 36:27","Rom 8:9,11,13-14","1 Cor 3:16","1 Cor 6:19","2 Cor 6:16","Eph 2:22","Eph 3:17","2 Tim 1:14","1 John 2:27","1 John 3:24","1 John 4:12-13"]},{"a":"shall","r":["Matt 10:20","Rom 8:10","1 Cor 14:15","2 Cor 13:5","Gal 4:6","Col 1:27","1 John 4:4"]}],"jhn.14.18":[{"a":"will not","r":["John 14:16,27","John 16:33","Ps 23:4","Isa 43:1","Isa 51:12","Isa 66:11-13","2 Cor 1:2-6","2 Thess 2:16","Heb 2:18"]},{"a":"comfortless","r":["Lam 5:3","Hos 14:3"]},{"a":"will come","r":["John 14:3,28","Ps 101:2","Hos 6:3","Matt 18:20","Matt 28:20"]}],"jhn.14.19":[{"a":"a little","r":["John 7:33","John 8:21","John 12:35","John 13:33","John 16:16,22"]},{"a":"because","r":["John 14:6","John 6:56-58","John 11:25","Rom 5:10","Rom 8:34","1 Cor 15:20,45","2 Cor 4:10-12","Col 3:3-4","Heb 7:25","1 John 1:1-3"]}],"jhn.14.2":[{"a":"my","r":["2 Cor 5:1","Heb 11:10,14-16","Heb 13:14","Rev 3:12,21","Rev 21:10-27"]},{"a":"if","r":["John 12:25-26","John 16:4","Luke 14:26-33","Acts 9:16","1 Thess 3:3-4","1 Thess 5:9","2 Thess 1:4-10","Titus 1:2","Rev 1:5"]},{"a":"I go","r":["John 13:33,36","John 17:24","Heb 6:20","Heb 9:8,23-26","Heb 11:16","Rev 21:2"]}],"jhn.14.20":[{"a":"ye shall","r":["John 14:10","John 10:38","John 17:7,11,21-23,26","2 Cor 5:19","Col 1:19","Col 2:9"]},{"a":"ye in","r":["John 6:56","John 15:5-7","Rom 8:1","Rom 16:7","1 Cor 1:30","2 Cor 5:17","2 Cor 12:2","2 Cor 13:5","Gal 2:20","Eph 2:10","Col 1:27","1 John 4:12"]}],"jhn.14.21":[{"a":"that hath","r":["John 14:15,23-24","John 15:14","Gen 26:3-5","Deut 10:12-13","Deut 11:13","Deut 30:6-8","Ps 119:4-6","Jer 31:31,33-34","Ezek 36:25-27","Luke 11:28","2 Cor 5:14-15","Jas 2:23-24","1 John 2:5","1 John 3:18-24","1 John 5:3","2 John 1:6","Rev 22:14"]},{"a":"that loveth","r":["John 14:23","John 15:9-10","John 16:27","John 17:23","Ps 35:27","Isa 62:2-5","Zeph 3:17","2 Thess 2:16","1 John 3:1"]},{"a":"and will","r":["John 14:18,22-23","John 16:14","Acts 18:9-11","Acts 22:18","2 Cor 3:18","2 Cor 4:6","2 Cor 12:8","2 Tim 4:17-18,22","1 John 1:1-3","Rev 2:17","Rev 3:20"]}],"jhn.14.22":[{"a":"Judas","r":["Matt 10:3"]},{"a":"Lebbaeus, Thaddaeus","r":["Mark 3:18"]},{"a":"Thaddaeus","r":["Luke 6:16","Acts 1:13","Jude 1:1"]},{"a":"how","r":["John 3:4,9","John 4:11","John 6:52,60","John 16:17-18"]}],"jhn.14.23":[{"a":"If","r":["John 14:15,21"]},{"a":"make","r":["John 14:17","John 5:17-19","John 6:56","John 10:30","Gen 1:26","Gen 11:7","Ps 90:1","Ps 91:1","Isa 57:15","Rom 8:9-11","1 John 2:24","1 John 4:4,15-16","Rev 3:20-21","Rev 7:15-17","Rev 21:22","Rev 22:3"]}],"jhn.14.24":[{"a":"that","r":["John 14:15,21-23","Matt 19:21","Matt 25:41-46","2 Cor 8:8-9","1 John 3:16-20"]},{"a":"and","r":["John 14:10","John 3:34","John 5:19,38","John 7:16,28","John 8:26,28,38,42","John 12:44-50"]}],"jhn.14.25":[{"a":"have","r":["John 14:29","John 13:19","John 15:11","John 16:1-4,12","John 17:6-8"]}],"jhn.14.26":[{"a":"Holy Ghost","r":["John 7:39","John 20:22","Ps 51:11","Isa 63:10","Matt 1:18,20","Matt 3:11","Matt 28:19","Mark 12:36","Mark 13:11","Luke 1:15,35,41,67","Luke 2:25","Luke 3:22","Luke 11:13","Acts 1:2,8","Acts 2:4","Acts 5:3","Acts 7:51,55","Acts 13:2,4","Acts 15:8,28","Acts 16:6","Acts 20:28","Acts 28:25","Rom 5:5","Rom 14:17","Rom 15:13,16","1 Cor 2:13","1 Cor 6:19","1 Cor 12:3","2 Cor 6:6","2 Cor 13:14","Eph 1:13","Eph 4:30","1 Thess 1:5-6","1 Thess 4:8","2 Tim 1:14","Titus 3:5","Heb 2:4","Heb 3:7","Heb 9:8","Heb 10:15","1 Pet 1:12","2 Pet 1:21","1 John 5:7","Jude 1:20"]},{"a":"whom","r":["John 14:16","John 15:26","John 16:7","Luke 24:49","Acts 1:4"]},{"a":"he","r":["John 6:45","John 16:13-14","Ps 25:8-9,12-14","Isa 54:13","Jer 31:33-34","1 Cor 2:10-13","Eph 1:17","1 John 2:20,27","Rev 2:11"]},{"a":"bring","r":["John 2:22","John 12:16","Acts 11:16","Acts 20:35"]}],"jhn.14.27":[{"a":"Peace I leave","r":["John 16:33","John 20:19,21,26","Num 6:26","Ps 29:11","Ps 72:2,7","Ps 85:10","Isa 9:6","Isa 32:15-17","Isa 54:7-10,13","Isa 55:12","Isa 57:19","Zech 6:13","Luke 1:79","Luke 2:14","Luke 10:5","Acts 10:36","Rom 1:7","Rom 5:1,10","Rom 8:6","Rom 15:13","1 Cor 1:3","2 Cor 5:18-21","Gal 1:3","Gal 5:22","Gal 6:16","Eph 2:14-17","Phil 4:7","Col 1:2,20","Col 3:15","2 Thess 1:2","2 Thess 3:16","Heb 7:2","Heb 13:20","Rev 1:4"]},{"a":"not","r":["Job 34:29","Ps 28:3","Lam 3:17","Dan 4:1","Dan 6:25"]},{"a":"afraid","r":["Ps 11:1","Ps 27:1","Ps 56:3,11","Ps 91:5","Ps 112:7","Prov 3:25","Isa 12:2","Isa 41:10,14","Jer 1:8","Ezek 2:6","Matt 10:26","Luke 12:4","Acts 18:9","2 Tim 1:7","Rev 2:10","Rev 21:8"]}],"jhn.14.28":[{"a":"heard","r":["John 14:3,18","John 16:16-22"]},{"a":"If","r":["John 16:7","Ps 47:5-7","Ps 68:9,18","Luke 24:51-53","1 Pet 1:8"]},{"a":"I go","r":["John 14:12","John 16:16","John 20:17"]},{"a":"Father","r":["John 5:18","John 10:30,38","John 13:16","John 20:21","Isa 42:1","Isa 49:5-7","Isa 53:11","Matt 12:18","1 Cor 11:3","1 Cor 15:24-28","Phil 2:6-11","Heb 1:2-3","Heb 2:9-15","Heb 3:1-4","Rev 1:11,17","Rev 1:18"]}],"jhn.14.29":[{"a":"And now I have told you before it come to pass, that, when it is come to pass, ye might believe.","r":["John 13:19","John 16:4-31","Matt 24:24-25"]}],"jhn.14.3":[{"a":"I will","r":["John 14:18-23,28","John 12:26","John 17:24","Matt 25:32-34","Acts 1:11","Acts 7:59-60","Rom 8:17","2 Cor 5:6-8","Phil 1:23","1 Thess 4:16-17","2 Thess 1:12","2 Thess 2:1","2 Tim 2:12","Heb 9:28","1 John 3:2-3","Rev 3:21","Rev 21:22-23","Rev 22:3-5"]}],"jhn.14.30":[{"a":"I","r":["John 16:12","Luke 24:44-49","Acts 1:3"]},{"a":"the","r":["John 12:31","John 16:11","Luke 22:53","2 Cor 4:4","Eph 2:2","Eph 6:12","Col 1:13","1 John 4:4","1 John 5:19","Rev 12:9","Rev 20:2-3,7-8"]},{"a":"and","r":["Luke 1:35","2 Cor 5:21","Heb 4:15","Heb 7:26","1 Pet 1:19","1 Pet 2:22","1 John 3:5-8"]}],"jhn.14.31":[{"a":"that the","r":["John 4:34","John 10:18","John 12:27","John 15:9","John 18:11","Ps 40:8","Matt 26:39","Phil 2:8","Heb 5:7-8","Heb 10:5-9","Heb 12:2-3"]},{"a":"Arise","r":["John 18:1-4","Matt 26:46","Luke 12:50"]}],"jhn.14.4":[{"a":"whither","r":["John 14:2,28","John 13:3","John 16:28","Luke 24:26"]},{"a":"and the","r":["John 3:16-17,36","John 6:40,68-69","John 10:9","John 12:26"]}],"jhn.14.5":[{"a":"Thomas","r":["John 20:25-28"]},{"a":"we know not","r":["John 15:12","Mark 8:17-18","Mark 9:19","Luke 24:25","Heb 5:11-12"]}],"jhn.14.6":[{"a":"I am","r":["John 10:9","Isa 35:8-9","Matt 11:27","Acts 4:12","Rom 5:2","Eph 2:18","Heb 7:25","Heb 9:8","Heb 10:19-22","1 Pet 1:21"]},{"a":"the truth","r":["John 1:14,17","John 8:32","John 15:1","John 18:37","Rom 15:8-9","2 Cor 1:19-20","Col 2:9,17","1 John 1:8","1 John 5:6,20","Rev 1:5","Rev 3:7,14","Rev 19:11"]},{"a":"the life","r":["John 14:19","John 1:4","John 5:21,25-29","John 6:33,51,57,68","John 8:51","John 10:28","John 11:25-26","John 17:2-3","Acts 3:15","Rom 5:21","1 Cor 15:45","Col 3:4","1 John 1:1-2","1 John 5:11-12","Rev 22:1,17"]},{"a":"no","r":["John 10:7,9","Acts 4:12","Rom 15:16","1 Pet 2:4","1 Pet 3:18","1 John 2:23","2 John 1:9","Rev 5:8-9","Rev 7:9-17","Rev 13:7-8","Rev 20:15"]}],"jhn.14.7":[{"a":"ye","r":["John 14:9-10,20","John 1:18","John 8:19","John 15:24","John 16:3","John 17:3,21,23","Matt 11:27","Luke 10:22","2 Cor 4:6","Col 1:15-17","Col 2:2-3","Heb 1:3"]},{"a":"from","r":["John 14:16-20","John 16:13-16","John 17:6,8,26"]}],"jhn.14.8":[{"a":"Philip","r":["John 1:43-46","John 6:5-7","John 12:21-22"]},{"a":"shew","r":["John 16:25","Exod 33:18-23","Exod 34:5-7","Job 33:26","Ps 17:15","Ps 63:2","Matt 5:8","Rev 22:3-5"]}],"jhn.14.9":[{"a":"Have","r":["Mark 9:19"]},{"a":"he","r":["John 14:7,20","John 12:45","Col 1:15","Phil 2:6","Heb 1:3"]},{"a":"how","r":["Gen 26:9","Ps 11:1","Jer 2:23","Luke 12:56","1 Cor 15:12"]}],"jhn.3.1":[{"a":"There was a man of the Pharisees, named Nicodemus, a ruler of the Jews:","r":["John 3:10","John 7:47-49"]}],"jhn.3.10":[{"a":"Art","r":["Isa 9:16","Isa 29:10-12","Isa 56:10","Jer 8:8-9","Matt 11:25","Matt 15:14","Matt 22:29"]},{"a":"and knowest","r":["Deut 10:16","Deut 30:6","1 Chr 29:19","Ps 51:6,10","Ps 73:1","Isa 11:6-9","Isa 66:7-9","Jer 31:33","Jer 32:39-40","Ezek 11:19","Ezek 18:31-32","Ezek 36:25-27","Ezek 37:23-24","Rom 2:28","Phil 3:3","Col 2:11"]}],"jhn.3.11":[{"a":"verily","r":["John 3:3,5"]},{"a":"We speak","r":["John 3:13,32-34","John 1:18","John 7:16","John 8:14,28-29,38","John 12:49","John 14:24","Isa 55:4","Matt 11:27","Luke 10:22","1 John 1:1-3","1 John 5:6-12","Rev 1:5","Rev 3:14"]},{"a":"ye","r":["John 3:32","John 1:11","John 5:31-40,43","John 12:37-38","Isa 50:2","Isa 53:1","Isa 65:2","Matt 23:37","Acts 22:18","Acts 28:23-27","2 Cor 4:4"]}],"jhn.3.12":[{"a":"earthly","r":["John 3:3,5,8","1 Cor 3:1-2","Heb 5:11","1 Pet 2:1-3"]},{"a":"heavenly","r":["John 3:13-17,31-36","John 1:1-14","1 Cor 2:7-9","1 Tim 3:16","1 John 4:10"]}],"jhn.3.13":[{"a":"no man","r":["John 1:18","John 6:46","Deut 30:12","Prov 30:4","Acts 2:34","Rom 10:6","Eph 4:9"]},{"a":"but","r":["John 6:33,38,51,62","John 8:42","John 13:3","John 16:28-30","John 17:5","1 Cor 15:47"]},{"a":"even","r":["John 1:18","Matt 28:20","Mark 16:19-20","Acts 20:28","Eph 1:23","Eph 4:10"]}],"jhn.3.14":[{"a":"as","r":["Num 21:7-9","2 Kgs 18:4"]},{"a":"even","r":["John 8:28","John 12:32-34","Ps 22:16","Matt 26:54","Luke 18:31-33","Luke 24:20,26-27,44-46","Acts 2:23","Acts 4:27-28"]}],"jhn.3.15":[{"a":"whosoever","r":["John 3:16,36","John 1:12","John 6:40,47","John 11:25-26","John 12:44-46","John 20:31","Isa 45:22","Mark 16:16","Acts 8:37","Acts 16:30-31","Rom 5:1-2","Rom 10:9-14","Gal 2:16,20","Heb 7:25","Heb 10:39","1 John 5:1,11-13"]},{"a":"not","r":["John 5:24","John 10:28-30","Matt 18:11","Luke 19:10","Acts 13:41","1 Cor 1:18","2 Cor 4:3"]},{"a":"eternal","r":["John 17:2-3","Rom 5:21","Rom 6:22-23","1 John 2:25","1 John 5:13,20"]}],"jhn.3.16":[{"a":"God","r":["Luke 2:14","Rom 5:8","2 Cor 5:19-21","Titus 3:4","1 John 4:9-10,19"]},{"a":"gave","r":["John 1:14,18","Gen 22:12","Mark 12:6","Rom 5:10","Rom 8:32"]},{"a":"that whosoever","r":["John 3:15","Matt 9:13","1 Tim 1:15-16"]}],"jhn.3.17":[{"a":"God","r":["John 5:45","John 8:15-16","John 12:47-48","Luke 9:56"]},{"a":"but","r":["John 1:29","John 6:40","Isa 45:21-23","Isa 49:6-7","Isa 53:10-12","Zech 9:9","Matt 1:23","Matt 18:11","Matt 1:23","Matt 18:11","Luke 2:10-11","Luke 19:10","1 Tim 2:5-6","1 John 2:2","1 John 4:14"]}],"jhn.3.18":[{"a":"is not","r":["John 3:36","John 5:24","John 6:40,47","John 20:31","Rom 5:1","Rom 8:1,34","1 John 5:12"]},{"a":"he that believeth not","r":["Mark 16:16","Heb 2:3","Heb 12:25","1 John 5:10"]}],"jhn.3.19":[{"a":"this","r":["John 1:4,9-11","John 8:12","John 9:39-41","John 15:22-25","Matt 11:20-24","Luke 10:11-16","Luke 12:47","Rom 1:32","2 Cor 2:15-16","2 Thess 2:12","Heb 3:12-13"]},{"a":"because","r":["John 5:44","John 7:17","John 8:44-45","John 10:26-27","John 12:43","Isa 30:9-12","Luke 16:14","Acts 24:21-26","Rom 2:8","1 Pet 2:8","2 Pet 3:3"]}],"jhn.3.2":[{"a":"came","r":["John 7:50-51","John 12:42-43","John 19:38-39","Judg 6:27","Isa 51:7","Phil 1:14"]},{"a":"Rabbi","r":["John 3:26","John 1:38","John 20:16"]},{"a":"we know","r":["Matt 22:16","Mark 12:14"]},{"a":"for","r":["John 5:36","John 7:31","John 9:16,30-33","John 11:47-48","John 12:37","John 15:24","Acts 2:22","Acts 4:16-17","Acts 10:38"]}],"jhn.3.20":[{"a":"every","r":["John 7:7","1 Kgs 22:8","Job 24:13-17","Ps 50:17","Prov 1:29","Prov 4:18","Prov 5:12","Prov 15:12","Amos 5:10-11","Luke 11:45","Jas 1:23-25"]},{"a":"reproved","r":["Eph 5:12-13"]}],"jhn.3.21":[{"a":"he that","r":["John 1:47","John 5:39","Ps 1:1-3","Ps 119:80,105","Ps 139:23-24","Isa 8:20","Acts 17:11-12","1 John 1:6"]},{"a":"that his","r":["John 15:4-5","Isa 26:12","Hos 14:8","1 Cor 15:10","2 Cor 1:12","Gal 5:22-23","Gal 6:8","Eph 5:9","Phil 1:11","Phil 2:13","Col 1:29","Heb 13:21","1 Pet 1:22","2 Pet 1:5-10","1 John 2:27-29","1 John 4:12-13,15-16","Rev 3:1-2,15"]},{"a":"they are","r":["3 John 1:11"]}],"jhn.3.22":[{"a":"these","r":["John 2:13","John 4:3","John 7:3"]},{"a":"and baptized","r":["John 3:26","John 4:1-2"]}],"jhn.3.23":[{"a":"near","r":["Gen 33:18"]},{"a":"Shalem","r":["1 Sam 9:4"]},{"a":"much","r":["Jer 51:13","Ezek 19:10","Ezek 43:2","Rev 1:15","Rev 14:2","Rev 19:6"]},{"a":"and they","r":["Matt 3:5-6","Mark 1:4-5","Luke 3:7"]}],"jhn.3.24":[{"a":"For John was not yet cast into prison.","r":["Matt 4:12","Matt 14:3","Mark 6:17","Luke 3:19-20","Luke 9:7-9"]}],"jhn.3.25":[{"a":"about","r":["John 2:6","Matt 3:11","Mark 7:2-5,8","Heb 6:2","Heb 9:10,13-14,23","1 Pet 3:21"]}],"jhn.3.26":[{"a":"he that","r":["Num 11:26-29","Eccl 4:4","1 Cor 3:3-5","Gal 5:20-21","Gal 6:12-13","Jas 3:14-18","Jas 4:5-6"]},{"a":"to whom","r":["John 1:7,15,26-36"]},{"a":"and all","r":["John 1:7,9","John 11:48","John 12:19","Ps 65:2","Isa 45:23","Acts 19:26-27"]}],"jhn.3.27":[{"a":"A man","r":["Num 16:9-11","Num 17:5","1 Chr 28:4-5","Jer 1:5","Jer 17:16","Amos 7:15","Matt 25:15","Mark 13:34","Rom 1:5","Rom 12:6","1 Cor 1:1","1 Cor 2:12-14","1 Cor 3:5","1 Cor 4:7","1 Cor 12:11","1 Cor 15:10","Gal 1:1","Eph 1:1","Eph 3:7-8","1 Tim 2:7","Jas 1:17","1 Pet 4:10-11"]},{"a":"receive","r":["Heb 5:4-5"]},{"a":"from","r":["Matt 21:25","Mark 11:30-31"]}],"jhn.3.28":[{"a":"I said","r":["John 1:20,25,27"]},{"a":"but","r":["John 1:23","Mal 3:1","Mal 4:4-5","Matt 3:3,11-12","Mark 1:2-3","Luke 1:16-17,76","Luke 3:4-6"]}],"jhn.3.29":[{"a":"hath","r":["Ps 45:9-17","Song 3:11","Song 4:8-12","Isa 54:5","Isa 62:4-5","Jer 2:2","Ezek 16:8","Hos 2:19","Matt 22:2","2 Cor 11:2","Eph 5:25-27","Rev 19:7-9","Rev 21:9"]},{"a":"the friend","r":["Judg 14:10-11","Ps 45:14","Song 5:1","Matt 9:15"]},{"a":"this","r":["Isa 66:11","Luke 2:10-14","Luke 15:6"]}],"jhn.3.3":[{"a":"Verily","r":["John 1:51","Matt 5:18","2 Cor 1:19-20","Rev 3:14"]},{"a":"Except","r":["John 3:5-6","John 1:13","Gal 6:15","Eph 2:1","Titus 3:5","Jas 1:18","1 Pet 1:3,23-25","1 John 2:29","1 John 3:9","1 John 5:1,18"]},{"a":"again","r":["Jas 1:17","Jas 3:17"]},{"a":"he cannot","r":["John 3:5","John 1:5","John 12:40","Deut 29:4","Jer 5:21","Matt 13:11-16","Matt 16:17","2 Cor 4:4"]}],"jhn.3.30":[{"a":"must increase","r":["Ps 72:17-19","Isa 9:7","Isa 53:2-3,12","Dan 2:34-35,44-45","Matt 13:31-33","Rev 11:15"]},{"a":"but","r":["Acts 13:36-37","1 Cor 3:5","2 Cor 3:7-11","Col 1:18","Heb 3:2-6"]}],"jhn.3.31":[{"a":"that cometh","r":["John 3:13","John 6:33","John 8:23","Eph 1:20-21","Eph 4:8-10"]},{"a":"is above","r":["John 1:15,27,30","John 5:21-25","Matt 28:18","Acts 10:36","Rom 9:5","Eph 1:21","Phil 2:9-11","1 Pet 3:22","Rev 19:16"]},{"a":"he that is","r":["John 3:12","1 Cor 15:47-48","Heb 9:1,9-10"]},{"a":"he that cometh","r":["John 6:33,51","John 16:27-28"]}],"jhn.3.32":[{"a":"what","r":["John 3:11","John 5:20","John 8:26","John 15:15"]},{"a":"and no","r":["John 3:26,33","John 1:11","Isa 50:2","Isa 53:1","Rom 10:16-21","Rom 11:2-6"]}],"jhn.3.33":[{"a":"hath set","r":["Rom 3:3-4","Rom 4:18-21","2 Cor 1:18","Titus 1:1-2","Heb 6:17","1 John 5:9-10"]}],"jhn.3.34":[{"a":"he","r":["John 7:16","John 8:26-28,40,47"]},{"a":"for God","r":["John 3:17","John 1:16","John 5:26","John 7:37-39","John 15:26","John 16:7","Num 11:25","2 Kgs 2:9","Ps 45:7","Isa 11:2-5","Isa 59:21","Isa 62:1-3","Rom 8:2","Eph 3:8","Eph 4:7-13","Col 1:19","Col 2:9","Rev 21:6","Rev 22:1,16-17"]}],"jhn.3.35":[{"a":"Father","r":["John 5:20,22","John 15:9","John 17:23,26","Prov 8:30","Isa 42:1","Matt 3:17","Matt 17:5"]},{"a":"and","r":["John 13:3","John 17:2","Gen 41:44,55","Ps 2:8","Isa 9:6-7","Matt 11:27","Matt 28:18","Luke 10:22","1 Cor 15:27","Eph 1:22","Phil 2:9-11","Heb 1:2","Heb 2:8-9","1 Pet 3:22"]}],"jhn.3.36":[{"a":"that believeth on","r":["John 3:15-16","John 1:12","John 5:24","John 6:47-54","John 10:28","Hab 2:4","Rom 1:17","Rom 8:1","1 John 3:14-15","1 John 5:10-13"]},{"a":"see","r":["John 3:3","John 8:51","Num 32:11","Job 33:28","Ps 36:9","Ps 49:19","Ps 106:4-5","Luke 2:30","Luke 3:6","Rom 8:24-25","Rev 21:8"]},{"a":"but","r":["Ps 2:12","Rom 1:18","Rom 4:15","Rom 5:9","Gal 3:10","Eph 5:6","1 Thess 1:10","1 Thess 5:9","Heb 2:3","Heb 10:29","Rev 6:16-17"]}],"jhn.3.4":[{"a":"How","r":["John 3:3","John 4:11-12","John 6:53,60","1 Cor 1:18","1 Cor 2:14"]}],"jhn.3.5":[{"a":"born","r":["John 3:3","Isa 44:3-4","Ezek 36:25-27","Matt 3:11","Mark 16:16","Acts 2:38","Eph 5:26","Titus 3:4-7","1 Pet 1:2","1 Pet 3:21","1 John 5:6-8"]},{"a":"and of","r":["John 1:13","Rom 8:2","1 Cor 2:12","1 Cor 6:11","1 John 2:29","1 John 5:1,6-8"]},{"a":"cannot","r":["Matt 5:20","Matt 18:3","Matt 28:19","Luke 13:3,5,24","Acts 2:38","Acts 3:19","Rom 14:17","2 Cor 5:17-18","Gal 6:15","Eph 2:4-10","2 Thess 2:13-14"]}],"jhn.3.6":[{"a":"born of the flesh","r":["Gen 5:3","Gen 6:5,12","Job 14:4","Job 15:14-16","Job 25:4","Ps 51:10","Rom 7:5,18,25","Rom 8:1,4-9,13","1 Cor 15:47-49","2 Cor 5:17","Gal 5:16-21,24","Eph 2:3","Col 2:11"]},{"a":"that","r":["Ezek 11:19-20","Ezek 36:26-27","Rom 8:5,9","1 Cor 6:17","Gal 5:17","1 John 3:9"]}],"jhn.3.7":[{"a":"Marvel","r":["John 3:12","John 5:28","John 6:61-63"]},{"a":"Ye","r":["John 3:3","Job 15:14","Matt 13:33-35","Rom 3:9-19","Rom 9:22-25","Rom 12:1-2","Eph 4:22-24","Col 1:12","Heb 12:14","1 Pet 1:14-16,22","Rev 21:27"]}],"jhn.3.8":[{"a":"wind","r":["Job 37:10-13,16-17,21-23","Ps 107:25,29","Eccl 11:4-5","Ezek 37:9","Acts 2:2","Acts 4:31","1 Cor 2:11","1 Cor 12:11"]},{"a":"so","r":["John 1:13","Isa 55:9-13","Mark 4:26-29","Luke 6:43-44","1 Cor 2:11","1 John 2:29","1 John 3:8-9"]}],"jhn.3.9":[{"a":"How","r":["John 3:4","John 6:52,60","Prov 4:18","Isa 42:16","Mark 8:24-25","Luke 1:34"]}],"mat.5.1":[{"a":"seeing","r":["Matt 4:25","Matt 13:2","Mark 4:1"]},{"a":"he went","r":["Matt 15:29","Mark 3:13,20","John 6:2-3"]},{"a":"his","r":["Matt 4:18-22","Matt 10:2-4","Luke 6:13-16"]}],"mat.5.10":[{"a":"are","r":["Matt 10:23","Ps 37:12","Mark 10:30","Luke 6:22","Luke 21:12","John 15:20","Acts 5:40","Acts 8:1","Rom 8:35-39","1 Cor 4:9-13","2 Cor 4:8-12,17","Phil 1:28","2 Tim 2:12","2 Tim 3:11","Jas 1:2-5","1 Pet 3:13-14","1 Pet 4:12-16","1 John 3:12","Rev 2:10"]},{"a":"for","r":["Matt 5:3","2 Thess 1:4-7","Jas 1:12"]}],"mat.5.11":[{"a":"when","r":["Matt 10:25","Matt 27:39","Ps 35:11","Isa 66:5","Luke 7:33-34","John 9:28","1 Pet 2:23"]},{"a":"falsely","r":["1 Pet 4:14"]},{"a":"for","r":["Matt 10:18,22,39","Matt 19:29","Matt 24:9","Ps 44:22","Mark 4:17","Mark 8:35","Mark 13:9,13","Luke 6:22","Luke 9:24","Luke 21:12,17","John 15:21","Acts 9:16","Rom 8:36","1 Cor 4:10","2 Cor 4:11","Rev 2:3"]}],"mat.5.12":[{"a":"Rejoice","r":["Luke 6:23","Acts 5:41","Acts 16:25","Rom 5:3","2 Cor 4:17","Phil 2:17","Col 1:24","Jas 1:2","1 Pet 4:13"]},{"a":"for great","r":["Matt 6:1-2,4-5,16","Matt 10:41-42","Matt 16:27","Gen 15:1","Ruth 2:12","Ps 19:11","Ps 58:11","Prov 11:18","Isa 3:10","Luke 6:23,35","1 Cor 3:8","Col 3:24","Heb 11:6,26"]},{"a":"for so","r":["Matt 21:34-38","Matt 23:31-37","1 Kgs 18:4,13","1 Kgs 19:2,10-14","1 Kgs 21:20","1 Kgs 22:8,26-27","2 Kgs 1:9","2 Chr 16:10","2 Chr 24:20-22","2 Chr 36:16","Neh 9:26","Jer 2:30","Jer 26:8,21-23","Luke 6:23","Luke 11:47-51","Luke 13:34","Acts 7:51","1 Thess 2:15"]}],"mat.5.13":[{"a":"the salt","r":["Lev 2:13","Col 4:6"]},{"a":"if","r":["Mark 9:49-50","Luke 14:34-35","Heb 6:4-6","2 Pet 2:20-21"]}],"mat.5.14":[{"a":"the light","r":["Prov 4:18","John 5:35","John 12:36","Rom 2:19-20","2 Cor 6:14","Eph 5:8-14","Phil 2:15","1 Thess 5:5","Rev 1:20","Rev 2:1"]},{"a":"a city","r":["Gen 11:4-8","Rev 21:14-27"]}],"mat.5.15":[{"a":"do","r":["Mark 4:21","Luke 8:16","Luke 11:33"]},{"a":"it giveth","r":["Exod 25:37","Num 8:2"]}],"mat.5.16":[{"a":"your light","r":["Prov 4:18","Isa 58:8","Isa 60:1-3","Rom 13:11-14","Eph 5:8","Phil 2:15-16","1 Thess 2:12","1 Thess 5:6-8","1 Pet 2:9","1 John 1:5-7"]},{"a":"that","r":["Matt 6:1-5,16","Matt 23:5","Acts 9:36","Eph 2:10","1 Tim 2:10","1 Tim 5:10,25","1 Tim 6:18","Titus 2:7,14","Titus 3:4,7-8,14","Heb 10:24","1 Pet 2:12","1 Pet 3:1,16"]},{"a":"and","r":["Isa 61:3","John 15:8","1 Cor 14:25","2 Cor 9:13","Gal 1:24","2 Thess 1:10-12","1 Pet 2:12","1 Pet 4:11,14"]},{"a":"your Father","r":["Matt 5:45","Matt 6:9","Matt 23:9","Luke 11:2"]}],"mat.5.17":[{"a":"to destroy the law","r":["Luke 16:17","John 8:5","Acts 6:13","Acts 18:13","Acts 21:28","Rom 3:31","Rom 10:4","Gal 3:17-24"]},{"a":"but","r":["Matt 3:15","Ps 40:6-8","Isa 42:21","Rom 8:4","Gal 4:4-5","Col 2:16-17","Heb 10:3-12"]}],"mat.5.18":[{"a":"verily","r":["Matt 5:26","Matt 6:2,16","Matt 8:10","Matt 10:15,23,42","Matt 11:11","Matt 13:17","Matt 16:28","Matt 17:20","Matt 18:3,18","Matt 19:23,28","Matt 21:21,31","Matt 23:36","Matt 24:2,34,47","Matt 25:12,40,45","Matt 26:13-14","Mark 3:28","Mark 6:11","Mark 8:12","Mark 9:1,41","Mark 10:15,29","Mark 11:23","Mark 12:43","Mark 13:30","Mark 14:9","Mark 14:18,25,30","Luke 4:24","Luke 11:51","Luke 12:37","Luke 13:35","Luke 18:17,29","Luke 21:32","Luke 23:43","John 1:51","John 3:3,5,11","John 5:19,24-25","John 6:26,32,47,53","John 8:34,51,58","John 10:1,7","John 12:24","John 13:16,20-21,38","John 14:12","John 16:20,23","John 21:18"]},{"a":"Till","r":["Matt 24:35","Ps 102:26","Isa 51:6","Luke 16:17","Luke 21:33","Heb 1:11-12","2 Pet 3:10-13","Rev 20:11"]},{"a":"pass","r":["Ps 119:89-90,152","Isa 40:8","1 Pet 1:25"]}],"mat.5.19":[{"a":"shall break","r":["Deut 27:26","Ps 119:6,128","Gal 3:10-13","Jas 2:10-11"]},{"a":"these","r":["Matt 23:23","Deut 12:32","Luke 11:42"]},{"a":"shall teach","r":["Matt 15:3-6","Matt 23:16-22","Mal 2:8-9","Rom 3:8","Rom 6:1,15","1 Tim 6:3-4","Rev 2:14-15,20"]},{"a":"the least","r":["Matt 11:11","1 Sam 2:30"]},{"a":"do","r":["Matt 28:20","Acts 1:1","Rom 13:8-10","Gal 5:14-24","Phil 3:17-18","Phil 4:8-9","1 Thess 2:10-12","1 Thess 4:1-7","1 Tim 4:11-12","1 Tim 6:11","Titus 2:8-10","Titus 3:8"]},{"a":"great","r":["Matt 19:28","Matt 20:26","Dan 12:3","Luke 1:15","Luke 9:48","Luke 22:24-26","1 Pet 5:4"]}],"mat.5.2":[{"a":"And he opened his mouth, and taught them, saying,","r":["Matt 13:35","Job 3:1","Ps 78:1-2","Prov 8:6","Prov 31:8-9","Luke 6:20-26","Acts 8:35","Acts 10:34","Acts 18:14","Eph 6:19"]}],"mat.5.20":[{"a":"exceed","r":["Matt 23:2-5,23-28","Luke 11:39-40,44","Luke 12:1","Luke 16:14-15","Luke 18:10-14","Luke 20:46-47","Rom 9:30-32","Rom 10:2-3","2 Cor 5:17","Phil 3:9"]},{"a":"ye","r":["Matt 3:10","Matt 7:21","Matt 18:5","Mark 10:15,25","Luke 18:17,24-25","John 3:3-5","Heb 12:14","Rev 21:27"]}],"mat.5.21":[{"a":"it","r":["Matt 5:27,33,43","2 Sam 20:18","Job 8:8-10"]},{"a":"Thou","r":["Gen 9:5-6","Exod 20:13","Deut 5:17"]},{"a":"and","r":["Exod 21:12-14","Num 35:12,16-21,30-34","Deut 21:7-9","1 Kgs 2:5-6,31-32"]}],"mat.5.22":[{"a":"I say","r":["Matt 5:28,34,44","Matt 3:17","Matt 17:5","Deut 18:18-19","Acts 3:20-23","Acts 7:37","Heb 5:9","Heb 12:25"]},{"a":"That","r":["Gen 4:5-6","Gen 37:4,8","1 Sam 17:27-28","1 Sam 18:8-9","1 Sam 20:30-33","1 Sam 22:12-23","1 Kgs 21:4","2 Chr 16:10","Esth 3:5-6","Ps 37:8","Dan 2:12-13","Dan 3:13,19","Eph 4:26-27"]},{"a":"his brother","r":["Matt 5:23-24","Matt 18:21,35","Deut 15:11","Neh 5:8","Obad 1:10,12","Rom 12:10","1 Cor 6:6","1 Thess 4:6","1 John 2:9","1 John 3:10,14-15","1 John 4:20-21","1 John 5:16"]},{"a":"without","r":["Ps 7:4","Ps 25:3","Ps 35:19","Ps 69:4","Ps 109:3","Lam 3:52","John 15:25"]},{"a":"Whosoever","r":["Matt 11:18-19","Matt 12:24","1 Sam 20:30","2 Sam 16:7","John 7:20","John 8:48","Acts 17:18","1 Cor 6:10","Eph 4:31-32","Titus 3:2","1 Pet 2:23","1 Pet 3:9","Jude 1:9"]},{"a":"Raca","r":["2 Sam 6:20","Jas 2:20"]},{"a":"the council","r":["Matt 10:17","Matt 26:59","Mark 14:55","Mark 15:1","John 11:47","Acts 5:27"]},{"a":"fool","r":["Ps 14:1","Ps 49:10","Ps 92:6","Prov 14:16","Prov 18:6","Jer 17:11"]},{"a":"hell","r":["Matt 5:29-30","Matt 10:28","Matt 18:8-9","Matt 25:41","Mark 9:47","Luke 12:5","Luke 16:23-24","Rev 20:14"]}],"mat.5.23":[{"a":"thou","r":["Matt 8:4","Matt 23:19","Deut 16:16-17","1 Sam 15:22","Isa 1:10-17","Hos 6:6","Amos 5:21-24"]},{"a":"rememberest","r":["Gen 41:9","Gen 42:21-22","Gen 50:15-17","Lev 6:2-6","1 Kgs 2:44","Lam 3:20","Ezek 16:63","Luke 19:8"]}],"mat.5.24":[{"a":"there","r":["Matt 18:15-17","Job 42:8","Prov 25:9","Mark 9:50","Rom 12:17-18","1 Cor 6:7-8","1 Tim 2:8","Jas 3:13-18","Jas 5:16","1 Pet 3:7-8"]},{"a":"and then","r":["Matt 23:23","1 Cor 11:28"]}],"mat.5.25":[{"a":"with","r":["Gen 32:3-8,13-22","Gen 33:3-11","1 Sam 25:17-35","Prov 6:1-5","Prov 25:8","Luke 12:58-59","Luke 14:31-32"]},{"a":"whiles","r":["Job 22:21","Ps 32:6","Isa 55:6-7","Luke 13:24-25","2 Cor 6:2","Heb 3:7,13","Heb 12:17"]},{"a":"and the","r":["1 Kgs 22:26-27"]}],"mat.5.26":[{"a":"Thou","r":["Matt 18:34","Matt 25:41,46","Luke 12:59","Luke 16:26","2 Thess 1:9","Jas 2:13"]}],"mat.5.27":[{"a":"Thou","r":["Exod 20:14","Lev 20:10","Deut 5:18","Deut 22:22-24","Prov 6:32"]}],"mat.5.28":[{"a":"I say","r":["Matt 5:22,39","Matt 7:28-29"]},{"a":"That","r":["Gen 34:2","Gen 39:7-23","Exod 20:17","2 Sam 11:2","Job 31:1,9","Prov 6:25","Jas 1:14-15","2 Pet 2:14","1 John 2:16"]},{"a":"hath","r":["Ps 119:96","Rom 7:7-8,14"]}],"mat.5.29":[{"a":"if","r":["Matt 18:8-9","Mark 9:43-48"]},{"a":"pluck","r":["Matt 19:12","Rom 6:6","Rom 8:13","1 Cor 9:27","Gal 5:24","Col 3:5","1 Pet 4:1-3"]},{"a":"for","r":["Matt 16:26","Prov 5:8-14","Mark 8:36","Luke 9:24-25"]}],"mat.5.3":[{"a":"Blessed","r":["Matt 5:4-11","Matt 11:6","Matt 13:16","Matt 24:46","Ps 1:1","Ps 2:12","Ps 32:1-2","Ps 41:1","Ps 84:12","Ps 112:1","Ps 119:1-2","Ps 128:1","Ps 146:5","Prov 8:32","Isa 30:18","Luke 6:20-26","Luke 11:28","John 20:29","Rom 4:6-9","Jas 1:12","Rev 19:9","Rev 22:14"]},{"a":"the poor","r":["Matt 11:25","Matt 18:1-3","Lev 26:41-42","Deut 8:2","2 Chr 7:14","2 Chr 33:12,19,23","2 Chr 34:27","Job 42:6","Ps 34:18","Ps 51:17","Prov 16:19","Prov 29:23","Isa 57:15","Isa 61:1","Isa 66:2","Jer 31:18-20","Dan 5:21-22","Mic 6:8","Luke 4:18","Luke 6:20","Luke 18:14","Jas 1:10","Jas 4:9-10"]},{"a":"for","r":["Matt 3:2","Matt 8:11","Mark 10:14","Jas 2:5"]}],"mat.5.30":[{"a":"offend","r":["Matt 11:6","Matt 13:21","Matt 16:23","Matt 18:6-7","Matt 26:31","Luke 17:2","Rom 9:33","Rom 14:20-21","1 Cor 8:13","Gal 5:11","1 Pet 2:8"]},{"a":"cast","r":["Matt 22:13","Matt 25:20","Luke 12:5"]}],"mat.5.31":[{"a":"whosoever","r":["Matt 19:3,7","Deut 24:1-4","Jer 3:1","Mark 10:2-9"]}],"mat.5.32":[{"a":"I say","r":["Matt 5:28","Luke 9:30,35"]},{"a":"whosoever","r":["Matt 19:8-9","Mal 2:14-16","Mark 10:5-12","Luke 16:18","Rom 7:3","1 Cor 7:4,10-11"]}],"mat.5.33":[{"a":"it hath","r":["Matt 23:16"]},{"a":"Thou","r":["Exod 20:7","Lev 19:12","Num 30:2-16","Deut 5:11","Deut 23:23","Ps 50:14","Ps 76:11","Eccl 5:4-6","Nah 1:15"]}],"mat.5.34":[{"a":"Swear","r":["Deut 23:21-23","Eccl 9:2","Jas 5:12"]},{"a":"heaven","r":["Matt 23:16-22","Isa 57:15","Isa 66:1"]}],"mat.5.35":[{"a":"the earth","r":["Ps 99:5"]},{"a":"the city","r":["2 Chr 6:6","Ps 48:2","Ps 87:2","Mal 1:14","Rev 21:2,10"]}],"mat.5.36":[{"a":"shalt","r":["Matt 23:16-21"]},{"a":"because","r":["Matt 6:27","Luke 12:25"]}],"mat.5.37":[{"a":"let","r":["2 Cor 1:17-20","Col 4:6","Jas 5:12"]},{"a":"cometh","r":["Matt 13:19","Matt 15:19","John 8:44","Eph 4:25","Col 3:9","Jas 5:12"]}],"mat.5.38":[{"a":"An eye","r":["Exod 21:22-27","Lev 24:19-20","Deut 19:19"]}],"mat.5.39":[{"a":"That","r":["Lev 19:18","1 Sam 24:10-15","1 Sam 25:31-34","1 Sam 26:8-10","Job 31:29-31","Prov 20:22","Prov 24:29","Luke 6:29","Rom 12:17-19","1 Cor 6:7","1 Thess 5:15","Heb 12:4","Jas 5:6","1 Pet 3:9"]},{"a":"whosoever","r":["1 Kgs 22:24","Job 16:10","Isa 50:6","Lam 3:30","Mic 5:1","Luke 6:29","Luke 22:64","1 Pet 2:20-23"]}],"mat.5.4":[{"a":"Blessed are they that mourn: for they shall be comforted.","r":["Ps 6:1-9","Ps 13:1-5","Ps 30:7-11","Ps 32:3-7","Ps 40:1-3","Ps 69:29-30","Ps 116:3-7","Ps 126:5-6","Isa 12:1","Isa 25:8","Isa 30:19","Isa 35:10","Isa 38:14-19","Isa 51:11-12","Isa 57:18","Isa 61:2-3","Isa 66:10","Jer 31:9-12,16-17","Ezek 7:16","Ezek 9:4","Zech 12:10-14","Zech 13:1","Luke 6:21,25","Luke 7:38,50","Luke 16:25","John 16:20-22","2 Cor 1:4-7","2 Cor 7:9-10","Jas 1:12","Rev 7:14-17","Rev 21:4"]}],"mat.5.40":[{"a":"And if any man will sue thee at the law, and take away thy coat, let him have thy cloke also.","r":["Luke 6:29","1 Cor 6:7"]}],"mat.5.41":[{"a":"compel","r":["Matt 27:32","Mark 15:21","Luke 23:26"]}],"mat.5.42":[{"a":"Give to him that asketh thee, and from him that would borrow of thee turn not thou away.","r":["Matt 25:35-40","Deut 15:7-14","Job 31:16-20","Ps 37:21,25-26","Ps 112:5-9","Prov 3:27-28","Prov 11:24-25","Prov 19:17","Eccl 11:1-2,6","Isa 58:6-12","Dan 4:27","Luke 6:30-36","Luke 11:41","Luke 14:12-14","Rom 12:20","2 Cor 9:6-15","1 Tim 6:17-19","Heb 6:10","Heb 13:16","Jas 1:27","Jas 2:15-16","1 John 3:16-18"]}],"mat.5.43":[{"a":"Thou","r":["Matt 19:19","Matt 22:39-40","Lev 19:18","Mark 12:31-34","Luke 10:27-29","Rom 13:8-10","Gal 5:13-14","Jas 2:8"]},{"a":"and hate","r":["Exod 17:14-16","Deut 23:6","Deut 25:17","Ps 41:10","Ps 139:21-22"]}],"mat.5.44":[{"a":"But I say unto you, Love your enemies, bless them that curse you, do good to them that hate you, and pray for them which despitefully use you, and persecute you;","r":["Exod 23:4-5","2 Kgs 6:22","2 Chr 28:9-15","Ps 7:4","Ps 35:13-14","Prov 25:21-22","Luke 6:27-28,34-35","Luke 23:34","Acts 7:60","Rom 12:14,20-21","1 Cor 4:12-13","1 Cor 13:4-8","1 Pet 2:23","1 Pet 3:9"]}],"mat.5.45":[{"a":"ye","r":["Matt 5:9","Luke 6:35","John 13:35","Eph 5:1","1 John 3:9"]},{"a":"for","r":["Job 25:3","Ps 145:9","Acts 14:17"]}],"mat.5.46":[{"a":"if","r":["Matt 6:1","Luke 6:32-35","1 Pet 2:20-23"]},{"a":"publicans","r":["Matt 9:10-11","Matt 11:19","Matt 18:17","Matt 21:31-32","Luke 15:1","Luke 18:13","Luke 19:2,7"]}],"mat.5.47":[{"a":"salute","r":["Matt 10:12","Luke 6:32","Luke 10:4-5"]},{"a":"what","r":["Matt 5:20","1 Pet 2:20"]}],"mat.5.48":[{"a":"ye","r":["Gen 17:1","Lev 11:44","Lev 19:2","Lev 20:26","Deut 18:13","Job 1:1-3","Ps 37:37","Luke 6:36,40","2 Cor 7:1","2 Cor 13:9,11","Phil 3:12-15","Col 1:28","Col 4:12","Jas 1:4","1 Pet 1:15-16"]},{"a":"even","r":["Matt 5:16,45","Eph 3:1","Eph 5:1-2","1 John 3:3"]}],"mat.5.5":[{"a":"the meek","r":["Matt 11:29","Matt 21:5","Num 12:3","Ps 22:26","Ps 25:9","Ps 69:32","Ps 147:6","Ps 149:4","Isa 11:4","Isa 29:19","Isa 61:1","Zeph 2:3","Gal 5:23","Eph 4:2","Col 3:12","1 Tim 6:11","2 Tim 2:25","Titus 3:2","Jas 1:21","Jas 3:13","1 Pet 3:4,15"]},{"a":"they","r":["Ps 25:13","Ps 37:9,11,22,29,34","Isa 60:21","Rom 4:13"]}],"mat.5.6":[{"a":"are","r":["Ps 42:1-2","Ps 63:1-2","Ps 84:2","Ps 107:9","Amos 8:11-13","Luke 1:53","Luke 6:21,25","John 6:27"]},{"a":"for","r":["Ps 4:6-7","Ps 17:15","Ps 63:5","Ps 65:4","Ps 145:19","Song 5:1","Isa 25:6","Isa 41:17","Isa 44:3","Isa 49:9-10","Isa 55:1-3","Isa 65:13","Isa 66:11","John 4:14","John 6:48-58","John 7:37","Rev 7:16"]}],"mat.5.7":[{"a":"are","r":["Matt 6:14-15","Matt 18:33-35","2 Sam 22:26","Job 31:16-22","Ps 18:25","Ps 37:26","Ps 41:1-4","Ps 112:4,9","Prov 11:17","Prov 14:21","Prov 19:17","Isa 57:1","Isa 58:6-12","Dan 4:27","Mic 6:8","Mark 11:25","Luke 6:35","Eph 4:32","Eph 5:1","Col 3:12","Jas 3:17"]},{"a":"for","r":["Hos 1:6","Hos 2:1,23","Rom 11:30","1 Cor 7:25","2 Cor 4:1","1 Tim 1:13,16","2 Tim 1:16-18","Heb 4:16","Heb 6:10","Jas 2:13","1 Pet 2:10"]}],"mat.5.8":[{"a":"are","r":["Matt 23:25-28","1 Chr 29:17-19","Ps 15:2","Ps 18:26","Ps 24:4","Ps 51:6,10","Ps 73:1","Prov 22:11","Ezek 36:25-27","Acts 15:9","2 Cor 7:1","Titus 1:15","Heb 9:14","Heb 10:22","Jas 3:17","Jas 4:8","1 Pet 1:22"]},{"a":"for","r":["Gen 32:30","Job 19:26-27","1 Cor 13:12","Heb 12:14","1 John 3:2-3"]}],"mat.5.9":[{"a":"are","r":["1 Chr 12:17","Ps 34:12","Ps 120:6","Ps 122:6-8","Acts 7:26","Rom 12:18","Rom 14:1-7","Rom 14:17-19","1 Cor 6:6","2 Cor 5:20","2 Cor 13:11","Gal 5:22","Eph 4:1","Phil 2:1-3","Phil 4:2","Col 3:13","2 Tim 2:22-24","Heb 12:14","Jas 1:19-20","Jas 3:16-18"]},{"a":"for","r":["Matt 5:45,48","Ps 82:6-7","Luke 6:35","Luke 20:36","Eph 5:1-2","Phil 2:15-16","1 Pet 1:14-16"]}],"mat.6.1":[{"a":"heed","r":["Matt 16:6","Mark 8:15","Luke 11:35","Luke 12:1,15","Heb 2:1"]},{"a":"alms","r":["Deut 24:13","Ps 112:9","Dan 4:27","2 Cor 9:9-10"]},{"a":"to be","r":["Matt 6:5,16","Matt 5:16","Matt 23:5,14,28-30","2 Kgs 10:16,31","Ezek 33:31","Zech 7:5","Zech 13:4","Luke 16:15","John 5:44","John 12:43","Gal 6:12"]},{"a":"otherwise","r":["Matt 6:4,6","Matt 5:46","Matt 10:41-42","Matt 16:27","Matt 25:40","1 Cor 9:17-18","Heb 6:10","Heb 11:26","2 John 1:8"]},{"a":"of your","r":["Matt 6:9","Matt 5:48"]}],"mat.6.10":[{"a":"Thy kingdom","r":["Matt 3:2","Matt 4:17","Matt 16:28","Ps 2:6","Isa 2:2","Jer 23:5","Dan 2:44","Dan 7:13,27","Zech 9:9","Mark 11:10","Luke 19:11,38","Col 1:13","Rev 11:15","Rev 12:10","Rev 19:6","Rev 20:4"]},{"a":"Thy will","r":["Matt 7:21","Matt 12:50","Matt 26:42","Ps 40:8","Mark 3:35","John 4:34","John 6:40","John 7:17","Acts 13:22","Acts 21:14","Acts 22:14","Rom 12:2","Eph 6:6","Col 1:9","1 Thess 4:3","1 Thess 5:18","Heb 10:7,36","Heb 13:21","1 Pet 2:15","1 Pet 4:2"]},{"a":"as","r":["Neh 9:6","Ps 103:19-21","Dan 4:35","Heb 1:14"]}],"mat.6.11":[{"a":"Give us this day our daily bread.","r":["Matt 4:4","Exod 16:16-35","Job 23:12","Ps 33:18-19","Ps 34:10","Prov 30:8","Isa 33:16","Luke 11:3","John 6:31-59","2 Thess 3:12","1 Tim 6:8"]}],"mat.6.12":[{"a":"forgive","r":["Exod 34:7","1 Kgs 8:30,34,39,50","Ps 32:1","Ps 130:4","Isa 1:18","Dan 9:19","Acts 13:38","Eph 1:7","1 John 1:7-9"]},{"a":"debts","r":["Matt 18:21-27,34","Luke 7:40-48","Luke 11:4"]},{"a":"as","r":["Matt 6:14-15","Matt 18:21-22,28-35","Neh 5:12-13","Mark 11:25-26","Luke 6:37","Luke 17:3-5","Eph 4:32","Col 3:13"]}],"mat.6.13":[{"a":"lead","r":["Matt 26:41","Gen 22:1","Deut 8:2,16","Prov 30:8","Luke 22:31-46","1 Cor 10:13","2 Cor 12:7-9","Heb 11:36","1 Pet 5:8","2 Pet 2:9","Rev 2:10","Rev 3:10"]},{"a":"deliver","r":["1 Chr 4:10","Ps 121:7-8","Jer 15:21","John 17:15","Gal 1:4","1 Thess 1:10","2 Tim 4:17-18","Heb 2:14-15","1 John 3:8","1 John 5:18-19","Rev 7:14-17","Rev 21:4"]},{"a":"thine","r":["Matt 6:10","Exod 15:18","1 Chr 29:11","Ps 10:16","Ps 47:2,7","Ps 145:10-13","Dan 4:25,34-35","Dan 7:18","1 Tim 1:17","1 Tim 6:15-17","Rev 5:13","Rev 19:1"]},{"a":"Amen","r":["Matt 28:20","Num 5:22","Deut 27:15-26","1 Kgs 1:36","1 Chr 16:36","Ps 41:13","Ps 72:19","Ps 89:52","Ps 106:48","Jer 28:6","1 Cor 14:16","2 Cor 1:20","Rev 1:18","Rev 3:14","Rev 19:4"]}],"mat.6.14":[{"a":"For if ye forgive men their trespasses, your heavenly Father will also forgive you:","r":["Matt 6:12","Matt 7:2","Matt 18:21-35","Prov 21:13","Mark 11:25-26","Eph 4:32","Col 3:13","Jas 2:13","1 John 3:10"]}],"mat.6.16":[{"a":"when","r":["Matt 9:14-15","2 Sam 12:16,21","Neh 1:4","Esth 4:16","Ps 35:13","Ps 69:10","Ps 109:24","Dan 9:3","Luke 2:37","Acts 10:30","Acts 13:2-3","Acts 14:23","1 Cor 7:5","2 Cor 6:5","2 Cor 11:27"]},{"a":"be","r":["Matt 6:2,5","1 Kgs 21:27","Isa 58:3-5","Zech 7:3-5","Mal 3:14","Mark 2:18","Luke 18:12"]}],"mat.6.17":[{"a":"anoint","r":["Ruth 3:3","2 Sam 14:2","Eccl 9:8","Dan 10:2-3"]}],"mat.6.18":[{"a":"appear","r":["2 Cor 5:9","2 Cor 10:18","Col 3:22-24","1 Pet 2:13"]},{"a":"shall","r":["Matt 6:4,6","Rom 2:6","1 Pet 1:7"]}],"mat.6.19":[{"a":"Lay not up for yourselves treasures upon earth, where moth and rust doth corrupt, and where thieves break through and steal:","r":["Job 31:24","Ps 39:6","Ps 62:10","Prov 11:4","Prov 16:16","Prov 23:5","Eccl 2:26","Eccl 5:10-14","Zeph 1:18","Luke 12:21","Luke 18:24","1 Tim 6:8-10,17","Heb 13:5","Jas 5:1-3","1 John 2:15-16"]}],"mat.6.2":[{"a":"when","r":["Job 31:16-20","Ps 37:21","Ps 112:9","Prov 19:17","Eccl 11:2","Isa 58:7,10-12","Luke 11:41","Luke 12:33","John 13:29","Acts 9:36","Acts 10:2,4,31","Acts 11:29","Acts 24:17","Rom 12:8","2 Cor 9:6-15","Gal 2:10","Eph 4:28","1 Tim 6:18","Phlm 1:7","Heb 13:16","Jas 2:15-16","1 Pet 4:11","1 John 3:17-19"]},{"a":"do not sound a trumpet","r":["Prov 20:6","Hos 8:1"]},{"a":"as","r":["Matt 6:5","Matt 7:5","Matt 15:7","Matt 16:3","Matt 22:18","Matt 23:13-29","Matt 24:51","Isa 9:17","Isa 10:6","Mark 7:6","Luke 6:42","Luke 12:56","Luke 13:15"]},{"a":"in the synagogues","r":["Matt 6:5","Matt 23:6","Mark 12:39","Luke 11:43","Luke 20:46"]},{"a":"glory","r":["1 Sam 15:30","John 5:41,44","John 7:18","1 Thess 2:6"]},{"a":"verily","r":["Matt 6:5,16","Matt 5:18"]}],"mat.6.20":[{"a":"But lay up for yourselves treasures in heaven, where neither moth nor rust doth corrupt, and where thieves do not break through nor steal:","r":["Matt 19:21","Isa 33:6","Luke 12:33","Luke 18:22","1 Tim 6:17","Heb 10:34","Heb 11:26","Jas 2:5","1 Pet 1:4","1 Pet 5:4","Rev 2:9"]}],"mat.6.21":[{"a":"where","r":["Isa 33:6","Luke 12:34","2 Cor 4:18"]},{"a":"there","r":["Matt 12:34","Prov 4:23","Jer 4:14","Jer 22:17","Acts 8:21","Rom 7:5-7","Phlm 1:3,19","Col 3:1-3","Heb 3:12"]}],"mat.6.22":[{"a":"light of","r":["Luke 11:34-36"]},{"a":"single","r":["Acts 2:46","2 Cor 11:3","Eph 6:5","Col 3:22"]}],"mat.6.23":[{"a":"thine","r":["Matt 20:15","Isa 44:18-20","Mark 7:22","Eph 4:18","Eph 5:8","1 John 2:11"]},{"a":"If","r":["Matt 23:16-28","Prov 26:12","Isa 5:20-21","Isa 8:20","Jer 4:22","Jer 8:8-9","Luke 8:10","John 9:39-41","Rom 1:22","Rom 2:17-23","1 Cor 1:18-20","1 Cor 2:14","1 Cor 3:18-19","Rev 3:17-18"]}],"mat.6.24":[{"a":"serve","r":["Matt 4:10","Josh 24:15,19-20","1 Sam 7:3","1 Kgs 18:21","2 Kgs 17:33-34,41","Ezek 20:39","Zeph 1:5","Luke 16:13","Rom 6:16-22","Gal 1:10","2 Tim 4:10","Jas 4:4","1 John 2:15-16"]},{"a":"mammon","r":["Luke 16:9,11,13","1 Tim 6:9-10,17"]}],"mat.6.25":[{"a":"I say","r":["Matt 5:22-28","Luke 12:4-5,8-9,22"]},{"a":"Take","r":["Matt 6:31,34","Matt 10:19","Matt 13:22","Ps 55:22","Mark 4:19","Mark 13:11","Luke 8:14","Luke 10:40-41","Luke 12:22-23,25-26,29","1 Cor 7:32","Phil 4:6","2 Tim 2:4","Heb 13:5-6","1 Pet 5:7"]},{"a":"Is not","r":["Luke 12:23","Rom 8:32"]}],"mat.6.26":[{"a":"the fowls","r":["Matt 10:29-31","Gen 1:29-31","Job 35:11","Job 38:41","Ps 104:11-12,27-28","Ps 145:15-16","Ps 147:9","Luke 12:6-7,24-31"]},{"a":"your","r":["Matt 6:32","Matt 7:9","Luke 12:32"]}],"mat.6.27":[{"a":"by","r":["Matt 5:36","Ps 39:6","Eccl 3:14","Luke 12:25-26","1 Cor 12:18"]}],"mat.6.28":[{"a":"why","r":["Matt 6:25,31","Matt 10:10","Luke 3:11","Luke 22:35-36"]},{"a":"the lilies","r":["Luke 12:27"]}],"mat.6.29":[{"a":"even","r":["1 Kgs 10:5-7","2 Chr 9:4-6,20-22","1 Tim 2:9-10","1 Pet 3:2-5"]}],"mat.6.3":[{"a":"let","r":["Matt 8:4","Matt 9:30","Matt 12:19","Mark 1:44","John 7:4"]}],"mat.6.30":[{"a":"clothe","r":["Ps 90:5-6","Ps 92:7","Isa 40:6-8","Luke 12:28","Jas 1:10-11","1 Pet 1:24"]},{"a":"O ye","r":["Matt 8:26","Matt 14:31","Matt 16:8","Matt 17:17","Mark 4:40","Mark 9:19","Luke 9:41","John 20:27","Heb 3:12"]}],"mat.6.31":[{"a":"What shall we eat","r":["Matt 4:4","Matt 15:33","Lev 25:20-22","2 Chr 25:9","Ps 37:3","Ps 55:22","Ps 78:18-31","Luke 12:29","1 Pet 5:7"]}],"mat.6.32":[{"a":"after","r":["Matt 5:46-47","Matt 20:25-26","Ps 17:14","Luke 12:30","Eph 4:17","1 Thess 4:5"]},{"a":"for your","r":["Matt 6:8","Ps 103:13","Luke 11:11-13","Luke 12:30"]}],"mat.6.33":[{"a":"seek","r":["1 Kgs 3:11-13","1 Kgs 17:13","2 Chr 1:7-12","2 Chr 31:20-21","Prov 2:1-9","Prov 3:9-10","Hag 1:2-11","Hag 2:16-19","Luke 12:31","John 6:27"]},{"a":"the kingdom","r":["Matt 3:2","Matt 4:17","Matt 13:44-46","Acts 20:25","Acts 28:31","Rom 14:17","Col 1:13-14","2 Thess 1:5","2 Pet 1:11"]},{"a":"his","r":["Matt 5:6","Isa 45:24","Jer 23:6","Luke 1:6","Rom 1:17","Rom 3:21-22","Rom 10:3","1 Cor 1:30","2 Cor 5:21","Phil 3:9","2 Pet 1:1"]},{"a":"and all","r":["Matt 19:29","Lev 25:20-21","Ps 34:9-10","Ps 37:3,18-19,25","Ps 84:11-12","Mark 10:30","Luke 18:29-30","Rom 8:31","1 Cor 3:22","1 Tim 4:8"]}],"mat.6.34":[{"a":"no","r":["Matt 6:11,25","Exod 16:18-20","Lam 3:23"]},{"a":"for","r":["Deut 33:25","1 Kgs 17:4-6,14-16","2 Kgs 7:1-2","Luke 11:3","Heb 13:5-6"]},{"a":"Sufficient","r":["John 14:27","John 16:33","Acts 14:22","1 Thess 3:3-4"]}],"mat.6.4":[{"a":"seeth","r":["Matt 6:6,18","Ps 17:3","Ps 44:21","Ps 139:1-3,12","Jer 17:10","Jer 23:24","Heb 4:13","Rev 2:23"]},{"a":"reward","r":["Matt 10:42","Matt 25:34-40","1 Sam 2:30","Luke 8:17","Luke 14:14","1 Cor 4:5","Jude 1:24"]}],"mat.6.5":[{"a":"when","r":["Matt 7:7-8","Matt 9:38","Matt 21:22","Ps 5:2","Ps 55:17","Prov 15:8","Isa 55:6-7","Jer 29:12","Dan 6:10","Dan 9:4-19","Luke 18:1","John 16:24","Eph 6:18","Col 4:2-3","1 Thess 5:17","Jas 5:15-16"]},{"a":"thou shalt not","r":["Matt 6:2","Matt 23:14","Job 27:8-10","Isa 1:15","Luke 18:10-11","Luke 20:47"]},{"a":"for","r":["Matt 23:6","Mark 12:38","Luke 11:43"]},{"a":"Verily","r":["Matt 6:2","Prov 16:5","Luke 14:12-14","Jas 4:6"]}],"mat.6.6":[{"a":"enter","r":["Matt 14:23","Matt 26:36-39","Gen 32:24-29","2 Kgs 4:33","Isa 26:20","John 1:48","Acts 9:40","Acts 10:9,30"]},{"a":"pray","r":["Ps 34:15","Isa 65:24","John 20:17","Rom 8:5","Eph 3:14"]}],"mat.6.7":[{"a":"use","r":["1 Kgs 18:26-29","Eccl 5:2-3,7","Acts 19:34"]},{"a":"repetitions","r":["Matt 26:39,42,44","1 Kgs 8:26-54","Dan 9:18-19"]},{"a":"the heathen","r":["Matt 6:32","Matt 18:17"]}],"mat.6.8":[{"a":"your","r":["Matt 6:32","Ps 38:9","Ps 69:17-19","Luke 12:30","John 16:23-27","Phil 4:6"]}],"mat.6.9":[{"a":"this","r":["Luke 11:1-2"]},{"a":"Our","r":["Matt 6:1,6,14","Matt 5:16,48","Matt 7:11","Matt 10:29","Matt 26:29,42","Isa 63:16","Isa 64:8","Luke 15:18,21","John 20:17","Rom 1:7","Rom 8:15","Gal 1:1","Gal 4:6","1 Pet 1:17"]},{"a":"which","r":["Matt 23:9","2 Chr 20:6","Ps 115:3","Isa 57:15","Isa 66:1"]},{"a":"Hallowed","r":["Lev 10:3","2 Sam 7:26","1 Kgs 8:43","1 Chr 17:24","Neh 9:5","Ps 72:18","Ps 111:9","Isa 6:3","Isa 37:20","Ezek 36:23","Ezek 38:23","Hab 2:14","Zech 14:9","Mal 1:11","Luke 2:14","Luke 11:2","1 Tim 6:16","Rev 4:11","Rev 5:12"]}],"psa.23.1":[{"a":"my shepherd","r":["Ps 79:13","Ps 80:1","Ps 95:6-7","Isa 40:11","Jer 23:3-4","Ezek 34:11-12,23-24","Mic 5:2,4","John 10:11,14,27-30","Heb 13:20","1 Pet 2:25","1 Pet 5:4","Rev 7:17"]},{"a":"I shall not want","r":["Ps 34:9-10","Ps 84:11","Matt 6:33","Luke 12:30-32","Rom 8:32","Phil 4:19","Heb 13:5-6"]}],"psa.23.2":[{"a":"green pastures","r":["Isa 30:23","Ezek 34:13-14"]},{"a":"leadeth me","r":["Ps 46:4","Isa 49:9-10","Rev 7:17","Rev 21:6","Rev 22:1,17"]},{"a":"still waters","r":["Job 34:29","Isa 8:6"]}],"psa.23.3":[{"a":"restoreth my soul","r":["Ps 19:7","Ps 51:10,12","Ps 85:4-7","Ps 119:176","Job 33:30","Jer 32:37-42","Hos 14:4-9","Mic 7:8-9,18-19","Luke 22:31-32","Rev 3:19"]},{"a":"leadeth","r":["Ps 5:8","Ps 143:8-10","Prov 8:20","Isa 42:16","Jer 31:8"]},{"a":"for his name's sake.","r":["Ps 34:3","Ps 79:9","Ezek 20:14","Eph 1:6"]}],"psa.23.4":[{"a":"through","r":["Ps 44:19","Job 3:5","Job 10:21-22","Job 24:17","Jer 2:6","Luke 1:79"]},{"a":"I will","r":["Ps 3:6","Ps 27:1-4","Ps 46:1-3","Ps 118:6","Ps 138:7","Isa 41:10","1 Cor 15:55-57"]},{"a":"for thou","r":["Ps 14:5","Ps 46:11","Isa 8:9-10","Isa 43:1-2","Zech 8:23","Matt 1:23","Matt 28:20","Acts 18:9-10","2 Tim 4:22"]},{"a":"thy rod","r":["Ps 110:2","Mic 7:14","Zech 11:10,14"]}],"psa.23.5":[{"a":"preparest","r":["Ps 22:26,29","Ps 31:19-20","Ps 104:15","Job 36:16","Isa 25:6","John 6:53-56","John 10:9-10","John 16:22"]},{"a":"thou anointest","r":["Ps 45:7","Ps 92:10","Amos 6:6","Matt 6:17","2 Cor 1:21","1 John 2:20,27"]},{"a":"my cup","r":["Ps 16:5","Ps 116:13","1 Cor 10:16","Eph 3:20"]}],"psa.23.6":[{"a":"goodness","r":["Ps 30:11-12","Ps 36:7-10","Ps 103:17","2 Cor 1:10","2 Tim 4:18"]},{"a":"and I","r":["Ps 16:11","Ps 17:15","Ps 73:24-26","2 Cor 5:1","Phil 1:23"]},{"a":"for ever","r":["Ps 21:4"]}],"rom.5.1":[{"a":"being","r":["Rom 5:9,18","Rom 1:17","Rom 3:22,26-28,30","Rom 4:5,24-25","Rom 9:30","Rom 10:10","Hab 2:4","John 3:16-18","John 5:24","Acts 13:38-39","Gal 2:16","Gal 3:11-14,25","Gal 5:4-6","Phil 3:9","Jas 2:23-26"]},{"a":"we have","r":["Rom 5:10","Rom 1:7","Rom 10:15","Rom 14:17","Rom 15:13,33","Job 21:21","Ps 85:8-10","Ps 122:6","Isa 27:5","Isa 32:17","Isa 54:13","Isa 55:12","Isa 57:19-21","Zech 6:13","Luke 2:14","Luke 10:5-6","Luke 19:38,42","John 14:27","John 16:33","Acts 10:36","2 Cor 5:18-20","Eph 2:14-17","Col 1:20","Col 3:15","1 Thess 5:23","2 Thess 3:16","Heb 13:20","Jas 2:23"]},{"a":"through","r":["Rom 6:23","John 20:31","Eph 2:7"]}],"rom.5.10":[{"a":"when","r":["Rom 8:7","2 Cor 5:18-19,21","Col 1:20-21"]},{"a":"reconciled","r":["Rom 5:11","Rom 8:32","Lev 6:30","2 Chr 29:24","Ezek 45:20","Dan 9:24","Eph 2:16","Heb 2:17"]},{"a":"we shall","r":["John 5:26","John 6:40,57","John 10:28-29","John 11:25-26","John 14:19","2 Cor 4:10-11","Col 3:3-4","Heb 7:25","Rev 1:18"]}],"rom.5.11":[{"a":"but we","r":["Rom 2:17","Rom 3:29-30","1 Sam 2:1","Ps 32:11","Ps 33:1","Ps 43:4","Ps 104:34","Ps 149:2","Isa 61:10","Hab 3:17-18","Luke 1:46","Gal 4:9","Gal 5:22","Phil 3:1,3","Phil 4:4","1 Pet 1:8"]},{"a":"by whom","r":["John 1:12","John 6:50-58","1 Cor 10:16","Col 2:6"]},{"a":"atonement","r":["Rom 5:10","2 Cor 5:18-19"]}],"rom.5.12":[{"a":"as by","r":["Rom 5:19","Gen 3:6"]},{"a":"and death","r":["Rom 6:23","Gen 2:17","Gen 3:19,22-24","Ezek 18:4","1 Cor 15:21","Jas 1:15","Rev 20:14-15"]},{"a":"all","r":["Rom 3:23","Jas 3:2","1 John 1:8-10"]}],"rom.5.13":[{"a":"until","r":["Gen 4:7-11","Gen 6:5-6,11","Gen 8:21","Gen 13:13","Gen 18:20","Gen 19:4,32,36","Gen 38:7,10"]},{"a":"but sin","r":["Rom 4:15","1 Cor 15:56","1 John 3:4,14"]}],"rom.5.14":[{"a":"death","r":["Rom 5:17,21","Gen 4:8","Gen 5:5-31","Gen 7:22","Gen 19:25","Exod 1:6","Heb 9:27"]},{"a":"even","r":["Rom 8:20,22","Exod 1:22","Exod 12:29-30","Jonah 4:11"]}],"rom.5.15":[{"a":"But not","r":["Rom 5:16-17,20","Isa 55:8-9","John 3:16","John 4:10"]},{"a":"many","r":["Rom 5:12,18","Dan 12:2","Matt 20:28","Matt 26:28"]},{"a":"much","r":["Eph 2:8"]},{"a":"and the gift","r":["Rom 6:23","2 Cor 9:15","Heb 2:9","1 John 4:9-10","1 John 5:11"]},{"a":"hath","r":["Rom 5:20","Isa 53:11","Isa 55:7","1 John 2:2","Rev 7:9-10,14-17"]}],"rom.5.16":[{"a":"for the","r":["Gen 3:6-19","Gal 3:10","Jas 2:10"]},{"a":"but the free","r":["Isa 1:18","Isa 43:25","Isa 44:22","Luke 7:47-50","Acts 13:38-39","1 Cor 6:9-11","1 Tim 1:13-16"]}],"rom.5.17":[{"a":"For if","r":["Rom 5:12","Gen 3:6,19","1 Cor 15:21-22,49"]},{"a":"abundance","r":["Rom 5:20","John 10:10","1 Tim 1:14"]},{"a":"gift","r":["Rom 6:23","Isa 61:10","Phil 3:9"]},{"a":"shall reign","r":["Rom 8:39","Matt 25:34","1 Cor 4:8","2 Tim 2:12","Jas 2:5","1 Pet 2:9","Rev 1:6","Rev 3:21","Rev 5:9-10","Rev 20:4,6","Rev 22:5"]}],"rom.5.18":[{"a":"upon","r":["Rom 5:12,15,19","Rom 3:19-20"]},{"a":"the righteousness","r":["Rom 3:21-22","2 Pet 1:1"]},{"a":"all men","r":["John 1:7","John 3:26","John 12:32","Acts 13:39","1 Cor 15:22","1 Tim 2:4-6","Heb 2:9","1 John 2:20"]}],"rom.5.19":[{"a":"so by","r":["Isa 53:10-12","Dan 9:24","2 Cor 5:21","Eph 1:6","Rev 7:9-17"]}],"rom.5.2":[{"a":"By whom","r":["John 10:7,9","John 14:6","Acts 14:27","Eph 2:18","Eph 3:12","Heb 10:19-20","1 Pet 3:18"]},{"a":"wherein","r":["Rom 5:9-10","Rom 8:1,30-39","Rom 14:4","John 5:24","1 Cor 15:1","Eph 6:13","1 Pet 1:4"]},{"a":"and rejoice","r":["Rom 5:5","Rom 8:24","Rom 12:12","Rom 15:13","Job 19:25-27","Ps 16:9-11","Ps 17:15","Prov 14:32","2 Thess 2:16","Heb 3:6","Heb 6:18","1 Pet 1:3-9","1 John 3:1-3"]},{"a":"the glory","r":["Rom 2:7","Rom 3:23","Rom 8:17-18","Exod 33:18-20","Ps 73:24","Matt 25:21","John 5:24","2 Cor 3:18","2 Cor 4:17","Rev 3:21","Rev 21:3,11,23","Rev 22:4-5"]}],"rom.5.20":[{"a":"the law","r":["Rom 3:19-20","Rom 4:15","Rom 6:14","Rom 7:5-13","John 15:22","2 Cor 3:7-9","Gal 3:19-25"]},{"a":"But","r":["Rom 6:1","2 Chr 33:9-13","Ps 25:11","Isa 1:18","Isa 43:24-25","Jer 3:8-14","Ezek 16:52,60-63","Ezek 36:25-32","Mic 7:18-19","Matt 9:13","Luke 7:47","Luke 23:39-43","John 10:10","1 Cor 6:9-11","Eph 1:6-8","Eph 2:1-5","1 Tim 1:13-16","Titus 3:3-7"]}],"rom.5.21":[{"a":"That","r":["Rom 5:14","Rom 6:12,14,16"]},{"a":"grace","r":["John 1:16-17","Titus 2:11","Heb 4:16","1 Pet 5:10"]},{"a":"through","r":["Rom 5:17","Rom 4:13","Rom 8:10","2 Pet 1:1"]},{"a":"unto","r":["Rom 6:23","John 10:28","1 John 2:25","1 John 5:11-13"]}],"rom.5.3":[{"a":"but we","r":["Rom 8:35-37","Matt 5:10-12","Luke 6:22-23","Acts 5:41","2 Cor 11:23-30","2 Cor 12:9-10","Eph 3:13","Phil 1:29","Phil 2:17-18","Jas 1:2-3,12","1 Pet 3:14","1 Pet 4:16-17"]},{"a":"knowing","r":["2 Cor 4:17","Heb 12:10-11"]}],"rom.5.4":[{"a":"patience","r":["Rom 15:4","2 Cor 1:4-6","2 Cor 4:8-12","2 Cor 6:9-10","Jas 1:12","1 Pet 1:6-7","1 Pet 5:10"]},{"a":"and experience","r":["Josh 10:24-25","1 Sam 17:34-37","Ps 27:2-3","Ps 42:4-5","Ps 71:14,18-24","2 Cor 4:8-10","2 Tim 4:16-18"]}],"rom.5.5":[{"a":"hope","r":["Job 27:8","Ps 22:4-5","Isa 28:15-18","Isa 45:16-17","Isa 49:23","Jer 17:5-8","Phil 1:20","2 Thess 2:16","2 Tim 1:12","Heb 6:18-19"]},{"a":"because","r":["Rom 8:14-17,28","Matt 22:36-37","1 Cor 8:3","Heb 8:10-12","1 John 4:19"]},{"a":"shed","r":["Isa 44:3-5","Ezek 36:25","2 Cor 1:22","2 Cor 3:18","2 Cor 4:6","Gal 4:6","Gal 5:22","Eph 1:13","Eph 3:16-19","Eph 4:30","Titus 3:5"]}],"rom.5.6":[{"a":"For","r":["Ezek 16:4-8","Eph 2:1-5","Col 2:13","Titus 3:3-5"]},{"a":"without","r":["Lam 1:6","Dan 11:15"]},{"a":"in due time","r":["Gal 4:4","Heb 9:26","1 Pet 1:20"]},{"a":"Christ","r":["Rom 5:8","Rom 4:25","1 Thess 5:9"]},{"a":"ungodly","r":["Rom 4:5","Rom 11:26","Ps 1:1","1 Tim 1:9","Titus 2:12","2 Pet 2:5-6","2 Pet 3:7","Jude 1:4,15,18"]}],"rom.5.7":[{"a":"scarcely","r":["John 15:13","1 John 3:16"]},{"a":"a good","r":["2 Sam 18:27","Ps 112:5","Acts 11:24"]},{"a":"some","r":["Rom 16:4","2 Sam 18:3","2 Sam 23:14-17"]}],"rom.5.8":[{"a":"commendeth","r":["Rom 5:20","Rom 3:5","John 15:13","Eph 1:6-8","Eph 2:7","1 Tim 1:16"]},{"a":"in that","r":["Isa 53:6","1 Pet 3:18","1 John 3:16","1 John 4:9-10"]}],"rom.5.9":[{"a":"being","r":["Rom 5:1","Rom 3:24-26","Eph 2:13","Heb 9:14,22","1 John 1:7"]},{"a":"we shall","r":["Rom 5:10","Rom 1:18","Rom 8:1,30","John 5:24","1 Thess 1:10"]}],"rom.8.1":[{"a":"no","r":["Rom 4:7-8","Rom 5:1","Rom 7:17,20","Isa 54:17","John 3:18-19","John 5:24","Gal 3:13"]},{"a":"in","r":["Rom 16:7","John 14:20","John 15:4","1 Cor 1:30","1 Cor 15:22","2 Cor 5:17","2 Cor 12:2","Gal 3:28","Phil 3:9"]},{"a":"who","r":["Rom 8:4,14","Gal 5:16,25","Titus 2:11-14"]}],"rom.8.10":[{"a":"if Christ","r":["John 6:56","John 14:20,23","John 15:5","John 17:23","2 Cor 13:5","Eph 3:17","Col 1:27"]},{"a":"the body","r":["Rom 8:11","Rom 5:12","2 Cor 4:11","2 Cor 5:1-4","1 Thess 4:16","Heb 9:27","2 Pet 1:13-14","Rev 14:13"]},{"a":"but","r":["John 4:14","John 6:54","John 11:25-26","John 14:19","1 Cor 15:45","2 Cor 5:6-8","Phil 1:23","Col 3:3-4","Heb 12:23","Rev 7:14-17"]},{"a":"life","r":["Rom 5:21","2 Cor 5:21","Phil 3:9"]}],"rom.8.11":[{"a":"him","r":["Rom 8:9","Rom 4:24-25","Acts 2:24,32-33","Eph 1:19-20","Heb 13:20","1 Pet 1:21"]},{"a":"he that raised","r":["Rom 8:2","Rom 6:4-5","Isa 26:19","Ezek 37:14","John 5:28-29","1 Cor 6:14","1 Cor 15:16,20-22","1 Cor 15:51-57","2 Cor 4:14","Eph 2:5","Phil 3:21","1 Thess 4:14-17","1 Pet 3:18","Rev 1:18","Rev 11:11","Rev 20:11-13"]},{"a":"mortal","r":["Rom 6:12","1 Cor 15:53","2 Cor 4:11","2 Cor 5:4"]},{"a":"dwelleth","r":["Rom 8:9","John 7:38-39","John 14:17"]}],"rom.8.12":[{"a":"we are","r":["Rom 6:2-15","Ps 116:16","1 Cor 6:19-20","1 Pet 4:2-3"]}],"rom.8.13":[{"a":"ye live","r":["Rom 8:1,4-6","Rom 6:21,23","Rom 7:5","Gal 5:19-21","Gal 6:8","Eph 5:3-5","Col 3:5-6","Jas 1:14-15"]},{"a":"but if","r":["Rom 8:2","1 Cor 9:27","Gal 5:24","Eph 4:22","Col 3:5-8","Titus 2:12","1 Pet 2:11"]},{"a":"through","r":["Rom 8:1","Eph 4:30","Eph 5:18","1 Pet 1:22"]}],"rom.8.14":[{"a":"led","r":["Rom 8:5,9","Ps 143:10","Prov 8:20","Isa 48:16-17","Gal 4:6","Gal 5:16,18,22-25","Eph 5:9"]},{"a":"they are","r":["Rom 8:17","2 Cor 6:18","Gal 3:26","Eph 1:5","1 John 3:1","Rev 21:7"]}],"rom.8.15":[{"a":"the spirit","r":["Exod 20:19","Num 17:12","Luke 8:28,37","John 16:8","Acts 2:37","Acts 16:29","1 Cor 2:12","2 Tim 1:7","Heb 2:15","Heb 12:18-24","Jas 2:19","1 John 4:18"]},{"a":"the Spirit","r":["Rom 8:16","Isa 56:5","Jer 3:19","1 Cor 2:12","Gal 4:5-7","Eph 1:5,11-14"]},{"a":"Abba","r":["Mark 14:36","Luke 11:2","Luke 22:42","John 20:17"]}],"rom.8.16":[{"a":"Spirit","r":["Rom 8:23,26","2 Cor 1:22","2 Cor 5:5","Eph 1:13","Eph 4:30","1 John 4:13"]},{"a":"with our","r":["2 Cor 1:12","1 John 3:19-22","1 John 5:10"]}],"rom.8.17":[{"a":"if children","r":["Rom 8:3,29-30","Rom 5:9-10,17","Luke 12:32","Acts 26:18","Gal 3:29","Gal 4:7","Eph 3:6","Titus 3:7","Heb 1:14","Heb 6:17","Jas 2:5","1 Pet 1:4"]},{"a":"heirs of","r":["Matt 25:21","Luke 22:29-30","John 17:24","1 Cor 2:9","1 Cor 3:22-23","Rev 3:21","Rev 21:7"]},{"a":"if so be","r":["Matt 16:24","Luke 24:26","John 12:25-26","Acts 14:22","2 Cor 4:8-12","Phil 1:29","2 Tim 2:10-14"]}],"rom.8.18":[{"a":"I reckon","r":["Matt 5:11-12","Acts 20:24","2 Cor 4:17-18","Heb 11:25-26,35","1 Pet 1:6-7"]},{"a":"the glory","r":["Col 3:4","2 Thess 1:7-12","2 Thess 2:14","1 Pet 1:13","1 Pet 4:13","1 Pet 5:1","1 John 3:2"]}],"rom.8.19":[{"a":"the earnest","r":["Rom 8:23","Phil 1:20"]},{"a":"expectation","r":["Isa 65:17","Acts 3:21","2 Pet 3:11-13","Rev 21:1-5"]},{"a":"the manifestation","r":["Mal 3:17-18","Matt 25:31-46","1 John 3:2"]}],"rom.8.2":[{"a":"For","r":["Rom 3:27","John 8:36"]},{"a":"Spirit","r":["Rom 8:10-11","John 4:10,14","John 6:63","John 7:38-39","1 Cor 15:45","2 Cor 3:6","Rev 11:11","Rev 22:1"]},{"a":"hath","r":["Rom 6:18,22","Ps 51:12","John 8:32","2 Cor 3:17","Gal 2:19","Gal 5:1"]},{"a":"from","r":["Rom 5:21","Rom 7:21,24-25"]}],"rom.8.20":[{"a":"the creature","r":["Rom 8:22","Gen 3:17-19","Gen 5:29","Gen 6:13","Job 12:6-10","Isa 24:5-6","Jer 12:4,11","Jer 14:5-6","Hos 4:3","Joel 1:18"]}],"rom.8.21":[{"a":"Because","r":["2 Pet 3:13"]},{"a":"into the glorious","r":["Rom 8:19","Rev 22:3-5"]}],"rom.8.22":[{"a":"the, etc","r":["Rom 8:20","Mark 16:15","Col 1:23"]},{"a":"groaneth","r":["Ps 48:6","Jer 12:11","John 16:21","Rev 12:2"]}],"rom.8.23":[{"a":"which have","r":["Rom 8:15-16","Rom 5:5","2 Cor 5:5","Gal 5:22-23","Eph 1:14","Eph 5:9"]},{"a":"even we","r":["Rom 8:26","Rom 7:24","2 Cor 5:2-4","2 Cor 7:5","Phil 1:21-23","1 Pet 1:7"]},{"a":"waiting","r":["Rom 8:19,25","Luke 20:36","Phil 3:20-21","2 Tim 4:8","Titus 2:13","Heb 9:28","1 John 3:2"]},{"a":"the redemption","r":["Luke 21:28","Eph 1:14","Eph 4:30"]}],"rom.8.24":[{"a":"saved","r":["Rom 5:2","Rom 12:12","Rom 15:4,13","Ps 33:18,22","Ps 146:5","Prov 14:32","Jer 17:7","Zech 9:12","1 Cor 13:13","Gal 5:5","Col 1:5,23,27","1 Thess 5:8","2 Thess 2:16","Titus 2:11-13","Heb 6:18-19","1 Pet 1:3,21","1 John 3:3"]},{"a":"but hope","r":["2 Cor 4:18","2 Cor 5:7","Heb 11:1","1 Pet 1:10-11"]}],"rom.8.25":[{"a":"with patience","r":["Rom 8:23","Rom 2:7","Rom 12:12","Gen 49:18","Ps 27:14","Ps 37:7-9","Ps 62:1,5-6","Ps 130:5-7","Isa 25:9","Isa 26:8","Lam 3:25-26","Luke 8:15","Luke 21:19","Col 1:11","1 Thess 1:3","2 Thess 3:5","Heb 6:12,15","Heb 10:36","Heb 12:1-3","Jas 1:3-4","Jas 5:7-11","Rev 1:9","Rev 13:10","Rev 14:12"]}],"rom.8.26":[{"a":"infirmities","r":["Rom 15:1","2 Cor 12:5-10","Heb 4:15","Heb 5:2"]},{"a":"for we","r":["Matt 20:22","Luke 11:1-13","Jas 4:3"]},{"a":"but","r":["Rom 8:15","Ps 10:17","Zech 12:10","Matt 10:20","Gal 4:6","Eph 2:18","Eph 6:18","Jude 1:20-21"]},{"a":"with","r":["Rom 7:24","Ps 6:3,9","Ps 42:1-5","Ps 55:1-2","Ps 69:3","Ps 77:1-3","Ps 88:1-3","Ps 102:5,20","Ps 119:81","Ps 119:82","Ps 143:4-7","Luke 22:44","2 Cor 5:2,4","2 Cor 12:8"]}],"rom.8.27":[{"a":"And he","r":["1 Chr 28:9","1 Chr 29:17","Ps 7:9","Ps 44:21","Prov 17:3","Jer 11:20","Jer 17:10","Jer 20:12","Matt 6:8","John 21:17","Acts 1:24","Acts 15:8","1 Thess 2:4","Heb 4:13","Rev 2:23"]},{"a":"knoweth","r":["Ps 38:9","Ps 66:18-19","Jas 5:16"]},{"a":"he maketh","r":["Rom 8:34","Eph 2:18"]},{"a":"according","r":["Jer 29:12-13","John 14:13","Jas 1:5-6","1 John 3:21-22","1 John 5:14-15"]}],"rom.8.28":[{"a":"we know","r":["Rom 8:35-39","Rom 5:3-4","Gen 50:20","Deut 8:2-3,16","Ps 46:1-2","Jer 24:5-7","Zech 13:9","2 Cor 4:15-17","2 Cor 5:1","Phil 1:19-23","2 Thess 1:5-7","Heb 12:6-12","Jas 1:3-4","1 Pet 1:7-8","Rev 3:19"]},{"a":"them","r":["Rom 5:5","Exod 20:6","Deut 6:5","Neh 1:5","Ps 69:36","Mark 12:30","1 Cor 2:9","Jas 1:12","Jas 2:5","1 John 4:10,19","1 John 5:2-3"]},{"a":"the called","r":["Rom 8:30","Rom 1:6-7","Rom 9:11,23-24","Jer 51:29","Acts 13:48","Gal 1:15","Eph 1:9-10","Eph 3:11","1 Thess 5:9","2 Thess 2:13-14","2 Tim 2:19","1 Pet 5:10"]}],"rom.8.29":[{"a":"whom","r":["Rom 11:2","Exod 33:12,17","Ps 1:6","Jer 1:5","Matt 7:23","2 Tim 2:19","1 Pet 1:2","Rev 13:8"]},{"a":"he also","r":["Eph 1:5,11","1 Pet 1:20"]},{"a":"to be","r":["Rom 13:14","John 17:16,19,22-23,26","1 Cor 15:49","2 Cor 3:18","Eph 1:4","Eph 4:24","Phil 3:21","1 John 3:2"]},{"a":"that he might","r":["Ps 89:27","Matt 12:50","Matt 25:40","John 20:17","Col 1:15-18","Heb 1:5-6","Heb 2:11-15","Rev 1:5-6"]}],"rom.8.3":[{"a":"For what","r":["Rom 3:20","Rom 7:5-11","Acts 13:39","Gal 3:21","Heb 7:18-19","Heb 10:1-10,14"]},{"a":"God","r":["Rom 8:32","John 3:14-17","Gal 4:4-5","1 John 4:10-14"]},{"a":"in the","r":["Rom 9:3","Mark 15:27-28","John 9:24"]},{"a":"for sin","r":["2 Cor 5:21","Gal 3:13"]},{"a":"condemned","r":["Rom 6:6","1 Pet 2:24","1 Pet 4:1-2"]}],"rom.8.30":[{"a":"Moreover","r":["Rom 8:28","Rom 1:6","Rom 9:23-24","Isa 41:9","1 Cor 1:2,9","Eph 4:4","Heb 9:15","1 Pet 2:9","2 Pet 1:10","Rev 17:14","Rev 19:9"]},{"a":"he called","r":["Rom 3:22-26","1 Cor 6:11","Titus 3:4-7"]},{"a":"he justified","r":["Rom 8:1,17-18,33-35","Rom 5:8-10","John 5:24","John 6:39-40","John 17:22,24","2 Cor 4:17","Eph 2:6","Col 3:4","1 Thess 2:12","2 Thess 1:10-12","2 Thess 2:13-14","2 Tim 2:11","Heb 9:15","1 Pet 3:9","1 Pet 4:13-14","1 Pet 5:10"]}],"rom.8.31":[{"a":"What","r":["Rom 4:1"]},{"a":"If","r":["Gen 15:1","Num 14:9","Deut 33:29","Josh 10:42","1 Sam 14:6","1 Sam 17:45-47","Ps 27:1-3","Ps 46:1-3,7,11","Ps 56:4,11","Ps 84:11-12","Ps 118:6","Isa 50:7-9","Isa 54:17","Jer 1:19","Jer 20:11","John 10:28-30","1 John 4:4"]}],"rom.8.32":[{"a":"that","r":["Rom 5:6-10","Rom 11:21","Gen 22:12","Isa 53:10","Matt 3:17","John 3:16","2 Cor 5:21","2 Pet 2:4-5","1 John 4:10"]},{"a":"delivered","r":["Rom 4:25"]},{"a":"how","r":["Rom 8:28","Rom 6:23","Ps 84:11","1 Cor 2:12","1 Cor 3:21-23","2 Cor 4:15","Rev 21:7"]}],"rom.8.33":[{"a":"Who","r":["Rom 8:1","Job 1:9-11","Job 2:4-6","Job 22:6-30","Job 34:8-9","Job 42:7-9","Ps 35:11","Isa 54:17","Zech 3:1-4","Rev 12:10-11"]},{"a":"of God's","r":["Isa 42:1","Matt 24:24","Luke 18:7","1 Thess 1:4","Titus 1:1","1 Pet 1:2"]},{"a":"It is","r":["Rom 3:26","Isa 50:8-9","Gal 3:8","Rev 12:10-11"]}],"rom.8.34":[{"a":"Who","r":["Rom 8:1","Rom 14:13","Job 34:29","Ps 37:33","Ps 109:31","Jer 50:20"]},{"a":"It is Christ","r":["Rom 4:25","Rom 5:6-10","Rom 14:9","Job 33:24","Matt 20:28","John 14:19","Gal 3:13-14","Heb 1:3","Heb 9:10-14","Heb 10:10-14,19-22","Heb 12:2","1 Pet 3:18","Rev 1:18"]},{"a":"who is even","r":["Mark 16:19","Acts 7:56-60","Col 3:1","Heb 8:1-2","Heb 12:1","1 Pet 3:22"]},{"a":"who also","r":["Rom 8:27","Isa 53:12","John 16:23,26-27","John 17:20-24","Heb 4:14-15","Heb 7:25","Heb 9:24","1 John 2:1-2"]}],"rom.8.35":[{"a":"shall separate","r":["Rom 8:39","Ps 103:17","Jer 31:3","John 10:28","John 13:1","2 Thess 2:13-14,16","Rev 1:5"]},{"a":"shall tribulation","r":["Rom 8:17","Rom 5:3-5","Matt 5:10-12","Matt 10:28-31","Luke 21:12-18","John 16:33","Acts 14:22","Acts 20:23-24","2 Cor 4:17","2 Cor 6:4-10","2 Cor 11:23-27","2 Tim 1:12","2 Tim 4:16-18","Heb 12:3-11","Jas 1:2-4","1 Pet 1:5-7","1 Pet 4:12-14","Rev 7:14-17"]}],"rom.8.36":[{"a":"For thy","r":["Ps 44:22","Ps 141:7","John 16:2","1 Cor 15:30","2 Cor 4:11"]},{"a":"as sheep","r":["Isa 53:7","Jer 11:19","Jer 12:3","Jer 51:40","Acts 8:32"]}],"rom.8.37":[{"a":"Nay","r":["2 Chr 20:25-27","Isa 25:8","1 Cor 15:54,57","2 Cor 2:14","2 Cor 12:9,19","1 John 4:4","1 John 5:4-5","Rev 7:9-10","Rev 11:7-12","Rev 12:11","Rev 17:14","Rev 21:7"]},{"a":"him","r":["Gal 2:20","Eph 5:2,25-27","2 Thess 2:16","1 John 4:10,19","Jude 1:24","Rev 1:5"]}],"rom.8.38":[{"a":"For I","r":["Rom 4:21","2 Cor 4:13","2 Tim 1:12","Heb 11:13"]},{"a":"that","r":["Rom 14:8","John 10:28","1 Cor 3:22-23","1 Cor 15:54-58","2 Cor 5:4-8","Phil 1:20-23"]},{"a":"nor","r":["2 Cor 11:14","Eph 1:21","Eph 6:11-12","Col 1:16","Col 2:15","1 Pet 3:22","1 Pet 5:8-10"]}],"rom.8.39":[{"a":"Nor","r":["Eph 3:18-19"]},{"a":"height","r":["Exod 9:16-17","Ps 93:3-4","Isa 10:10-14,33","Isa 24:21","Dan 4:11","Dan 5:18-23","2 Thess 2:4","Rev 13:1-8"]},{"a":"depth","r":["Rom 11:33","Ps 64:6","Prov 20:5","Matt 24:24","2 Cor 2:11","2 Cor 11:3","2 Thess 2:9-12","Rev 2:24","Rev 12:9","Rev 13:14","Rev 19:20","Rev 20:3,7"]},{"a":"shall be","r":["John 10:28-30","Col 3:3-4"]},{"a":"love","r":["Rom 8:35","Rom 5:8","John 3:16","John 16:27","John 17:26","Eph 1:4","Eph 2:4-7","Titus 3:4-7","1 John 4:9-10,16,19"]}],"rom.8.4":[{"a":"That","r":["Gal 5:22-24","Eph 5:26-27","Col 1:22","Heb 12:23","1 John 3:2","Jude 1:24","Rev 14:5"]}],"rom.8.5":[{"a":"For they","r":["Rom 8:12-13","John 3:6","1 Cor 15:48","2 Cor 10:3","2 Pet 2:10"]},{"a":"mind","r":["Rom 8:6-7","Mark 8:33","1 Cor 2:14","Phil 3:18-19"]},{"a":"of the Spirit","r":["Rom 8:9,14","1 Cor 2:14","Gal 5:22-25","Eph 5:9","Col 3:1-3"]}],"rom.8.6":[{"a":"to be carnally minded","r":["Rom 8:7,13","Rom 6:21,23","Rom 7:5,11","Rom 13:14","Gal 6:8","Jas 1:14-15"]},{"a":"to be spiritually minded","r":["Rom 5:1,10","Rom 14:17","John 14:6,27","John 17:5","Gal 5:22"]}],"rom.8.7":[{"a":"the carnal mind","r":["Rom 1:28,30","Rom 5:10","Exod 20:5","2 Chr 19:2","Ps 53:1","John 7:7","John 15:23-24","Eph 4:18-19","Col 1:21","2 Tim 3:4","Jas 4:4","1 John 2:15-16"]},{"a":"for it","r":["Rom 8:4","Rom 3:31","Rom 7:7-14,22","Matt 5:19","1 Cor 9:21","Gal 5:22-23","Heb 8:10"]},{"a":"neither","r":["Jer 13:23","Matt 12:34","1 Cor 2:14","2 Pet 2:14"]}],"rom.8.8":[{"a":"they that","r":["Rom 8:9","Rom 7:5","John 3:3,5-6"]},{"a":"please","r":["Matt 3:17","John 8:29","1 Cor 7:32","Phil 4:18","Col 1:10","Col 3:20","1 Thess 4:1","Heb 11:5-6","Heb 13:16,21","1 John 3:22"]}],"rom.8.9":[{"a":"But ye","r":["Rom 8:2","Ezek 11:19","Ezek 36:26-27","John 3:6"]},{"a":"if so be","r":["Rom 8:11","Luke 11:13","1 Cor 3:16","1 Cor 6:19","2 Cor 6:16","Gal 4:6","Eph 1:13,17-18","Eph 2:22","2 Tim 1:14","1 John 3:24","1 John 4:4","Jude 1:19-21"]},{"a":"the Spirit","r":["John 3:34","Gal 4:6","Phil 1:19","1 Pet 1:11"]},{"a":"he is","r":["John 17:9-10","1 Cor 3:21-23","1 Cor 15:23","2 Cor 10:7","Gal 5:24","Rev 13:8","Rev 20:15"]}]};

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
      <button type="button" id="menu-import-tsk" style="width:100%;margin-bottom:0.5rem;min-height:52px">Load All Cross-References (one time)</button>
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
        <h2 style="margin:0;border:none;padding:0">Load All Cross-References</h2>
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
 * Tap-a-word Strong's (v6.20.0 – user-controlled marks)
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

        <p style="margin-bottom:1rem"><strong>Research / Commentary</strong><br>
        Tap <strong>Research</strong> while viewing a chapter. Choose Adam Clarke or Tyndale Open Study Notes.
        Notes are fetched from the free bible.helloao.org API and cached on this device so they work offline afterward.</p>

        <p style="margin-bottom:1rem"><strong>Tap-a-word Strong's</strong><br>
        With the dictionary installed, tap any word to open Strong's (number, gloss, transliteration, other verses).<br>
        Use <strong>Mark this word</strong> inside the panel to put a thin outline on that occurrence only.<br>
        <strong>Remove mark</strong> clears it. Long-press + drag still selects text for Color as before.</p>

        <p style="margin-bottom:1rem"><strong>Backup</strong><br>
        Menu → Export / Import study data.</p>

        <p style="margin-bottom:0.5rem"><strong>Version</strong> 6.20.0</p>
      </div>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);
}

function openAbout() {
  showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>About – KJV Study v6.20.0</h2>
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
        <strong>Research:</strong> Adam Clarke’s Commentary and Tyndale Open Study Notes
        (via the free bible.helloao.org API). Chapters are cached locally after first load.
      </p>
      <p style="line-height:1.65;margin-bottom:0.8rem">
        <strong>Install:</strong> On supported browsers (Chrome, Edge, Safari on iOS/iPadOS,
        Chromebook) use the browser’s “Add to Home Screen” / “Install app” option
        for a full-screen, offline-capable experience.
      </p>
      <p style="font-size:0.9em;color:var(--text-dim)">Version 6.20.0 – personal data stays on device</p>
    </div>
  `).querySelector('.close').onclick = function () {
    closeOverlay(this.closest('.overlay'));
  };
}

// ---------- Start ----------
document.addEventListener('DOMContentLoaded', init);
