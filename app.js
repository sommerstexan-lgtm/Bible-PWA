/* app.js – Main application controller. NASB Study PWA v3.4.0
   Client-side only. Personal data never leaves the device.
*/

import * as storage from './storage.js';
import * as bible from './bible.js';
import * as analyze from './analyze.js';

// ---------- Password gate (client-side only) ----------
const APP_PASSWORD = 'NASB-Study-1995-Private';

function checkPassword() {
  if (localStorage.getItem('nasb-unlocked') === 'yes') return true;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay center';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px;text-align:center">
        <h2 style="margin-bottom:1rem">NASB Study</h2>
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
        localStorage.setItem('nasb-unlocked', 'yes');
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
let navStack = []; // for cross-ref back navigation

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
      await navigator.serviceWorker.register('./sw.js');
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
    <header>
      <button type="button" id="btn-nav" title="Books & Chapters" aria-label="Navigate">☰ Books</button>
      <div class="title" id="header-title">NASB Study</div>
      <button type="button" id="btn-search" aria-label="Search">Search</button>
      <button type="button" id="btn-menu" aria-label="Menu">Menu</button>
    </header>
    <div class="toolbar" id="toolbar">
      <button type="button" id="btn-font-down" aria-label="Smaller text">A−</button>
      <button type="button" id="btn-font-up" aria-label="Larger text">A+</button>
      <button type="button" id="btn-colors" title="Color Index">Colors</button>
      <button type="button" id="btn-review" title="Review by color">Review</button>
      <button type="button" id="btn-help" title="Help">Help</button>
      <span class="spacer"></span>
      <button type="button" id="btn-prev-ch" aria-label="Previous chapter">◀</button>
      <button type="button" id="btn-next-ch" aria-label="Next chapter">▶</button>
    </div>
    <div class="version-bar">v3.4.0</div>
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
  $('#btn-prev-ch').onclick = () => changeChapter(-1);
  $('#btn-next-ch').onclick = () => changeChapter(1);
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

function buildColoredHtml(text, ranges) {
  if (!ranges.length) return escapeHtml(text);
  const len = text.length;
  const cover = Array.from({ length: len }, () => null);
  for (const r of ranges) {
    for (let i = r.start; i < r.end; i++) cover[i] = r.color;
  }
  let html = "";
  let i = 0;
  while (i < len) {
    const col = cover[i];
    let j = i + 1;
    while (j < len && cover[j] === col) j++;
    const slice = escapeHtml(text.slice(i, j));
    if (col) {
      const meta = analyze.getColorMeta(col);
      // Pure solid color – no transparency, correct text color
      const bg = meta ? meta.hex : "#666666";
      const fg = meta ? meta.text : "#ffffff";
      html += `<span class="hl" data-color="${col}" style="background-color:${bg};color:${fg}">${slice}</span>`;
    } else {
      html += slice;
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

let pendingSelection = null; // { key, start, end, text }

function getSelectionOffsets(textEl) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount || !textEl) return null;
  const range = sel.getRangeAt(0);
  if (!textEl.contains(range.commonAncestorContainer)) return null;

  // Build plain text and map offsets by walking text nodes
  const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
  let plain = "";
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push({ node: walker.currentNode, start: plain.length });
    plain += walker.currentNode.textContent;
  }

  function offsetInPlain(container, offset) {
    for (const n of nodes) {
      if (n.node === container) return n.start + offset;
      // if container is an element, try its text children
    }
    // Fallback: use toString length of a pre-range
    try {
      const pre = range.cloneRange();
      pre.selectNodeContents(textEl);
      pre.setEnd(container, offset);
      return pre.toString().length;
    } catch (e) {
      return null;
    }
  }

  const start = offsetInPlain(range.startContainer, range.startOffset);
  const end = offsetInPlain(range.endContainer, range.endOffset);
  if (start == null || end == null || end <= start) return null;
  return { start, end, text: plain.slice(start, end), plainLen: plain.length };
}

function captureSelectionFromVerse(key) {
  const verseEl = document.getElementById("v-" + key.replace(/\./g, "-"));
  if (!verseEl) { pendingSelection = null; return null; }
  const textEl = verseEl.querySelector(".verse-text");
  const result = getSelectionOffsets(textEl);
  if (!result) { pendingSelection = null; return null; }
  pendingSelection = { key, start: result.start, end: result.end, text: result.text };
  return pendingSelection;
}

function installSelectionWatchers(main) {
  // Capture selection as soon as the user finishes selecting (before button tap collapses it)
  const save = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    // Find which verse the selection is inside
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
    // Debounce slightly
    clearTimeout(installSelectionWatchers._t);
    installSelectionWatchers._t = setTimeout(save, 50);
  });
}

