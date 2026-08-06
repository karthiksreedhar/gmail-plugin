/**
 * Important + Unread / Starred Layout (Standard / Two Col / Three Col) - Frontend
 *
 * Adds a header layout selector with three modes:
 *
 *   - "Standard" : the app's native single stacked email list (feature inert).
 *   - "Two Col"  : the original two-column layout —
 *                    LEFT  column : "Important & Unread" (important OR unread)
 *                    RIGHT column : "Starred"
 *                    BELOW (full width) : "Everything else"
 *   - "Three Col": same as Two Col plus a THIRD column listing the user's
 *                  saved drafts (from GET /api/drafts). Clicking a draft opens
 *                  it in the compose window, prefilled, exactly like the
 *                  native drafts view does.
 *
 * How the email grouping is decided (per email, mutually exclusive so no card
 * is duplicated):
 *   1. If the email is Starred            -> Starred column.
 *   2. Else if it is Important OR Unread  -> Important & Unread column.
 *   3. Else                               -> "Everything else" section below.
 *
 * Emails are never fetched, changed, deleted or re-classified: the feature
 * MOVES the exact row nodes the app already rendered (never clones them), so
 * click handlers, delete buttons, notes previews and highlights keep working.
 * The drafts column is the only part that fetches data (read-only list call).
 *
 * The selected mode is remembered in localStorage (the old boolean on/off key
 * from the two-column version is migrated automatically). The app re-renders
 * the list on approvals, filter changes and refreshes, so the feature stays in
 * sync by wrapping displayEmails() and running a lightweight periodic check.
 */

