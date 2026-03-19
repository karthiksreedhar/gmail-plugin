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
    const { app, getUserDoc, invokeGemini, getGeminiModel, getCurrentUser } = context;
    function extractFirstSentence(text) {
      const normalized = String(text || '').replace(/\s+/g, ' ').trim();
      if (!normalized) return '';
      const match = normalized.match(/^[^.!?]+[.!?]/);
      return (match ? match[0] : normalized).trim();
    }

    function parseSummarizerPayload(raw) {
      const fallback = {
        summary: extractFirstSentence(raw) || 'No summary generated.',
        todos: ['No apparent TODOs']
      };
      const source = String(raw || '').trim();
      if (!source) return fallback;

      const fenceMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = fenceMatch ? fenceMatch[1].trim() : source;
      const jsonBlockMatch = candidate.match(/\{[\s\S]*\}/);
      const jsonText = (jsonBlockMatch ? jsonBlockMatch[0] : candidate).trim();

      try {
        const parsed = JSON.parse(jsonText);
        const summary = extractFirstSentence(parsed?.summary) || fallback.summary;
        const todosRaw = Array.isArray(parsed?.todos) ? parsed.todos : [];
        const todos = todosRaw
          .map(item => String(item || '').trim())
          .filter(Boolean);
        return {
          summary,
          todos: todos.length > 0 ? todos : ['No apparent TODOs']
        };
      } catch (_) {
        return fallback;
      }
    }

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

        if (typeof invokeGemini !== 'function') {
          return res.status(500).json({ success: false, error: 'Gemini client is not available in feature context' });
        }

        // Construct a prompt for Gemini
        const prompt = `Analyze the following email thread and return STRICT JSON only.

Required JSON shape:
{
  "summary": "One sentence maximum summary.",
  "todos": ["TODO item 1", "TODO item 2"]
}

Rules:
- "summary" must be at most one sentence.
- "todos" must be a bullet-list equivalent as an array of strings.
- If there are no apparent TODOs, set todos to ["No apparent TODOs"] exactly.
- Do not include markdown or any text outside JSON.

Email Thread:
${messages.map(message => `From: ${message.from}\nSubject: ${message.subject}\nBody: ${message.body}`).join('\n\n')}
`;

        // Call Gemini API
        const completion = await invokeGemini({
          model: (typeof getGeminiModel === 'function' ? getGeminiModel() : undefined),
          messages: [
            { role: 'system', content: 'You are an email summarization assistant.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          maxOutputTokens: 500
        });

        const modelRaw = String(completion?.content || '').trim();
        const parsed = parseSummarizerPayload(modelRaw);

        console.log(`Email Thread Summarizer: Summary generated for thread ${threadId}: ${parsed.summary}`);

        res.json({ success: true, summary: parsed.summary, todos: parsed.todos });

      } catch (error) {
        console.error('Email Thread Summarizer: Error summarizing thread:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    console.log('Email Thread Summarizer: Backend initialized');
  }
};
