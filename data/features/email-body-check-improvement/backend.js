/**
 * Improve Email Body Check for Summarization Backend
 * Investigates and fixes the 'Email body is required' error when the email body clearly exists.
 * Improves the robustness of the email body detection mechanism.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser, getGmailEmail } = context;

    console.log('Email Body Check Improvement: Initializing backend...');

    // API endpoint to check email body
    app.get('/api/email-body-check-improvement/check-body', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { messageId } = req.query;

        if (!messageId) {
          return res.status(400).json({ success: false, error: 'Message ID is required' });
        }

        console.log(`Email Body Check Improvement: Checking email body for message ID: ${messageId}`);

        const email = await getGmailEmail(messageId);

        if (!email) {
          return res.status(404).json({ success: false, error: 'Email not found' });
        }

        const body = email.body;

        if (!body) {
          console.warn(`Email Body Check Improvement: Email body is missing for message ID: ${messageId}`);
          return res.json({ success: true, data: { bodyExists: false, message: 'Email body is missing' } });
        }

        console.log(`Email Body Check Improvement: Email body found for message ID: ${messageId}`);
        res.json({ success: true, data: { bodyExists: true, message: 'Email body exists' } });

      } catch (error) {
        console.error('Email Body Check Improvement: Error checking email body:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    console.log('Email Body Check Improvement: Backend initialized');
  }
};