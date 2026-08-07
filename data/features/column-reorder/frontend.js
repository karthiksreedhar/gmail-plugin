/**
 * Column Controls (Reorder & Minimize) Frontend
 *
 * Adds two controls to the multi-column inbox layout columns:
 *
 *   1. REORDER  - grab a column by its header and drop it to the left/right of
 *                 another column to change the left-to-right order. The order
 *                 is applied with CSS flex `order` so it survives the layout's
 *                 frequent re-renders.
 *
 *   2. MINIMIZE - each column header carries a small toggle button. Minimizing
 *                 collapses the column to a thin vertical strip (its body is
 *                 hidden and the label rotates), freeing horizontal space for
 *                 the remaining columns. Expanding restores it. Clicking a
 *                 minimized column's strip also expands it.
 *
 * Both the order and the set of minimized columns are persisted per user via
 * the backend (with a localStorage mirror for instant apply on load).
 *
 * Target layout: the multi-column inbox produced by the layout feature, i.e.
 * a `.iust-top` flex row inside `#emailContainer` whose direct `.iust-col`
 * children (Important & Unread / Starred / Drafts) are the columns. Each
 * column carries a stable class such as `iust-col-primary` used as its key.
 */

(function () {
  'use strict';

  console.log('Column Controls: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Column Controls: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // ---- Configuration -------------------------------------------------------
  const CONTAINER_ID = 'emailContainer';   // the approved-list container
  const TOP_SELECTOR = '.iust-top';         // the flex row that holds the columns
  const COL_SELECTOR = '.iust-col';         // each column
  const HEADER_SELECTOR = '.iust-header';   // used as the drag handle

  // ---- State ---------------------------------------------------------------
  let savedOrder = [];      // canonical list of column keys, left -> right
  let savedMinimized = [];  // column keys that are collapsed
  let currentUser = '';     // used for per-user persistence / cache
  let dragKey = null;       // key of the column currently being dragged
  let scheduled = false;    // debounce flag for decorateColumns()

  /* ========================================================================
   * COLUMN KEYS
   * ====================================================================== */

  // Derive a stable key for a column so its state can be remembered across
  // re-renders. Prefer the layout's own per-column class (e.g. iust-col-primary);
  // fall back to the header text if no such class exists.
  function getColumnKey(col) {
    if (!col || !col.classList) return null;

    const cls = Array.from(col.classList).find(
      (c) => c.indexOf('iust-col-') === 0 && c !== 'iust-col'
    );
    if (cls) return cls;

    const header = col.querySelector(HEADER_SELECTOR);
    if (header) {
      const text = header.textContent
        .replace(/\(\s*\d+\s*\)/g, '') // strip the "(12)" count
        .replace(/[^\w\s&]/g, '')       // strip emoji / punctuation
        .trim()
        .toLowerCase();
      if (text) return 'hdr:' + text;
    }
    return null;
  }

  function presentKeys(top) {
    return Array.from(top.querySelectorAll(':scope > ' + COL_SELECTOR))
      .map(getColumnKey)
      .filter(Boolean);
  }

  // Merge the saved order with the columns actually present right now: keep the
  // saved sequence for known columns, then append any brand-new columns.
  function reconcileOrder(present) {
    const ordered = savedOrder.filter((k) => present.indexOf(k) !== -1);
    present.forEach((k) => {
      if (ordered.indexOf(k) === -1) ordered.push(k);
    });
    return ordered;
  }

  /* ========================================================================
   * MINIMIZED STATE
   * ====================================================================== */

  function isMinimized(key) {
    return savedMinimized.indexOf(key) !== -1;
  }

  function setMinimized(key, minimized) {
    const idx = savedMinimized.indexOf(key);
    if (minimized && idx === -1) savedMinimized.push(key);
    else if (!minimized && idx !== -1) savedMinimized.splice(idx, 1);
  }

  /* ========================================================================
   * PERSISTENCE (backend + localStorage mirror for instant apply)
   * ====================================================================== */

  function cacheKey() {
    return 'columnControlsState::' + (currentUser || 'default');
  }

  function loadFromCache() {
    try {
      const raw = window.localStorage.getItem(cacheKey());
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        return {
          order: Array.isArray(parsed.order) ? parsed.order : [],
          minimized: Array.isArray(parsed.minimized) ? parsed.minimized : []
        };
      }
    } catch (e) {
      /* ignore corrupt/unavailable cache */
    }
    return null;
  }

  function saveToCache() {
    try {
      window.localStorage.setItem(
        cacheKey(),
        JSON.stringify({ order: savedOrder, minimized: savedMinimized })
      );
    } catch (e) {
      /* localStorage may be unavailable - not fatal */
    }
  }

  async function loadState() {
    currentUser = (typeof API.getCurrentUser === 'function' ? API.getCurrentUser() : '') || '';

    // Apply the cached state immediately so columns don't visibly snap.
    const cached = loadFromCache();
    if (cached) {
      savedOrder = cached.order;
      savedMinimized = cached.minimized;
    }

    try {
      const res = await API.apiCall('/api/column-reorder/state');
      if (res && res.success) {
        if (Array.isArray(res.order)) savedOrder = res.order;
        if (Array.isArray(res.minimized)) savedMinimized = res.minimized;
        saveToCache();
      }
    } catch (e) {
      console.warn('Column Controls: could not load saved state from backend', e);
    }

    scheduleDecorate();
  }

  async function persistState() {
    saveToCache();
    try {
      const res = await API.apiCall('/api/column-reorder/state', {
        method: 'POST',
        body: { order: savedOrder, minimized: savedMinimized }
      });
      if (!res || !res.success) {
        console.warn('Column Controls: backend did not confirm save', res);
      }
    } catch (e) {
      console.warn('Column Controls: could not save state to backend', e);
    }
  }

  /* ========================================================================
   * APPLYING THE LAYOUT (order + minimized)
   * ====================================================================== */

  // Assign a CSS flex `order` to each column so they render left -> right in
  // the reconciled sequence. Using `order` (rather than moving DOM nodes) means
  // the layout feature can rebuild the columns without losing the arrangement.
  function applyOrder(top) {
    const cols = Array.from(top.querySelectorAll(':scope > ' + COL_SELECTOR));
    const present = cols.map(getColumnKey);
    const ordered = reconcileOrder(present);

    cols.forEach((col) => {
      const key = getColumnKey(col);
      const idx = ordered.indexOf(key);
      col.style.order = String(idx === -1 ? 999 : idx);
    });
  }

  // Reflect the minimized set on the columns and keep each toggle button's
  // icon/label in sync.
  function applyMinimized(top) {
    const cols = Array.from(top.querySelectorAll(':scope > ' + COL_SELECTOR));
    cols.forEach((col) => {
      const key = getColumnKey(col);
      const min = isMinimized(key);
      col.classList.toggle('creorder-min', min);
      updateToggleButton(col, min);
    });
  }

  function applyLayout(top) {
    if (!top) return;
    applyOrder(top);
    applyMinimized(top);
  }

  // Move `key` to sit immediately before/after `targetKey` and return the new
  // left-to-right list.
  function moveKey(list, key, targetKey, placeAfter) {
    const arr = list.filter((k) => k !== key);
    const idx = arr.indexOf(targetKey);
    if (idx === -1) {
      arr.push(key);
      return arr;
    }
    arr.splice(idx + (placeAfter ? 1 : 0), 0, key);
    return arr;
  }

  /* ========================================================================
   * MINIMIZE TOGGLE BUTTON
   * ====================================================================== */

  function updateToggleButton(col, min) {
    const btn = col.querySelector(':scope > .creorder-toggle');
    if (!btn) return;
    btn.textContent = min ? '+' : '\u2013'; // "+" to expand, en dash to minimize
    btn.title = min ? 'Expand column' : 'Minimize column';
    btn.setAttribute('aria-label', min ? 'Expand column' : 'Minimize column');
  }

  function ensureToggle(col) {
    let btn = col.querySelector(':scope > .creorder-toggle');
    if (btn) return btn;

    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'creorder-toggle';
    btn.setAttribute('draggable', 'false');

    // A click on the toggle must never start a drag or open the column.
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    btn.addEventListener('dragstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener('click', onToggleClick);

    col.appendChild(btn);
    return btn;
  }

  function onToggleClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const col = e.currentTarget.closest(COL_SELECTOR);
    if (!col) return;
    const key = getColumnKey(col);
    if (!key) return;

    setMinimized(key, !isMinimized(key));

    applyLayout(col.closest(TOP_SELECTOR));
    persistState();
  }

  /* ========================================================================
   * DRAG HANDLERS (reorder)
   * ====================================================================== */

  function clearIndicators(top) {
    top.querySelectorAll('.creorder-drop-before, .creorder-drop-after').forEach((el) => {
      el.classList.remove('creorder-drop-before', 'creorder-drop-after');
    });
  }

  function onDragStart(e) {
    const col = e.currentTarget.closest(COL_SELECTOR);
    if (!col) return;
    dragKey = getColumnKey(col);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // setData is required for drag to start in some browsers (e.g. Firefox).
      try { e.dataTransfer.setData('text/plain', dragKey || ''); } catch (err) { /* ignore */ }
    }
    col.classList.add('creorder-dragging');
  }

  function onDragOver(e) {
    if (!dragKey) return;
    const col = e.currentTarget;
    e.preventDefault(); // allow drop
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    if (getColumnKey(col) === dragKey) {
      col.classList.remove('creorder-drop-before', 'creorder-drop-after');
      return;
    }

    const rect = col.getBoundingClientRect();
    const after = e.clientX - rect.left > rect.width / 2;
    col.classList.toggle('creorder-drop-after', after);
    col.classList.toggle('creorder-drop-before', !after);
  }

  function onDragLeave(e) {
    const col = e.currentTarget;
    // Ignore leaves that just move onto a child of the same column.
    if (e.relatedTarget && col.contains(e.relatedTarget)) return;
    col.classList.remove('creorder-drop-before', 'creorder-drop-after');
  }

  function onDrop(e) {
    const col = e.currentTarget;
    e.preventDefault();

    const targetKey = getColumnKey(col);
    const rect = col.getBoundingClientRect();
    const placeAfter = e.clientX - rect.left > rect.width / 2;

    const top = col.closest(TOP_SELECTOR);
    if (top) clearIndicators(top);

    if (!dragKey || !targetKey || dragKey === targetKey || !top) {
      return;
    }

    const present = presentKeys(top);
    const base = reconcileOrder(present);
    savedOrder = moveKey(base, dragKey, targetKey, placeAfter);

    applyLayout(top);
    persistState();
  }

  function onDragEnd(e) {
    const header = e.currentTarget;
    const col = header.closest(COL_SELECTOR);
    if (col) col.classList.remove('creorder-dragging');
    const top = header.closest(TOP_SELECTOR);
    if (top) clearIndicators(top);
    dragKey = null;
  }

  // Clicking a minimized column's header (its thin strip) expands it. When the
  // column is expanded this is a no-op, so normal headers stay inert.
  function onHeaderClick(e) {
    const col = e.currentTarget.closest(COL_SELECTOR);
    if (!col) return;
    const key = getColumnKey(col);
    if (!key || !isMinimized(key)) return;

    setMinimized(key, false);
    applyLayout(col.closest(TOP_SELECTOR));
    persistState();
  }

  /* ========================================================================
   * DECORATION (wire controls + apply layout on the current columns)
   * ====================================================================== */

  function decorateColumns() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    const top = container.querySelector(TOP_SELECTOR);
    if (!top) return;

    const cols = Array.from(top.querySelectorAll(':scope > ' + COL_SELECTOR));
    if (cols.length < 1) return;

    cols.forEach((col) => {
      // Each column is a drop target for reordering.
      if (!col.__creorderDropWired) {
        col.addEventListener('dragover', onDragOver);
        col.addEventListener('dragleave', onDragLeave);
        col.addEventListener('drop', onDrop);
        col.__creorderDropWired = true;
      }

      // Ensure the minimize/expand toggle button exists on the column.
      ensureToggle(col);

      // The header is the drag handle and the click-to-expand target.
      const header = col.querySelector(HEADER_SELECTOR);
      if (header && !header.__creorderWired) {
        header.setAttribute('draggable', 'true');
        header.classList.add('creorder-handle');
        header.title = 'Drag to reorder this column';
        header.addEventListener('dragstart', onDragStart);
        header.addEventListener('dragend', onDragEnd);
        header.addEventListener('click', onHeaderClick);
        header.__creorderWired = true;
      }
    });

    applyLayout(top);
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try {
        decorateColumns();
      } catch (err) {
        console.error('Column Controls: decorate error', err);
      }
    }, 60);
  }

  /* ========================================================================
   * STYLES
   * ====================================================================== */

  function injectStyles() {
    if (document.getElementById('column-reorder-styles')) return;
    const style = document.createElement('style');
    style.id = 'column-reorder-styles';
    style.textContent = [
      /* --- reorder affordances --- */
      '.creorder-handle { cursor: grab; user-select: none; }',
      '.creorder-handle:active { cursor: grabbing; }',
      '.creorder-handle:hover { background: #e8eaed; }',
      // Grip glyph so users know the header is draggable.
      ".creorder-handle::before { content: '\\283F'; margin-right: 8px; color: #9aa0a6; font-size: 14px; letter-spacing: -1px; }",
      '.iust-col.creorder-dragging { opacity: 0.45; }',
      // Drop indicators (inset shadow avoids shifting the layout).
      '.iust-col.creorder-drop-before { box-shadow: inset 3px 0 0 0 #1a73e8; }',
      '.iust-col.creorder-drop-after { box-shadow: inset -3px 0 0 0 #1a73e8; }',

      /* --- minimize toggle button --- */
      '.iust-col { position: relative; }',
      '.creorder-toggle {',
      '  position: absolute; top: 6px; right: 6px; z-index: 5;',
      '  width: 22px; height: 22px; padding: 0; line-height: 18px;',
      '  border: 1px solid #dadce0; border-radius: 4px;',
      '  background: #fff; color: #5f6368;',
      '  font-size: 15px; font-weight: 700; text-align: center; cursor: pointer;',
      '}',
      '.creorder-toggle:hover { background: #f1f3f4; color: #202124; }',

      /* --- minimized (collapsed) column --- */
      '.iust-col.creorder-min {',
      '  flex: 0 0 auto !important; width: 46px !important; min-width: 46px !important;',
      '}',
      '.iust-col.creorder-min .iust-col-rows,',
      '.iust-col.creorder-min > .iust-empty { display: none !important; }',
      '.iust-col.creorder-min .iust-header {',
      '  writing-mode: vertical-rl;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '  max-height: 320px;',
      '  padding: 34px 10px 14px 10px;', // leave room for the toggle button at the top
      '  cursor: pointer;',
      '  border-bottom: none;',
      '}',
      // Hide the horizontal drag grip while collapsed (it looks odd rotated).
      '.iust-col.creorder-min .creorder-handle::before { content: none; }',
      '.iust-col.creorder-min .creorder-toggle { right: 12px; }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  /* ========================================================================
   * WATCHERS
   * ====================================================================== */

  function watch() {
    const container = document.getElementById(CONTAINER_ID);
    if (container && typeof MutationObserver === 'function') {
      const observer = new MutationObserver(() => scheduleDecorate());
      observer.observe(container, { childList: true, subtree: true });
    }

    // Backstop: re-apply periodically and pick up user switches (no reliable
    // 'userChanged' event is emitted by the app).
    setInterval(() => {
      const u = (typeof API.getCurrentUser === 'function' ? API.getCurrentUser() : '') || '';
      if (u !== currentUser) {
        loadState(); // updates currentUser and re-applies
        return;
      }
      try {
        decorateColumns();
      } catch (err) {
        console.error('Column Controls: interval decorate error', err);
      }
    }, 1200);
  }

  /* ========================================================================
   * INIT
   * ====================================================================== */

  async function initialize() {
    try {
      injectStyles();
      await loadState();
      watch();
      scheduleDecorate();
      console.log('Column Controls: Frontend initialized successfully');
    } catch (err) {
      console.error('Column Controls: Initialization failed', err);
    }
  }

  initialize();

  console.log('Column Controls: Frontend loaded successfully');
})();
