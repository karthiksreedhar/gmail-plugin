/**
 * Important + Unread / Starred Two-Column Layout - Frontend
 *
 * Replaces the single stacked email list on the main page with a two-column
 * layout:
 *
 *   - LEFT  column : "Important & Unread"  -> emails that are important OR unread
 *   - RIGHT column : "Starred"             -> all starred emails
 *   - BELOW (full width) : "Everything else" -> the remaining read /
 *                          non-important / non-starred emails, so nothing is
 *                          ever hidden.
 *
 * How the grouping is decided (per email, mutually exclusive so no card is
 * duplicated):
 *   1. If the email is Starred            -> RIGHT column ("all the starred stuff").
 *   2. Else if it is Important OR Unread  -> LEFT column.
 *   3. Else                               -> "Everything else" section below.
 *
 * This is a pure client-side layout feature. It does NOT fetch, change, delete
 * or re-classify any data. It reads each email's isImportant / isStarred /
 * isUnread flags from window.EmailAssistant.getEmails() and MOVES the exact row
 * nodes the app already rendered (never clones them), so the open-thread click
 * handler, delete buttons, notes previews and the recently-added highlight all
 * keep working untouched.
 *
 * Because only the currently rendered rows are re-arranged, the layout always
 * respects the active category filter / search results.
 *
 * A header toggle button turns the layout on/off; the choice is remembered in
 * localStorage. The app re-renders the list on approvals, filter changes and
 * refreshes (and does NOT emit an "emailsLoaded" event), so the feature stays
 * in sync by wrapping displayEmails() and running a lightweight periodic check.
 */

