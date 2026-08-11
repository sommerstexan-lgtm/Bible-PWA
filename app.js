/* app.js – Main application controller. KJV Study PWA v5.15.0
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
      const reg = await navigator.serviceWorker.register('./sw.js?v=5.15.0', {
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
      <div class="version-bar">v5.15.0</div>
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
 * Build verse HTML with solid highlight fills + optional Tap-a-word Strong's outlines.
 * When enableTap is true, every alphabetic word is wrapped in .tap-word so it can be
 * tapped for Strong's. Outline color follows the agreed rule:
 *   - no highlight → soft fixed accent (CSS --tap-outline-default)
 *   - has highlight → brighter version of that highlight color (never disappears)
 * Text content / character offsets are preserved so selection logic stays intact.
 */
function buildColoredHtml(text, ranges, enableTap = false) {
  if (!ranges.length && !enableTap) return escapeHtml(text);
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
        if (col) {
          const meta = analyze.getColorMeta(col);
          const bg = (meta && meta.hex) ? meta.hex : "#666666";
          const fg = (meta && meta.text) ? meta.text : analyze.contrastTextColor(bg);
          const outline = analyze.outlineColorForHighlight(bg);
          html += `<span class="hl tap-word" data-color="${col}" data-word="${esc}" style="background-color:${bg};color:${fg};-webkit-text-fill-color:${fg};--tap-outline:${outline}">${esc}</span>`;
        } else {
          html += `<span class="tap-word" data-word="${esc}">${esc}</span>`;
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
  // Lexicon presence enables Tap-a-word Strong's outlines (fully offline)
  const [lexPack] = await Promise.all([
    storage.getLexiconPack(),
    ...keys.map(async (k) => {
      const [hl, note, xrefs, shared] = await Promise.all([
        storage.getHighlights(k),
        storage.getNote(k),
        storage.getCrossRefs(k),
        storage.findSharedNoteForVerse(k)
      ]);
      highlightMap[k] = hl;
      const hasPrivate = !!(note && String(note).trim());
      const hasShared = !!(shared && shared.body && String(shared.body).trim());
      noteMap[k] = hasPrivate || hasShared;
      xrefMap[k] = Array.isArray(xrefs) && xrefs.length > 0;
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

    const coloredText = buildColoredHtml(v.text, ranges, enableTap);
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
      openStrongsForWord(wordEl.dataset.word, verseEl ? verseEl.dataset.key : null);
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

// ---------- Review by color (v5.15.0: hierarchical book → verse + Back to books) ----------
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
const STARTER_XREFS = {
  // Small public-domain common references (illustrative)
  'gen.1.1': [{ target: 'jhn.1.1', label: 'John 1:1' }, { target: 'heb.11.3', label: 'Heb 11:3' }],
  'gen.1.2': [{ target: 'psa.104.30', label: 'Ps 104:30' }],
  'gen.1.3': [{ target: '2co.4.6', label: '2 Cor 4:6' }],
  'gen.1.26': [{ target: 'col.1.16', label: 'Col 1:16' }, { target: 'jhn.1.3', label: 'John 1:3' }],
  'gen.1.27': [{ target: 'mat.19.4', label: 'Matt 19:4' }]
};

async function openCrossRefs(key) {
  let refs = await storage.getCrossRefs(key);
  // merge starter if none user-defined yet (copy so we can persist deletes)
  if (!refs.length && STARTER_XREFS[key]) {
    refs = STARTER_XREFS[key].map(r => ({ ...r }));
  }

  function renderListHtml(items) {
    if (!items.length) return '<p style="color:var(--text-dim)">No cross-references yet.</p>';
    return items.map((r, i) => `
      <div class="xref-row" style="display:flex;gap:0.4rem;margin-bottom:0.45rem;align-items:stretch">
        <button type="button" class="xref-item" data-target="${escapeHtml(r.target)}" data-idx="${i}"
          style="flex:1;text-align:left">${escapeHtml(r.label || r.target)}</button>
        <button type="button" class="xref-del" data-idx="${i}" title="Delete"
          style="flex:0 0 auto;min-width:52px;min-height:48px;background:#8b2e2e;color:#fff;font-weight:700">✕</button>
      </div>
    `).join('');
  }

  const overlay = showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>Cross-references</h2>
      <div id="xref-list">${renderListHtml(refs)}</div>
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
        const book = books.find(b => b.id === currentBookId);
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
        $('#xref-list', overlay).innerHTML = renderListHtml(refs);
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
    $('#xref-list', overlay).innerHTML = renderListHtml(refs);
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
    'genesis': 'gen', 'gen': 'gen',
    'exodus': 'exo', 'exo': 'exo',
    'matthew': 'mat', 'matt': 'mat', 'mat': 'mat',
    'john': 'jhn', 'jhn': 'jhn', 'jn': 'jhn',
    'hebrews': 'heb', 'heb': 'heb',
    'psalm': 'psa', 'psalms': 'psa', 'ps': 'psa', 'psa': 'psa',
    'colossians': 'col', 'col': 'col',
    '2 corinthians': '2co', '2cor': '2co', '2 co': '2co'
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

// ---------- Search (v5.15.0: sticky header + hierarchical book → verse) ----------
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
      // Re-render current chapter so Tap-a-word outlines appear immediately
      if (currentBookId && currentChapter) {
        await renderChapter(currentBookId, currentChapter, { preserveScroll: document.getElementById('main')?.scrollTop || 0 });
      }
    } catch (err) {
      alert('Import failed: ' + (err.message || err));
    }
  };
}


/**
 * Tap-a-word Strong's (v5.15.0 mid-level)
 * Uses only the installed lexicon pack + loaded book text. Fully offline.
 * Shows Strong's number, gloss, transliteration/pron, and a few other verses
 * that contain the same English word (approximation of same-Strong occurrences
 * because verse text is not Strong's-tagged).
 */
async function openStrongsForWord(word, verseKey) {
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

  const overlay = showOverlay(`
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem">
        <h2 style="margin:0;border:none;padding:0">Strong's · ${escapeHtml(clean)}</h2>
        <button type="button" class="close" style="float:none;min-width:52px;min-height:52px;font-size:1.5rem">×</button>
      </div>
      ${body}
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);

  const dictBtn = $('#strong-open-dict', overlay);
  if (dictBtn) {
    dictBtn.onclick = () => { closeOverlay(overlay); openDictionary(clean); };
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

        <p style="margin-bottom:1rem"><strong>Backup</strong><br>
        Menu → Export / Import study data.</p>

        <p style="margin-bottom:0.5rem"><strong>Version</strong> 5.15.0</p>
      </div>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);
}

function openAbout() {
  showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>About – KJV Study v5.15.0</h2>
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
      <p style="font-size:0.9em;color:var(--text-dim)">Version 5.15.0 – personal data stays on device</p>
    </div>
  `).querySelector('.close').onclick = function () {
    closeOverlay(this.closest('.overlay'));
  };
}

// ---------- Start ----------
document.addEventListener('DOMContentLoaded', init);
