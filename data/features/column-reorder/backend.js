/**
 * Drag-and-Drop Column Reorder Backend
 *
 * Persists the user's chosen left-to-right ordering of the inbox layout
 * columns. The frontend sends an array of stable column keys; we store it
 * per user and hand it back on load.
 */

module.exports = {
  /**
   * Initialize the feature.
   * @param {Object} context - Feature context with server resources.
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser } = context;

    console.log('Column Reorder: Initializing backend...');

    // GET - return the saved column order for the current user.
    app.get('/api/column-reorder/order', async (req, res) => {
      try {
        const user = getCurrentUser();
        const doc = await getUserDoc('column_reorder_data', user);
        const order = doc && Array.isArray(doc.order) ? doc.order : [];
        res.json({ success: true, order });
      } catch (error) {
        console.error('Column Reorder: Error getting order:', error);
        res.status(500).json({ success: false, error: 'Failed to load column order' });
      }
    });

    // POST - save the column order for the current user.
    app.post('/api/column-reorder/order', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { order } = req.body || {};

        if (!Array.isArray(order)) {
          return res.status(400).json({ success: false, error: 'order must be an array of column keys' });
        }

        // Keep only string keys and cap the length defensively.
        const clean = order.filter((k) => typeof k === 'string' && k.length > 0).slice(0, 20);

        await setUserDoc('column_reorder_data', user, {
          order: clean,
          updatedAt: new Date().toISOString()
        });

        console.log('Column Reorder: Saved order for ' + user + ' -> [' + clean.join(', ') + ']');

        res.json({ success: true, order: clean });
      } catch (error) {
        console.error('Column Reorder: Error saving order:', error);
        res.status(500).json({ success: false, error: 'Failed to save column order' });
      }
    });

    console.log('Column Reorder: Backend initialized');
  }
};
