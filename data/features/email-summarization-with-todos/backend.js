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
    const { app, getUserDoc, invokeGemini, getGeminiModel, getCurrentUser } = context;

    console.log('Email Summarization with To-Do Extraction: Initializing backend...');

    async function resolveEmailBodyForUser(userEmail, emailId, explicitBody) {
      const fromBody = String(explicitBody || '').trim();
      if (fromBody) return fromBody;

      const normalizedId = String(emailId || '').trim();
      if (!normalizedId) return '';

      try {
        const responseDoc = await getUserDoc('response_emails', userEmail);
        const emails = Array.isArray(responseDoc?.emails) ? responseDoc.emails : [];
        const found = emails.find(e => String(e?.id || '').trim() === normalizedId);
        if (found) {
          const body = String(found.body || found.originalBody || found.snippet || '').trim();
          if (body) return body;
        }
      } catch (_) {}

      try {
        const threadDoc = await getUserDoc('email_threads', userEmail);
        const threads = Array.isArray(threadDoc?.threads) ? threadDoc.threads : [];
        const foundThread = threads.find(t => String(t?.responseId || '').trim() === normalizedId || String(t?.id || '').trim() === normalizedId);
        const messages = Array.isArray(foundThread?.messages) ? foundThread.messages : [];
        for (const msg of messages) {
          const body = String(msg?.body || '').trim();
          if (body) return body;
        }
      } catch (_) {}

      return '';
    }

    function parseSummaryAndTodos(rawText) {
      const text = String(rawText || '').trim();
      if (!text) return { summary: '', todos: [] };

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const summary = String(parsed?.summary || '').trim();
          const todos = Array.isArray(parsed?.todos)
            ? parsed.todos.map(t => String(t || '').trim()).filter(Boolean)
            : [];
          if (summary || todos.length) return { summary, todos };
        } catch (_) {}
      }

      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const todoRegex = /^[-*•]\s+(.+)$/;
      const todos = [];
      const nonTodoLines = [];

      for (const line of lines) {
        const match = line.match(todoRegex);
        if (match && match[1]) {
          todos.push(match[1].trim());
        } else {
          nonTodoLines.push(line);
        }
      }

      const summary = nonTodoLines[0] || text;
      return { summary, todos };
    }

    // Register API route for email summarization
    app.post('/api/email-summarization-with-todos/summarize', async (req, res) => {
      try {
        const user = getCurrentUser();
        const { emailBody, emailId, subject, from } = req.body || {};
        const resolvedBody = await resolveEmailBodyForUser(user, emailId, emailBody);

        if (!resolvedBody) {
          return res.status(400).json({ success: false, error: 'Email body is required' });
        }

        // Generate summary and extract to-dos using Gemini
        const prompt = `You will analyze one email and respond with strict JSON.
Return exactly this shape:
{
  "summary": "one sentence summary",
  "todos": ["todo 1", "todo 2"]
}
Rules:
- summary must be exactly one sentence.
- todos must be an array of concrete action items; use [] if none.
- no markdown, no commentary.

Sender: ${String(from || '').trim() || 'Unknown'}
Subject: ${String(subject || '').trim() || 'No subject'}
Body:
${resolvedBody}`;

        const response = await invokeGemini({
          model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          maxOutputTokens: 500
        });

        const parsed = parseSummaryAndTodos(response?.content || '');
        const summary = parsed.summary || 'Summary unavailable.';
        const todos = Array.isArray(parsed.todos) ? parsed.todos : [];

        res.json({ success: true, data: { summary, todos } });

      } catch (error) {
        console.error('Email Summarization with To-Do Extraction: Error summarizing email:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    console.log('Email Summarization with To-Do Extraction: Backend initialized');
  }
};
