/**
 * Jira Card Interface Backend
 * Provides a dedicated interface within the Gmail plugin to view and manage Jira cards associated with the user's account.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser } = context;

    console.log('Jira Card Interface: Initializing backend...');

    // GET - Fetch Jira cards
    app.get('/api/jira-card-interface/cards', async (req, res) => {
      try {
        const user = getCurrentUser();
        const doc = await getUserDoc('jira_card_interface_data', user);
        const cards = doc?.cards || [];

        res.json({
          success: true,
          data: cards
        });
      } catch (error) {
        console.error('Jira Card Interface: Error getting Jira cards:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to load Jira cards'
        });
      }
    });

    // POST - Save Jira cards
    app.post('/api/jira-card-interface/cards', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { cards } = req.body;

        if (!cards) {
          return res.status(400).json({
            success: false,
            error: 'Jira cards are required'
          });
        }

        await setUserDoc('jira_card_interface_data', user, {
          cards,
          updatedAt: new Date().toISOString()
        });

        console.log('Jira Card Interface: Jira cards saved successfully');

        res.json({ success: true, message: 'Jira cards saved' });
      } catch (error) {
        console.error('Jira Card Interface: Error saving Jira cards:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to save Jira cards'
        });
      }
    });

    // GET - Fetch a specific Jira card by ID
    app.get('/api/jira-card-interface/cards/:cardId', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { cardId } = req.params;

        const doc = await getUserDoc('jira_card_interface_data', user);
        const cards = doc?.cards || [];

        const card = cards.find(c => c.id === cardId);

        if (!card) {
          return res.status(404).json({
            success: false,
            error: 'Jira card not found'
          });
        }

        res.json({
          success: true,
          data: card
        });
      } catch (error) {
        console.error('Jira Card Interface: Error getting Jira card:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to load Jira card'
        });
      }
    });

    console.log('Jira Card Interface: Backend initialized');
  }
};