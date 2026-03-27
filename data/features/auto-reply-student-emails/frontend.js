/**
 * Auto Reply Student Emails Frontend
 * Adds quick reply buttons to UI 4170 emails and pre-fills a response template.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('Auto Reply Student Emails: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;
  const BUTTON_CLASS = 'auto-reply-student-emails-btn';
  const TARGET_CATEGORIES = new Set(['ui 4170', 'ui4170']);

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  function stripHtml(value) {
    return String(value || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isTargetCategoryEmail(emailItem) {
    const pills = Array.from(emailItem.querySelectorAll('.email-categories .email-category'));
    if (!pills.length) return false;
    return pills.some((pill) => TARGET_CATEGORIES.has(normalize(pill.textContent)));
  }

  function getEmailId(emailItem) {
    const deleteBtn = emailItem.querySelector('.delete-thread-btn');
    const onclickAttr = deleteBtn ? String(deleteBtn.getAttribute('onclick') || '') : '';
    if (!onclickAttr) return '';
    const match = onclickAttr.match(/deleteEmailThread\('([^']+)'/);
    return match && match[1] ? match[1] : '';
  }

  function getEmailSubject(emailItem) {
    const subjectEl = emailItem.querySelector('.email-subject');
    return String(subjectEl?.textContent || '').trim() || 'Email Thread';
  }

  function getDisplaySender(emailItem) {
    const senderEl = emailItem.querySelector('.email-from');
    const raw = String(senderEl?.textContent || '').replace(/open in inbox/i, '').trim();
    return raw || 'there';
  }

  function toNameCase(input) {
    return String(input || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  function deriveSenderName(fromValue, fallbackDisplayName) {
    const from = String(fromValue || '').trim();
    let name = '';

    if (from.includes('<')) {
      name = from.split('<')[0].trim().replace(/^"|"$/g, '');
    } else if (from.includes('@')) {
      const local = from.split('@')[0];
      name = local.replace(/[._-]+/g, ' ').trim();
    } else {
      name = from;
    }

    if (!name) {
      name = String(fallbackDisplayName || '').trim();
    }
    if (!name) return 'there';

    const full = toNameCase(name);
    const first = full.split(/\s+/).filter(Boolean)[0] || 'there';
    if (first.length <= 3) return first.toUpperCase();
    return first;
  }

  function waitFor(conditionFn, timeoutMs = 10000, intervalMs = 80) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        let ok = false;
        try {
          ok = !!conditionFn();
        } catch (_) {}
        if (ok) {
          clearInterval(timer);
          resolve(true);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('timeout'));
        }
      }, intervalMs);
    });
  }

  function setTemplateAsGeneratedResponse(template) {
    const responseArea = document.getElementById('generatedResponseArea');
    const responseDisplay = document.getElementById('responseDisplay');
    const responseEditor = document.getElementById('responseEditor');
    const refineSection = document.getElementById('refineSection');

    if (!responseArea || !responseDisplay || !responseEditor || !refineSection) {
      throw new Error('generate_response_ui_missing');
    }

    responseArea.style.display = 'block';
    refineSection.style.display = 'block';
    responseDisplay.innerHTML = String(template).replace(/\n/g, '<br>');
    responseDisplay.style.display = 'block';
    responseEditor.style.display = 'none';

    if (typeof window.enableResponseEditing === 'function' && typeof window.saveResponseEdit === 'function') {
      window.enableResponseEditing();
      responseEditor.value = template;
      window.saveResponseEdit();
    }
  }

  function getLatestIncomingMessage(ctx) {
    const messages = Array.isArray(ctx?.messages) ? ctx.messages.slice() : [];
    if (!messages.length) return null;
    const sorted = messages.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    return [...sorted].reverse().find((m) => !m.isResponse) || sorted[sorted.length - 1] || null;
  }

  function extractAssignment(text) {
    const src = String(text || '');
    const patterns = [
      /\b(homework|hw|assignment|project|pset|problem set)\s*#?\s*([a-z0-9._-]+)/i,
      /\b(midterm|final|quiz)\s*#?\s*([a-z0-9._-]+)/i
    ];
    for (const pattern of patterns) {
      const m = src.match(pattern);
      if (m) {
        const first = String(m[1] || '').replace(/\s+/g, ' ').trim();
        const second = String(m[2] || '').trim();
        const label = [first, second].filter(Boolean).join(' ');
        if (label) return label;
      }
    }
    return 'the assignment';
  }

  function classifyEmail(body, subject) {
    const text = `${String(subject || '')}\n${String(body || '')}`.toLowerCase();
    const extension = /\b(extension|extend|extended|late|deadline extension|submit late|late submission|grace period|need more time)\b/.test(text);
    if (extension) {
      return { type: 'extension', assignment: extractAssignment(`${subject}\n${body}`) };
    }
    const slackIssue = /\b(slack|workspace|channel|invite link|join link|cannot join|can't join|not working|login issue)\b/.test(text);
    if (slackIssue) {
      return { type: 'slack' };
    }
    return { type: 'logistics' };
  }

  function buildTemplate(senderName, classification) {
    if (classification.type === 'extension') {
      return [
        `Hi ${senderName},`,
        '',
        `No worries, you can submit ${classification.assignment} when you are able.`,
        '',
        'Thanks,',
        'Riya'
      ].join('\n');
    }
    if (classification.type === 'slack') {
      return [
        `Hi ${senderName},`,
        '',
        "Yeah, I've been getting a lot of similar emails from other students and I'm working on figuring out the issue.",
        '',
        'For now, please check the announcements page on CourseWorks for updates.',
        '',
        'Thanks,',
        'Riya'
      ].join('\n');
    }
    return [
      `Hi ${senderName},`,
      '',
      'Please check the announcements page on CourseWorks for updates.',
      '',
      'Thanks,',
      'Riya'
    ].join('\n');
  }

  async function handleQuickReplyClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    try {
      const emailItem = ev.currentTarget?.closest('.email-item');
      if (!emailItem) throw new Error('email_item_not_found');

      const emailId = getEmailId(emailItem);
      const subject = getEmailSubject(emailItem);
      const fallbackDisplayName = getDisplaySender(emailItem);
      if (!emailId) throw new Error('email_id_not_found');

      if (typeof window.openEmailThread !== 'function' || typeof window.replyToCurrentThread !== 'function') {
        throw new Error('thread_actions_unavailable');
      }

      await window.openEmailThread(emailId, subject);
      await waitFor(
        () => window.currentThreadContext && window.currentThreadContext.emailId === emailId,
        12000,
        90
      );

      const latestIncoming = getLatestIncomingMessage(window.currentThreadContext || {});
      const senderName = deriveSenderName(latestIncoming?.from, fallbackDisplayName);
      const bodyText = stripHtml(latestIncoming?.body || latestIncoming?.snippet || '');
      const kind = classifyEmail(bodyText, subject);
      const template = buildTemplate(senderName, kind);

      window.replyToCurrentThread();
      await waitFor(
        () => document.getElementById('generatedResponseArea') && document.getElementById('responseDisplay'),
        6000,
        60
      );

      setTemplateAsGeneratedResponse(template);
      API.showSuccess(kind.type === 'extension'
        ? 'Extension quick reply template loaded.'
        : 'Logistics quick reply template loaded.');
    } catch (error) {
      console.error('Auto Reply Student Emails: open/prefill failed', error);
      API.showError('Failed to open student quick reply template.');
    }
  }

  function addButtons() {
    const emailItems = Array.from(document.querySelectorAll('.email-item'));
    if (!emailItems.length) return;

    emailItems.forEach((emailItem) => {
      if (!isTargetCategoryEmail(emailItem)) return;

      const actions = emailItem.querySelector('.email-actions');
      if (!actions) return;
      if (actions.querySelector(`.${BUTTON_CLASS}`)) return;

      const btn = document.createElement('button');
      btn.className = BUTTON_CLASS;
      btn.type = 'button';
      btn.textContent = 'Quick Reply';
      btn.style.cssText = [
        'background:#1a73e8',
        'color:#fff',
        'border:none',
        'padding:8px 12px',
        'border-radius:4px',
        'cursor:pointer',
        'font-size:13px',
        'margin-right:8px'
      ].join(';');
      btn.addEventListener('click', handleQuickReplyClick);

      const deleteBtn = actions.querySelector('.delete-thread-btn');
      if (deleteBtn) {
        actions.insertBefore(btn, deleteBtn);
      } else {
        actions.appendChild(btn);
      }
    });
  }

  function initialize() {
    setTimeout(addButtons, 120);
    setInterval(addButtons, 1600);

    if (typeof window.displayEmails === 'function') {
      const originalDisplayEmails = window.displayEmails;
      window.displayEmails = async function (...args) {
        const out = await originalDisplayEmails.apply(this, args);
        setTimeout(addButtons, 80);
        return out;
      };
    }
  }

  initialize();
  console.log('Auto Reply Student Emails: Frontend loaded');
})();
