/**
 * See Events Frontend
 * Adds a top "See Events" button and a full-window events page.
 */

(function () {
  if (!window.EmailAssistant) {
    console.error('See Events: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;
  const OVERLAY_ID = 'see-events-overlay';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    if (!iso) return 'Date unknown';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Date unknown';
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
        <div style="position:sticky; top:0; z-index:2; background:#0f172a; color:#fff; padding:16px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px;">
          <div>
            <div style="font-size:22px; font-weight:700;">See Events</div>
            <div style="font-size:13px; opacity:.9; margin-top:2px;">Recent and upcoming meetings/events inferred from recent inbox emails</div>
          </div>
          <button id="seeEventsCloseBtn" style="background:#1e293b; color:#fff; border:1px solid #334155; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px;">Close</button>
        </div>
        <div id="seeEventsContent" style="padding:20px 24px 28px;"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('#seeEventsCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
      });
    }

    return overlay;
  }

  function renderLoading(container) {
    container.innerHTML = '<div style="font-size:14px; color:#334155;">Loading events...</div>';
  }

  function renderError(container, message) {
    container.innerHTML = `
      <div style="padding:16px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; color:#991b1b;">
        ${escapeHtml(message || 'Failed to load events.')}
      </div>
    `;
  }

  function renderEmpty(container) {
    container.innerHTML = `
      <div style="padding:16px; background:#fff; border:1px solid #e2e8f0; border-radius:10px; color:#334155;">
        No recent or upcoming meeting/event emails were detected.
      </div>
    `;
  }

  function eventCardHtml(item) {
    const subject = escapeHtml(item.subject || 'No Subject');
    const from = escapeHtml(item.from || 'Unknown Sender');
    const when = escapeHtml(formatDate(item.eventDate || item.receivedDate));
    const received = escapeHtml(formatDate(item.receivedDate));

    return `
      <button
        type="button"
        class="see-events-card"
        data-email-id="${escapeHtml(item.id)}"
        data-email-subject="${subject}"
        style="
          display:block;
          width:100%;
          text-align:left;
          background:#fff;
          border:1px solid #e2e8f0;
          border-radius:10px;
          padding:12px 14px;
          margin-bottom:8px;
          cursor:pointer;
        "
      >
        <div style="font-size:15px; color:#0f172a; font-weight:650; line-height:1.4;">${subject}</div>
        <div style="font-size:12px; color:#475569; margin-top:6px;">${from}</div>
        <div style="font-size:12px; color:#334155; margin-top:2px;">Event time: ${when}</div>
        <div style="font-size:12px; color:#64748b; margin-top:2px;">Email received: ${received}</div>
      </button>
    `;
  }

  function renderSection(title, items) {
    const list = (items || []).map(eventCardHtml).join('');
    return `
      <section style="margin-bottom:20px;">
        <h2 style="font-size:16px; font-weight:700; color:#0f172a; margin:0 0 10px;">${escapeHtml(title)} (${items.length})</h2>
        ${list || '<div style="font-size:13px; color:#64748b;">None</div>'}
      </section>
    `;
  }

  function wireEventCardClicks(root) {
    root.querySelectorAll('.see-events-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-email-id') || '';
        const subject = card.getAttribute('data-email-subject') || 'Email Thread';
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.style.display = 'none';

        try {
          API.openEmailThread(id, subject);
        } catch (error) {
          console.error('See Events: failed to open thread', error);
          API.showError('Failed to open selected email thread.');
        }
      });
    });
  }

  async function openSeeEventsPage() {
    const overlay = ensureOverlay();
    const content = overlay.querySelector('#seeEventsContent');
    overlay.style.display = 'block';

    renderLoading(content);

    try {
      const data = await API.apiCall('/api/see-events/list?limit=80');
      if (!data || !data.success) {
        renderError(content, data?.error || 'Failed to load events.');
        return;
      }

      const upcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
      const recent = Array.isArray(data.recent) ? data.recent : [];
      if (!upcoming.length && !recent.length) {
        renderEmpty(content);
        return;
      }

      content.innerHTML = [
        renderSection('Upcoming', upcoming),
        renderSection('Recent', recent)
      ].join('');

      wireEventCardClicks(content);
    } catch (error) {
      console.error('See Events: request failed', error);
      renderError(content, 'Failed to load events.');
    }
  }

  function initialize() {
    API.addHeaderButton('See Events', openSeeEventsPage, {
      className: 'generate-btn'
    });
  }

  initialize();
  console.log('See Events: Frontend loaded');
})();
