/**
 * Emails Requiring Reply Frontend
 * Automatically promotes the top 5 latest reply-needed emails to the top of the list.
 */

(function() {
  if (!window.EmailAssistant) {
    console.error('emails-requiring-reply: EmailAssistant API unavailable');
    return;
  }

  const API = window.EmailAssistant;
  const selectedById = new Map(); // emailId -> { rank, reason }
  const dismissedIds = new Set();
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

  function renderReplyMarker(emailItem, info) {
    const row = emailItem.querySelector('.email-meta-row');
    if (!row) return;

    const existing = row.querySelector('.reply-priority-marker');
    if (existing) existing.remove();
    if (!info) return;

    const marker = document.createElement('span');
    marker.className = 'reply-priority-marker';
    marker.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'margin-left:8px',
      'padding:2px 8px',
      'border-radius:999px',
      'background:#d2e3fc',
      'color:#174ea6',
      'font-size:11px',
      'font-weight:700'
    ].join(';');
    marker.title = String(info.reason || '').trim() || 'Likely requires reply';
    marker.textContent = `Reply Priority #${Number(info.rank) || 0}`;
    row.appendChild(marker);
  }

  function clearDismissButton(emailItem) {
    const existing = emailItem.querySelector('.reply-dismiss-btn');
    if (existing) existing.remove();
  }

  function renderDismissButton(emailItem, id) {
    const actions = emailItem.querySelector('.email-actions');
    if (!actions || !id) return;
    clearDismissButton(emailItem);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'reply-dismiss-btn';
    btn.textContent = 'No Reply Needed';
    btn.style.cssText = [
      'background:#f1f3f4',
      'color:#174ea6',
      'border:1px solid #c6dafc',
      'padding:6px 10px',
      'border-radius:12px',
      'cursor:pointer',
      'font-size:12px',
      'margin-right:8px'
    ].join(';');
    btn.title = 'Remove this from reply-priority list';
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      btn.disabled = true;
      try {
        const resp = await API.apiCall('/api/emails-requiring-reply/dismiss', {
          method: 'POST',
          body: { emailId: id }
        });
        if (!resp || !resp.success) {
          throw new Error(resp?.error || 'Dismiss failed');
        }
        dismissedIds.add(id);
        selectedById.delete(id);
        applyTopFivePriority();
      } catch (error) {
        console.error('emails-requiring-reply dismiss failed:', error);
        API.showError('Failed to mark as no-reply-needed.');
      } finally {
        btn.disabled = false;
      }
    });
    actions.insertBefore(btn, actions.firstChild || null);
  }

  function applyTopFivePriority() {
    const container = document.getElementById('emailContainer');
    if (!container) return;

    const items = Array.from(container.querySelectorAll('.email-item'));
    if (!items.length) return;
    const allEmails = Array.isArray(API.getEmails()) ? API.getEmails() : [];
    const dateById = new Map(
      allEmails
        .map(e => [String(e?.id || '').trim(), new Date(e?.date || 0).getTime()])
        .filter(([id, ms]) => id && Number.isFinite(ms))
    );

    const selected = [];
    const normal = [];

    items.forEach((item, index) => {
      const id = getEmailId(item);
      const info = id ? selectedById.get(id) : null;

      if (info) {
        item.style.backgroundColor = '#EEF4FF';
        item.style.borderLeft = '4px solid #1A73E8';
        renderReplyMarker(item, info);
        renderDismissButton(item, id);
        selected.push({ item, rank: Number(info.rank) || 999, index });
      } else {
        if (item.style.borderLeft === '4px solid rgb(26, 115, 232)' || item.style.borderLeft === '4px solid #1A73E8') {
          item.style.borderLeft = '';
        }
        const marker = item.querySelector('.reply-priority-marker');
        if (marker) marker.remove();
        clearDismissButton(item);
        const ms = Number(dateById.get(id));
        normal.push({ item, index, ms: Number.isFinite(ms) ? ms : -Infinity });
      }
    });

    selected.sort((a, b) => (a.rank - b.rank) || (a.index - b.index));
    normal.sort((a, b) => (b.ms - a.ms) || (a.index - b.index));
    const reordered = [...selected.map(x => x.item), ...normal.map(x => x.item)];
    reordered.forEach(node => container.appendChild(node));
  }

  function collectVisibleEmailIds() {
    const emailItems = Array.from(document.querySelectorAll('#emailContainer .email-item'));
    const ids = emailItems.map(getEmailId).filter(Boolean);
    return Array.from(new Set(ids));
  }

  async function refreshReplyPriority() {
    if (inflight) return;
    inflight = true;
    try {
      const visibleIds = collectVisibleEmailIds();
      if (!visibleIds.length) return;

      const response = await API.apiCall('/api/emails-requiring-reply/top-five', {
        method: 'POST',
        body: { emailIds: visibleIds }
      });
      if (!response || !response.success || typeof response.selectedById !== 'object') {
        return;
      }

      selectedById.clear();
      Object.entries(response.selectedById).forEach(([id, info]) => {
        if (!id || !info) return;
        if (dismissedIds.has(id)) return;
        selectedById.set(id, {
          rank: Number(info.rank) || 999,
          reason: String(info.reason || '')
        });
      });

      applyTopFivePriority();
    } catch (error) {
      console.error('emails-requiring-reply refresh failed:', error);
    } finally {
      inflight = false;
    }
  }

  function initialize() {
    setTimeout(() => refreshReplyPriority(), 300);
    setInterval(() => refreshReplyPriority(), 45000);

    if (typeof window.displayEmails === 'function') {
      const original = window.displayEmails;
      window.displayEmails = async function(...args) {
        const out = await original.apply(this, args);
        setTimeout(() => refreshReplyPriority(), 80);
        return out;
      };
    }
  }

  initialize();
  console.log('emails-requiring-reply: Frontend initialized');
})();
