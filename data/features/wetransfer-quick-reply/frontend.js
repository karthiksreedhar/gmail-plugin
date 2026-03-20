/**
 * WeTransfer Quick Reply Frontend
 * Adds a "Quick Reply" button to emails categorized as WeTransfer.
 * Clicking the button opens the inline Generate Response flow and pre-fills
 * the generated response with the configured template.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('WeTransfer Quick Reply: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;
  const BUTTON_CLASS = 'wetransfer-quick-reply-btn';
  const TARGET_CATEGORY = 'wetransfer';
  const REPLY_TEMPLATE = [
    'Hi,',
    '',
    'Thanks for sharing the files – I will come by to pick up the negatives within the next few weeks!',
    '',
    'Thanks,',
    'Karthik'
  ].join('\n');

  function isWeTransferCategory(emailItem) {
    const pills = Array.from(emailItem.querySelectorAll('.email-categories .email-category'));
    if (!pills.length) return false;
    return pills.some((pill) => String(pill.textContent || '').trim().toLowerCase() === TARGET_CATEGORY);
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

  function waitFor(conditionFn, timeoutMs = 8000, intervalMs = 60) {
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

    // Keep core app's internal `currentGeneratedResponse` in sync by routing
    // through existing edit/save handlers.
    if (typeof window.enableResponseEditing === 'function' && typeof window.saveResponseEdit === 'function') {
      window.enableResponseEditing();
      responseEditor.value = template;
      window.saveResponseEdit();
    }
  }

  async function handleQuickReplyClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    try {
      const emailItem = ev.currentTarget?.closest('.email-item');
      if (!emailItem) throw new Error('email_item_not_found');

      const emailId = getEmailId(emailItem);
      const subject = getEmailSubject(emailItem);
      if (!emailId) throw new Error('email_id_not_found');

      if (typeof window.openEmailThread !== 'function' || typeof window.replyToCurrentThread !== 'function') {
        throw new Error('thread_actions_unavailable');
      }

      await window.openEmailThread(emailId, subject);
      await waitFor(() => window.currentThreadContext && window.currentThreadContext.emailId === emailId, 10000, 80);
      window.replyToCurrentThread();
      await waitFor(() => document.getElementById('generatedResponseArea') && document.getElementById('responseDisplay'), 5000, 50);

      setTemplateAsGeneratedResponse(REPLY_TEMPLATE);
      API.showSuccess('Quick reply template loaded in Generate Response.');
    } catch (error) {
      console.error('WeTransfer Quick Reply: open/prefill failed', error);
      API.showError('Failed to open Quick Reply template.');
    }
  }

  function addButtons() {
    const emailItems = Array.from(document.querySelectorAll('.email-item'));
    if (!emailItems.length) return;

    emailItems.forEach((emailItem) => {
      if (!isWeTransferCategory(emailItem)) return;

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
    setTimeout(addButtons, 100);
    setInterval(addButtons, 1500);

    if (typeof window.displayEmails === 'function') {
      const originalDisplayEmails = window.displayEmails;
      window.displayEmails = async function (...args) {
        const out = await originalDisplayEmails.apply(this, args);
        setTimeout(addButtons, 50);
        return out;
      };
    }
  }

  initialize();
  console.log('WeTransfer Quick Reply: Frontend loaded');
})();