(function () {
  'use strict';

  console.log('Important+Unread / Starred Layout: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Important+Unread / Starred Layout: EmailAssistant API not available');
    return;
  }

  // Guard against the feature script being loaded more than once.
  if (window.__importantUnreadStarredTwoColInitialized) {
    console.log('Important+Unread / Starred Layout: already initialized, skipping');
    return;
  }
  window.__importantUnreadStarredTwoColInitialized = true;

  const API = window.EmailAssistant;

  /* ============================================================
   * CONFIGURATION / CONSTANTS
   * ============================================================ */
  const CONTAINER_ID = 'emailContainer';   // the approved-list container
  const WRAPPER_CLASS = 'iust-wrapper';     // our injected layout wrapper
  const LEGACY_STORAGE_KEY = 'importantUnreadStarredTwoColEnabled';
  const MODE_STORAGE_KEY = 'importantUnreadStarredLayoutMode';
  const REFRESH_MS = 800;                   // background re-check interval
  const DRAFTS_REFRESH_MS = 30000;          // drafts list refresh interval

  const MODES = ['standard', 'two', 'three'];
  const MODE_LABELS = { standard: 'Standard', two: 'Two Col', three: 'Three Col' };

  const LEFT_LABEL = '❗ Important & Unread'; // ❗ Important & Unread
  const RIGHT_LABEL = '⭐ Starred';           // ⭐ Starred
  const DRAFTS_LABEL = '📝 Drafts';     // 📝 Drafts
  const OTHER_LABEL = 'Everything else';

  /* ============================================================
   * STATE
   * ============================================================ */
  let mode = 'two';
  try {
    const savedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (savedMode && MODES.indexOf(savedMode) !== -1) {
      mode = savedMode;
    } else {
      // Migrate the old two-column on/off boolean.
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy !== null) mode = legacy === 'true' ? 'two' : 'standard';
    }
  } catch (e) { /* localStorage may be unavailable */ }

  let isBusy = false;        // reentrancy guard while manipulating the DOM
  let draftsCache = [];      // last fetched drafts list
  let draftsFetchedAt = 0;   // timestamp of the last successful fetch
  let draftsFetchInFlight = false;

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

      /* Subtle accent so the columns read as distinct at a glance. */
      .iust-col-primary { border-top: 3px solid #f4b400; }
      .iust-col-starred { border-top: 3px solid #4285f4; }
      .iust-col-drafts  { border-top: 3px solid #34a853; }

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

      /* Draft cards in the third column, styled like the app's inbox rows. */
      .iust-draft-item {
        border-bottom: 1px solid #e0e0e0;
        padding: 8px 14px;
        cursor: pointer;
        background: #fff;
        overflow: hidden;
      }
      .iust-draft-item:hover { background: #f6f9fe; }
      .iust-draft-top {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .iust-draft-label {
        color: #d93025;
        font-weight: 600;
        font-size: 13px;
        flex-shrink: 0;
      }
      .iust-draft-to {
        color: #5f6368;
        font-size: 13px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1 1 auto;
      }
      .iust-draft-date {
        color: #5f6368;
        font-size: 12px;
        flex-shrink: 0;
        margin-left: auto;
        padding-left: 8px;
      }
      .iust-draft-subject {
        font-size: 13px;
        color: #202124;
        font-weight: 500;
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .iust-draft-snippet { color: #5f6368; font-weight: 400; }

      /* Layout selector menu (anchored under the header button). */
      .iust-mode-menu {
        position: fixed;
        z-index: 10000;
        background: #fff;
        border: 1px solid #dadce0;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.15);
        padding: 4px;
        min-width: 150px;
      }
      .iust-mode-menu button {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        border: none;
        background: transparent;
        text-align: left;
        padding: 8px 12px;
        font-size: 13px;
        border-radius: 6px;
        cursor: pointer;
        color: #202124;
      }
      .iust-mode-menu button:hover { background: #f1f3f4; }
      .iust-mode-menu .iust-mode-check {
        width: 14px;
        flex-shrink: 0;
        color: #1a73e8;
        font-weight: 700;
      }

      /* Stack the top columns on narrow screens. */
      @media (max-width: 768px) {
        .iust-top { flex-direction: column; }
      }
      /* Three columns need a bit more room; stack earlier. */
      @media (max-width: 1000px) {
        .iust-top.iust-three { flex-wrap: wrap; }
        .iust-top.iust-three .iust-col { flex: 1 1 45%; }
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

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Compact date, matching the app's inbox rows: time only when today,
  // date only otherwise (year added when it isn't the current year).
  function formatCompactDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const sameDay = date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
    if (sameDay) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
    });
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
      console.error('Important+Unread / Starred Layout: getEmails() failed', err);
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
   * DRAFTS COLUMN (Three Col mode only)
   * ============================================================ */

  function fetchDrafts(force) {
    if (draftsFetchInFlight) return;
    if (!force && Date.now() - draftsFetchedAt < DRAFTS_REFRESH_MS) return;
    draftsFetchInFlight = true;
    fetch('/api/drafts')
      .then(resp => resp.json())
      .then(data => {
        if (data && data.success && Array.isArray(data.drafts)) {
          draftsCache = data.drafts;
          draftsFetchedAt = Date.now();
          renderDraftsColumnContent();
        }
      })
      .catch(err => {
        console.warn('Important+Unread / Starred Layout: drafts fetch failed', err);
      })
      .finally(() => { draftsFetchInFlight = false; });
  }

  // Open a draft in the compose window, prefilled — mirrors the app's own
  // openDraftInCompose(). The compose state ids are global lexical bindings in
  // app.js, so assignment keeps "save updates the same draft" semantics; if
  // that ever changes the try/catch degrades to a plain prefilled composer.
  function openDraftFromColumn(draft) {
    if (typeof window.openComposeEmail !== 'function') {
      if (typeof window.showDraftsView === 'function') window.showDraftsView();
      return;
    }
    window.openComposeEmail();
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('composeToInput', draft.to);
    setVal('composeCcInput', draft.cc);
    setVal('composeBccInput', draft.bcc);
    setVal('composeSubjectInput', draft.subject);
    const bccRow = document.getElementById('composeBccRow');
    if (bccRow) bccRow.style.display = draft.bcc ? 'flex' : 'none';
    const bodyEl = document.getElementById('composeBody');
    if (bodyEl) bodyEl.textContent = draft.body || '';
    try {
      composeCurrentDraftId = draft.id;
      composeReplyToMessageId = draft.replyToMessageId || '';
    } catch (e) {
      console.warn('Important+Unread / Starred Layout: could not link composer to draft id (saving will create a new draft)', e);
    }
  }

  function buildDraftCard(draft) {
    const card = document.createElement('div');
    card.className = 'iust-draft-item';
    const snippet = String(draft.body || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    card.innerHTML =
      '<div class="iust-draft-top">' +
        '<span class="iust-draft-label">Draft</span>' +
        '<span class="iust-draft-to">To: ' + escapeHtml(draft.to || '(no recipient)') + '</span>' +
        '<span class="iust-draft-date">' + escapeHtml(formatCompactDate(draft.updatedAt || draft.createdAt)) + '</span>' +
      '</div>' +
      '<div class="iust-draft-subject">' + escapeHtml(draft.subject || '(no subject)') +
        (snippet ? ' <span class="iust-draft-snippet">&ndash; ' + escapeHtml(snippet) + '</span>' : '') +
      '</div>';
    card.addEventListener('click', () => openDraftFromColumn(draft));
    return card;
  }

  // (Re)fill the drafts column in the current wrapper, if present.
  function renderDraftsColumnContent() {
    const col = document.querySelector('.' + WRAPPER_CLASS + ' .iust-col-drafts');
    if (!col) return;

    const header = col.querySelector('.iust-header');
    if (header) {
      header.innerHTML = '<span>' + DRAFTS_LABEL + ' <span class="iust-count">(' + draftsCache.length + ')</span></span>';
    }
    const rowsWrap = col.querySelector('.iust-col-rows');
    if (!rowsWrap) return;
    rowsWrap.innerHTML = '';
    if (draftsCache.length) {
      draftsCache.forEach(draft => rowsWrap.appendChild(buildDraftCard(draft)));
    } else {
      const note = document.createElement('div');
      note.className = 'iust-empty';
      note.textContent = draftsFetchedAt ? 'No drafts' : 'Loading drafts…';
      rowsWrap.appendChild(note);
    }
  }

  function buildDraftsColumn() {
    const col = document.createElement('div');
    col.className = 'iust-col iust-col-drafts';
    col.appendChild(buildHeader(DRAFTS_LABEL, draftsCache.length));
    const rowsWrap = document.createElement('div');
    rowsWrap.className = 'iust-col-rows';
    col.appendChild(rowsWrap);
    return col;
  }

  /* ============================================================
   * CORE: build / refresh the column layout
   * ============================================================ */
  function reorganize() {
    if (mode === 'standard' || isBusy) return;

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

    // If nothing qualifies for either email column, leave the native flat list
    // as-is (a multi-column shell over only "everything else" would look odd).
    if (primaryRows.length === 0 && starredRows.length === 0) return;

    isBusy = true;
    try {
      const wrapper = document.createElement('div');
      wrapper.className = WRAPPER_CLASS;

      const top = document.createElement('div');
      top.className = 'iust-top' + (mode === 'three' ? ' iust-three' : '');
      top.appendChild(buildColumn('iust-col-primary', LEFT_LABEL, primaryRows));
      top.appendChild(buildColumn('iust-col-starred', RIGHT_LABEL, starredRows));
      if (mode === 'three') {
        top.appendChild(buildDraftsColumn());
      }
      wrapper.appendChild(top);

      // "Everything else" spans full width below the columns.
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

      if (mode === 'three') {
        renderDraftsColumnContent(); // fill from cache immediately
        fetchDrafts(false);          // refresh if stale
      }

      console.log(
        'Important+Unread / Starred Layout: laid out ' + MODE_LABELS[mode] +
        ' (Important & Unread: ' + primaryRows.length +
        ', Starred: ' + starredRows.length +
        (mode === 'three' ? ', Drafts: ' + draftsCache.length : '') +
        ', Everything else: ' + otherRows.length + ')'
      );
    } catch (err) {
      console.error('Important+Unread / Starred Layout: reorganize error', err);
    } finally {
      isBusy = false;
    }
  }

  // Undo the layout by asking the app to re-render the current view natively.
  // filterByCategory() rebuilds #emailContainer from scratch; in Standard mode
  // our reorganize() is a no-op so the native stacked layout stays. In the
  // column modes the fresh native render is immediately re-flowed into columns
  // by the displayEmails() hook.
  function restore() {
    try {
      if (typeof API.filterByCategory === 'function') {
        const filter = typeof API.getCurrentFilter === 'function' ? API.getCurrentFilter() : 'all';
        API.filterByCategory(filter || 'all');
      }
    } catch (err) {
      console.error('Important+Unread / Starred Layout: restore error', err);
    }
  }

  /* ============================================================
   * HEADER LAYOUT SELECTOR
   * ============================================================ */
  function buttonLabel() {
    return '▤ Layout: ' + MODE_LABELS[mode];
  }

  function updateButtonLabel() {
    const btn = document.querySelector('.iust-toggle-btn');
    if (btn) btn.textContent = buttonLabel();
  }

  function closeModeMenu() {
    const menu = document.querySelector('.iust-mode-menu');
    if (menu) menu.remove();
    document.removeEventListener('click', onDocClickCloseMenu, true);
  }

  function onDocClickCloseMenu(e) {
    if (!e.target.closest('.iust-mode-menu') && !e.target.closest('.iust-toggle-btn')) {
      closeModeMenu();
    }
  }

  function openModeMenu(anchorBtn) {
    closeModeMenu();
    const menu = document.createElement('div');
    menu.className = 'iust-mode-menu';

    MODES.forEach(m => {
      const item = document.createElement('button');
      item.type = 'button';
      item.innerHTML =
        '<span class="iust-mode-check">' + (m === mode ? '✓' : '') + '</span>' +
        '<span>' + MODE_LABELS[m] + '</span>';
      item.addEventListener('click', () => {
        closeModeMenu();
        setMode(m);
      });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    const rect = anchorBtn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';

    // Defer so the opening click doesn't immediately close it.
    setTimeout(() => document.addEventListener('click', onDocClickCloseMenu, true), 0);
  }

  function addToggleButton() {
    if (typeof API.addHeaderButton !== 'function') return;
    API.addHeaderButton(buttonLabel(), (e) => {
      const btn = (e && e.currentTarget) || document.querySelector('.iust-toggle-btn');
      const existing = document.querySelector('.iust-mode-menu');
      if (existing) closeModeMenu();
      else openModeMenu(btn);
    }, {
      className: 'btn btn-primary iust-toggle-btn',
      style: { marginRight: '12px' }
    });
  }

  function setMode(next) {
    if (MODES.indexOf(next) === -1 || next === mode) { updateButtonLabel(); return; }
    mode = next;
    try { window.localStorage.setItem(MODE_STORAGE_KEY, mode); } catch (e) {}

    if (mode === 'three') fetchDrafts(true);

    // A native re-render is the cleanest transition for every switch: in
    // Standard mode it stays native; in the column modes the displayEmails()
    // hook immediately re-flows the fresh render into the selected layout.
    restore();
    if (mode !== 'standard') reorganize();

    if (typeof API.showSuccess === 'function') {
      API.showSuccess('Layout: ' + MODE_LABELS[mode]);
    }
    updateButtonLabel();
  }

  /* ============================================================
   * SYNC HOOKS
   * ============================================================ */
  function scheduleReorganize(delay) {
    if (mode === 'standard') return;
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
    console.log('Important+Unread / Starred Layout: hooked displayEmails()');
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
    setInterval(() => {
      if (mode !== 'standard') reorganize();
      if (mode === 'three') fetchDrafts(false);
    }, REFRESH_MS);

    // First pass shortly after load (emails may already be on screen).
    scheduleReorganize(200);
    if (mode === 'three') fetchDrafts(true);

    updateButtonLabel();
    console.log('Important+Unread / Starred Layout: Frontend initialized (mode=' + mode + ')');
  }

  initialize();

  console.log('Important+Unread / Starred Layout: Frontend loaded successfully');
})();
