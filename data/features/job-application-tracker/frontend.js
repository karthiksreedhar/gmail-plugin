/**
 * Job Application Tracker Frontend
 * Adds a header button and auto-prioritizes stale job-application emails in inbox.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('Job Application Tracker: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;
  const followUpById = new Map(); // emailId -> { daysOld, priorityRank, message }
  let inflight = false;

  function safeStr(v) {
    return String(v || '').trim();
  }

  function getEmailId(emailItem) {
    const notesPreview = emailItem.querySelector('.notes-preview[data-email-notes]');
    if (notesPreview) {
      const id = safeStr(notesPreview.getAttribute('data-email-notes'));
      if (id) return id;
    }
    const deleteBtn = emailItem.querySelector('.delete-thread-btn');
    const onclickRaw = deleteBtn ? safeStr(deleteBtn.getAttribute('onclick')) : '';
    const match = onclickRaw.match(/deleteEmailThread\('([^']+)'/);
    return match && match[1] ? match[1] : '';
  }

  function collectVisibleEmailIds() {
    const items = Array.from(document.querySelectorAll('#emailContainer .email-item'));
    return Array.from(new Set(items.map(getEmailId).filter(Boolean)));
  }

  function clearMarker(emailItem) {
    const marker = emailItem.querySelector('.job-followup-marker');
    if (marker) marker.remove();
  }

  function renderMarker(emailItem, info) {
    clearMarker(emailItem);
    if (!info) return;
    const row = emailItem.querySelector('.email-meta-row');
    if (!row) return;
    const marker = document.createElement('span');
    marker.className = 'job-followup-marker';
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
    marker.textContent = safeStr(info.message || 'Follow up suggested');
    row.appendChild(marker);
  }

  function applyPriorityToDom() {
    const container = document.getElementById('emailContainer');
    if (!container) return;
    const items = Array.from(container.querySelectorAll('.email-item'));
    if (!items.length) return;

    const urgent = [];
    const normal = [];

    items.forEach((item, index) => {
      const id = getEmailId(item);
      const info = id ? followUpById.get(id) : null;
      if (info) {
        item.style.backgroundColor = '#FFF4CC';
        item.style.borderLeft = '4px solid #F4B400';
        renderMarker(item, info);
        urgent.push({
          item,
          age: Number(info.daysOld) || 0,
          priorityRank: Number(info.priorityRank) || 0,
          index
        });
      } else {
        item.style.backgroundColor = '';
        if (item.style.borderLeft === '4px solid rgb(244, 180, 0)' || item.style.borderLeft === '4px solid #F4B400') {
          item.style.borderLeft = '';
        }
        clearMarker(item);
        normal.push({ item, index });
      }
    });

    // Oldest stale job-app emails first.
    urgent.sort((a, b) => {
      if (b.priorityRank !== a.priorityRank) return b.priorityRank - a.priorityRank;
      return (b.age - a.age) || (a.index - b.index);
    });
    const reordered = [...urgent.map(x => x.item), ...normal.map(x => x.item)];
    reordered.forEach(node => container.appendChild(node));
  }

  async function refreshFollowUpPriority() {
    if (inflight) return;
    inflight = true;
    try {
      const ids = collectVisibleEmailIds();
      if (!ids.length) return;
      const response = await API.apiCall('/api/job-application-tracker/followup-priority', {
        method: 'POST',
        body: { emailIds: ids }
      });
      if (!response || !response.success || typeof response.followUpByEmailId !== 'object') return;

      followUpById.clear();
      Object.entries(response.followUpByEmailId).forEach(([id, info]) => {
        if (!id || !info) return;
        followUpById.set(id, {
          daysOld: Number(info.daysOld) || 0,
          priorityRank: Number(info.priorityRank) || 0,
          message: safeStr(info.message)
        });
      });
      applyPriorityToDom();
    } catch (error) {
      console.error('Job Application Tracker follow-up refresh failed:', error);
    } finally {
      inflight = false;
    }
  }

  function openTrackerPage() {
    try {
      window.open('/job-application-tracker', '_blank', 'noopener');
    } catch (error) {
      console.error('Job Application Tracker: failed to open page', error);
      API.showError('Failed to open Job Application Tracker.');
    }
  }

  function installDisplayEmailsHook() {
    if (typeof window.displayEmails !== 'function') return;
    const originalDisplayEmails = window.displayEmails;
    window.displayEmails = async function(...args) {
      const out = await originalDisplayEmails.apply(this, args);
      setTimeout(() => { refreshFollowUpPriority(); }, 70);
      return out;
    };
  }

  function initialize() {
    API.addHeaderButton('Job Tracker', openTrackerPage, {
      className: 'generate-btn'
    });

    API.on('emailsLoaded', () => {
      setTimeout(() => { refreshFollowUpPriority(); }, 120);
    });

    installDisplayEmailsHook();
    setTimeout(() => { refreshFollowUpPriority(); }, 250);
    setInterval(() => { refreshFollowUpPriority(); }, 30000);
  }

  initialize();
  console.log('Job Application Tracker: Frontend loaded');
})();
