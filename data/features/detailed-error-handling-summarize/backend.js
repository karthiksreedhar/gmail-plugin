/**
 * Detailed Summarization Error Handling Backend
 * Improves error reporting for the email summarization feature to provide more specific reasons for failure.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, invokeGemini, getCurrentUser, getGmailEmail, cleanResponseBody } = context;

    console.log('Detailed Summarization Error Handling: Initializing backend...');

    // Route to summarize a specific email
    app.post('/api/detailed-error-handling-summarize/summarize-email', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { emailId } = req.body;

        if (!emailId) {
          return res.status(400).json({ success: false, error: 'Email ID is required' });
        }

        // Fetch the email content
        let email;
        try {
          email = await getGmailEmail(emailId);
          if (!email) {
            return res.status(404).json({ success: false, error: 'Email not found' });
          }
        } catch (gmailError) {
          console.error('Detailed Summarization Error Handling: Error fetching email from Gmail:', gmailError);
          return res.status(500).json({ success: false, error: 'Failed to fetch email from Gmail: ' + gmailError.message });
        }

        if (!email || !email.payload || !email.payload.parts) {
          return res.status(400).json({ success: false, error: 'Invalid email format: Missing payload or parts' });
        }

        let emailBody = '';
        try {
          emailBody = await cleanResponseBody(email);
          if (!emailBody) {
            return res.status(400).json({ success: false, error: 'Email body is empty after cleaning' });
          }
        } catch (cleanError) {
          console.error('Detailed Summarization Error Handling: Error cleaning email body:', cleanError);
          return res.status(500).json({ success: false, error: 'Failed to clean email body: ' + cleanError.message });
        }

        if (!emailBody) {
          return res.status(400).json({ success: false, error: 'Email body is missing' });
        }

        // Generate summary using Gemini
        let summary;
        try {
          const response = await invokeGemini({
            model: context.getGeminiModel(),
            messages: [
              { role: 'system', content: 'You are an email summarization expert. Provide a concise summary of the email content.' },
              { role: 'user', content: emailBody }
            ],
            temperature: 0.5,
            maxOutputTokens: 500
          });

          summary = response.content;
          if (!summary) {
            return res.status(500).json({ success: false, error: 'Gemini failed to generate a summary' });
          }
        } catch (geminiError) {
          console.error('Detailed Summarization Error Handling: Gemini API error:', geminiError);
          return res.status(500).json({ success: false, error: 'Gemini API error: ' + geminiError.message });
        }

        res.json({ success: true, data: { summary } });

      } catch (error) {
        console.error('Detailed Summarization Error Handling: Unexpected error:', error);
        res.status(500).json({ success: false, error: 'Unexpected error: ' + error.message });
      }
    });

    console.log('Detailed Summarization Error Handling: Backend initialized');
  }
};