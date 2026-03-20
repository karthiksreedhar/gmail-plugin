/**
 * Deployment Update Frontend
 * Adds a top "Deployment Update" button that opens a full-window updates page.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('Deployment Update: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;
  const OVERLAY_ID = 'deployment-update-overlay';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    const d = new Date(value || 0);
    if (Number.isNaN(d.getTime())) return 'Unknown date';
    return d.toLocaleString();
  }

  function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'background:#f8fafc',
      'display:none',
      'overflow:auto'
    ].join(';');

    overlay.innerHTML = `
      <div style="min-height:100%; display:flex; flex-direction:column;">
        <div style="position:sticky; top:0; background:#0f172a; color:#fff; padding:16px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px;">
          <div>
            <div style="font-size:22px; font-weight:700;">Deployment Update</div>
            <div style="font-size:13px; opacity:.9; margin-top:2px;">Most recent updates from Deployment Infrastructure emails</div>
          </div>
          <button id="deploymentUpdateCloseBtn" style="background:#1e293b; color:#fff; border:1px solid #334155; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px;">Close</button>
        </div>
        <div id="deploymentUpdateContent" style="padding:20px 24px 28px;"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('#deploymentUpdateCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
      });
    }

    return overlay;
  }

  function renderLoading(container) {
    container.innerHTML = '<div style="font-size:14px; color:#334155;">Loading deployment updates...</div>';
  }

  function renderEmpty(container) {
    container.innerHTML = `
      <div style="padding:16px; background:#fff; border:1px solid #e2e8f0; border-radius:10px; color:#334155;">
        No recent emails found in category <strong>Deployment Infrastructure</strong>.
      </div>
    `;
  }

  function renderError(container, message) {
    container.innerHTML = `
      <div style="padding:16px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; color:#991b1b;">
        ${escapeHtml(message || 'Failed to load deployment updates.')}
      </div>
    `;
  }

  function renderUpdates(container, updates) {
    const cards = (updates || []).map((item) => {
      const subject = escapeHtml(item.subject || 'No Subject');
      const from = escapeHtml(item.from || 'Unknown Sender');
      const date = formatDate(item.date);
      const snippet = escapeHtml(item.snippet || '');

      return `
        <button
          type="button"
          class="deployment-update-card"
          data-email-id="${escapeHtml(item.id)}"
          data-email-subject="${subject}"
          style="
            display:block;
            width:100%;
            text-align:left;
            background:#fff;
            border:1px solid #e2e8f0;
            border-radius:10px;
            padding:14px 16px;
            margin-bottom:10px;
            cursor:pointer;
          "
        >
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
            <div style="font-size:16px; font-weight:650; color:#0f172a;">${subject}</div>
            <div style="font-size:12px; color:#475569; white-space:nowrap;">${escapeHtml(date)}</div>
          </div>
          <div style="font-size:13px; color:#334155; margin-top:4px;">${from}</div>
          <div style="font-size:13px; color:#475569; margin-top:8px; line-height:1.5;">${snippet}</div>
        </button>
      `;
    }).join('');

    container.innerHTML = cards;

    container.querySelectorAll('.deployment-update-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-email-id') || '';
        const subject = card.getAttribute('data-email-subject') || 'Email Thread';
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.style.display = 'none';

        try {
          API.openEmailThread(id, subject);
        } catch (error) {
          console.error('Deployment Update: failed to open thread', error);
          API.showError('Failed to open selected email thread.');
        }
      });
    });
  }

  async function openDeploymentUpdatePage() {
    const overlay = ensureOverlay();
    const content = overlay.querySelector('#deploymentUpdateContent');
    overlay.style.display = 'block';

    renderLoading(content);

    try {
      const data = await API.apiCall('/api/deployment-update/latest?limit=30');
      if (!data || !data.success) {
        renderError(content, data?.error || 'Failed to load deployment updates.');
        return;
      }

      const updates = Array.isArray(data.updates) ? data.updates : [];
      if (!updates.length) {
        renderEmpty(content);
        return;
      }

      renderUpdates(content, updates);
    } catch (error) {
      console.error('Deployment Update: request failed', error);
      renderError(content, 'Failed to load deployment updates.');
    }
  }

  function initialize() {
    API.addHeaderButton('Deployment Update', openDeploymentUpdatePage, {
      className: 'generate-btn'
    });
  }

  initialize();
  console.log('Deployment Update: Frontend loaded');
})();
