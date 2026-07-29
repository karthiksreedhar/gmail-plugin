/**
 * Important / Starred Two-Column Layout - Frontend
 *
 * Re-arranges the approved email list into a two-column layout:
 *   - LEFT  column : the "Important" section
 *   - RIGHT column : the "Starred" section
 *   - BELOW (single full-width column): the "Everything else" section
 *
 * This is a pure client-side / layout feature. It does NOT fetch, change,
 * delete or re-classify any data. The app already splits the approved list
 * into native "Important", "Starred" and "Everything else" sections (based on
 * each email's isImportant / isStarred flags) and renders them stacked in
 * #emailContainer as:
 *
 *     <header>                                (Important header + collapse toggle)
 *     <div id="inbox-section-rows-important"> (the Important email cards)
 *     <header>                                (Starred header + collapse toggle)
 *     <div id="inbox-section-rows-starred">   (the Starred email cards)
 *     <header>                                (Everything else header + toggle)
 *     <div id="inbox-section-rows-other">     (the remaining email cards)
 *
 * This feature MOVES those exact nodes (never clones them) into a two-column
 * wrapper, so the collapse toggles, delete buttons and "open thread" click
 * handlers all keep working untouched.
 *
 * A header toggle button turns the layout on/off; the choice is remembered in
 * localStorage. Because the app re-renders the list on approvals, filter
 * changes and refreshes (and does NOT emit an "emailsLoaded" event), the
 * feature stays in sync by wrapping displayEmails() and running a lightweight
 * periodic check.
 */

