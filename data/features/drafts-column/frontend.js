/**
 * Drafts Column - Frontend
 *
 * Adds a persistent THIRD column to the main inbox layout. The app's
 * `.main-content` is a flex row made of:
 *
 *   Column 1 : the left sidebar (categories / people)
 *   Column 2 : the `.content-area` (the email list + thread/reply/response pane)
 *
 * This feature injects Column 3 as a sibling of `.content-area`: a scrollable
 * panel on the right that lists ALL of the user's drafts. Because it lives
 * OUTSIDE `.content-area`, it stays visible while browsing the inbox, viewing a
 * thread, or on the Reply / Response pages - a true always-on third column.
 *
 * Data comes from the app's existing drafts API (no backend is added):
 *   GET    /api/drafts            -> { success, drafts: [...] }
 *   DELETE /api/drafts/:id        -> { success }
 *
 * A draft object looks like:
 *   { id, to, cc, bcc, subject, body, replyToMessageId,
 *     source: 'app' | 'gmail', createdAt, updatedAt }
 *
 * Interactions
 *   - Click a draft card       -> opens it in the app's composer, prefilled.
 *   - Trash icon on a card     -> deletes that draft (with a confirm), then
 *                                 refreshes the column.
 *   - Refresh icon in header   -> re-fetches the drafts.
 *   - Header toggle button     -> show / hide the whole column (remembered in
 *                                 localStorage).
 *
 * The column keeps itself in sync with a lightweight poll (the app does not
 * emit an event when a draft is saved/sent), and only re-renders when the draft
 * list actually changes so it never disrupts a click, hover or scroll.
 */

