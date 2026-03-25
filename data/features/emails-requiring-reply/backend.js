/**
 * Emails Requiring Reply Backend
 * Uses thread history + LLM ranking to identify the 5 latest emails that likely need a response.
 */

module.exports = {
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser, normalizeUserEmailForData, invokeGemini, getGeminiModel } = context;
    const DISMISS_COLLECTION = 'feature_emails_requiring_reply_dismissed';

    function safeStr(value) {
      return String(value || '').trim();
    }

    function lower(value) {
      return safeStr(value).toLowerCase();
    }

    function dateMs(value) {
      const ms = new Date(value || 0).getTime();
      return Number.isFinite(ms) ? ms : 0;
    }

    function resolveUserEmail(req) {
      const override = safeStr(req?.body?.userEmail);
      const current = override || safeStr(getCurrentUser());
      if (!current) return '';
      if (typeof normalizeUserEmailForData === 'function') {
        return normalizeUserEmailForData(current);
      }
      return current.toLowerCase();
    }

    function isLikelyAutomated(email) {
      const from = lower(email?.originalFrom || email?.from);
      const subject = lower(email?.subject);
      return from.includes('noreply')
        || from.includes('no-reply')
        || from.includes('do-not-reply')
        || subject.includes('newsletter')
        || subject.includes('daily digest')
        || subject.includes('weekly digest')
        || subject.includes('notification');
    }

    function hasReplyIntentSignal(email) {
      const text = `${safeStr(email?.subject)}\n${safeStr(email?.snippet || email?.body || email?.originalBody)}`.toLowerCase();
      if (!text) return false;
      return /\?/.test(text)
        || /\b(please reply|please respond|please confirm|can you|could you|would you|let me know|follow up|following up|awaiting|need your|reply requested)\b/i.test(text);
    }

    function isUserMessage(msg, userEmail) {
      if (msg?.isResponse === true) return true;
      const from = lower(msg?.from || msg?.originalFrom);
      if (!from) return false;
      return from.includes(userEmail) || from.includes(`<${userEmail}>`);
    }

    function isFromUser(fromRaw, userEmail) {
      const from = lower(fromRaw);
      if (!from) return false;
      return from.includes(userEmail) || from.includes(`<${userEmail}>`);
    }

    function buildThreadMaps(threads, userEmail) {
      const byKey = new Map();

      for (const thread of (Array.isArray(threads) ? threads : [])) {
        const messages = (Array.isArray(thread?.messages) ? thread.messages.slice() : [])
          .sort((a, b) => dateMs(a?.date) - dateMs(b?.date));
        if (!messages.length) continue;

        const inboundCount = messages.filter(m => !isUserMessage(m, userEmail)).length;
        const userReplyCount = messages.filter(m => isUserMessage(m, userEmail)).length;
        const latest = messages[messages.length - 1];
        const latestIsUser = isUserMessage(latest, userEmail);
        const hasPendingInbound = !latestIsUser;
        const latestInbound = [...messages].reverse().find(m => !isUserMessage(m, userEmail)) || null;
        const latestInboundDate = dateMs(latestInbound?.date);
        const userResponseAfterLatestInbound = messages.some(m => isUserMessage(m, userEmail) && dateMs(m?.date) > latestInboundDate);

        const history = {
          threadId: safeStr(thread?.id || thread?.threadId),
          responseId: safeStr(thread?.responseId),
          inboundCount,
          userReplyCount,
          latestIsUser,
          hasUserEverReplied: userReplyCount > 0,
          hasPendingInbound,
          userResponseAfterLatestInbound,
          latestMessageAt: safeStr(latest?.date),
          latestMessageFrom: safeStr(latest?.from || latest?.originalFrom),
          recentMessages: messages.slice(-4).map(m => ({
            from: safeStr(m?.from || m?.originalFrom),
            date: safeStr(m?.date),
            isUser: isUserMessage(m, userEmail),
            subject: safeStr(m?.subject).slice(0, 180),
            bodyPreview: safeStr(m?.body || m?.snippet).slice(0, 220)
          }))
        };

        const keys = new Set([
          safeStr(thread?.id),
          safeStr(thread?.threadId),
          safeStr(thread?.responseId)
        ].filter(Boolean));
        keys.forEach(k => byKey.set(k, history));
      }

      return byKey;
    }

    function buildCandidate(email, threadHistory, userEmail) {
      return {
        id: safeStr(email?.id),
        date: safeStr(email?.date),
        from: safeStr(email?.originalFrom || email?.from),
        subject: safeStr(email?.subject).slice(0, 260),
        snippet: safeStr(email?.snippet || email?.body || email?.originalBody).slice(0, 600),
        category: safeStr(Array.isArray(email?.categories) && email.categories.length ? email.categories[0] : email?.category),
        signals: {
          likelyAutomated: isLikelyAutomated(email),
          hasReplyIntentLanguage: hasReplyIntentSignal(email),
          latestSenderIsUser: !!threadHistory?.latestIsUser || isFromUser(email?.originalFrom || email?.from, userEmail)
        },
        threadHistory: threadHistory || {
          inboundCount: 0,
          userReplyCount: 0,
          latestIsUser: false,
          hasUserEverReplied: false,
          hasPendingInbound: true,
          userResponseAfterLatestInbound: false,
          latestMessageAt: safeStr(email?.date),
          latestMessageFrom: safeStr(email?.originalFrom || email?.from),
          recentMessages: []
        }
      };
    }

    function parseModelSelection(raw) {
      const source = safeStr(raw);
      if (!source) return [];

      const fenced = source.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      const candidate = fenced ? fenced[1].trim() : source;

      let parsed = null;
      try {
        parsed = JSON.parse(candidate);
      } catch (_) {
        const arrMatch = candidate.match(/\[[\s\S]*\]/);
        if (arrMatch) {
          try {
            parsed = JSON.parse(arrMatch[0]);
          } catch (_) {
            parsed = null;
          }
        }
      }

      if (!parsed) return [];
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.selected)) return parsed.selected;
      return [];
    }

    function fallbackPickTopFive(candidates) {
      const scored = (Array.isArray(candidates) ? candidates : []).map(c => {
        const pending = c?.threadHistory?.hasPendingInbound ? 1 : 0;
        const repliedBefore = c?.threadHistory?.hasUserEverReplied ? 1 : 0;
        const automated = c?.signals?.likelyAutomated ? 1 : 0;
        const intent = c?.signals?.hasReplyIntentLanguage ? 1 : 0;
        const score = (pending * 5) + (repliedBefore * 3) + (intent * 2) - (automated * 4);
        return { candidate: c, score };
      });

      return scored
        .filter(x => x.score > 0 && !x?.candidate?.signals?.latestSenderIsUser)
        .sort((a, b) => (b.score - a.score) || (dateMs(b.candidate?.date) - dateMs(a.candidate?.date)))
        .slice(0, 5)
        .map((x, i) => ({
          id: safeStr(x.candidate?.id),
          rank: i + 1,
          reason: 'Heuristic fallback: pending inbound + prior reply behavior + reply-intent language.'
        }));
    }

    async function selectReplyPriority(candidates, userEmail) {
      if (!Array.isArray(candidates) || !candidates.length) return [];
      if (typeof invokeGemini !== 'function') {
        return fallbackPickTopFive(candidates);
      }

      const modelInput = candidates.slice(0, 80).map((c, i) => ({
        i: i + 1,
        id: c.id,
        date: c.date,
        from: c.from,
        subject: c.subject,
        snippet: c.snippet,
        category: c.category,
        signals: c.signals,
        threadHistory: c.threadHistory
      }));

      const prompt = `You are ranking inbox emails for likely "needs user reply now" decisions.

User email: ${userEmail}
Current date/time: ${new Date().toISOString()}

Task:
From the provided candidate emails, choose at most 5 email IDs that the user is MOST likely to respond to now.

Core objective:
- Prefer emails that have an unresolved inbound message from someone else.
- Use prior thread behavior: if user historically replies in that thread/sender pattern, boost it.
- Prioritize recency among reply-worthy candidates (the user asked for latest likely replies).

Important reasoning rules:
1) Strong positive signals:
   - Latest message is inbound and no user response after it.
   - Direct request/question/action item in subject/snippet.
   - Prior user replies in the same thread.
2) Strong negative signals:
   - Automated/newsletter/no-reply notifications.
   - FYI announcements with no implied response needed.
   - Threads where user already replied after latest inbound.
   - Any item where the user is the latest sender.
3) Recency:
   - Between similar candidates, pick the newer one.
4) Precision:
   - Only return IDs from the provided list.
   - Do not hallucinate IDs.

Output format (STRICT JSON only):
{
  "selected": [
    { "id": "email-id", "rank": 1, "reason": "short reason (<= 20 words)" }
  ]
}

Constraints:
- 0 to 5 entries.
- Rank should start at 1 and be unique.
- Reasons must be concise and tied to signals/history.
- HARD CONSTRAINT: Never select an email when latest sender is the user.

Candidates JSON:
${JSON.stringify(modelInput)}`;

      try {
        const completion = await invokeGemini({
          model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
          messages: [
            { role: 'system', content: 'You are a careful inbox triage assistant focused on reply prioritization with high precision.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          maxOutputTokens: 1800
        });

        const parsed = parseModelSelection(completion?.content || '');
        if (!Array.isArray(parsed) || !parsed.length) {
          return fallbackPickTopFive(candidates);
        }

        const candidateIds = new Set(candidates.map(c => safeStr(c.id)));
        const selected = [];
        const seen = new Set();

        for (const item of parsed) {
          const id = safeStr(item?.id);
          if (!id || seen.has(id) || !candidateIds.has(id)) continue;
          const matchCandidate = candidates.find(c => safeStr(c?.id) === id);
          if (matchCandidate?.signals?.latestSenderIsUser) continue;
          seen.add(id);
          selected.push({
            id,
            rank: Number(item?.rank) || (selected.length + 1),
            reason: safeStr(item?.reason).slice(0, 220)
          });
          if (selected.length >= 5) break;
        }

        if (!selected.length) {
          return fallbackPickTopFive(candidates);
        }

        selected.sort((a, b) => a.rank - b.rank);
        return selected;
      } catch (error) {
        console.error('emails-requiring-reply model selection failed:', error?.message || error);
        return fallbackPickTopFive(candidates);
      }
    }

    async function loadDismissedMap(userEmail) {
      const doc = await getUserDoc(DISMISS_COLLECTION, userEmail).catch(() => null);
      return (doc && typeof doc.dismissedByEmailId === 'object' && doc.dismissedByEmailId)
        ? doc.dismissedByEmailId
        : {};
    }

    async function saveDismissedMap(userEmail, dismissedByEmailId) {
      if (typeof setUserDoc !== 'function') return;
      await setUserDoc(DISMISS_COLLECTION, userEmail, { dismissedByEmailId: dismissedByEmailId || {} });
    }

    app.post('/api/emails-requiring-reply/top-five', async (req, res) => {
      try {
        const userEmail = resolveUserEmail(req);
        if (!userEmail) {
          return res.status(400).json({ success: false, error: 'Missing current user' });
        }

        const responseDoc = await getUserDoc('response_emails', userEmail).catch(() => null);
        const threadDoc = await getUserDoc('email_threads', userEmail).catch(() => null);
        const emails = Array.isArray(responseDoc?.emails) ? responseDoc.emails : [];
        const threads = Array.isArray(threadDoc?.threads) ? threadDoc.threads : [];

        const requestedIds = Array.isArray(req.body?.emailIds)
          ? Array.from(new Set(req.body.emailIds.map(v => safeStr(v)).filter(Boolean)))
          : [];
        const allow = requestedIds.length ? new Set(requestedIds) : null;
        const dismissedByEmailId = await loadDismissedMap(userEmail);
        const dismissedIds = new Set(Object.keys(dismissedByEmailId || {}).map(safeStr).filter(Boolean));

        const threadMap = buildThreadMaps(threads, userEmail);

        const candidates = emails
          .filter(e => safeStr(e?.id))
          .filter(e => !allow || allow.has(safeStr(e?.id)))
          .filter(e => !dismissedIds.has(safeStr(e?.id)))
          .sort((a, b) => dateMs(b?.date) - dateMs(a?.date))
          .slice(0, 120)
          .map(email => {
            const id = safeStr(email?.id);
            const history = threadMap.get(id) || null;
            return buildCandidate(email, history, userEmail);
          })
          .filter(c => !c?.signals?.latestSenderIsUser)
          .filter(c => c?.threadHistory?.hasPendingInbound !== false);

        const selected = await selectReplyPriority(candidates, userEmail);
        const selectedIds = selected.map(x => safeStr(x.id)).filter(Boolean);
        const selectedById = {};
        selected.forEach(item => {
          selectedById[item.id] = {
            rank: item.rank,
            reason: item.reason
          };
        });

        return res.json({
          success: true,
          selected,
          selectedIds,
          selectedById
        });
      } catch (error) {
        console.error('emails-requiring-reply top-five failed:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to prioritize reply-needed emails' });
      }
    });

    app.post('/api/emails-requiring-reply/dismiss', async (req, res) => {
      try {
        const userEmail = resolveUserEmail(req);
        const emailId = safeStr(req.body?.emailId);
        if (!userEmail) {
          return res.status(400).json({ success: false, error: 'Missing current user' });
        }
        if (!emailId) {
          return res.status(400).json({ success: false, error: 'emailId is required' });
        }

        const dismissedByEmailId = await loadDismissedMap(userEmail);
        dismissedByEmailId[emailId] = new Date().toISOString();
        await saveDismissedMap(userEmail, dismissedByEmailId);
        return res.json({ success: true, emailId });
      } catch (error) {
        console.error('emails-requiring-reply dismiss failed:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to dismiss email' });
      }
    });

    console.log('emails-requiring-reply: Backend initialized');
  }
};