(function () {
  'use strict';

  console.log('Important / Starred Two-Column Layout: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Important / Starred Two-Column Layout: EmailAssistant API not available');
    return;
  }

  // Guard against the feature script being loaded more than once.
  if (window.__importantStarredTwoColInitialized) {
    console.log('Important / Starred Two-Column Layout: already initialized, skipping');
    return;
  }
  window.__importantStarredTwoColInitialized = true;

  const API = window.EmailAssistant;

  /* ============================================================
   * CONFIGURATION / CONSTANTS
   * ============================================================ */
  const CONTAINER_ID = 'emailContainer';           // the approved-list container
  const SECTION_KEYS = ['important', 'starred', 'other']; // native section keys
  const ROWS_ID = key => 'inbox-section-rows-' + key;     // native rows wrapper ids

  const STORAGE_KEY = 'importantStarredTwoColEnabled';
  const REFRESH_MS = 800;   // background re-check interval

  const LEFT_LABEL = '\u2757 Important';   // ❗ Important
  const RIGHT_LABEL = '\u2B50 Starred';    // ⭐ Starred

  /* ============================================================
   * STATE
   * ============================================================ */
  let enabled = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) enabled = saved === 'true';
  } catch (e) { /* localStorage may be unavailable */ }

  let isBusy = false;  // reentrancy guard while manipulating the DOM

  /* ============================================================
   * STYLES
   * ============================================================ */
  function injectStyles() {
    if (document.getElementById('important-starred-two-col-styles')) return;
    const style = document.createElement('style');
    style.id = 'important-starred-two-col-styles';
    style.textContent = `
      .tcv-wrapper { width: 100%; box-sizing: border-box; }

      .tcv-top {
        display: flex;
        gap: 16px;
        align-items: flex-start;
      }

      .tcv-col {
        flex: 1 1 0;
        min-width: 0;               /* allow flex items to shrink */
        display: flex;
        flex-direction: column;
      }

      /* Subtle accent so the two columns read as distinct at a glance. */
      .tcv-col-important { border-top: 3px solid #f4b400; }
      .tcv-col-starred   { border-top: 3px solid #4285f4; }

      /* Cards inside the columns fill the column width. */
      .tcv-col .email-item {
        width: 100%;
        box-sizing: border-box;
      }

      /* Placeholder header shown when a column's section has no emails,
         styled to match the app's native section headers. */
      .tcv-placeholder-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        margin-top: 4px;
        background: #f1f3f4;
        border-bottom: 1px solid #e0e0e0;
        font-size: 13px;
        font-weight: 600;
        color: #5f6368;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .tcv-placeholder-header .tcv-count {
        font-weight: 400;
        text-transform: none;
        color: #9aa0a6;
      }

      .tcv-empty {
        color: #9aa0a6;
        font-size: 13px;
        font-style: italic;
        padding: 12px 16px;
      }

      /* Stack the two top columns on narrow screens. */
      @media (max-width: 768px) {
        .tcv-top { flex-direction: column; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ============================================================
   * HELPERS
   * ============================================================ */

  function getContainer() {
    return document.getElementById(CONTAINER_ID);
  }

  // Locate a native section (its rows wrapper + the header that precedes it).
  // Returns null if that section wasn't rendered (i.e. it had no emails).
  function getSection(container, key) {
    const rows = container.querySelector('#' + ROWS_ID(key));
    if (!rows) return null;
    const prev = rows.previousElementSibling;
    const header = (prev && prev !== rows) ? prev : null;
    return { header, rows };
  }

  // Build a placeholder header + empty note for a missing column section.
  function fillPlaceholder(col, label) {
    const ph = document.createElement('div');
    ph.className = 'tcv-placeholder-header';
    ph.innerHTML = '<span>' + label + ' <span class="tcv-count">(0)</span></span>';
    const note = document.createElement('div');
    note.className = 'tcv-empty';
    note.textContent = 'No emails here';
    col.appendChild(ph);
    col.appendChild(note);
  }

  // Move a real section (header + rows) into a column, or fall back to a
  // placeholder so the two-column shape stays stable.
  function fillColumn(col, section, label) {
    if (section) {
      if (section.header) col.appendChild(section.header);
      col.appendChild(section.rows);
    } else {
      fillPlaceholder(col, label);
    }
  }

  /* ============================================================
   * CORE: build / refresh the two-column layout
   * ============================================================ */
  function rebuild(container) {
    const imp = getSection(container, 'important');
    const star = getSection(container, 'starred');
    const other = getSection(container, 'other');

    // If neither Important nor Starred exists, the app rendered a flat single
    // list (only "everything else", or nothing). Leave it as-is.
    if (!imp && !star) return;

    isBusy = true;
    try {
      const wrapper = document.createElement('div');
      wrapper.className = 'tcv-wrapper';

      const top = document.createElement('div');
      top.className = 'tcv-top';

      const leftCol = document.createElement('div');
      leftCol.className = 'tcv-col tcv-col-important';
      const rightCol = document.createElement('div');
      rightCol.className = 'tcv-col tcv-col-starred';

      fillColumn(leftCol, imp, LEFT_LABEL);
      fillColumn(rightCol, star, RIGHT_LABEL);

      top.appendChild(leftCol);
      top.appendChild(rightCol);
      wrapper.appendChild(top);

      // "Everything else" spans full width below the two columns.
      if (other) {
        if (other.header) wrapper.appendChild(other.header);
        wrapper.appendChild(other.rows);
      }

      container.appendChild(wrapper);

      console.log(
        'Important / Starred Two-Column Layout: laid out columns ' +
        '(Important: ' + (imp ? 'yes' : 'empty') +
        ', Starred: ' + (star ? 'yes' : 'empty') +
        ', Everything else: ' + (other ? 'yes' : 'none') + ')'
      );
    } catch (err) {
      console.error('Important / Starred Two-Column Layout: rebuild error', err);
    } finally {
      isBusy = false;
    }
  }

  // Entry point: arrange freshly rendered native sections into two columns.
  function reorganize() {
    if (!enabled || isBusy) return;

    const container = getContainer();
    if (!container) return;

    // Native section rows that are NOT already inside our wrapper are "loose"
    // (i.e. freshly rendered by the app and awaiting placement).
    const loose = SECTION_KEYS
      .map(k => container.querySelector('#' + ROWS_ID(k)))
      .some(el => el && !el.closest('.tcv-wrapper'));

    if (!loose) return; // already arranged, or nothing to arrange

    // Defensive: drop any stale wrapper before rebuilding from loose sections.
    const stale = container.querySelector('.tcv-wrapper');
    if (stale && stale.querySelector('.email-item') === null) stale.remove();

    rebuild(container);
  }

  // Undo the layout: return the real section nodes to the container in the
  // app's original order (Important, Starred, Everything else), then remove
  // the wrapper (which also discards any placeholder columns).
  function restore() {
    const container = getContainer();
    if (!container) return;
    const wrapper = container.querySelector('.tcv-wrapper');
    if (!wrapper) return;

    isBusy = true;
    try {
      SECTION_KEYS.forEach(key => {
        const rows = wrapper.querySelector('#' + ROWS_ID(key));
        if (!rows) return;
        const prev = rows.previousElementSibling;
        if (prev && prev !== rows && !prev.classList.contains('tcv-placeholder-header')) {
          container.appendChild(prev);
        }
        container.appendChild(rows);
      });
      wrapper.remove();
    } catch (err) {
      console.error('Important / Starred Two-Column Layout: restore error', err);
    } finally {
      isBusy = false;
    }
  }

  /* ============================================================
   * HEADER TOGGLE BUTTON
   * ============================================================ */
  function buttonLabel() {
    return enabled ? '\u25A9 2-Column: On' : '\u2630 2-Column: Off';
  }

  function updateButtonLabel() {
    const btn = document.querySelector('.tcv-toggle-btn');
    if (btn) btn.textContent = buttonLabel();
  }

  function addToggleButton() {
    if (typeof API.addHeaderButton !== 'function') return;
    API.addHeaderButton(buttonLabel(), () => setEnabled(!enabled), {
      className: 'btn btn-primary tcv-toggle-btn',
      style: { marginRight: '12px' }
    });
  }

  function setEnabled(value) {
    enabled = value;
    try { window.localStorage.setItem(STORAGE_KEY, String(value)); } catch (e) {}

    if (enabled) {
      reorganize();
      if (typeof API.showSuccess === 'function') API.showSuccess('Two-column layout enabled');
    } else {
      restore();
      if (typeof API.showSuccess === 'function') API.showSuccess('Two-column layout disabled');
    }
    updateButtonLabel();
  }

  /* ============================================================
   * SYNC HOOKS
   * ============================================================ */
  function scheduleReorganize(delay) {
    if (!enabled) return;
    setTimeout(reorganize, delay || 50);
  }

  // Wrap the app's displayEmails() so we re-flow immediately after each render.
  function hookDisplayEmails() {
    if (typeof window.displayEmails !== 'function') return;
    if (window.displayEmails.__tcvHooked) return;

    const original = window.displayEmails;
    window.displayEmails = function (...args) {
      const result = original.apply(this, args);
      if (result && typeof result.then === 'function') {
        result.then(() => scheduleReorganize(50)).catch(() => {});
      } else {
        scheduleReorganize(50);
      }
      return result;
    };
    window.displayEmails.__tcvHooked = true;
    console.log('Important / Starred Two-Column Layout: hooked displayEmails()');
  }

  /* ============================================================
   * INITIALIZATION
   * ============================================================ */
  function initialize() {
    injectStyles();
    addToggleButton();

    // Hook now, and again shortly after in case displayEmails isn't defined yet.
    hookDisplayEmails();
    setTimeout(hookDisplayEmails, 500);

    // featureLoaded is the only event this app actually emits.
    if (typeof API.on === 'function') {
      API.on('featureLoaded', () => scheduleReorganize(80));
    }

    // Periodic safety net (the app does not fire an "emailsLoaded" event, and
    // the list is re-rendered on approvals, filter changes and refreshes).
    setInterval(() => { if (enabled) reorganize(); }, REFRESH_MS);

    // First pass shortly after load (emails may already be on screen).
    scheduleReorganize(200);

    updateButtonLabel();
    console.log('Important / Starred Two-Column Layout: Frontend initialized (enabled=' + enabled + ')');
  }

  initialize();

  console.log('Important / Starred Two-Column Layout: Frontend loaded successfully');
})();
