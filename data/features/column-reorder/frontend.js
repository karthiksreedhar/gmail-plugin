/**
 * Drag-and-Drop Column Reorder Frontend
 *
 * Makes the inbox layout columns reorderable: grab a column by its header and
 * drop it to the left/right of another column to change the left-to-right
 * order. The order is applied with CSS flex `order` (so it survives the
 * layout's frequent re-renders) and is persisted per user via the backend.
 *
 * Target layout: the multi-column inbox produced by the layout feature, i.e.
 * a `.iust-top` flex row inside `#emailContainer` whose direct `.iust-col`
 * children (Important & Unread / Starred / Drafts) are the columns. Each
 * column carries a stable class such as `iust-col-primary` used as its key.
 */

(function () {
  'use strict';

  console.log('Column Reorder: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Column Reorder: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // ---- Configuration -------------------------------------------------------
  const CONTAINER_ID = 'emailContainer';   // the approved-list container
  const TOP_SELECTOR = '.iust-top';         // the flex row that holds the columns
  const COL_SELECTOR = '.iust-col';         // each reorderable column
  const HEADER_SELECTOR = '.iust-header';   // used as the drag handle

  // ---- State ---------------------------------------------------------------
  let savedOrder = [];   // canonical list of column keys, left -> right
  let currentUser = '';  // used for per-user persistence / cache
  let dragKey = null;    // key of the column currently being dragged
  let scheduled = false; // debounce flag for decorateColumns()

  /* ========================================================================
   * COLUMN KEYS
   * ====================================================================== */

  // Derive a stable key for a column so its position can be remembered across
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
   * PERSISTENCE (backend + localStorage mirror for instant apply)
   * ====================================================================== */

  function cacheKey() {
    return 'columnReorderOrder::' + (currentUser || 'default');
  }

  function loadFromCache() {
    try {
      const raw = window.localStorage.getItem(cacheKey());
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function saveToCache() {
    try {
      window.localStorage.setItem(cacheKey(), JSON.stringify(savedOrder));
    } catch (e) {
      /* localStorage may be unavailable - not fatal */
    }
  }

  async function loadOrder() {
    currentUser = (typeof API.getCurrentUser === 'function' ? API.getCurrentUser() : '') || '';

    // Apply the cached order immediately so columns don't visibly snap.
    const cached = loadFromCache();
    if (cached && cached.length) savedOrder = cached;

    try {
      const res = await API.apiCall('/api/column-reorder/order');
      if (res && res.success && Array.isArray(res.order) && res.order.length) {
        savedOrder = res.order;
        saveToCache();
      }
    } catch (e) {
      console.warn('Column Reorder: could not load saved order from backend', e);
    }

    scheduleDecorate();
  }

  async function persistOrder() {
    saveToCache();
    try {
      const res = await API.apiCall('/api/column-reorder/order', {
        method: 'POST',
        body: { order: savedOrder }
      });
      if (!res || !res.success) {
        console.warn('Column Reorder: backend did not confirm save', res);
      }
    } catch (e) {
      console.warn('Column Reorder: could not save order to backend', e);
    }
  }

  /* ========================================================================
   * APPLYING THE ORDER
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
   * DRAG HANDLERS
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

    applyOrder(top);
    persistOrder();
  }

  function onDragEnd(e) {
    const header = e.currentTarget;
    const col = header.closest(COL_SELECTOR);
    if (col) col.classList.remove('creorder-dragging');
    const top = header.closest(TOP_SELECTOR);
    if (top) clearIndicators(top);
    dragKey = null;
  }

  /* ========================================================================
   * DECORATION (wire drag handlers + apply order on the current columns)
   * ====================================================================== */

  function decorateColumns() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    const top = container.querySelector(TOP_SELECTOR);
    if (!top) return;

    const cols = Array.from(top.querySelectorAll(':scope > ' + COL_SELECTOR));
    if (cols.length < 2) return; // nothing meaningful to reorder

    applyOrder(top);

    cols.forEach((col) => {
      // Each column is a drop target.
      if (!col.__creorderDropWired) {
        col.addEventListener('dragover', onDragOver);
        col.addEventListener('dragleave', onDragLeave);
        col.addEventListener('drop', onDrop);
        col.__creorderDropWired = true;
      }

      // The header is the drag handle.
      const header = col.querySelector(HEADER_SELECTOR);
      if (header && !header.__creorderWired) {
        header.setAttribute('draggable', 'true');
        header.classList.add('creorder-handle');
        header.title = 'Drag to reorder this column';
        header.addEventListener('dragstart', onDragStart);
        header.addEventListener('dragend', onDragEnd);
        header.__creorderWired = true;
      }
    });
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try {
        decorateColumns();
      } catch (err) {
        console.error('Column Reorder: decorate error', err);
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
      '.creorder-handle { cursor: grab; user-select: none; }',
      '.creorder-handle:active { cursor: grabbing; }',
      '.creorder-handle:hover { background: #e8eaed; }',
      // Grip affordance so users know the header is draggable.
      ".creorder-handle::before { content: '\\283F'; margin-right: 8px; color: #9aa0a6; font-size: 14px; letter-spacing: -1px; }",
      '.iust-col.creorder-dragging { opacity: 0.45; }',
      // Drop indicators (inset shadow avoids shifting the layout).
      '.iust-col.creorder-drop-before { box-shadow: inset 3px 0 0 0 #1a73e8; }',
      '.iust-col.creorder-drop-after { box-shadow: inset -3px 0 0 0 #1a73e8; }'
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
        loadOrder(); // updates currentUser and re-applies
        return;
      }
      try {
        decorateColumns();
      } catch (err) {
        console.error('Column Reorder: interval decorate error', err);
      }
    }, 1200);
  }

  /* ========================================================================
   * INIT
   * ====================================================================== */

  async function initialize() {
    try {
      injectStyles();
      await loadOrder();
      watch();
      scheduleDecorate();
      console.log('Column Reorder: Frontend initialized successfully');
    } catch (err) {
      console.error('Column Reorder: Initialization failed', err);
    }
  }

  initialize();

  console.log('Column Reorder: Frontend loaded successfully');
})();
