/**
 * Deadline Email Prioritization Backend
 * Detects emails with deadlines due within the next 3 days.
 */

module.exports = {
  initialize(context) {
    const { app, getUserDoc, getCurrentUser, normalizeUserEmailForData } = context;

    function safeStr(value) {
      return String(value || '').trim();
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

    function parseDateCandidate(raw, now) {
      const text = safeStr(raw);
      if (!text) return null;

      const hasYear = /\b\d{4}\b/.test(text) || /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text);
      const hasTime = /\b\d{1,2}:\d{2}\b/.test(text) || /\b\d{1,2}\s*(am|pm)\b/i.test(text);
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) return null;

      // If no year is provided and parsed date is in the past, assume next year.
      if (!hasYear && parsed.getTime() < (now.getTime() - 24 * 60 * 60 * 1000)) {
        parsed.setFullYear(parsed.getFullYear() + 1);
      }

      // Date-only deadlines are typically end-of-day expectations.
      if (!hasTime) {
        parsed.setHours(23, 59, 59, 999);
      }
      return parsed;
    }

    function extractDeadlineCandidates(text, now) {
      const source = safeStr(text);
      if (!source) return [];

      const keywordRe = /\b(deadline|due|due by|submit|submission|apply|application|rsvp|register|payment due|pay by|expires|final day|must be received by|complete by)\b/i;
      const dateRe = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?\b/gi;

      const candidates = [];
      let match;
      while ((match = dateRe.exec(source)) !== null) {
        const rawDateText = safeStr(match[0]);
        if (!rawDateText) continue;

        const start = Math.max(0, match.index - 80);
        const end = Math.min(source.length, match.index + rawDateText.length + 80);
        const contextWindow = source.slice(start, end);
        if (!keywordRe.test(contextWindow)) continue;

        const dueAt = parseDateCandidate(rawDateText, now);
        if (!dueAt) continue;

        candidates.push({
          dueAt,
          matchedText: rawDateText
        });
      }
      return candidates;
    }

    function evaluateEmailForUrgency(email, now, windowEnd) {
      const body = safeStr(email?.body || email?.originalBody || email?.snippet);
      const subject = safeStr(email?.subject);
      const text = `${subject}\n${body}`.slice(0, 20000);
      const candidates = extractDeadlineCandidates(text, now);

      const inWindow = candidates
        .filter(c => c?.dueAt && c.dueAt.getTime() >= now.getTime() && c.dueAt.getTime() <= windowEnd.getTime())
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

      if (!inWindow.length) return null;
      return inWindow[0];
    }

    app.post('/api/deadline-email-prioritization/scan', async (req, res) => {
      try {
        const userEmail = resolveUserEmail(req);
        if (!userEmail) {
          return res.status(400).json({ success: false, error: 'Missing current user' });
        }

        const responseDoc = await getUserDoc('response_emails', userEmail).catch(() => null);
        const emails = Array.isArray(responseDoc?.emails) ? responseDoc.emails : [];
        const requestedIds = Array.isArray(req.body?.emailIds)
          ? Array.from(new Set(req.body.emailIds.map(v => safeStr(v)).filter(Boolean)))
          : [];

        const allowed = requestedIds.length ? new Set(requestedIds) : null;
        const now = new Date();
        const windowEnd = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));

        const urgent = [];
        for (const email of emails) {
          const id = safeStr(email?.id);
          if (!id) continue;
          if (allowed && !allowed.has(id)) continue;

          const match = evaluateEmailForUrgency(email, now, windowEnd);
          if (!match) continue;

          urgent.push({
            id,
            dueAt: match.dueAt.toISOString(),
            matchedText: match.matchedText || ''
          });
        }

        urgent.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
        const byEmailId = {};
        urgent.forEach(item => {
          byEmailId[item.id] = { dueAt: item.dueAt, matchedText: item.matchedText };
        });

        return res.json({
          success: true,
          urgentEmails: urgent,
          urgentByEmailId: byEmailId,
          window: {
            from: now.toISOString(),
            to: windowEnd.toISOString()
          }
        });
      } catch (error) {
        console.error('Deadline Email Prioritization scan failed:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to scan emails for deadlines' });
      }
    });

    console.log('Deadline Email Prioritization: Backend initialized');
  }
};