async function renderChapter(bookId, chapterNum) {
  const book = books.find(b => b.id === bookId);
  if (!book) return;
  const ch = book.chapters.find(c => c.number === chapterNum);
  if (!ch) return;

  currentBookId = bookId;
  currentChapter = chapterNum;
  $('#header-title').textContent = `${book.name} ${chapterNum}`;

  const main = $('#main');
  main.innerHTML = `<div class="chapter-header">${book.name} ${chapterNum}</div>`;

  const keys = ch.verses.map(v => bible.verseKey(bookId, chapterNum, v.number));
  const highlightMap = {};
  await Promise.all(keys.map(async (k) => {
    highlightMap[k] = await storage.getHighlights(k);
  }));

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

    const coloredText = buildColoredHtml(v.text, ranges);

    verseEl.innerHTML = `
      <span class="verse-num">${v.number}</span>
      <span class="verse-text">${coloredText}</span>
      <div class="color-chips">${chips}</div>
      <div class="verse-actions">
        <button type="button" data-act="analyze" data-key="${key}">Analyze</button>
        <button type="button" data-act="color" data-key="${key}">Color</button>
        <button type="button" data-act="note" data-key="${key}">Note</button>
        <button type="button" data-act="xref" data-key="${key}">Cross-refs</button>
      </div>
    `;
    main.appendChild(verseEl);
  }

  // Event delegation
  main.onclick = async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const key = btn.dataset.key;

    // Prefer already-captured selection; fall back to live capture
    if (!pendingSelection || pendingSelection.key !== key) {
      captureSelectionFromVerse(key);
    }

    if (act === 'analyze') openAnalyze(key);
    else if (act === 'color') openColorPicker(key);
    else if (act === 'note') openNote(key);
    else if (act === 'xref') openCrossRefs(key);
  };

  installSelectionWatchers(main);

  main.scrollTop = 0;
  await storage.saveLastPosition({ bookId, chapter: chapterNum });
  updateChapterButtons();
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
  const list = books.map(b => `
    <li data-book="${b.id}">
      <strong>${b.name}</strong>
      <span style="color:var(--text-dim);font-size:0.9em"> (${b.testament || ''} · ${b.chapters.length} ch)</span>
    </li>
  `).join('');

  const overlay = showOverlay(`
    <div class="panel">
      <button class="close" type="button" aria-label="Close">×</button>
      <h2>Books</h2>
      <ul class="nav-list" id="book-list">${list || '<li>No books imported</li>'}</ul>
      <div id="chapter-area" class="hidden">
        <h2 id="ch-title" style="margin-top:1rem"></h2>
        <div class="chapter-grid" id="ch-grid"></div>
        <button type="button" id="back-to-books" style="margin-top:1rem;width:100%">← Back to books</button>
      </div>
    </div>
  `);

  $('.close', overlay).onclick = () => closeOverlay(overlay);
  $('#back-to-books', overlay).onclick = () => {
    $('#book-list', overlay).classList.remove('hidden');
    $('#chapter-area', overlay).classList.add('hidden');
  };

  $$('#book-list li[data-book]', overlay).forEach(li => {
    li.onclick = () => {
      const book = books.find(b => b.id === li.dataset.book);
      if (!book) return;
      $('#book-list', overlay).classList.add('hidden');
      $('#chapter-area', overlay).classList.remove('hidden');
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
    };
  });
}

// ---------- Color Index ----------
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

