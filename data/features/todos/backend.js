/**
 * TODOs Backend
 * Extracts TODO items for email IDs and returns them in batch.
 */

module.exports = {
  initialize(context) {
    const { app, getUserDoc, setUserDoc, invokeGemini, getGeminiModel, getCurrentUser } = context;
    const CACHE_COLLECTION = 'feature_todos_cache';
    const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

    function safeStr(value) {
      return String(value || '').trim();
    }

    function signatureForEmail(email) {
      const subject = safeStr(email?.subject);
      const body = safeStr(email?.body || email?.originalBody || email?.snippet);
      return `${subject}::${body.slice(0, 2000)}`;
    }

    function heuristicTodos(email) {
      const body = safeStr(email?.body || email?.originalBody || email?.snippet);
      if (!body) return [];
      const lines = body
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .slice(0, 120);

      const out = [];
      const bulletRe = /^[-*•]\s+(.+)$/;
      const actionRe = /\b(please|need to|action item|todo|to do|follow up|by\s+\w+day|deadline|send|review|submit|complete|schedule|book)\b/i;
      for (const line of lines) {
        const m = line.match(bulletRe);
        if (m && m[1]) {
          out.push(m[1]);
          continue;
        }
        if (actionRe.test(line) && line.length <= 180) out.push(line);
      }
      return Array.from(new Set(out.map(v => safeStr(v)).filter(Boolean))).slice(0, 5);
    }

    function parseModelTodos(raw, expectedIds) {
      const txt = safeStr(raw);
      const fallback = {};
      (expectedIds || []).forEach(id => { fallback[id] = []; });
      if (!txt) return fallback;

      const fenceMatch = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = fenceMatch ? fenceMatch[1].trim() : txt;
      const jsonMatch = candidate.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : candidate;

      try {
        const parsed = JSON.parse(jsonText);
        const items = Array.isArray(parsed?.items) ? parsed.items : [];
        const out = { ...fallback };
        for (const item of items) {
          const id = safeStr(item?.id);
          if (!id || !out.hasOwnProperty(id)) continue;
          const todos = Array.isArray(item?.todos)
            ? item.todos.map(t => safeStr(t)).filter(Boolean).slice(0, 5)
            : [];
          out[id] = todos;
        }
        return out;
      } catch (_) {
        return fallback;
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

    app.post('/api/todos/extract-batch', async (req, res) => {
      try {
        const userEmail = getCurrentUser();
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
          let modelOutput = {};
          if (typeof invokeGemini === 'function') {
            const payload = missing.map(m => ({
              id: m.id,
              subject: safeStr(m.email?.subject),
              from: safeStr(m.email?.originalFrom || m.email?.from),
              body: safeStr(m.email?.body || m.email?.originalBody || m.email?.snippet).slice(0, 4000)
            }));

            const prompt = `Return strict JSON only.
Shape:
{
  "items": [
    { "id": "email-id", "todos": ["todo 1", "todo 2"] }
  ]
}
Rules:
- Use only IDs provided.
- todos should contain actionable items only.
- If none, return [] for that id.
- Max 5 todos per id.

Emails:
${JSON.stringify(payload, null, 2)}`;

            const completion = await invokeGemini({
              model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.2,
              maxOutputTokens: 900
            });

            modelOutput = parseModelTodos(completion?.content || '', missing.map(m => m.id));
          }

          for (const item of missing) {
            const fromModel = Array.isArray(modelOutput[item.id]) ? modelOutput[item.id] : [];
            const todos = fromModel.length ? fromModel : heuristicTodos(item.email);
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
