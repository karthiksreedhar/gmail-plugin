/**
 * Email Summarizer and ToDo Extractor Backend
 * Adds a 'Summarize' button to each email thread that, when clicked, opens a popup with a one-sentence summary and a list of extracted ToDos.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, setUserDoc, invokeGemini, getCurrentUser, getGeminiModel } = context;

    console.log('Email Summarizer and ToDo Extractor: Initializing backend...');

    // API endpoint to summarize an email thread
    app.post('/api/email-summarizer-and-todo-extractor/summarize', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { emailBody } = req.body;

        if (!emailBody) {
          return res.status(400).json({ success: false, error: 'Email body is required' });
        }

        const prompt = `Summarize the following email in one sentence and extract any actionable ToDos in bullet points. If there are no ToDos, write "None".\n\n${emailBody}`;

        const response = await invokeGemini({
          model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          maxOutputTokens: 500
        });

        const summary = response.content;

        res.json({ success: true, data: { summary } });

      } catch (error) {
        console.error('Email Summarizer and ToDo Extractor: Error summarizing email:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    console.log('Email Summarizer and ToDo Extractor: Backend initialized');
  }
};