// ---------- Review by color ----------
async function openReviewByColor(preselectColor = null) {
  const allHighlights = await storage.getAllHighlights();
  const colorFilter = preselectColor;

  const colorOptions = analyze.allColors().map(c =>
    `<option value="${c.id}" ${c.id === colorFilter ? 'selected' : ''}>${c.label} – ${c.meaning}</option>`
  ).join('');

  const overlay = showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>Review by Color</h2>
      <label style="display:block;margin-bottom:0.6rem">
        Color:
        <select id="review-color" style="width:100%;padding:0.6rem;font-size:1.05rem;margin-top:0.3rem;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px">
          <option value="">— choose a color —</option>
          ${colorOptions}
        </select>
      </label>
      <label style="display:block;margin-bottom:0.8rem">
        Book filter:
        <select id="review-book" style="width:100%;padding:0.6rem;font-size:1.05rem;margin-top:0.3rem;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px">
          <option value="">All loaded books</option>
          ${books.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
        </select>
      </label>
      <div id="review-results"></div>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);

  async function refresh() {
    const color = $('#review-color', overlay).value;
    const bookFilter = $('#review-book', overlay).value;
    const resultsEl = $('#review-results', overlay);
    if (!color) {
      resultsEl.innerHTML = '<p style="color:var(--text-dim)">Select a color to see matching verses.</p>';
      return;
    }
    const matches = allHighlights.filter(h => {
      const ranges = h.ranges || [];
      return ranges.some(r => r.color === color);
    });
    const filtered = bookFilter
      ? matches.filter(h => h.key.startsWith(bookFilter + '.'))
      : matches;

    if (!filtered.length) {
      resultsEl.innerHTML = '<p style="color:var(--text-dim)">No verses marked with this color yet.</p>';
      return;
    }

    resultsEl.innerHTML = filtered.map(h => {
      const { bookId, chapter, verse } = bible.parseKey(h.key);
      const book = books.find(b => b.id === bookId);
      const text = bible.getVerseText(books, bookId, chapter, verse) || '';
      return `
        <div class="search-result" data-key="${h.key}">
          <span class="ref">${book ? book.name : bookId} ${chapter}:${verse}</span>
          ${escapeHtml(text.slice(0, 140))}${text.length > 140 ? '…' : ''}
        </div>
      `;
    }).join('');

    $$('.search-result', resultsEl).forEach(el => {
      el.onclick = async () => {
        const { bookId, chapter } = bible.parseKey(el.dataset.key);
        closeOverlay(overlay);
        await renderChapter(bookId, chapter);
        // scroll to verse after short delay
        setTimeout(() => {
          const target = document.getElementById('v-' + el.dataset.key.replace(/\./g, '-'));
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 120);
      };
    });
  }

  $('#review-color', overlay).onchange = refresh;
  $('#review-book', overlay).onchange = refresh;
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

  if (!pendingSelection || pendingSelection.key !== key) {
    captureSelectionFromVerse(key);
  }
  const sel = pendingSelection && pendingSelection.key === key ? pendingSelection : null;

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

    if (sel) {
      // Remove overlapping parts first, then add the new range
      const punched = [];
      for (const r of ranges) {
        if (r.end <= sel.start || r.start >= sel.end) {
          punched.push(r);
        } else {
          if (r.start < sel.start) punched.push({ color: r.color, start: r.start, end: sel.start });
          if (r.end > sel.end) punched.push({ color: r.color, start: sel.end, end: r.end });
        }
      }
      punched.push({ color: colorId, start: sel.start, end: sel.end });
      ranges = punched;
    } else {
      ranges = [{ color: colorId, start: 0, end: plain.length }];
    }

    await storage.setHighlights(key, ranges);
    pendingSelection = null;
    closeOverlay(overlay);
    await renderChapter(currentBookId, currentChapter);
    setTimeout(() => {
      const t = document.getElementById("v-" + key.replace(/\./g, "-"));
      if (t) t.scrollIntoView({ block: "center" });
    }, 80);
  };
}


// ---------- Notes ----------
async function openNote(key) {
  const existing = await storage.getNote(key);
  const { bookId, chapter, verse } = bible.parseKey(key);
  const overlay = showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>Note – ${bookId.toUpperCase()} ${chapter}:${verse}</h2>
      <textarea class="note-input" id="note-text" placeholder="Your personal notes stay on this device only…">${escapeHtml(existing)}</textarea>
      <button type="button" id="save-note" style="width:100%;margin-top:0.8rem;background:var(--accent);color:#111;font-weight:600">Save Note</button>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);
  $('#save-note', overlay).onclick = async () => {
    const text = $('#note-text', overlay).value;
    await storage.setNote(key, text);
    closeOverlay(overlay);
  };
  // auto-focus
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
  // merge starter if none user-defined yet
  if (!refs.length && STARTER_XREFS[key]) {
    refs = STARTER_XREFS[key];
  }

  const list = refs.map((r, i) => `
    <button type="button" class="xref-item" data-target="${r.target}" data-idx="${i}">
      ${r.label || r.target}
    </button>
  `).join('') || '<p style="color:var(--text-dim)">No cross-references yet.</p>';

  const overlay = showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>Cross-references</h2>
      <div id="xref-list">${list}</div>
      <hr style="border-color:var(--border);margin:1rem 0">
      <label style="display:block;margin-bottom:0.4rem">Add new (e.g. jhn.3.16 or John 3:16)</label>
      <input type="text" id="new-xref" placeholder="book.chapter.verse or Book ch:vs"
        style="width:100%;padding:0.7rem;font-size:1.1rem;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
      <button type="button" id="add-xref" style="width:100%;margin-top:0.6rem">Add Cross-ref</button>
      ${navStack.length ? '<button type="button" id="xref-back" style="width:100%;margin-top:0.6rem">← Back to previous</button>' : ''}
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);

  $$('.xref-item', overlay).forEach(btn => {
    btn.onclick = async () => {
      // push current location for back
      navStack.push({ bookId: currentBookId, chapter: currentChapter });
      closeOverlay(overlay);
      await jumpToRef(btn.dataset.target);
    };
  });

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
    closeOverlay(overlay);
    openCrossRefs(key); // refresh
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
    return;
  }
  await renderChapter(bookId, chapter);
  setTimeout(() => {
    const t = document.getElementById('v-' + targetKey.replace(/\./g, '-'));
    if (t) {
      t.scrollIntoView({ behavior: 'smooth', block: 'center' });
      t.style.outline = '2px solid var(--accent)';
      setTimeout(() => { t.style.outline = ''; }, 2500);
    }
  }, 150);
}

