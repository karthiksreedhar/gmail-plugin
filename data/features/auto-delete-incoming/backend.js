/**
 * Auto-Delete Incoming Email Backend
 *
 * Deletes emails that are currently in the Gmail inbox. Because Gmail has no
 * server-side "on new mail" webhook available to this plugin, deletion runs as
 * repeated "purge passes": each pass lists messages still in the inbox and
 * removes them (Trash or Permanent, per the user's setting). The frontend calls
 * the purge endpoint on a short interval (and after each email sync) while the
 * plugin is open, so any email that lands in the inbox is deleted on the next
 * pass.
 *
 * IMPORTANT SCOPE NOTE:
 * The host app currently authorizes only `gmail.readonly` + `gmail.send`.
 * Gmail's API requires `gmail.modify` to Trash a message and the full
 * `https://mail.google.com/` scope to permanently delete one. A feature cannot
 * widen the app's OAuth scopes (that lives in server.js). If the scope is
 * missing, the Gmail API returns HTTP 403 "insufficient permission" and this
 * backend surfaces a clear message asking the operator to add the scope and the
 * user to re-authorize. All the deletion logic below is correct and will start
 * working the moment the broader scope is granted.
 */

module.exports = {
  /**
   * Initialize the feature.
   * @param {Object} context - Feature context with server resources.
   */
  initialize(context) {
    const { app, gmail, searchGmailEmails, getUserDoc, setUserDoc, getCurrentUser } = context;

    console.log('Auto-Delete Incoming Email: Initializing backend...');

    const COLLECTION = 'auto_delete_incoming_data';

    // Max messages listed per purge pass. Trash processes these one-by-one;
    // Permanent uses a single batchDelete. Repeated passes clear larger inboxes.
    const FETCH_LIMIT = 100;
    const TRASH_MAX_PER_PASS = 50;

    const DEFAULT_SETTINGS = { enabled: false, mode: 'trash' };

    // --- Helpers ---------------------------------------------------------

    function normalizeMode(mode) {
      return mode === 'permanent' ? 'permanent' : 'trash';
    }

    async function getState(userEmail) {
      const doc = await getUserDoc(COLLECTION, userEmail);
      return {
        enabled: !!(doc && doc.enabled),
        mode: normalizeMode(doc && doc.mode),
        deletedCount: (doc && Number(doc.deletedCount)) || 0,
        lastRunAt: (doc && doc.lastRunAt) || null,
        lastError: (doc && doc.lastError) || null
      };
    }

    async function saveState(userEmail, patch) {
      const current = await getState(userEmail);
      const next = { ...current, ...patch };
      await setUserDoc(COLLECTION, userEmail, next);
      return next;
    }

    // Detect a Gmail "missing OAuth scope" / permission error so we can give
    // the user an actionable message instead of a generic 500.
    function isScopeError(err) {
      const status = err && (err.code || (err.response && err.response.status));
      let detail = '';
      try {
        detail = (err && err.message ? err.message : '') + ' ' +
          JSON.stringify((err && err.response && err.response.data) || (err && err.errors) || '');
      } catch (_) {
        detail = (err && err.message) || '';
      }
      return status === 403 || /insufficient|scope|permission|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(detail);
    }

    const SCOPE_HELP =
      'Gmail rejected the delete request because this app is only authorized to ' +
      'read and send mail. Deletion requires the "gmail.modify" scope (for Trash) ' +
      'or full "mail.google.com" scope (for Permanent). Ask the operator to add ' +
      'the scope in the server OAuth config, then sign out and sign back in to ' +
      're-authorize.';

    /**
     * Perform one purge pass over the current inbox.
     * @returns {Object} { attempted, deleted, needsAuth, needsScope, error }
     */
    async function purgeInbox(mode) {
      const gmailClient = await gmail();
      if (!gmailClient) {
        return { attempted: 0, deleted: 0, needsAuth: true };
      }

      // List messages still sitting in the inbox.
      let refs = [];
      try {
        refs = await searchGmailEmails('in:inbox', FETCH_LIMIT);
      } catch (err) {
        if (isScopeError(err)) return { attempted: 0, deleted: 0, needsScope: true };
        throw err;
      }

      const ids = (Array.isArray(refs) ? refs : [])
        .map(r => r && r.id)
        .filter(Boolean);

      if (ids.length === 0) {
        return { attempted: 0, deleted: 0 };
      }

      let deleted = 0;

      if (mode === 'permanent') {
        try {
          await gmailClient.users.messages.batchDelete({
            userId: 'me',
            requestBody: { ids }
          });
          deleted = ids.length;
        } catch (err) {
          if (isScopeError(err)) {
            return { attempted: ids.length, deleted: 0, needsScope: true };
          }
          throw err;
        }
        return { attempted: ids.length, deleted };
      }

      // Trash mode: no batch endpoint, so trash sequentially (capped per pass).
      const toProcess = ids.slice(0, TRASH_MAX_PER_PASS);
      for (const id of toProcess) {
        try {
          await gmailClient.users.messages.trash({ userId: 'me', id });
          deleted += 1;
        } catch (err) {
          if (isScopeError(err)) {
            return { attempted: toProcess.length, deleted, needsScope: true };
          }
          // Skip individual failures (e.g. message already gone) and continue.
          console.error('Auto-Delete Incoming Email: Failed to trash message', id, err && err.message);
        }
      }

      return { attempted: toProcess.length, deleted };
    }

    // --- Routes ----------------------------------------------------------

    // GET current settings + stats.
    app.get('/api/auto-delete-incoming/settings', async (req, res) => {
      try {
        const user = getCurrentUser();
        if (!user) {
          return res.status(400).json({ success: false, error: 'User email not found.' });
        }
        const state = await getState(user);
        res.json({ success: true, data: state });
      } catch (error) {
        console.error('Auto-Delete Incoming Email: Error getting settings:', error);
        res.status(500).json({ success: false, error: 'Failed to load settings.' });
      }
    });

    // POST update settings (enable/disable, mode).
    app.post('/api/auto-delete-incoming/settings', async (req, res) => {
      try {
        const user = getCurrentUser();
        if (!user) {
          return res.status(400).json({ success: false, error: 'User email not found.' });
        }

        const body = req.body || {};
        const patch = {};
        if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
        if (typeof body.mode === 'string') patch.mode = normalizeMode(body.mode);

        const next = await saveState(user, patch);
        console.log(
          `Auto-Delete Incoming Email: Settings updated for ${user} ` +
          `(enabled=${next.enabled}, mode=${next.mode})`
        );
        res.json({ success: true, data: next });
      } catch (error) {
        console.error('Auto-Delete Incoming Email: Error saving settings:', error);
        res.status(500).json({ success: false, error: 'Failed to save settings.' });
      }
    });

    // POST run a purge pass now. Automatic (poller) calls omit `manual` and are
    // gated by the stored `enabled` flag; manual calls set manual=true and run
    // regardless so the user can test with a single explicit click.
    app.post('/api/auto-delete-incoming/purge', async (req, res) => {
      try {
        const user = getCurrentUser();
        if (!user) {
          return res.status(400).json({ success: false, error: 'User email not found.' });
        }

        const manual = !!(req.body && req.body.manual);
        const state = await getState(user);

        if (!manual && !state.enabled) {
          return res.json({ success: true, skipped: true, reason: 'disabled', data: state });
        }

        const result = await purgeInbox(state.mode);

        if (result.needsAuth) {
          return res.status(401).json({
            success: false,
            needsAuth: true,
            error: 'Gmail authorization required. Please sign in again.'
          });
        }

        if (result.needsScope) {
          const next = await saveState(user, { lastError: SCOPE_HELP });
          return res.status(403).json({
            success: false,
            needsScope: true,
            error: SCOPE_HELP,
            data: next
          });
        }

        const next = await saveState(user, {
          deletedCount: state.deletedCount + result.deleted,
          lastRunAt: new Date().toISOString(),
          lastError: null
        });

        console.log(
          `Auto-Delete Incoming Email: Purge (${state.mode}) for ${user} ` +
          `attempted=${result.attempted}, deleted=${result.deleted}`
        );

        res.json({
          success: true,
          data: next,
          mode: state.mode,
          attempted: result.attempted,
          deleted: result.deleted,
          // If we hit the trash per-pass cap and still filled it, more may remain.
          moreLikely: state.mode === 'trash' && result.attempted >= TRASH_MAX_PER_PASS
        });
      } catch (error) {
        console.error('Auto-Delete Incoming Email: Error during purge:', error);
        res.status(500).json({ success: false, error: error.message || 'Purge failed.' });
      }
    });

    console.log('Auto-Delete Incoming Email: Backend initialized');
  }
};
