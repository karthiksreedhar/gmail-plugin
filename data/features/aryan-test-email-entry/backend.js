/**
 * Summarize Email Entry Backend
 * Moves the summarize button to be next to each email entry and fixes the 'Failed to summarize emails' error.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, invokeGemini, getGeminiModel, getCurrentUser } = context;

    console.log('Summarize Email Entry: Initializing backend...');

    // Example API endpoint (replace with your actual logic)
    app.get('/api/aryan-test-email-entry/summarize', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { emailId } = req.query;

        if (!emailId) {
          return res.status(400).json({ success: false, error: 'Email ID is required' });
        }

        // Fetch email data (replace with your actual data retrieval)
        const priorityEmailsDoc = await getUserDoc('priority_emails', user);
        const emails = priorityEmailsDoc?.emails || [];
        const email = emails.find(e => e.id === emailId);

        if (!email) {
          return res.status(404).json({ success: false, error: 'Email not found' });
        }

        // Generate summary and todos using Gemini
        const prompt = `Summarize the following email in one sentence and extract any TODOs as bullet points. If there are no TODOs, write "None".\n\nEmail Subject: ${email.subject}\nEmail Body: ${email.body}`;

        const response = await invokeGemini({
          model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          maxOutputTokens: 500
        });

        const summary = response.content;

        res.json({ success: true, data: { summary } });

      } catch (error) {
        console.error('Summarize Email Entry: Error summarizing email:', error);
        res.status(500).json({ success: false, error: 'Failed to summarize email' });
      }
    });

    console.log('Summarize Email Entry: Backend initialized');
  }
};