// ---------- Search ----------
function openSearch() {
  const overlay = showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>Search (loaded books only)</h2>
      <input type="search" class="search-box" id="search-input" placeholder="Type at least 2 characters…" autofocus>
      <div id="search-results"></div>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);
  const input = $('#search-input', overlay);
  let timer = null;
  input.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      const results = await bible.searchBooks(q, books);
      const el = $('#search-results', overlay);
      if (!results.length) {
        el.innerHTML = q.length >= 2 ? '<p style="color:var(--text-dim)">No matches.</p>' : '';
        return;
      }
      el.innerHTML = results.map(r => `
        <div class="search-result" data-key="${r.key}">
          <span class="ref">${r.bookName} ${r.chapter}:${r.verse}</span>
          ${escapeHtml(r.snippet)}
        </div>
      `).join('');
      $$('.search-result', el).forEach(row => {
        row.onclick = async () => {
          const { bookId, chapter } = bible.parseKey(row.dataset.key);
          closeOverlay(overlay);
          await renderChapter(bookId, chapter);
          setTimeout(() => {
            const t = document.getElementById('v-' + row.dataset.key.replace(/\./g, '-'));
            if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 120);
        };
      });
    }, 220);
  };
  setTimeout(() => input.focus(), 100);
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
  $('#menu-import', overlay).onclick = () => { closeOverlay(overlay); openImport(); };
  $('#menu-settings', overlay).onclick = () => { closeOverlay(overlay); openSettings(); };
  $('#menu-about', overlay).onclick = () => { closeOverlay(overlay); openAbout(); };
  $('#menu-lock', overlay).onclick = () => {
    localStorage.removeItem('nasb-unlocked');
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
        currentBookId = imported[0].id;
        currentChapter = 1;
        await renderChapter(currentBookId, currentChapter);
      }
    } catch (err) {
      alert('Import failed: ' + (err.message || err));
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
    a.download = `nasb-study-backup-${stamp}.json`;
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
        (<code>nasb-study-backup-….json</code>).
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


function openHelp() {
  const overlay = showOverlay(`
    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem">
        <h2 style="margin:0;border:none;padding:0">How to use</h2>
        <button type="button" class="close" style="float:none;min-width:52px;min-height:52px;font-size:1.5rem">×</button>
      </div>
      <div style="line-height:1.65;font-size:1.02em">
        <p style="margin-bottom:1rem"><strong>Color a few words</strong><br>
        Long-press and select the words → tap <strong>Color</strong> → choose color → <strong>Apply Color</strong>.</p>

        <p style="margin-bottom:1rem"><strong>Clear a highlight</strong><br>
        Select the highlighted words → Color → “Clear color from selected text”.<br>
        Or Color → “Clear ALL colors on this verse”.</p>

        <p style="margin-bottom:1rem"><strong>Chapters (◀ ▶)</strong><br>
        Move to previous/next chapter. Buttons dim at the first or last chapter.<br>
        Sample includes Genesis 1–2. If arrows do nothing: Menu → Remove sample book → hard-refresh.</p>

        <p style="margin-bottom:1rem"><strong>Backup</strong><br>
        Menu → Export study data / Import study data.</p>

        <p style="margin-bottom:1rem"><strong>Password</strong><br>
        Stays unlocked until Menu → Lock app.</p>

        <p style="margin-bottom:0.5rem"><strong>Version</strong> 3.4.0</p>
      </div>
    </div>
  `);
  $('.close', overlay).onclick = () => closeOverlay(overlay);
}

function openAbout() {
  showOverlay(`
    <div class="panel">
      <button class="close" type="button">×</button>
      <h2>About – NASB Study v3.4.0</h2>
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
        <strong>Text:</strong> This app never ships copyrighted NASB text.
        A public-domain KJV Genesis sample is included only for testing.
        Import your own legally obtained NASB 1995 text in the documented JSON format.
      </p>
      <p style="line-height:1.65;margin-bottom:0.8rem">
        <strong>Install:</strong> On supported browsers (Chrome, Edge, Safari on iOS/iPadOS,
        Chromebook) use the browser’s “Add to Home Screen” / “Install app” option
        for a full-screen, offline-capable experience.
      </p>
      <p style="font-size:0.9em;color:var(--text-dim)">Version 3.4.0 – personal data stays on device</p>
    </div>
  `).querySelector('.close').onclick = function () {
    closeOverlay(this.closest('.overlay'));
  };
}

// ---------- Start ----------
document.addEventListener('DOMContentLoaded', init);
