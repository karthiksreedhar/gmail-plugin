/**
 * TODOs Backend
 * Extracts TODO items for email IDs and returns them in batch.
 */

module.exports = {
  initialize(context) {
    const { app, getUserDoc, setUserDoc, invokeGemini, getGeminiModel, getCurrentUser, normalizeUserEmailForData } = context;
    const CACHE_COLLECTION = 'feature_todos_cache';
    const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
    const TODO_SCHEMA_VERSION = 'v3_match_email_thread_summarizer';

    function safeStr(value) {
      return String(value || '').trim();
    }

    function signatureForEmail(email) {
      const subject = safeStr(email?.subject);
      const body = safeStr(email?.body || email?.originalBody || email?.snippet);
      return `${TODO_SCHEMA_VERSION}::${subject}::${body.slice(0, 2000)}`;
    }

    function parseSummarizerStyleTodos(raw) {
      const source = safeStr(raw);
      if (!source) return [];

      const fenceMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = fenceMatch ? fenceMatch[1].trim() : source;
      const jsonBlockMatch = candidate.match(/\{[\s\S]*\}/);
      const jsonText = (jsonBlockMatch ? jsonBlockMatch[0] : candidate).trim();

      try {
        const parsed = JSON.parse(jsonText);
        const todosRaw = Array.isArray(parsed?.todos) ? parsed.todos : [];
        const cleaned = todosRaw
          .map(item => safeStr(item))
          .filter(Boolean)
          .slice(0, 5);
        return cleaned.length > 0 ? cleaned : ['No apparent TODOs'];
      } catch (_) {
        return [];
      }
    }

    async function loadEmailMapForUser(userEmail, emailIds) {
      const wanted = new Set((emailIds || []).map(safeStr).filter(Boolean));
      const map = new Map();
      if (!wanted.size) return map;

      const responsesDoc = await getUserDoc('response_emails', userEmail).catch(() => null);
      const responses = Array.isArray(responsesDoc?.emails) ? responsesDoc.emails : [];
      for (const e of responses) {
        const id = safeStr(e?.id);
        if (!id || !wanted.has(id)) continue;
        map.set(id, e);
      }

      if (map.size === wanted.size) return map;

      const threadsDoc = await getUserDoc('email_threads', userEmail).catch(() => null);
      const threads = Array.isArray(threadsDoc?.threads) ? threadsDoc.threads : [];
      for (const t of threads) {
        const responseId = safeStr(t?.responseId);
        if (responseId && wanted.has(responseId) && !map.has(responseId)) {
          const messages = Array.isArray(t?.messages) ? t.messages : [];
          const firstWithBody = messages.find(m => safeStr(m?.body));
          map.set(responseId, {
            id: responseId,
            subject: t?.subject || firstWithBody?.subject || '',
            body: firstWithBody?.body || '',
            snippet: ''
          });
        }
      }
      return map;
    }

    async function getCache(userEmail) {
      const doc = await getUserDoc(CACHE_COLLECTION, userEmail).catch(() => null);
      return doc && typeof doc.itemsByEmailId === 'object' ? doc.itemsByEmailId : {};
    }

    async function setCache(userEmail, itemsByEmailId) {
      await setUserDoc(CACHE_COLLECTION, userEmail, { itemsByEmailId });
    }

    function resolveUserEmail(req) {
      const override = safeStr(req?.body?.userEmail);
      const fromReq = override || safeStr(getCurrentUser());
      if (!fromReq) return '';
      if (typeof normalizeUserEmailForData === 'function') {
        return normalizeUserEmailForData(fromReq);
      }
      return fromReq.toLowerCase();
    }

    async function computeTodosForMissingItems(missingItems) {
      const out = {};
      for (const item of missingItems) {
        let todos = [];
        if (typeof invokeGemini === 'function') {
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
From: ${safeStr(item.email?.originalFrom || item.email?.from)}
Subject: ${safeStr(item.email?.subject)}
Body: ${safeStr(item.email?.body || item.email?.originalBody || item.email?.snippet).slice(0, 6000)}
`;

          try {
            const completion = await invokeGemini({
              model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
              messages: [
                { role: 'system', content: 'You are an email summarization assistant.' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.3,
              maxOutputTokens: 500
            });
            todos = parseSummarizerStyleTodos(completion?.content || '');
          } catch (_) {
            todos = [];
          }
        }
        out[item.id] = todos;
      }
      return out;
    }

    app.post('/api/todos/cached-batch', async (req, res) => {
      try {
        const userEmail = resolveUserEmail(req);
        const idsInput = Array.isArray(req.body?.emailIds) ? req.body.emailIds : [];
        const emailIds = Array.from(new Set(idsInput.map(safeStr).filter(Boolean))).slice(0, 50);
        if (!emailIds.length) {
          return res.status(400).json({ success: false, error: 'emailIds are required' });
        }
        const cache = await getCache(userEmail);
        const todosByEmailId = {};
        for (const id of emailIds) {
          const cached = cache[id];
          todosByEmailId[id] = Array.isArray(cached?.todos) ? cached.todos : null;
        }
        return res.json({ success: true, todosByEmailId });
      } catch (error) {
        console.error('TODOs cached-batch error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to load cached TODOs' });
      }
    });

    app.post('/api/todos/extract-batch', async (req, res) => {
      try {
        const userEmail = resolveUserEmail(req);
        const idsInput = Array.isArray(req.body?.emailIds) ? req.body.emailIds : [];
        const emailIds = Array.from(new Set(idsInput.map(safeStr).filter(Boolean))).slice(0, 25);
        if (!emailIds.length) {
          return res.status(400).json({ success: false, error: 'emailIds are required' });
        }

        const emailMap = await loadEmailMapForUser(userEmail, emailIds);
        const cache = await getCache(userEmail);
        const now = Date.now();
        const todosByEmailId = {};
        const missing = [];

        for (const id of emailIds) {
          const email = emailMap.get(id);
          if (!email) {
            todosByEmailId[id] = [];
            continue;
          }
          const sig = signatureForEmail(email);
          const cached = cache[id];
          const cachedAt = cached?.updatedAt ? new Date(cached.updatedAt).getTime() : 0;
          const isFresh = cached && cached.signature === sig && (now - cachedAt) < CACHE_MAX_AGE_MS;
          if (isFresh) {
            todosByEmailId[id] = Array.isArray(cached.todos) ? cached.todos : [];
          } else {
            missing.push({ id, email, signature: sig });
          }
        }

        if (missing.length) {
          const generated = await computeTodosForMissingItems(missing);
          for (const item of missing) {
            const todos = Array.isArray(generated[item.id]) ? generated[item.id] : [];
            todosByEmailId[item.id] = todos;
            cache[item.id] = {
              todos,
              signature: item.signature,
              updatedAt: new Date().toISOString()
            };
          }
          await setCache(userEmail, cache).catch(() => {});
        }

        return res.json({ success: true, todosByEmailId });
      } catch (error) {
        console.error('TODOs feature backend error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to extract TODOs' });
      }
    });

    console.log('TODOs: Backend initialized');
  }
};
