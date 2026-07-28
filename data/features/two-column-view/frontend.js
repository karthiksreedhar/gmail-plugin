/**
 * Two-Column Email View - Frontend
 *
 * Re-arranges the approved email list into a two-column layout:
 *   - LEFT  column  : emails whose category matches "Important"
 *   - RIGHT column  : emails whose category matches "Starred"
 *   - BELOW (single full-width column): "everything else"
 *
 * This is a pure client-side / layout feature. It does NOT change any data,
 * it only re-positions the existing `.email-item` cards in the DOM. It keeps
 * itself in sync as the app re-renders the list (approvals, filter changes,
 * refresh, user switch) via an event hook, a displayEmails override and a
 * lightweight periodic check.
 *
 * A header toggle button lets the user turn the layout on/off. The choice is
 * remembered in localStorage.
 */

(function () {
  'use strict';

  console.log('Two-Column Email View: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Two-Column Email View: EmailAssistant API not available');
    return;
  }

  // Prevent double-initialization if the feature script is loaded twice.
  if (window.__twoColumnEmailViewInitialized) {
    console.log('Two-Column Email View: already initialized, skipping');
    return;
  }
  window.__twoColumnEmailViewInitialized = true;

  const API = window.EmailAssistant;

  /* ============================================================
   * CONFIGURATION
   *
   * Category names are matched case-insensitively as SUBSTRINGS of an
   * email's category pill text. Edit these arrays if your categories use
   * different names (e.g. add 'high priority' to LEFT_KEYWORDS).
   * ============================================================ */
  const LEFT_KEYWORDS = ['important'];          // -> left-hand column
  const RIGHT_KEYWORDS = ['starred', 'star'];   // -> right-hand column

  const LEFT_TITLE = '\u2757 Important';        // ❗ Important
  const RIGHT_TITLE = '\u2B50 Starred';         // ⭐ Starred
  const REST_TITLE = '\uD83D\uDCE5 Everything else'; // 📥 Everything else
  const EMPTY_TEXT = 'No emails here';

  const STORAGE_KEY = 'twoColumnEmailViewEnabled';
  const REFRESH_MS = 800;   // background re-check interval

  /* ============================================================
   * STATE
   * ============================================================ */
  let enabled = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) enabled = saved === 'true';
  } catch (e) { /* localStorage may be unavailable */ }

  let listContainerRef = null;   // the element that holds the approved email cards
  let lastOrder = [];            // email-item elements in original render order (for restore)
  let isBusy = false;            // reentrancy guard while we manipulate the DOM

  /* ============================================================
   * STYLES
   * ============================================================ */
  function injectStyles() {
    if (document.getElementById('two-col-styles')) return;
    const style = document.createElement('style');
    style.id = 'two-col-styles';
    style.textContent = `
      .two-col-wrapper { width: 100%; box-sizing: border-box; }

      .two-col-top {
        display: flex;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 18px;
      }

      .two-col-column {
        flex: 1 1 0;
        min-width: 0;               /* allow flex items to shrink */
        display: flex;
        flex-direction: column;
      }

      .two-col-col-header,
      .two-col-rest-header {
        font-size: 14px;
        font-weight: 700;
        padding: 8px 12px;
        border-radius: 6px;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 6px;
        letter-spacing: .2px;
      }

      .two-col-col-important .two-col-col-header {
        background: #fff3cd;
        color: #7a5b00;
        border-left: 4px solid #ffc107;
      }

      .two-col-col-starred .two-col-col-header {
        background: #e7f1ff;
        color: #084298;
        border-left: 4px solid #0d6efd;
      }

      .two-col-rest-header {
        background: #f1f3f5;
        color: #495057;
        border-left: 4px solid #adb5bd;
      }

      .two-col-col-body,
      .two-col-rest {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      /* Cards inside the columns should fill their column width */
      .two-col-column .email-item,
      .two-col-rest .email-item {
        width: 100%;
        box-sizing: border-box;
        margin: 0;                  /* spacing handled by the flex gap */
      }

      .two-col-empty {
        color: #adb5bd;
        font-size: 13px;
        font-style: italic;
        padding: 12px;
        border: 1px dashed #dee2e6;
        border-radius: 6px;
        text-align: center;
      }

      /* Stack the two top columns on narrow screens */
      @media (max-width: 768px) {
        .two-col-top { flex-direction: column; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ============================================================
   * HELPERS
   * ============================================================ */

  // Read an email card's category pill labels (lower-cased).
  function getCategories(item) {
    return Array.from(item.querySelectorAll('.email-category'))
      .map(pill => (pill.textContent || '').trim().toLowerCase())
      .filter(Boolean);
  }

  function matchesAny(categories, keywords) {
    return categories.some(cat => keywords.some(kw => cat.includes(kw)));
  }

  // Decide which column an email belongs to. Important takes priority over
  // Starred when an email happens to carry both.
  function classify(item) {
    const cats = getCategories(item);
    if (matchesAny(cats, LEFT_KEYWORDS)) return 'left';
    if (matchesAny(cats, RIGHT_KEYWORDS)) return 'right';
    return 'rest';
  }

  // Heuristic: does this card live inside the "new / pending approval" area?
  // Used only to avoid choosing that area as the main list container.
  function looksLikePending(item) {
    let el = item;
    for (let depth = 0; depth < 5 && el; depth++) {
      const cls = (el.className && el.className.toString ? el.className.toString() : '');
      const id = el.id || '';
      const tokens = (cls + ' ' + id).toLowerCase().split(/[\s_-]+/);
      if (tokens.some(t => ['new', 'pending', 'unapproved', 'approval', 'approve'].includes(t))) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  // Email cards that are NOT already inside our layout wrapper (i.e. freshly
  // rendered by the app and awaiting placement).
  function looseItemsIn(container) {
    return Array.from(container.querySelectorAll('.email-item'))
      .filter(it => !it.closest('.two-col-wrapper'));
  }

  // Find the container that holds the approved email list. Chooses the parent
  // with the most non-pending cards.
  function findListContainer() {
    const items = Array.from(document.querySelectorAll('.email-item'))
      .filter(it => document.contains(it) && !it.closest('.two-col-wrapper'));

    if (!items.length) {
      const existing = document.querySelector('.two-col-wrapper');
      return existing ? existing.parentElement : null;
    }

    const groups = new Map();
    items.forEach(it => {
      const parent = it.parentElement;
      if (!parent) return;
      if (!groups.has(parent)) groups.set(parent, { count: 0, pending: 0 });
      const g = groups.get(parent);
      g.count++;
      if (looksLikePending(it)) g.pending++;
    });

    let best = null;
    let bestScore = -Infinity;
    groups.forEach((g, parent) => {
      // heavily prefer containers made of non-pending cards
      const score = (g.count - g.pending) * 1000 - g.pending;
      if (score > bestScore) {
        bestScore = score;
        best = parent;
      }
    });
    return best;
  }

  function makeColumn(extraClass, title) {
    const col = document.createElement('div');
    col.className = 'two-col-column ' + extraClass;

    const header = document.createElement('div');
    header.className = 'two-col-col-header';
    header.textContent = title;

    const body = document.createElement('div');
    body.className = 'two-col-col-body';

    col.appendChild(header);
    col.appendChild(body);
    return { col, header, body };
  }

  function emptyNote() {
    const note = document.createElement('div');
    note.className = 'two-col-empty';
    note.textContent = EMPTY_TEXT;
    return note;
  }

  /* ============================================================
   * CORE: build / refresh the two-column layout
   * ============================================================ */
  function rebuild(looseItems, oldWrapper) {
    if (!listContainerRef) return;

    const scopeItems = looseItems.slice();
    if (!scopeItems.length) return;

    isBusy = true;
    try {
      // Remember the app's original render order so we can restore it later.
      lastOrder = scopeItems.slice();

      const wrapper = document.createElement('div');
      wrapper.className = 'two-col-wrapper';

      const top = document.createElement('div');
      top.className = 'two-col-top';

      const left = makeColumn('two-col-col-important', LEFT_TITLE);
      const right = makeColumn('two-col-col-starred', RIGHT_TITLE);
      top.appendChild(left.col);
      top.appendChild(right.col);

      const restWrap = document.createElement('div');
      restWrap.className = 'two-col-rest-wrap';
      const restHeader = document.createElement('div');
      restHeader.className = 'two-col-rest-header';
      const restBody = document.createElement('div');
      restBody.className = 'two-col-rest';
      restWrap.appendChild(restHeader);
      restWrap.appendChild(restBody);

      let nLeft = 0, nRight = 0, nRest = 0;
      scopeItems.forEach(item => {
        const kind = classify(item);
        if (kind === 'left') { left.body.appendChild(item); nLeft++; }
        else if (kind === 'right') { right.body.appendChild(item); nRight++; }
        else { restBody.appendChild(item); nRest++; }
      });

      if (nLeft === 0) left.body.appendChild(emptyNote());
      if (nRight === 0) right.body.appendChild(emptyNote());

      left.header.textContent = LEFT_TITLE + ' (' + nLeft + ')';
      right.header.textContent = RIGHT_TITLE + ' (' + nRight + ')';
      restHeader.textContent = REST_TITLE + ' (' + nRest + ')';

      wrapper.appendChild(top);
      wrapper.appendChild(restWrap);

      // Discard any stale wrapper from a previous render, then attach the new one.
      if (oldWrapper && oldWrapper.parentElement) oldWrapper.remove();
      listContainerRef.appendChild(wrapper);

      console.log(
        'Two-Column Email View: laid out ' + scopeItems.length +
        ' emails (Important: ' + nLeft + ', Starred: ' + nRight + ', Other: ' + nRest + ')'
      );
    } catch (err) {
      console.error('Two-Column Email View: rebuild error', err);
    } finally {
      isBusy = false;
    }
  }

  // Entry point: place freshly rendered cards into the two-column layout.
  function reorganize() {
    if (!enabled || isBusy) return;

    if (!document.querySelector('.email-item')) return; // no list on screen

    if (!listContainerRef || !document.contains(listContainerRef)) {
      listContainerRef = findListContainer();
    }
    if (!listContainerRef) return;

    const wrapper = listContainerRef.querySelector('.two-col-wrapper');
    const loose = looseItemsIn(listContainerRef);

    // Nothing new to place -> already organized (or empty).
    if (loose.length === 0) return;

    rebuild(loose, wrapper);
  }

  // Undo the layout, returning cards to the container in their original order.
  function restore() {
    isBusy = true;
    try {
      if (!listContainerRef || !document.contains(listContainerRef)) {
        const w = document.querySelector('.two-col-wrapper');
        if (w) listContainerRef = w.parentElement;
      }
      if (!listContainerRef) return;

      const wrapper = listContainerRef.querySelector('.two-col-wrapper');
      if (!wrapper) return;

      const order = (lastOrder && lastOrder.length)
        ? lastOrder.filter(it => wrapper.contains(it))
        : Array.from(wrapper.querySelectorAll('.email-item'));

      order.forEach(it => listContainerRef.appendChild(it));
      wrapper.remove();
    } catch (err) {
      console.error('Two-Column Email View: restore error', err);
    } finally {
      isBusy = false;
    }
  }

  /* ============================================================
   * HEADER TOGGLE BUTTON
   * ============================================================ */
  function buttonLabel() {
    return enabled ? '\u268F 2-Column: On' : '\u2630 2-Column: Off';
  }

  function updateButtonLabel() {
    const btn = document.querySelector('.two-col-toggle-btn');
    if (btn) btn.textContent = buttonLabel();
  }

  function addToggleButton() {
    if (typeof API.addHeaderButton !== 'function') return;
    API.addHeaderButton(buttonLabel(), () => setEnabled(!enabled), {
      className: 'btn btn-primary two-col-toggle-btn',
      style: { marginRight: '12px' }
    });
  }

  function setEnabled(value) {
    enabled = value;
    try { window.localStorage.setItem(STORAGE_KEY, String(value)); } catch (e) {}

    if (enabled) {
      reorganize();
      if (typeof API.showSuccess === 'function') API.showSuccess('Two-column view enabled');
    } else {
      restore();
      if (typeof API.showWarning === 'function') API.showWarning('Two-column view disabled');
    }
    updateButtonLabel();
  }

  /* ============================================================
   * INITIALIZATION
   * ============================================================ */
  function scheduleReorganize(delay) {
    if (!enabled) return;
    setTimeout(reorganize, delay || 50);
  }

  function initialize() {
    injectStyles();
    addToggleButton();

    // React to the app's data/UI lifecycle events.
    if (typeof API.on === 'function') {
      API.on('emailsLoaded', () => scheduleReorganize(50));
      API.on('filterChanged', () => scheduleReorganize(60));
      API.on('featureLoaded', () => scheduleReorganize(60));
      API.on('userChanged', () => { listContainerRef = null; lastOrder = []; scheduleReorganize(120); });
    }

    // Hook the app's displayEmails() if present so we re-flow right after render.
    if (typeof window.displayEmails === 'function' && !window.displayEmails.__twoColHooked) {
      const original = window.displayEmails;
      window.displayEmails = function (...args) {
        const result = original.apply(this, args);
        if (result && typeof result.then === 'function') {
          result.then(() => scheduleReorganize(50));
        } else {
          scheduleReorganize(50);
        }
        return result;
      };
      window.displayEmails.__twoColHooked = true;
    }

    // Periodic safety net for dynamically rendered content.
    setInterval(() => { if (enabled) reorganize(); }, REFRESH_MS);

    // First pass shortly after load (emails may already be present).
    scheduleReorganize(200);

    updateButtonLabel();
    console.log('Two-Column Email View: Frontend initialized successfully (enabled=' + enabled + ')');
  }

  initialize();

  console.log('Two-Column Email View: Frontend loaded successfully');
})();
