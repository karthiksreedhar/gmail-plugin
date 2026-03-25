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
    return dt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
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
    marker.textContent = `Deadline: ${formatDueAt(info.dueAt)}`;
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
        if (item.style.borderLeft === '4px solid rgb(244, 180, 0)' || item.style.borderLeft === '4px solid #F4B400') {
          item.style.borderLeft = '';
        }
        const marker = item.querySelector('.deadline-priority-marker');
        if (marker) marker.remove();
        normal.push({ item, index });
      }
    });

    urgent.sort((a, b) => (a.dueAt - b.dueAt) || (a.index - b.index));

    const reordered = [
      ...urgent.map(entry => entry.item),
      ...normal.map(entry => entry.item)
    ];
    reordered.forEach(node => container.appendChild(node));
  }

  function collectVisibleEmailIds() {
    const emailItems = Array.from(document.querySelectorAll('#emailContainer .email-item'));
    const ids = emailItems.map(getEmailId).filter(Boolean);
    return Array.from(new Set(ids));
  }

  async function refreshUrgentDeadlines() {
    if (inflight) return;
    inflight = true;
    try {
      const visibleIds = collectVisibleEmailIds();
      if (!visibleIds.length) return;

      const response = await API.apiCall('/api/deadline-email-prioritization/scan', {
        method: 'POST',
        body: { emailIds: visibleIds }
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
    setTimeout(() => refreshUrgentDeadlines(), 250);
    setInterval(() => refreshUrgentDeadlines(), 30000);

    if (typeof window.displayEmails === 'function') {
      const originalDisplayEmails = window.displayEmails;
      window.displayEmails = async function(...args) {
        const out = await originalDisplayEmails.apply(this, args);
        setTimeout(() => refreshUrgentDeadlines(), 60);
        return out;
      };
    }
  }

  initialize();
  console.log('Deadline Email Prioritization: Frontend initialized');
})();
