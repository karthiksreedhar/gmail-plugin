/**
 * Robotics Talk Highlighter Frontend
 * Top-button toggled filter for semantically robotics-related emails.
 */

(function() {
  if (!window.EmailAssistant) {
    console.error('Robotics Talk Highlighter: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;
  const relevanceById = new Map(); // emailId -> { isRoboticsRelated, confidence, reason }
  const pendingIds = new Set();
  let filterActive = false;
  let inflight = false;
  let buttonEl = null;

  function safeStr(value) {
    return String(value || '').trim();
  }

  function getEmailId(emailItem) {
    const notesPreview = emailItem.querySelector('.notes-preview[data-email-notes]');
    if (notesPreview) {
      const fromNotes = safeStr(notesPreview.getAttribute('data-email-notes'));
      if (fromNotes) return fromNotes;
    }
    const deleteBtn = emailItem.querySelector('.delete-thread-btn');
    const onclickRaw = deleteBtn ? safeStr(deleteBtn.getAttribute('onclick')) : '';
    const match = onclickRaw.match(/deleteEmailThread\('([^']+)'/);
    return match && match[1] ? match[1] : '';
  }

  function collectAllVisibleEmailIds() {
    const emailItems = Array.from(document.querySelectorAll('#emailContainer .email-item'));
    const ids = emailItems.map(getEmailId).filter(Boolean);
    return Array.from(new Set(ids));
  }

  function setButtonStateText() {
    if (!buttonEl) return;
    buttonEl.textContent = filterActive ? 'Show All Emails' : 'Robotics Talks';
  }

  function clearRoboticsStyles(emailItem) {
    emailItem.style.borderLeft = '';
    emailItem.style.backgroundColor = '';
    const marker = emailItem.querySelector('.robotics-talk-marker');
    if (marker) marker.remove();
  }

  function addRoboticsStyles(emailItem, reason) {
    clearRoboticsStyles(emailItem);
    emailItem.style.borderLeft = '4px solid #ffc107';
    emailItem.style.backgroundColor = '#fffdf3';

    const metaRow = emailItem.querySelector('.email-meta-row');
    if (!metaRow) return;
    const marker = document.createElement('span');
    marker.className = 'robotics-talk-marker';
    marker.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'margin-left:8px',
      'padding:2px 8px',
      'border-radius:999px',
      'background:#fbbc04',
      'color:#5f370e',
      'font-size:11px',
      'font-weight:700',
      'max-width:320px',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis'
    ].join(';');
    marker.title = reason || 'Robotics-related';
    marker.textContent = 'Robotics-related';
    metaRow.appendChild(marker);
  }

  function applyFilterToDom() {
    const emailItems = Array.from(document.querySelectorAll('#emailContainer .email-item'));
    for (const item of emailItems) {
      const id = getEmailId(item);
      const classification = id ? relevanceById.get(id) : null;
      const related = !!classification?.isRoboticsRelated;

      if (related) addRoboticsStyles(item, classification?.reason);
      else clearRoboticsStyles(item);

      if (filterActive) {
        item.style.display = related ? '' : 'none';
      } else {
        item.style.display = '';
      }
    }
  }

  async function classifyIds(emailIds) {
    const ids = (emailIds || []).filter(Boolean);
    if (!ids.length || inflight) return;

    const unknown = ids.filter(id => !relevanceById.has(id) && !pendingIds.has(id));
    if (!unknown.length) return;

    unknown.forEach(id => pendingIds.add(id));
    inflight = true;
    try {
      const response = await API.apiCall('/api/robotics-talk-highlighter/classify-batch', {
        method: 'POST',
        body: { emailIds: unknown }
      });

      if (response && response.success && response.classificationsByEmailId && typeof response.classificationsByEmailId === 'object') {
        Object.entries(response.classificationsByEmailId).forEach(([id, classification]) => {
          relevanceById.set(id, {
            isRoboticsRelated: !!classification?.isRoboticsRelated,
            confidence: Number(classification?.confidence) || 0,
            reason: safeStr(classification?.reason)
          });
        });
      }
    } catch (error) {
      console.error('Robotics Talk Highlighter classifyIds failed:', error);
    } finally {
      unknown.forEach(id => pendingIds.delete(id));
      inflight = false;
      applyFilterToDom();
    }
  }

  async function toggleRoboticsFilter() {
    const ids = collectAllVisibleEmailIds();
    await classifyIds(ids);

    filterActive = !filterActive;
    setButtonStateText();
    applyFilterToDom();

    if (filterActive) {
      const matched = ids.filter(id => relevanceById.get(id)?.isRoboticsRelated).length;
      API.showSuccess(`Showing ${matched} robotics-related email${matched === 1 ? '' : 's'}.`);
    }
  }

  function installDisplayEmailsHook() {
    if (typeof window.displayEmails !== 'function') return;
    const originalDisplayEmails = window.displayEmails;
    window.displayEmails = async function(...args) {
      const out = await originalDisplayEmails.apply(this, args);
      setTimeout(async () => {
        const ids = collectAllVisibleEmailIds();
        await classifyIds(ids);
        applyFilterToDom();
      }, 80);
      return out;
    };
  }

  async function initialize() {
    API.addHeaderButton('Robotics Talks', toggleRoboticsFilter, {
      className: 'generate-btn'
    });
    buttonEl = Array.from(document.querySelectorAll('button')).find(btn =>
      safeStr(btn.textContent) === 'Robotics Talks' || safeStr(btn.textContent) === 'Show All Emails'
    ) || null;
    setButtonStateText();

    API.on('emailsLoaded', async () => {
      const ids = collectAllVisibleEmailIds();
      await classifyIds(ids);
      applyFilterToDom();
    });

    installDisplayEmailsHook();

    // Warm classification once so button toggle is immediate.
    setTimeout(async () => {
      const ids = collectAllVisibleEmailIds();
      await classifyIds(ids);
      applyFilterToDom();
    }, 180);
  }

  initialize();
  console.log('Robotics Talk Highlighter: Frontend initialized');
})();