(function () {
  'use strict';

  console.log('Drafts Column: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Drafts Column: EmailAssistant API not available');
    return;
  }

  // Guard against the feature script being loaded more than once.
  if (window.__draftsColumnInitialized) {
    console.log('Drafts Column: already initialized, skipping');
    return;
  }
  window.__draftsColumnInitialized = true;

  const API = window.EmailAssistant;

  /* ============================================================
   * CONFIGURATION / CONSTANTS
   * ============================================================ */
  const MAIN_CONTENT_SELECTOR = '.main-content';
  const PANEL_ID = 'drafts-column-panel';
  const LIST_ID = 'drafts-column-list';
  const COUNT_ID = 'drafts-column-count';
  const STYLE_ID = 'drafts-column-styles';
  const STORAGE_KEY = 'draftsColumnEnabled';
  const POLL_MS = 4000; // background re-check interval

  /* ============================================================
   * STATE
   * ============================================================ */
  let enabled = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) enabled = saved === 'true';
  } catch (e) { /* localStorage may be unavailable */ }

  let drafts = [];       // last fetched drafts
  let lastSignature = ''; // signature of what is currently rendered
  let fetchInFlight = false;

  /* ============================================================
   * SMALL UTILITIES (kept self-contained on purpose)
   * ============================================================ */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Compact, friendly date. Falls back to the raw string if unparseable.
  function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);

    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString([], sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function snippetOf(body) {
    return String(body || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  }

  // A signature that changes whenever the visible draft data changes.
  function signatureOf(list) {
    return String(enabled) + '::' + list
      .map(d => [d.id, d.updatedAt || d.createdAt || '', d.subject || '', d.to || '', d.source || '']
        .join('~'))
      .join('|');
  }

  /* ============================================================
   * STYLES
   * ============================================================ */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        flex: 0 0 330px;
        width: 330px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--gmail-surface, #ffffff);
        border-left: 1px solid var(--gmail-line, #dadce0);
        box-sizing: border-box;
      }

      #${PANEL_ID} .dc-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--gmail-line, #dadce0);
        background: var(--gmail-sidebar, #eef3fb);
        flex: 0 0 auto;
      }
      #${PANEL_ID} .dc-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--gmail-text, #202124);
        white-space: nowrap;
      }
      #${PANEL_ID} .dc-count {
        font-size: 12px;
        font-weight: 600;
        color: var(--gmail-muted, #5f6368);
        background: #fff;
        border: 1px solid var(--gmail-line, #dadce0);
        border-radius: 999px;
        padding: 1px 8px;
      }
      #${PANEL_ID} .dc-refresh {
        margin-left: auto;
        border: 1px solid var(--gmail-line, #dadce0);
        background: #fff;
        color: var(--gmail-muted, #5f6368);
        border-radius: 6px;
        width: 30px;
        height: 30px;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
      }
      #${PANEL_ID} .dc-refresh:hover { background: #f1f3f4; }
      #${PANEL_ID} .dc-refresh.dc-spin { animation: dc-spin 0.8s linear infinite; }
      @keyframes dc-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

      #${PANEL_ID} .dc-list {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
      }

      #${PANEL_ID} .dc-card {
        position: relative;
        padding: 10px 14px;
        border-bottom: 1px solid var(--gmail-line, #dadce0);
        cursor: pointer;
        transition: background-color 0.1s;
      }
      #${PANEL_ID} .dc-card:hover { background: #f6f9fe; }
      #${PANEL_ID} .dc-card:last-child { border-bottom: none; }

      #${PANEL_ID} .dc-card-top {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      #${PANEL_ID} .dc-badge {
        flex: 0 0 auto;
        font-size: 11px;
        font-weight: 700;
        color: #d93025;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      #${PANEL_ID} .dc-to {
        flex: 1 1 auto;
        min-width: 0;
        font-size: 12px;
        color: var(--gmail-muted, #5f6368);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${PANEL_ID} .dc-source {
        flex: 0 0 auto;
        font-size: 10px;
        font-weight: 600;
        color: #1a73e8;
        background: var(--gmail-blue-soft, #d3e3fd);
        border-radius: 999px;
        padding: 1px 6px;
      }
      #${PANEL_ID} .dc-del {
        flex: 0 0 auto;
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 4px;
        opacity: 0.55;
      }
      #${PANEL_ID} .dc-card:hover .dc-del { opacity: 1; }
      #${PANEL_ID} .dc-del:hover { background: #fce8e6; }

      #${PANEL_ID} .dc-subject {
        margin-top: 3px;
        font-size: 13px;
        font-weight: 600;
        color: var(--gmail-text, #202124);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${PANEL_ID} .dc-snippet {
        margin-top: 2px;
        font-size: 12px;
        color: var(--gmail-muted, #5f6368);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${PANEL_ID} .dc-date {
        margin-top: 4px;
        font-size: 11px;
        color: #9aa0a6;
      }

      #${PANEL_ID} .dc-empty,
      #${PANEL_ID} .dc-error {
        padding: 24px 16px;
        text-align: center;
        color: var(--gmail-muted, #5f6368);
        font-size: 13px;
      }
      #${PANEL_ID} .dc-empty-icon { font-size: 26px; margin-bottom: 6px; }
      #${PANEL_ID} .dc-empty-hint { font-size: 12px; margin-top: 6px; color: #9aa0a6; }
      #${PANEL_ID} .dc-error { color: #d93025; }

      /* Give the column a little less room on smaller screens. */
      @media (max-width: 1200px) {
        #${PANEL_ID} { flex-basis: 270px; width: 270px; }
      }
      @media (max-width: 900px) {
        #${PANEL_ID} { flex-basis: 220px; width: 220px; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ============================================================
   * PANEL CREATION / TEARDOWN
   * ============================================================ */
  function getPanel() {
    return document.getElementById(PANEL_ID);
  }

  // Create the column (once) and attach it as the last child of .main-content
  // so it sits to the right of the email content area.
  function ensurePanel() {
    if (!enabled) {
      removePanel();
      return null;
    }
    let panel = getPanel();
    if (panel) return panel;

    const main = document.querySelector(MAIN_CONTENT_SELECTOR);
    if (!main) return null; // layout not ready yet; a later poll will retry

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="dc-header">
        <span class="dc-title">📝 Drafts</span>
        <span class="dc-count" id="${COUNT_ID}">0</span>
        <button class="dc-refresh" type="button" title="Refresh drafts">⟳</button>
      </div>
      <div class="dc-list" id="${LIST_ID}">
        <div class="dc-empty">Loading drafts…</div>
      </div>
    `;
    main.appendChild(panel);

    panel.querySelector('.dc-refresh').addEventListener('click', () => {
      const btn = panel.querySelector('.dc-refresh');
      if (btn) btn.classList.add('dc-spin');
      fetchAndRender(true).finally(() => {
        if (btn) setTimeout(() => btn.classList.remove('dc-spin'), 400);
      });
    });

    // Render whatever we already have so the column isn't blank on first show.
    lastSignature = '';
    render();
    return panel;
  }

  function removePanel() {
    const panel = getPanel();
    if (panel) panel.remove();
    lastSignature = '';
  }

  /* ============================================================
   * RENDERING
   * ============================================================ */
  function render() {
    const panel = getPanel();
    if (!panel) return;

    const list = document.getElementById(LIST_ID);
    const countEl = document.getElementById(COUNT_ID);
    if (!list) return;

    if (countEl) countEl.textContent = String(drafts.length);

    // Preserve scroll position across re-renders.
    const prevScroll = list.scrollTop;

    if (!drafts.length) {
      list.innerHTML = `
        <div class="dc-empty">
          <div class="dc-empty-icon">📝</div>
          <div>No drafts yet</div>
          <div class="dc-empty-hint">Use “Save as Draft” in a composer, or “Load from Gmail” to pull in your Gmail drafts.</div>
        </div>
      `;
      return;
    }

    list.innerHTML = '';
    drafts.forEach((draft) => list.appendChild(buildCard(draft)));
    list.scrollTop = prevScroll;
  }

  function buildCard(draft) {
    const card = document.createElement('div');
    card.className = 'dc-card';
    card.dataset.draftId = draft.id || '';

    const toText = draft.to && String(draft.to).trim() ? draft.to : '(no recipient)';
    const subject = draft.subject && String(draft.subject).trim() ? draft.subject : '(no subject)';
    const snippet = snippetOf(draft.body);
    const sourceBadge = draft.source === 'gmail' ? '<span class="dc-source">Gmail</span>' : '';

    card.innerHTML = `
      <div class="dc-card-top">
        <span class="dc-badge">Draft</span>
        <span class="dc-to" title="${escapeHtml(toText)}">To: ${escapeHtml(toText)}</span>
        ${sourceBadge}
        <button class="dc-del" type="button" title="Delete this draft">🗑️</button>
      </div>
      <div class="dc-subject" title="${escapeHtml(subject)}">${escapeHtml(subject)}</div>
      ${snippet ? `<div class="dc-snippet">${escapeHtml(snippet)}</div>` : ''}
      <div class="dc-date">${escapeHtml(formatDate(draft.updatedAt || draft.createdAt))}</div>
    `;

    card.addEventListener('click', () => openDraftInComposer(draft));
    card.querySelector('.dc-del').addEventListener('click', (e) => {
      e.stopPropagation(); // don't open the composer when deleting
      confirmDelete(draft);
    });

    return card;
  }

  /* ============================================================
   * ACTIONS
   * ============================================================ */

  // Open a draft in the app's composer, prefilled - mirroring what the app's
  // own drafts view does. The composer's draft link is set on a best-effort
  // basis so that "Save as Draft" updates this same draft and "Send" clears it.
  function openDraftInComposer(draft) {
    try {
      if (typeof window.openComposeEmail !== 'function') {
        if (typeof API.showError === 'function') {
          API.showError('The composer is not available on this page.');
        }
        return;
      }

      window.openComposeEmail(); // resets the composer, then we prefill it

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
      };
      setVal('composeToInput', draft.to);
      setVal('composeCcInput', draft.cc);
      setVal('composeBccInput', draft.bcc);
      setVal('composeSubjectInput', draft.subject);

      const bccRow = document.getElementById('composeBccRow');
      if (bccRow) bccRow.style.display = draft.bcc ? 'flex' : 'none';

      const bodyEl = document.getElementById('composeBody');
      if (bodyEl) bodyEl.textContent = draft.body || '';

      linkComposerToDraft(draft.id, draft.replyToMessageId || '');
    } catch (err) {
      console.error('Drafts Column: failed to open draft in composer', err);
    }
  }

  // The composer tracks the draft it is editing via app-level script variables
  // (composeCurrentDraftId / composeReplyToMessageId). They are not on window,
  // but classic scripts on the page share a lexical scope, so we can assign
  // them here. If the app ever changes and the binding is gone, the assignment
  // throws and we degrade gracefully (saving would just create a new draft).
  function linkComposerToDraft(id, replyToMessageId) {
    try {
      // eslint-disable-next-line no-undef
      composeCurrentDraftId = id;
      // eslint-disable-next-line no-undef
      composeReplyToMessageId = replyToMessageId;
    } catch (e) {
      console.warn('Drafts Column: could not link composer to draft (non-fatal):', e && e.message);
    }
  }

  function confirmDelete(draft) {
    const label = draft.subject && String(draft.subject).trim() ? draft.subject : '(no subject)';
    const extra = draft.source === 'gmail' ? ', not from Gmail' : '';
    const message = `Delete the draft "${label}"? This only removes it from this app${extra}.`;

    const doDelete = async () => {
      try {
        const res = await API.apiCall('/api/drafts/' + encodeURIComponent(draft.id), { method: 'DELETE' });
        if (!res || !res.success) throw new Error((res && res.error) || 'Delete failed');
        if (typeof API.showSuccess === 'function') API.showSuccess('Draft deleted');
        await fetchAndRender(true);
      } catch (err) {
        console.error('Drafts Column: delete failed', err);
        if (typeof API.showError === 'function') API.showError('Failed to delete the draft.');
      }
    };

    if (typeof API.showConfirm === 'function') {
      API.showConfirm(message, doDelete);
    } else if (window.confirm(message)) {
      doDelete();
    }
  }

  /* ============================================================
   * DATA SYNC
   * ============================================================ */
  async function fetchAndRender(force) {
    if (!enabled) return;
    if (fetchInFlight) return;
    fetchInFlight = true;
    try {
      const res = await API.apiCall('/api/drafts');
      if (!res || !res.success) throw new Error((res && res.error) || 'Failed to load drafts');

      const next = Array.isArray(res.drafts) ? res.drafts : [];
      const sig = signatureOf(next);
      if (!force && sig === lastSignature) return; // nothing changed; leave the DOM alone

      drafts = next;
      lastSignature = sig;
      ensurePanel();
      render();
    } catch (err) {
      console.error('Drafts Column: failed to fetch drafts', err);
      const list = document.getElementById(LIST_ID);
      if (list && !drafts.length) {
        list.innerHTML = '<div class="dc-error">Failed to load drafts.</div>';
      }
    } finally {
      fetchInFlight = false;
    }
  }

  /* ============================================================
   * HEADER TOGGLE BUTTON
   * ============================================================ */
  function buttonLabel() {
    return enabled ? '📝 Drafts Column: On' : '📝 Drafts Column: Off';
  }

  function updateButtonLabel() {
    const btn = document.querySelector('.drafts-column-toggle-btn');
    if (btn) btn.textContent = buttonLabel();
  }

  function addToggleButton() {
    if (typeof API.addHeaderButton !== 'function') return;
    API.addHeaderButton(buttonLabel(), () => setEnabled(!enabled), {
      className: 'btn btn-primary drafts-column-toggle-btn',
      style: { marginRight: '12px' }
    });
  }

  function setEnabled(value) {
    enabled = value;
    try { window.localStorage.setItem(STORAGE_KEY, String(value)); } catch (e) {}

    if (enabled) {
      ensurePanel();
      fetchAndRender(true);
      if (typeof API.showSuccess === 'function') API.showSuccess('Drafts column shown');
    } else {
      removePanel();
      if (typeof API.showSuccess === 'function') API.showSuccess('Drafts column hidden');
    }
    updateButtonLabel();
  }

  /* ============================================================
   * INITIALIZATION
   * ============================================================ */
  function initialize() {
    injectStyles();
    addToggleButton();

    if (enabled) {
      ensurePanel();
      fetchAndRender(true);
    }

    // Keep in sync: the app re-renders / saves drafts without emitting an
    // event, so poll and only re-render when the data actually changes. This
    // also re-creates the column if the layout is ever rebuilt.
    setInterval(() => {
      if (!enabled) return;
      ensurePanel();
      fetchAndRender(false);
    }, POLL_MS);

    updateButtonLabel();
    console.log('Drafts Column: Frontend initialized (enabled=' + enabled + ')');
  }

  initialize();

  console.log('Drafts Column: Frontend loaded successfully');
})();
