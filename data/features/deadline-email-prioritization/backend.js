/**
 * Deadline Email Prioritization Backend
 * Detects emails with deadlines due within the next 3 days.
 */

module.exports = {
  initialize(context) {
    const { app, getUserDoc, getCurrentUser, normalizeUserEmailForData } = context;
    const TRACKED_CATEGORIES = new Set([
      'scu',
      'class announcements',
      'appointments',
      'law review'
    ]);
    const WEEKDAY_INDEX = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6
    };
    const DEADLINE_SIGNAL_RE = /\b(deadline|deadline is|due date|due by|due in|due on|by end of day|by eod|must be (?:submitted|received) by|final day|expires(?: on)?|apply by|submit by|rsvp by|register by|pay by|payment due|complete by)\b/i;
    const NEGATIVE_CONTEXT_RE = /\b(privacy policy|terms(?:\s*&\s*conditions)?|unsubscribe|manage preferences|newsletter settings)\b/i;

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

    function parseRelativeDateToken(raw, now) {
      const token = safeStr(raw).toLowerCase();
      if (!token) return null;

      const out = new Date(now.getTime());
      out.setSeconds(0, 0);

      if (token === 'today' || token === 'tonight') {
        out.setHours(23, 59, 59, 999);
        return out;
      }
      if (token === 'tomorrow') {
        out.setDate(out.getDate() + 1);
        out.setHours(23, 59, 59, 999);
        return out;
      }
      if (token === 'day after tomorrow') {
        out.setDate(out.getDate() + 2);
        out.setHours(23, 59, 59, 999);
        return out;
      }

      const inDays = token.match(/^in\s+(\d+)\s+days?$/);
      if (inDays) {
        const days = Number(inDays[1]);
        if (!Number.isFinite(days)) return null;
        out.setDate(out.getDate() + days);
        out.setHours(23, 59, 59, 999);
        return out;
      }

      const weekdayMatch = token.match(/^(?:(this|next)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
      if (!weekdayMatch) return null;

      const qualifier = safeStr(weekdayMatch[1]).toLowerCase();
      const weekdayName = safeStr(weekdayMatch[2]).toLowerCase();
      const target = WEEKDAY_INDEX[weekdayName];
      if (!Number.isInteger(target)) return null;

      const currentDay = out.getDay();
      let daysAhead = (target - currentDay + 7) % 7;

      if (qualifier === 'next') {
        daysAhead += 7;
      }

      out.setDate(out.getDate() + daysAhead);
      out.setHours(23, 59, 59, 999);
      return out;
    }

    function hasDeadlineSignal(contextWindow) {
      const ctx = safeStr(contextWindow).toLowerCase();
      if (!ctx) return false;
      if (NEGATIVE_CONTEXT_RE.test(ctx)) return false;
      if (DEADLINE_SIGNAL_RE.test(ctx)) return true;

      // Secondary patterns for deadline phrasing around explicit dates/tokens.
      if (/\bdue\s+(?:on|in)\b/i.test(ctx)) return true;
      if (/\bdue\s+(?:(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2})\b/i.test(ctx)) return true;
      if (/\b(apply|submit|register|rsvp|pay|complete)\b[\s\S]{0,30}\bby\b/i.test(ctx)) return true;
      return false;
    }

    function extractDeadlineCandidates(text, now) {
      const source = safeStr(text);
      if (!source) return [];

      const dateRe = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?\b/gi;
      const relativeRe = /\b(day after tomorrow|tomorrow|today|tonight|in\s+\d+\s+days?|(?:this|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi;

      const candidates = [];
      let match;
      while ((match = dateRe.exec(source)) !== null) {
        const rawDateText = safeStr(match[0]);
        if (!rawDateText) continue;

        const start = Math.max(0, match.index - 120);
        const end = Math.min(source.length, match.index + rawDateText.length + 120);
        const contextWindow = source.slice(start, end);
        if (!hasDeadlineSignal(contextWindow)) continue;

        const dueAt = parseDateCandidate(rawDateText, now);
        if (!dueAt) continue;

        candidates.push({
          dueAt,
          matchedText: rawDateText
        });
      }

      while ((match = relativeRe.exec(source)) !== null) {
        const rawToken = safeStr(match[0]);
        if (!rawToken) continue;

        const start = Math.max(0, match.index - 120);
        const end = Math.min(source.length, match.index + rawToken.length + 120);
        const contextWindow = source.slice(start, end);
        if (!hasDeadlineSignal(contextWindow)) continue;

        const dueAt = parseRelativeDateToken(rawToken, now);
        if (!dueAt) continue;

        candidates.push({
          dueAt,
          matchedText: rawToken
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

    function isTrackedCategoryEmail(email) {
      const categories = Array.isArray(email?.categories) && email.categories.length
        ? email.categories
        : (email?.category ? [email.category] : []);
      if (!categories.length) return false;

      return categories.some(category => TRACKED_CATEGORIES.has(safeStr(category).toLowerCase()));
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
          if (!isTrackedCategoryEmail(email)) continue;

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
