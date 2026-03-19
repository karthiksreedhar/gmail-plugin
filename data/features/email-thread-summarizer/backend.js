/**
 * Email Thread Summarizer Backend
 * Adds a 'Summarize' button to each email thread that generates a short summary (max 3 sentences) and lists any identified TODOs.
 */

module.exports = {
  /**
   * Initialize the feature
   * @param {Object} context - Feature context with server resources
   */
  initialize(context) {
    const { app, getUserDoc, openai, getCurrentUser } = context;

    console.log('Email Thread Summarizer: Initializing backend...');

    // Register API route to summarize an email thread
    app.post('/api/email-thread-summarizer/summarize', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { threadId } = req.body;

        if (!threadId) {
          return res.status(400).json({ success: false, error: 'Thread ID is required' });
        }

        console.log(`Email Thread Summarizer: Summarizing thread ${threadId} for user ${user}`);

        // Fetch all emails in the thread
        const thread = await getUserDoc('email_threads', user);
        const normalizedThreadId = String(threadId || '').trim();
        const rawThreadId = normalizedThreadId.startsWith('thread-')
          ? normalizedThreadId.slice('thread-'.length)
          : normalizedThreadId;

        const threadData = (thread?.threads || []).find(t => {
          const candidatePersisted = String(t?.id || '').trim();
          const candidateRaw = String(t?.threadId || '').trim();
          return candidatePersisted === normalizedThreadId || candidateRaw === rawThreadId;
        });

        if (!threadData || !threadData.messages) {
          return res.status(404).json({ success: false, error: 'Thread not found' });
        }

        const messages = threadData.messages;

        // Construct a prompt for OpenAI
        const prompt = `Summarize the following email thread in at most three sentences and list any identified TODOs.
        Email Thread:
        ${messages.map(message => `From: ${message.from}\nSubject: ${message.subject}\nBody: ${message.body}`).join('\n\n')}
        `;

        // Call OpenAI API
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are an email summarization assistant.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 500
        });

        const summary = String(response?.choices?.[0]?.message?.content || '').trim();

        console.log(`Email Thread Summarizer: Summary generated for thread ${threadId}: ${summary}`);

        res.json({ success: true, summary, todos: [] });

      } catch (error) {
        console.error('Email Thread Summarizer: Error summarizing thread:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    console.log('Email Thread Summarizer: Backend initialized');
  }
};
