/**
 * Column Controls (Reorder & Minimize) Backend
 *
 * Persists the user's inbox-column layout preferences:
 *   - order:     array of stable column keys, left -> right
 *   - minimized: array of column keys that are currently collapsed
 *
 * The frontend sends the full state; we store it per user and hand it back on
 * load.
 */

module.exports = {
  /**
   * Initialize the feature.
   * @param {Object} context - Feature context with server resources.
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser } = context;

    console.log('Column Controls: Initializing backend...');

    // GET - return the saved column state for the current user.
    app.get('/api/column-reorder/state', async (req, res) => {
      try {
        const user = getCurrentUser();
        const doc = await getUserDoc('column_reorder_data', user);
        const order = doc && Array.isArray(doc.order) ? doc.order : [];
        const minimized = doc && Array.isArray(doc.minimized) ? doc.minimized : [];
        res.json({ success: true, order, minimized });
      } catch (error) {
        console.error('Column Controls: Error getting state:', error);
        res.status(500).json({ success: false, error: 'Failed to load column state' });
      }
    });

    // POST - save the column state for the current user.
    app.post('/api/column-reorder/state', async (req, res) => {
      try {
        const user = getCurrentUser();
        const body = req.body || {};

        const cleanKeys = (arr) =>
          Array.isArray(arr)
            ? arr.filter((k) => typeof k === 'string' && k.length > 0).slice(0, 20)
            : [];

        const order = cleanKeys(body.order);
        const minimized = cleanKeys(body.minimized);

        await setUserDoc('column_reorder_data', user, {
          order,
          minimized,
          updatedAt: new Date().toISOString()
        });

        console.log(
          'Column Controls: Saved state for ' + user +
          ' -> order [' + order.join(', ') + '], minimized [' + minimized.join(', ') + ']'
        );

        res.json({ success: true, order, minimized });
      } catch (error) {
        console.error('Column Controls: Error saving state:', error);
        res.status(500).json({ success: false, error: 'Failed to save column state' });
      }
    });

    console.log('Column Controls: Backend initialized');
  }
};
