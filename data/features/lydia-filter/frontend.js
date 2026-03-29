/**
 * Lydia Filter Frontend
 * Adds a header button to show only Lydia emails, with segmented sub-filters.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('lydia-filter: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;
  const SEGMENT = {
    ALL: 'all',
    PROJECTS: 'projects',
    AKIFY: 'akify',
    OTHER: 'other'
  };

  const SEGMENT_LABELS = {
    [SEGMENT.ALL]: 'All Lydia',
    [SEGMENT.PROJECTS]: 'Projects',
    [SEGMENT.AKIFY]: 'Akify',
    [SEGMENT.OTHER]: 'Other'
  };

  let filterActive = false;
  let activeSegment = SEGMENT.ALL;
  let buttonEl = null;

  function safeStr(value) {
    return String(value || '').trim();
  }

  function normalize(value) {
    return safeStr(value).toLowerCase();
  }

  function parseSender(fromRaw) {
    const text = safeStr(fromRaw);
    if (!text) return { name: '', email: '' };

    const angle = text.match(/^(.*?)<([^>]+)>/);
    if (angle) {
      return {
        name: safeStr(angle[1]).replace(/^"|"$/g, ''),
        email: normalize(angle[2])
      };
    }

    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) {
      return { name: '', email: normalize(emailMatch[0]) };
    }

    return { name: text, email: '' };
  }

  function senderHaystack(email) {
    const parsed = parseSender(email?.originalFrom || email?.from || email?.sender || '');
    return [
      parsed.name,
      parsed.email,
      email?.originalFrom,
      email?.from,
      email?.sender,
      email?.fromName
    ].map(normalize).filter(Boolean).join(' | ');
  }

  function isLydiaEmail(email) {
    const hay = senderHaystack(email);
    if (!hay) return false;

    if (hay.includes('lydia chilton') || hay.includes('lydia b. chilton')) return true;
    if (hay.includes('lydia') && hay.includes('chilton')) return true;

    return false;
  }

  function emailText(email) {
    return [
      email?.subject,
      email?.originalSubject,
      email?.snippet,
      email?.body,
      email?.originalBody
    ].map(normalize).filter(Boolean).join('\n');
  }

  function classifyLydiaEmail(email) {
    const text = emailText(email);

    const isAkify = /\bakify\b/.test(text);
    if (isAkify) return SEGMENT.AKIFY;

    const isProject = /(experience\s+editing|constraints?\s+project|project\s+with\s+baishakhi|baishakhi)/.test(text);
    if (isProject) return SEGMENT.PROJECTS;

    return SEGMENT.OTHER;
  }

  function getAllEmails() {
    return Array.isArray(API.getEmails()) ? API.getEmails() : [];
  }

  function getLydiaEmails() {
    return getAllEmails().filter(isLydiaEmail);
  }

  function filterBySegment(emails, segment) {
    if (segment === SEGMENT.ALL) return emails;
    return emails.filter((email) => classifyLydiaEmail(email) === segment);
  }

  function getSegmentCounts() {
    const lydiaEmails = getLydiaEmails();
    const counts = {
      [SEGMENT.ALL]: lydiaEmails.length,
      [SEGMENT.PROJECTS]: 0,
      [SEGMENT.AKIFY]: 0,
      [SEGMENT.OTHER]: 0
    };

    for (const email of lydiaEmails) {
      const group = classifyLydiaEmail(email);
      counts[group] += 1;
    }

    return counts;
  }

  function currentFilterLabel() {
    if (!filterActive) return 'All';
    return `Lydia · ${SEGMENT_LABELS[activeSegment]}`;
  }

  function updateCurrentFilterLabel() {
    const el = document.getElementById('currentFilter');
    if (el) el.textContent = currentFilterLabel();
  }

  function setHeaderButtonText() {
    if (!buttonEl) return;
    buttonEl.textContent = filterActive ? 'Show All Emails' : 'Lydia Filter';
  }

  function ensureMenuContainer() {
    const existing = document.getElementById('lydiaFilterMenu');
    if (existing) return existing;

    const emailContainer = document.getElementById('emailContainer');
    if (!emailContainer || !emailContainer.parentElement) return null;

    const menu = document.createElement('div');
    menu.id = 'lydiaFilterMenu';
    menu.style.cssText = [
      'display:none',
      'padding:10px 12px',
      'margin:8px 0 10px 0',
      'border:1px solid #d8dde6',
      'border-radius:10px',
      'background:#f7f9fc',
      'font-size:13px'
    ].join(';');

    emailContainer.parentElement.insertBefore(menu, emailContainer);
    return menu;
  }

  function renderSegmentMenu() {
    const menu = ensureMenuContainer();
    if (!menu) return;

    if (!filterActive) {
      menu.style.display = 'none';
      return;
    }

    const counts = getSegmentCounts();
    menu.style.display = 'flex';
    menu.style.alignItems = 'center';
    menu.style.gap = '8px';
    menu.style.flexWrap = 'wrap';

    const order = [SEGMENT.ALL, SEGMENT.PROJECTS, SEGMENT.AKIFY, SEGMENT.OTHER];
    menu.innerHTML = order.map((segment) => {
      const selected = segment === activeSegment;
      const baseStyle = selected
        ? 'background:#1a73e8;color:#fff;border-color:#1a73e8;'
        : 'background:#fff;color:#1f2937;border-color:#cfd8e3;';

      return `<button data-lydia-segment="${segment}" style="padding:6px 10px;border:1px solid;border-radius:999px;cursor:pointer;font-size:12px;font-weight:600;${baseStyle}">${SEGMENT_LABELS[segment]} (${counts[segment] || 0})</button>`;
    }).join('');

    menu.querySelectorAll('button[data-lydia-segment]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = safeStr(btn.getAttribute('data-lydia-segment'));
        if (!next || next === activeSegment) return;
        activeSegment = next;
        applyFilter();
      });
    });
  }

  function applyFilter(showToast = false) {
    const all = getAllEmails();

    if (!filterActive) {
      API.displayEmails(all);
      updateCurrentFilterLabel();
      renderSegmentMenu();
      setHeaderButtonText();
      return;
    }

    const lydiaEmails = getLydiaEmails();
    const filtered = filterBySegment(lydiaEmails, activeSegment);
    API.displayEmails(filtered);

    const displayedCount = document.getElementById('displayedCount');
    if (displayedCount) displayedCount.textContent = String(filtered.length);

    updateCurrentFilterLabel();
    renderSegmentMenu();
    setHeaderButtonText();

    if (showToast) {
      API.showSuccess(`Showing ${filtered.length} ${SEGMENT_LABELS[activeSegment]} email${filtered.length === 1 ? '' : 's'} from Lydia.`);
    }
  }

  function toggleFilter() {
    filterActive = !filterActive;
    if (!filterActive) {
      activeSegment = SEGMENT.ALL;
    }
    applyFilter(true);
  }

  function installDisplayHook() {
    if (typeof window.displayEmails !== 'function') return;
    const original = window.displayEmails;
    window.displayEmails = async function (...args) {
      const out = await original.apply(this, args);
      setTimeout(() => {
        if (filterActive) {
          applyFilter(false);
        } else {
          renderSegmentMenu();
        }
      }, 80);
      return out;
    };
  }

  function initialize() {
    API.addHeaderButton('Lydia Filter', toggleFilter, {
      className: 'generate-btn'
    });

    buttonEl = Array.from(document.querySelectorAll('button')).find((btn) => {
      const label = safeStr(btn.textContent);
      return label === 'Lydia Filter' || label === 'Show All Emails';
    }) || null;

    setHeaderButtonText();
    renderSegmentMenu();

    API.on('emailsLoaded', () => {
      if (filterActive) {
        applyFilter(false);
      } else {
        renderSegmentMenu();
      }
    });

    installDisplayHook();
  }

  initialize();
  console.log('lydia-filter: Frontend initialized');
})();
