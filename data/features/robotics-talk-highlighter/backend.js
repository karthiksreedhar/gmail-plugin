/**
 * Robotics Talk Highlighter Backend
 * Semantic classifier for robotics-related email filtering.
 */

module.exports = {
  initialize(context) {
    const {
      app,
      getUserDoc,
      setUserDoc,
      getCurrentUser,
      normalizeUserEmailForData,
      invokeGemini,
      getGeminiModel
    } = context;

    const CACHE_COLLECTION = 'feature_robotics_talk_cache';
    const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
    const CLASSIFIER_VERSION = 'v2_semantic_robotics_talk_filter';

    function safeStr(value) {
      return String(value || '').trim();
    }

    function resolveUserEmail(req) {
      const override = safeStr(req?.body?.userEmail);
      const fromReq = override || safeStr(getCurrentUser());
      if (!fromReq) return '';
      if (typeof normalizeUserEmailForData === 'function') return normalizeUserEmailForData(fromReq);
      return fromReq.toLowerCase();
    }

    function signatureForEmail(email) {
      const subject = safeStr(email?.subject);
      const body = safeStr(email?.body || email?.originalBody || email?.snippet);
      return `${CLASSIFIER_VERSION}::${subject}::${body.slice(0, 2500)}`;
    }

    async function getCache(userEmail) {
      const doc = await getUserDoc(CACHE_COLLECTION, userEmail).catch(() => null);
      return doc && typeof doc.itemsByEmailId === 'object' ? doc.itemsByEmailId : {};
    }

    async function setCache(userEmail, itemsByEmailId) {
      await setUserDoc(CACHE_COLLECTION, userEmail, { itemsByEmailId });
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
        const responseId = safeStr(t?.responseId || t?.id);
        if (!responseId || !wanted.has(responseId) || map.has(responseId)) continue;

        const messages = Array.isArray(t?.messages) ? t.messages : [];
        const latest = messages[messages.length - 1] || {};
        map.set(responseId, {
          id: responseId,
          subject: safeStr(latest?.subject || t?.subject),
          body: safeStr(latest?.body || latest?.originalBody || ''),
          snippet: safeStr(latest?.snippet || t?.snippet || ''),
          originalFrom: safeStr(latest?.originalFrom || latest?.from || t?.originalFrom || t?.from)
        });
      }

      return map;
    }

    function heuristicClassify(email) {
      const text = `${safeStr(email?.subject)}\n${safeStr(email?.body || email?.originalBody || email?.snippet)}`.toLowerCase();
      const roboticsSignals = [
        'robotics', 'robot', 'autonomous', 'manipulation', 'locomotion', 'slam', 'ros',
        'embodied ai', 'vla', 'vision-language-action', 'humanoid', 'drone', 'control policy',
        'motion planning', 'path planning', 'reinforcement learning for control', 'grasp'
      ];
      const eventSignals = ['talk', 'seminar', 'colloquium', 'lecture', 'workshop', 'speaker', 'presentation', 'invited talk'];
      const hasRobotics = roboticsSignals.some(k => text.includes(k));
      const hasEvent = eventSignals.some(k => text.includes(k));
      const isRelated = hasRobotics && (hasEvent || text.includes('lab') || text.includes('research'));
      return {
        isRoboticsRelated: isRelated,
        confidence: isRelated ? 0.72 : 0.22,
        reason: isRelated ? 'Keyword+context heuristic match for robotics topic.' : 'No strong robotics talk signals found.'
      };
    }

    function parseJson(raw) {
      const source = safeStr(raw);
      if (!source) return null;
      const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = fenced ? fenced[1].trim() : source;
      const block = candidate.match(/\{[\s\S]*\}/);
      try {
        return JSON.parse(block ? block[0] : candidate);
      } catch (_) {
        return null;
      }
    }

    async function classifyMissingItems(missingItems) {
      const out = {};
      if (!missingItems.length) return out;

      const chunks = [];
      for (let i = 0; i < missingItems.length; i += 14) {
        chunks.push(missingItems.slice(i, i + 14));
      }

      for (const chunk of chunks) {
        if (typeof invokeGemini !== 'function') {
          for (const item of chunk) out[item.id] = heuristicClassify(item.email);
          continue;
        }

        const payload = chunk.map(item => ({
          id: item.id,
          from: safeStr(item.email?.originalFrom || item.email?.from),
          subject: safeStr(item.email?.subject).slice(0, 250),
          body: safeStr(item.email?.body || item.email?.originalBody || item.email?.snippet).slice(0, 2500)
        }));

        const prompt = `Classify which emails are related to robotics talks/seminars/research presentations using SEMANTIC reasoning.

Important:
- Do NOT rely only on explicit words like "robot" or "robotics".
- Mark as relevant when the topic is clearly adjacent robotics/embodied AI, e.g. VLA (vision-language-action), manipulation, control, SLAM, autonomous systems, locomotion, humanoids, drones, embodied foundation models.
- Exclude unrelated emails and generic service updates/status notifications.

Return STRICT JSON with exact shape:
{
  "results": [
    {
      "id": "email-id",
      "isRoboticsRelated": true,
      "confidence": 0.0,
      "reason": "short reason"
    }
  ]
}

Emails:
${JSON.stringify(payload)}`;

        try {
          const completion = await invokeGemini({
            model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
            messages: [
              { role: 'system', content: 'You are a careful email topic classifier.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            maxOutputTokens: 1400
          });

          const parsed = parseJson(completion?.content || '');
          const results = Array.isArray(parsed?.results) ? parsed.results : [];
          const resultMap = new Map(results.map(r => [safeStr(r?.id), r]));

          for (const item of chunk) {
            const hit = resultMap.get(item.id);
            if (hit && typeof hit.isRoboticsRelated === 'boolean') {
              out[item.id] = {
                isRoboticsRelated: !!hit.isRoboticsRelated,
                confidence: Math.max(0, Math.min(1, Number(hit.confidence) || 0)),
                reason: safeStr(hit.reason) || (hit.isRoboticsRelated ? 'Semantic robotics relevance match.' : 'Not robotics-related.')
              };
            } else {
              out[item.id] = heuristicClassify(item.email);
            }
          }
        } catch (_) {
          for (const item of chunk) out[item.id] = heuristicClassify(item.email);
        }
      }

      return out;
    }

    app.post('/api/robotics-talk-highlighter/classify-batch', async (req, res) => {
      try {
        const userEmail = resolveUserEmail(req);
        const idsInput = Array.isArray(req.body?.emailIds) ? req.body.emailIds : [];
        const emailIds = Array.from(new Set(idsInput.map(safeStr).filter(Boolean))).slice(0, 80);
        if (!userEmail) return res.status(400).json({ success: false, error: 'User email missing' });
        if (!emailIds.length) return res.status(400).json({ success: false, error: 'emailIds are required' });

        const emailMap = await loadEmailMapForUser(userEmail, emailIds);
        const cache = await getCache(userEmail);
        const now = Date.now();
        const classificationsByEmailId = {};
        const missing = [];

        for (const id of emailIds) {
          const email = emailMap.get(id);
          if (!email) {
            classificationsByEmailId[id] = { isRoboticsRelated: false, confidence: 0, reason: 'Email not found in cacheable stores.' };
            continue;
          }

          const sig = signatureForEmail(email);
          const cached = cache[id];
          const cachedAt = cached?.updatedAt ? new Date(cached.updatedAt).getTime() : 0;
          const isFresh = cached && cached.signature === sig && (now - cachedAt) < CACHE_MAX_AGE_MS;
          if (isFresh && cached.classification) {
            classificationsByEmailId[id] = cached.classification;
          } else {
            missing.push({ id, email, signature: sig });
          }
        }

        if (missing.length) {
          const generated = await classifyMissingItems(missing);
          for (const item of missing) {
            const classification = generated[item.id] || { isRoboticsRelated: false, confidence: 0, reason: 'No classification available.' };
            classificationsByEmailId[item.id] = classification;
            cache[item.id] = {
              signature: item.signature,
              updatedAt: new Date().toISOString(),
              classification
            };
          }
          await setCache(userEmail, cache).catch(() => {});
        }

        return res.json({ success: true, classificationsByEmailId });
      } catch (error) {
        console.error('Robotics Talk Highlighter classify-batch error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to classify emails' });
      }
    });

    console.log('Robotics Talk Highlighter: Backend initialized');
  }
};
