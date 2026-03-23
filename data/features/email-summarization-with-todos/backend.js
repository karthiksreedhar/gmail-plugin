/**
 * Email Summarization with To-Do Extraction Backend
 * Adds a 'Summarize' button to each email thread that generates a one-sentence summary and extracts to-do items using Gemini.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, invokeGemini, getGeminiModel, getCurrentUser } = context;

    console.log('Email Summarization with To-Do Extraction: Initializing backend...');

    // Register API route for email summarization
    app.post('/api/email-summarization-with-todos/summarize', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { emailBody } = req.body;

        if (!emailBody) {
          return res.status(400).json({ success: false, error: 'Email body is required' });
        }

        // Generate summary and extract to-dos using Gemini
        const prompt = `Summarize the following email in one sentence and extract any to-do items as bullet points. If there are no to-do items, write "None".\n\n${emailBody}`;

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
        console.error('Email Summarization with To-Do Extraction: Error summarizing email:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    console.log('Email Summarization with To-Do Extraction: Backend initialized');
  }
};