(function () {
  'use strict';

  console.log('Important+Unread / Starred Two-Column Layout: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Important+Unread / Starred Two-Column Layout: EmailAssistant API not available');
    return;
  }

  // Guard against the feature script being loaded more than once.
  if (window.__importantUnreadStarredTwoColInitialized) {
    console.log('Important+Unread / Starred Two-Column Layout: already initialized, skipping');
    return;
  }
  window.__importantUnreadStarredTwoColInitialized = true;

  const API = window.EmailAssistant;

  /* ============================================================
   * CONFIGURATION / CONSTANTS
   * ============================================================ */
  const CONTAINER_ID = 'emailContainer';   // the approved-list container
  const WRAPPER_CLASS = 'iust-wrapper';     // our injected layout wrapper
  const STORAGE_KEY = 'importantUnreadStarredTwoColEnabled';
  const REFRESH_MS = 800;                   // background re-check interval

  const LEFT_LABEL = '\u2757 Important & Unread'; // ❗ Important & Unread
  const RIGHT_LABEL = '\u2B50 Starred';           // ⭐ Starred
  const OTHER_LABEL = 'Everything else';

  /* ============================================================
   * STATE
   * ============================================================ */
  let enabled = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) enabled = saved === 'true';
  } catch (e) { /* localStorage may be unavailable */ }

  let isBusy = false; // reentrancy guard while manipulating the DOM

  /* ============================================================
   * STYLES
   * ============================================================ */
  function injectStyles() {
    if (document.getElementById('important-unread-starred-two-col-styles')) return;
    const style = document.createElement('style');
    style.id = 'important-unread-starred-two-col-styles';
    style.textContent = `
      .iust-wrapper { width: 100%; box-sizing: border-box; }

      .iust-top {
        display: flex;
        gap: 16px;
        align-items: flex-start;
      }

      .iust-col {
        flex: 1 1 0;
        min-width: 0;               /* allow flex items to shrink */
        display: flex;
        flex-direction: column;
      }

      /* Subtle accent so the two columns read as distinct at a glance. */
      .iust-col-primary { border-top: 3px solid #f4b400; }
      .iust-col-starred { border-top: 3px solid #4285f4; }

      /* Section headers, styled to match the app's native inbox section headers. */
      .iust-header {
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
      .iust-header .iust-count {
        font-weight: 400;
        text-transform: none;
        color: #9aa0a6;
      }

      .iust-empty {
        color: #9aa0a6;
        font-size: 13px;
        font-style: italic;
        padding: 12px 16px;
      }

      /* Cards inside the columns fill the column width and never spill out.
         The app's default card styles are tuned for a full-width list where
         .email-from is set to not shrink, so in a narrow column long sender
         names / category pills / subjects can push the row wider than the
         column and bleed into the gap and the other column. These overrides let
         each part shrink and clip (with an ellipsis) so everything stays inside
         the column. */
      .iust-col .email-item {
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        overflow: hidden;
      }
      .iust-col .email-content { min-width: 0; overflow: hidden; }
      .iust-col .email-header { min-width: 0; overflow: hidden; }
      .iust-col .email-from {
        min-width: 0;
        flex-shrink: 1;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .iust-col .email-from .email-categories {
        min-width: 0;
        overflow: hidden;
        flex-wrap: nowrap;
      }
      .iust-col .email-subject {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .iust-col .email-date {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Stack the two top columns on narrow screens. */
      @media (max-width: 768px) {
        .iust-top { flex-direction: column; }
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

  // Build an id -> email lookup from the app's full email list. Each email
  // carries the isImportant / isStarred / isUnread flags we need.
  function buildEmailIndex() {
    const index = new Map();
    try {
      const emails = typeof API.getEmails === 'function' ? (API.getEmails() || []) : [];
      emails.forEach(e => {
        if (e && e.id != null) index.set(String(e.id), e);
      });
    } catch (err) {
      console.error('Important+Unread / Starred Two-Column Layout: getEmails() failed', err);
    }
    return index;
  }

  // Decide which group a rendered row belongs to.
  // Returns 'starred' | 'primary' | 'other'.
  function classifyRow(row, index) {
    const id = row.dataset ? row.dataset.emailId : null;
    const email = id != null ? index.get(String(id)) : null;

    if (email) {
      if (email.isStarred) return 'starred';
      if (email.isImportant || email.isUnread) return 'primary';
      return 'other';
    }

    // Fallback when the row isn't in the current email list (e.g. search
    // results): we can still read unread state from the row's own class.
    if (row.classList.contains('email-unread')) return 'primary';
    return 'other';
  }

  // All rendered email rows in the container that are NOT already inside our
  // wrapper (i.e. freshly rendered by the app and awaiting placement).
  function collectLooseRows(container) {
    return Array.from(container.querySelectorAll('.email-item'))
      .filter(row => !row.closest('.' + WRAPPER_CLASS));
  }

  function buildHeader(label, count) {
    const header = document.createElement('div');
    header.className = 'iust-header';
    header.innerHTML = '<span>' + label + ' <span class="iust-count">(' + count + ')</span></span>';
    return header;
  }

  // Build a column: header + rows (or an empty note when there are none).
  function buildColumn(colClass, label, rows) {
    const col = document.createElement('div');
    col.className = 'iust-col ' + colClass;
    col.appendChild(buildHeader(label, rows.length));

    const rowsWrap = document.createElement('div');
    rowsWrap.className = 'iust-col-rows';
    if (rows.length) {
      rows.forEach(row => rowsWrap.appendChild(row)); // MOVE (not clone)
    } else {
      const note = document.createElement('div');
      note.className = 'iust-empty';
      note.textContent = 'No emails here';
      rowsWrap.appendChild(note);
    }
    col.appendChild(rowsWrap);
    return col;
  }

  /* ============================================================
   * CORE: build / refresh the two-column layout
   * ============================================================ */
  function reorganize() {
    if (!enabled || isBusy) return;

    const container = getContainer();
    if (!container) return;

    const looseRows = collectLooseRows(container);
    if (looseRows.length === 0) return; // already arranged, or nothing to arrange

    const index = buildEmailIndex();

    // Split the freshly rendered rows into the three groups (order preserved,
    // so the app's date sort is kept inside each group).
    const primaryRows = [];
    const starredRows = [];
    const otherRows = [];
    looseRows.forEach(row => {
      const group = classifyRow(row, index);
      if (group === 'starred') starredRows.push(row);
      else if (group === 'primary') primaryRows.push(row);
      else otherRows.push(row);
    });

    // If nothing qualifies for either column, leave the native flat list as-is
    // (a two-column shell over only "everything else" would look odd).
    if (primaryRows.length === 0 && starredRows.length === 0) return;

    isBusy = true;
    try {
      const wrapper = document.createElement('div');
      wrapper.className = WRAPPER_CLASS;

      const top = document.createElement('div');
      top.className = 'iust-top';
      top.appendChild(buildColumn('iust-col-primary', LEFT_LABEL, primaryRows));
      top.appendChild(buildColumn('iust-col-starred', RIGHT_LABEL, starredRows));
      wrapper.appendChild(top);

      // "Everything else" spans full width below the two columns.
      if (otherRows.length) {
        wrapper.appendChild(buildHeader(OTHER_LABEL, otherRows.length));
        const otherWrap = document.createElement('div');
        otherWrap.className = 'iust-other-rows';
        otherRows.forEach(row => otherWrap.appendChild(row)); // MOVE (not clone)
        wrapper.appendChild(otherWrap);
      }

      // The row nodes have already been moved into the (still detached)
      // wrapper, so clearing the container only discards the now-empty native
      // section shells/headers. Then drop our freshly built wrapper in.
      container.innerHTML = '';
      container.appendChild(wrapper);

      console.log(
        'Important+Unread / Starred Two-Column Layout: laid out columns ' +
        '(Important & Unread: ' + primaryRows.length +
        ', Starred: ' + starredRows.length +
        ', Everything else: ' + otherRows.length + ')'
      );
    } catch (err) {
      console.error('Important+Unread / Starred Two-Column Layout: reorganize error', err);
    } finally {
      isBusy = false;
    }
  }

  // Undo the layout by asking the app to re-render the current view natively.
  // filterByCategory() rebuilds #emailContainer from scratch; because the
  // feature is disabled, our reorganize() becomes a no-op and the native
  // stacked layout stays.
  function restore() {
    try {
      if (typeof API.filterByCategory === 'function') {
        const filter = typeof API.getCurrentFilter === 'function' ? API.getCurrentFilter() : 'all';
        API.filterByCategory(filter || 'all');
      }
    } catch (err) {
      console.error('Important+Unread / Starred Two-Column Layout: restore error', err);
    }
  }

  /* ============================================================
   * HEADER TOGGLE BUTTON
   * ============================================================ */
  function buttonLabel() {
    return enabled ? '\u25A9 2-Column: On' : '\u2630 2-Column: Off';
  }

  function updateButtonLabel() {
    const btn = document.querySelector('.iust-toggle-btn');
    if (btn) btn.textContent = buttonLabel();
  }

  function addToggleButton() {
    if (typeof API.addHeaderButton !== 'function') return;
    API.addHeaderButton(buttonLabel(), () => setEnabled(!enabled), {
      className: 'btn btn-primary iust-toggle-btn',
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
    if (window.displayEmails.__iustHooked) return;

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
    window.displayEmails.__iustHooked = true;
    console.log('Important+Unread / Starred Two-Column Layout: hooked displayEmails()');
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
    console.log('Important+Unread / Starred Two-Column Layout: Frontend initialized (enabled=' + enabled + ')');
  }

  initialize();

  console.log('Important+Unread / Starred Two-Column Layout: Frontend loaded successfully');
})();
