/**
 * Robotics Talk Highlighter Frontend
 * Click-to-scan keyword filter with incremental results.
 */

(function() {
  if (!window.EmailAssistant) {
    console.error('Robotics Talk Highlighter: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;
  const matchById = new Map(); // emailId -> { matched, reason }
  let filterActive = false;
  let scanning = false;
  let scanToken = 0;
  let buttonEl = null;

  // Kept intentionally focused to reduce false positives.
  const KEYWORD_RULES = [
    { label: 'robotics', regex: /\brobotics?\b/i },
    { label: 'vla', regex: /\bvla(s)?\b|\bvision[-\s]?language[-\s]?action\b/i },
    { label: 'manipulation', regex: /\b(robotic\s+)?manipulation\b/i },
    { label: 'motion planning', regex: /\bmotion\s+planning\b/i },
    { label: 'slam', regex: /\bslam\b/i },
    { label: 'ros', regex: /\bros\s?(1|2)?\b/i },
    { label: 'embodied ai', regex: /\bembodied\s+ai\b/i },
    { label: 'humanoid', regex: /\bhumanoid(s)?\b/i }
  ];

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

  function collectEmailItems() {
    return Array.from(document.querySelectorAll('#emailContainer .email-item'));
  }

  function extractSearchText(emailItem) {
    const subject = safeStr(emailItem.querySelector('.email-subject')?.textContent);
    const from = safeStr(emailItem.querySelector('.email-from')?.textContent);
    const snippet = safeStr(emailItem.querySelector('.email-snippet')?.textContent);
    const full = safeStr(emailItem.textContent);
    return `${subject}\n${from}\n${snippet}\n${full}`.toLowerCase();
  }

  function classifyByKeywords(emailItem) {
    const text = extractSearchText(emailItem);
    for (const rule of KEYWORD_RULES) {
      if (rule.regex.test(text)) {
        return { matched: true, reason: `Matched keyword: ${rule.label}` };
      }
    }
    return { matched: false, reason: '' };
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
      'font-weight:700'
    ].join(';');
    marker.title = reason || 'Robotics-related';
    marker.textContent = 'Robotics-related';
    metaRow.appendChild(marker);
  }

  function applyFilterToDom() {
    const emailItems = collectEmailItems();
    for (const item of emailItems) {
      const id = getEmailId(item);
      const matched = !!(id && matchById.get(id)?.matched);
      if (matched) addRoboticsStyles(item, matchById.get(id)?.reason);
      else clearRoboticsStyles(item);

      if (filterActive) item.style.display = matched ? '' : 'none';
      else item.style.display = '';
    }
  }

  function setButtonStateText(progressText) {
    if (!buttonEl) return;
    if (scanning) {
      buttonEl.textContent = progressText || 'Scanning...';
      return;
    }
    buttonEl.textContent = filterActive ? 'Show All Emails' : 'Robotics Talks';
  }

  function setScanningState(next, progressText) {
    scanning = !!next;
    if (buttonEl) buttonEl.disabled = !!next;
    setButtonStateText(progressText);
  }

  async function scanAndFilterIncremental() {
    const token = ++scanToken;
    const items = collectEmailItems();
    if (!items.length) {
      API.showWarning('No emails are currently loaded.');
      return;
    }

    filterActive = true;
    matchById.clear();
    applyFilterToDom(); // hide everything first, then reveal matches as found
    setScanningState(true, `Scanning 0/${items.length}...`);

    let matchedCount = 0;
    for (let i = 0; i < items.length; i++) {
      if (token !== scanToken) return; // canceled or superseded

      const item = items[i];
      const id = getEmailId(item);
      if (id) {
        const result = classifyByKeywords(item);
        matchById.set(id, result);
        if (result.matched) matchedCount += 1;
      }

      applyFilterToDom();
      setButtonStateText(`Scanning ${i + 1}/${items.length}...`);
      await new Promise(resolve => setTimeout(resolve, 15));
    }

    setScanningState(false);
    // Only decide outcome once full scan is done.
    if (matchedCount > 0) {
      API.showSuccess(`Showing ${matchedCount} robotics-related email${matchedCount === 1 ? '' : 's'}.`);
    } else {
      API.showWarning('No robotics emails found after full scan.');
    }
  }

  function clearFilter() {
    scanToken += 1; // cancel any running scan
    filterActive = false;
    setScanningState(false);
    applyFilterToDom();
  }

  async function onButtonClick() {
    if (scanning) return;
    if (filterActive) {
      clearFilter();
      return;
    }
    await scanAndFilterIncremental();
  }

  function installDisplayEmailsHook() {
    if (typeof window.displayEmails !== 'function') return;
    const originalDisplayEmails = window.displayEmails;
    window.displayEmails = async function(...args) {
      const out = await originalDisplayEmails.apply(this, args);
      setTimeout(() => {
        if (filterActive && !scanning) {
          // New DOM content loaded while filter is active; rescan deterministically.
          scanAndFilterIncremental().catch(() => {});
        } else {
          applyFilterToDom();
        }
      }, 80);
      return out;
    };
  }

  function initialize() {
    API.addHeaderButton('Robotics Talks', onButtonClick, {
      className: 'generate-btn'
    });
    buttonEl = Array.from(document.querySelectorAll('button')).find(btn =>
      safeStr(btn.textContent) === 'Robotics Talks' ||
      safeStr(btn.textContent) === 'Show All Emails'
    ) || null;
    setButtonStateText();

    API.on('emailsLoaded', () => {
      if (filterActive && !scanning) {
        scanAndFilterIncremental().catch(() => {});
      } else {
        applyFilterToDom();
      }
    });

    installDisplayEmailsHook();
  }

  initialize();
  console.log('Robotics Talk Highlighter: Frontend initialized');
})();
