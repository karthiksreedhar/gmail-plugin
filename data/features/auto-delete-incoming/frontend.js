/**
 * Auto-Delete Incoming Email Frontend
 *
 * Adds an "Auto-Delete Inbox" header button that opens a control panel. From
 * there the user can turn automatic deletion ON/OFF, choose Trash vs Permanent,
 * and run a manual purge. While enabled AND the plugin is open, a short poller
 * repeatedly asks the backend to delete everything currently in the inbox, so
 * any newly arrived email is removed on the next pass.
 *
 * Safety: the feature ships OFF. Turning it on requires typing DELETE to
 * confirm. There is no background process when the plugin is closed.
 */

(function () {
  console.log('Auto-Delete Incoming Email: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Auto-Delete Incoming Email: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  // How often (ms) to run an automatic purge pass while enabled.
  const POLL_INTERVAL_MS = 15000;

  // Local mirror of the server-side settings/stats.
  const state = {
    enabled: false,
    mode: 'trash',
    deletedCount: 0,
    lastRunAt: null,
    lastError: null
  };

  let pollTimer = null;
  let purgeInFlight = false;

  // --- Backend communication -------------------------------------------

  async function loadSettings() {
    try {
      const res = await API.apiCall('/api/auto-delete-incoming/settings');
      if (res && res.success && res.data) {
        Object.assign(state, res.data);
      }
    } catch (error) {
      console.error('Auto-Delete Incoming Email: Failed to load settings:', error);
    }
  }

  async function saveSettings(patch) {
    const res = await API.apiCall('/api/auto-delete-incoming/settings', {
      method: 'POST',
      body: patch
    });
    if (res && res.success && res.data) {
      Object.assign(state, res.data);
    }
    return res;
  }

  async function runPurge(manual) {
    // Prevent overlapping passes.
    if (purgeInFlight) return null;
    purgeInFlight = true;
    try {
      const res = await API.apiCall('/api/auto-delete-incoming/purge', {
        method: 'POST',
        body: { manual: !!manual }
      });

      if (res && res.data) {
        Object.assign(state, res.data);
      }

      // A missing-scope or auth problem will fail every pass. Stop the local
      // poller so we don't spam the API, and tell the user what to do.
      if (res && (res.needsScope || res.needsAuth)) {
        stopPolling();
        state.enabled = false;
        API.showError(res.error || 'Deletion failed. Automatic deletion has been paused.');
      }

      refreshPanel();
      return res;
    } catch (error) {
      console.error('Auto-Delete Incoming Email: Purge request failed:', error);
      return null;
    } finally {
      purgeInFlight = false;
    }
  }

  // --- Poller ----------------------------------------------------------

  function startPolling() {
    if (pollTimer) return;
    // Kick off an immediate pass, then continue on the interval.
    runPurge(false);
    pollTimer = setInterval(() => {
      if (state.enabled) runPurge(false);
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // --- UI --------------------------------------------------------------

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusHtml() {
    const enabledBadge = state.enabled
      ? '<span style="color:#fff;background:#dc3545;padding:2px 10px;border-radius:12px;font-weight:600;">ON</span>'
      : '<span style="color:#fff;background:#6c757d;padding:2px 10px;border-radius:12px;font-weight:600;">OFF</span>';
    const modeLabel = state.mode === 'permanent' ? 'Permanent (irreversible)' : 'Trash (recoverable ~30 days)';
    const last = state.lastRunAt ? new Date(state.lastRunAt).toLocaleString() : 'never';
    const err = state.lastError
      ? `<div style="margin-top:8px;color:#dc3545;font-size:13px;"><strong>Last error:</strong> ${escapeHtml(state.lastError)}</div>`
      : '';
    return `
      <div style="background:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px;padding:12px;margin-bottom:16px;font-size:14px;">
        <div style="margin-bottom:6px;">Status: ${enabledBadge}</div>
        <div style="margin-bottom:6px;">Mode: <strong>${escapeHtml(modeLabel)}</strong></div>
        <div style="margin-bottom:6px;">Total deleted (this account): <strong>${Number(state.deletedCount) || 0}</strong></div>
        <div>Last purge: <strong>${escapeHtml(last)}</strong></div>
        ${err}
      </div>
    `;
  }

  function refreshPanel() {
    const el = document.getElementById('auto-del-status');
    if (el) el.innerHTML = statusHtml();
  }

  function buildPanelHtml() {
    const trashChecked = state.mode !== 'permanent' ? 'checked' : '';
    const permChecked = state.mode === 'permanent' ? 'checked' : '';
    const enabledChecked = state.enabled ? 'checked' : '';

    return `
      <div style="max-width:560px;">
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px;margin-bottom:16px;color:#664d03;font-size:14px;">
          <strong>Warning:</strong> When enabled, this repeatedly deletes
          <em>every email currently in your inbox</em> while the plugin is open,
          so newly arriving mail is removed within a few seconds. This is
          destructive. Permanent mode cannot be undone.
        </div>

        <div id="auto-del-status">${statusHtml()}</div>

        <div style="margin-bottom:16px;">
          <label style="font-weight:600;display:block;margin-bottom:8px;">Deletion mode</label>
          <label style="display:block;margin-bottom:6px;cursor:pointer;">
            <input type="radio" name="auto-del-mode" value="trash" ${trashChecked}>
            Move to Trash — recoverable for ~30 days (needs "gmail.modify" scope)
          </label>
          <label style="display:block;cursor:pointer;">
            <input type="radio" name="auto-del-mode" value="permanent" ${permChecked}>
            Permanently delete — cannot be recovered (needs full "mail.google.com" scope)
          </label>
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-weight:600;display:block;margin-bottom:8px;">Automatic deletion</label>
          <label style="display:block;margin-bottom:8px;cursor:pointer;">
            <input type="checkbox" id="auto-del-enabled" ${enabledChecked}>
            Continuously delete incoming inbox email while the plugin is open
          </label>
          <div style="font-size:13px;color:#555;margin-bottom:8px;">
            To enable, type <strong>DELETE</strong> to confirm:
          </div>
          <input type="text" id="auto-del-confirm" placeholder="type DELETE"
                 style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;border-top:1px solid #eee;padding-top:16px;">
          <button class="generate-btn" style="background:#6c757d;"
                  onclick="window.__autoDelPurgeNow()">Purge inbox now</button>
          <button class="generate-btn" style="background:#6c757d;"
                  onclick="this.closest('.modal').remove()">Close</button>
          <button class="generate-btn" onclick="window.__autoDelSave()">Save settings</button>
        </div>
      </div>
    `;
  }

  function openPanel() {
    // Refresh from server first so the panel reflects current state.
    loadSettings().finally(() => {
      API.showModal(buildPanelHtml(), 'Auto-Delete Incoming Email');
    });
  }

  function readModeFromDom() {
    const checked = document.querySelector('input[name="auto-del-mode"]:checked');
    return checked && checked.value === 'permanent' ? 'permanent' : 'trash';
  }

  // --- Global handlers for modal buttons -------------------------------

  window.__autoDelSave = async function () {
    try {
      const mode = readModeFromDom();
      const enabledEl = document.getElementById('auto-del-enabled');
      const wantEnabled = !!(enabledEl && enabledEl.checked);

      if (wantEnabled) {
        const confirmEl = document.getElementById('auto-del-confirm');
        const typed = (confirmEl && confirmEl.value || '').trim();
        if (typed !== 'DELETE') {
          API.showError('Type DELETE in the confirmation box to enable automatic deletion.');
          return;
        }
      }

      const res = await saveSettings({ enabled: wantEnabled, mode });
      if (!res || !res.success) {
        API.showError((res && res.error) || 'Failed to save settings.');
        return;
      }

      if (state.enabled) {
        startPolling();
        API.showSuccess('Auto-delete is ON. Incoming inbox email will be deleted while the plugin is open.');
      } else {
        stopPolling();
        API.showSuccess('Auto-delete is OFF. Settings saved.');
      }

      refreshPanel();
    } catch (error) {
      console.error('Auto-Delete Incoming Email: Save failed:', error);
      API.showError('Failed to save settings.');
    }
  };

  window.__autoDelPurgeNow = function () {
    // Reflect the mode currently selected in the panel before purging.
    const mode = readModeFromDom();
    const label = mode === 'permanent' ? 'PERMANENTLY delete' : 'move to Trash';
    API.showConfirm(
      `This will ${label} every email currently in your inbox. Continue?`,
      async () => {
        // Persist the chosen mode so the purge uses it, then run manually.
        await saveSettings({ mode });
        const res = await runPurge(true);
        if (res && res.success && !res.skipped) {
          API.showSuccess(`Purge complete: ${res.deleted || 0} message(s) removed.`);
        } else if (res && res.success && res.skipped) {
          API.showSuccess('Nothing to delete.');
        }
      }
    );
  };

  // --- Init ------------------------------------------------------------

  async function initialize() {
    try {
      await loadSettings();

      API.addHeaderButton('Auto-Delete Inbox', openPanel, {
        style: { marginRight: '12px', background: '#dc3545' }
      });

      // If it was left enabled, resume purging (only while the page is open).
      if (state.enabled) {
        startPolling();
      }

      // Also purge right after a fresh sync brings new mail in.
      API.on('emailsLoaded', () => {
        if (state.enabled) runPurge(false);
      });

      console.log('Auto-Delete Incoming Email: Frontend initialized successfully');
    } catch (error) {
      console.error('Auto-Delete Incoming Email: Initialization failed:', error);
    }
  }

  initialize();

  console.log('Auto-Delete Incoming Email: Frontend loaded successfully');
})();
