/**
 * Deadline Email Prioritization Frontend
 * Automatically promotes imminent-deadline emails to the top and highlights them.
 */

(function() {
  if (!window.EmailAssistant) {
    console.error('Deadline Email Prioritization: EmailAssistant API unavailable');
    return;
  }

  const API = window.EmailAssistant;
  const urgentById = new Map(); // emailId -> { dueAt, matchedText }
  const BUTTON_CLASS = 'deadline-priority-ignore-btn';
  const baseOrderById = new Map(); // emailId -> chronological index from base list render
  let inflight = false;

  function getEmailId(emailItem) {
    const notesPreview = emailItem.querySelector('.notes-preview[data-email-notes]');
    if (notesPreview) {
      const fromNotes = String(notesPreview.getAttribute('data-email-notes') || '').trim();
      if (fromNotes) return fromNotes;
    }

    const deleteBtn = emailItem.querySelector('.delete-thread-btn');
    const onclickRaw = deleteBtn ? String(deleteBtn.getAttribute('onclick') || '') : '';
    const match = onclickRaw.match(/deleteEmailThread\('([^']+)'/);
    if (match && match[1]) return match[1];
    return '';
  }

  function formatDueAt(isoText) {
    const dt = new Date(isoText);
    if (Number.isNaN(dt.getTime())) return '';
    const datePart = dt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
    return `${datePart}, 11:59 PM`;
  }

  function renderDeadlineMarker(emailItem, info) {
    const row = emailItem.querySelector('.email-meta-row');
    if (!row) return;

    const existing = row.querySelector('.deadline-priority-marker');
    if (existing) existing.remove();

    if (!info) return;
    const marker = document.createElement('span');
    marker.className = 'deadline-priority-marker';
    marker.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'margin-left:8px',
      'padding:2px 8px',
      'border-radius:999px',
      'background:#fbbc04',
      'color:#5f370e',
      'font-size:11px',
      'font-weight:700'
    ].join(';');
    const estimate = Number.isFinite(Number(info.estimatedMinutes))
      ? ` · Est: ${Number(info.estimatedMinutes)} min`
      : (info.estimatedLabel ? ` · Est: ${String(info.estimatedLabel)}` : '');
    marker.textContent = `Deadline: ${formatDueAt(info.dueAt)}${estimate}`;
    row.appendChild(marker);
  }

  function applyPriorityStylingAndOrder() {
    const container = document.getElementById('emailContainer');
    if (!container) return;

    const emailItems = Array.from(container.querySelectorAll('.email-item'));
    if (!emailItems.length) return;

    const urgent = [];
    const normal = [];

    emailItems.forEach((item, index) => {
      const id = getEmailId(item);
      const info = id ? urgentById.get(id) : null;

      if (info) {
        item.style.backgroundColor = '#FFF4CC';
        item.style.borderLeft = '4px solid #F4B400';
        renderDeadlineMarker(item, info);
        urgent.push({ item, dueAt: new Date(info.dueAt).getTime() || Number.MAX_SAFE_INTEGER, index });
      } else {
        if (item.style.backgroundColor === 'rgb(255, 244, 204)' || item.style.backgroundColor === '#FFF4CC') {
          item.style.backgroundColor = '';
        }
        if (item.style.borderLeft === '4px solid rgb(244, 180, 0)' || item.style.borderLeft === '4px solid #F4B400') {
          item.style.borderLeft = '';
        }
        const marker = item.querySelector('.deadline-priority-marker');
        if (marker) marker.remove();
        normal.push({ item, index });
      }
    });

    urgent.sort((a, b) => (a.dueAt - b.dueAt) || (a.index - b.index));
    normal.sort((a, b) => {
      const aId = getEmailId(a.item);
      const bId = getEmailId(b.item);
      const aBase = baseOrderById.has(aId) ? baseOrderById.get(aId) : a.index;
      const bBase = baseOrderById.has(bId) ? baseOrderById.get(bId) : b.index;
      return aBase - bBase;
    });

    const reordered = [
      ...urgent.map(entry => entry.item),
      ...normal.map(entry => entry.item)
    ];
    reordered.forEach(node => container.appendChild(node));
    ensureIgnoreButtons();
  }

  async function markEmailAsNotDeadline(emailId) {
    if (!emailId) return;
    try {
      const response = await API.apiCall('/api/deadline-email-prioritization/ignore', {
        method: 'POST',
        body: { emailId, ignored: true }
      });
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to save ignored deadline');
      }
      urgentById.delete(emailId);
      applyPriorityStylingAndOrder();
      API.showSuccess('Marked as not a deadline. It will stay excluded in future runs.');
    } catch (error) {
      console.error('Deadline Email Prioritization ignore failed:', error);
      API.showError('Failed to mark email as not a deadline.');
    }
  }

  function ensureIgnoreButtons() {
    const emailItems = Array.from(document.querySelectorAll('#emailContainer .email-item'));
    if (!emailItems.length) return;

    emailItems.forEach((emailItem) => {
      const id = getEmailId(emailItem);
      const actions = emailItem.querySelector('.email-actions');
      if (!id || !actions) return;

      const existing = actions.querySelector(`.${BUTTON_CLASS}`);
      const isUrgent = urgentById.has(id);

      if (!isUrgent) {
        if (existing) existing.remove();
        return;
      }

      if (existing) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = BUTTON_CLASS;
      btn.textContent = 'Hide';
      btn.style.cssText = [
        'background:#fff',
        'color:#8a4b00',
        'border:1px solid #f4b400',
        'padding:6px 8px',
        'border-radius:6px',
        'cursor:pointer',
        'font-size:11px',
        'margin-right:8px'
      ].join(';');
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await markEmailAsNotDeadline(id);
      });

      const deleteBtn = actions.querySelector('.delete-thread-btn');
      if (deleteBtn) {
        actions.insertBefore(btn, deleteBtn);
      } else {
        actions.appendChild(btn);
      }
    });
  }

  function collectVisibleEmailIds() {
    const emailItems = Array.from(document.querySelectorAll('#emailContainer .email-item'));
    const ids = emailItems.map(getEmailId).filter(Boolean);
    return Array.from(new Set(ids));
  }

  function snapshotBaseChronologicalOrder() {
    const emailItems = Array.from(document.querySelectorAll('#emailContainer .email-item'));
    emailItems.forEach((item, index) => {
      const id = getEmailId(item);
      if (!id) return;
      baseOrderById.set(id, index);
    });
  }

  async function refreshUrgentDeadlines() {
    if (inflight) return;
    inflight = true;
    try {
      const visibleIds = collectVisibleEmailIds();
      if (!visibleIds.length) return;

      const response = await API.apiCall('/api/deadline-email-prioritization/scan', {
        method: 'POST',
        body: {
          emailIds: visibleIds,
          clientTimezoneOffsetMinutes: new Date().getTimezoneOffset()
        }
      });

      if (!response || !response.success || typeof response.urgentByEmailId !== 'object') {
        return;
      }

      urgentById.clear();
      Object.entries(response.urgentByEmailId).forEach(([id, info]) => {
        if (!id || !info || !info.dueAt) return;
        urgentById.set(id, info);
      });

      applyPriorityStylingAndOrder();
    } catch (error) {
      console.error('Deadline Email Prioritization refresh failed:', error);
    } finally {
      inflight = false;
    }
  }

  function initialize() {
    // Auto-run continuously; no manual button by design.
    setTimeout(() => snapshotBaseChronologicalOrder(), 220);
    setTimeout(() => refreshUrgentDeadlines(), 250);
    setInterval(() => refreshUrgentDeadlines(), 30000);

    if (typeof window.displayEmails === 'function') {
      const originalDisplayEmails = window.displayEmails;
      window.displayEmails = async function(...args) {
        const out = await originalDisplayEmails.apply(this, args);
        setTimeout(() => snapshotBaseChronologicalOrder(), 40);
        setTimeout(() => refreshUrgentDeadlines(), 60);
        setTimeout(() => ensureIgnoreButtons(), 90);
        return out;
      };
    }
  }

  initialize();
  console.log('Deadline Email Prioritization: Frontend initialized');
})();
