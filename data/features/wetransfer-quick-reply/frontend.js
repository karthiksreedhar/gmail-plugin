/**
 * WeTransfer Quick Reply Frontend
 * Adds a "Quick Reply" button to emails categorized as WeTransfer.
 * Clicking the button copies the configured response template.
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

  function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) {
          reject(new Error('copy_command_failed'));
          return;
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  async function handleQuickReplyClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    try {
      await copyText(REPLY_TEMPLATE);
      API.showSuccess('Quick reply copied to clipboard.');
    } catch (error) {
      console.error('WeTransfer Quick Reply: copy failed', error);
      API.showError('Failed to copy quick reply.');
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
