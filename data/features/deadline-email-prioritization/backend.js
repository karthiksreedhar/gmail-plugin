/**
 * Deadline Email Prioritization Backend
 * Detects emails with deadlines due within the next 3 days.
 */

module.exports = {
  initialize(context) {
    const { app, getUserDoc, setUserDoc, getCurrentUser, normalizeUserEmailForData, invokeGemini, getGeminiModel } = context;
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
    const PAST_CONTEXT_RE = /\b(was due|were due|deadline passed|already passed|past due|missed deadline|expired on)\b/i;

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

    function parseClientTimezoneOffsetMinutes(req) {
      const value = Number(req?.body?.clientTimezoneOffsetMinutes);
      if (!Number.isFinite(value)) return null;
      const rounded = Math.round(value);
      if (rounded < -840 || rounded > 840) return null;
      return rounded;
    }

    function parseDateCandidate(raw, now, clientTimezoneOffsetMinutes) {
      const text = safeStr(raw);
      if (!text) return null;

      const hasYear = /\b\d{4}\b/.test(text) || /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text);
      const hasTime = /\b\d{1,2}:\d{2}\b/.test(text) || /\b\d{1,2}\s*(am|pm)\b/i.test(text);
      const hasExplicitTimezone = /\b(?:UTC|GMT|PST|PDT|MST|MDT|CST|CDT|EST|EDT)\b|[+-]\d{2}:?\d{2}\b/i.test(text);
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) return null;

      // Date strings in emails usually do not include timezone and should be
      // interpreted in the viewer's local timezone (not server timezone).
      if (!hasExplicitTimezone && Number.isFinite(clientTimezoneOffsetMinutes)) {
        const serverOffsetMinutes = now.getTimezoneOffset();
        const deltaMinutes = clientTimezoneOffsetMinutes - serverOffsetMinutes;
        if (deltaMinutes) {
          parsed.setTime(parsed.getTime() + (deltaMinutes * 60 * 1000));
        }
      }

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

    function stripQuotedReplyContent(raw) {
      const text = safeStr(raw);
      if (!text) return '';
      const lines = text.split(/\r?\n/);
      const kept = [];
      for (const line of lines) {
        const trimmed = safeStr(line);
        if (/^on .+ wrote:$/i.test(trimmed)) break;
        if (/^(from|sent|to|subject):/i.test(trimmed)) break;
        if (/^>+/.test(trimmed)) continue;
        if (/^[-_]{3,}\s*original message\s*[-_]{3,}$/i.test(trimmed)) break;
        kept.push(line);
      }
      return safeStr(kept.join('\n'));
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
      if (PAST_CONTEXT_RE.test(ctx)) return false;
      if (DEADLINE_SIGNAL_RE.test(ctx)) return true;

      // Secondary patterns for deadline phrasing around explicit dates/tokens.
      if (/\bdue\s+(?:on|in)\b/i.test(ctx)) return true;
      if (/\bdue\s+(?:(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2})\b/i.test(ctx)) return true;
      if (/\b(apply|submit|register|rsvp|pay|complete)\b[\s\S]{0,30}\bby\b/i.test(ctx)) return true;
      return false;
    }

    function prepareDeadlineText(email) {
      const subject = safeStr(email?.subject);
      const bodyRaw = safeStr(email?.body || email?.originalBody || email?.snippet);
      const body = stripQuotedReplyContent(bodyRaw);
      return `${subject}\n${body}`.slice(0, 12000);
    }

    function extractDeadlineCandidates(text, now, clientTimezoneOffsetMinutes) {
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

        const dueAt = parseDateCandidate(rawDateText, now, clientTimezoneOffsetMinutes);
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

    function evaluateEmailForUrgency(email, now, windowEnd, clientTimezoneOffsetMinutes) {
      const text = prepareDeadlineText(email);
      const candidates = extractDeadlineCandidates(text, now, clientTimezoneOffsetMinutes);

      const inWindow = candidates
        .filter(c => c?.dueAt && c.dueAt.getTime() >= now.getTime() && c.dueAt.getTime() <= windowEnd.getTime())
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

      if (!inWindow.length) return null;
      return inWindow[0];
    }

    function heuristicEstimateMinutes(email, matchedText) {
      const text = `${safeStr(email?.subject)}\n${safeStr(email?.body || email?.originalBody || email?.snippet)}\n${safeStr(matchedText)}`.toLowerCase();
      if (/\b(project|assignment|homework|problem set|pset|paper|report|brief)\b/.test(text)) return 90;
      if (/\b(exam|quiz|midterm|final)\b/.test(text)) return 120;
      if (/\b(application|form|survey|register|registration|rsvp)\b/.test(text)) return 20;
      if (/\b(payment|pay|invoice|bill)\b/.test(text)) return 15;
      if (/\b(reply|respond|email back|confirm)\b/.test(text)) return 10;
      return 30;
    }

    async function estimateTaskMinutes(email, matchedText) {
      const fallback = heuristicEstimateMinutes(email, matchedText);
      if (typeof invokeGemini !== 'function') return fallback;

      const prompt = `Estimate how long the user will likely spend to complete the action implied by this deadline email.
Return JSON only in this exact shape:
{"estimatedMinutes": 25}

Rules:
- Integer minutes only.
- Range 5 to 240.
- Estimate user effort, not calendar wait time.
- Be conservative; avoid extreme values.

Email Subject: ${safeStr(email?.subject).slice(0, 300)}
Matched deadline phrase: ${safeStr(matchedText).slice(0, 120)}
Email snippet/body: ${safeStr(stripQuotedReplyContent(email?.body || email?.originalBody || email?.snippet)).slice(0, 2400)}
`;

      try {
        const completion = await invokeGemini({
          model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
          messages: [
            { role: 'system', content: 'You estimate task effort time from emails. Return strict JSON only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0,
          maxOutputTokens: 120
        });
        const raw = safeStr(completion?.content);
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = fenced && fenced[1] ? fenced[1].trim() : raw;
        const parsed = JSON.parse(candidate);
        const value = Number(parsed?.estimatedMinutes);
        if (Number.isFinite(value)) {
          const bounded = Math.max(5, Math.min(240, Math.round(value)));
          return bounded;
        }
      } catch (_) {}
      return fallback;
    }

    function isTrackedCategoryEmail(email) {
      const categories = Array.isArray(email?.categories) && email.categories.length
        ? email.categories
        : (email?.category ? [email.category] : []);
      if (!categories.length) return false;

      return categories.some(category => TRACKED_CATEGORIES.has(safeStr(category).toLowerCase()));
    }

    async function loadIgnoredEmailIdSet(userEmail) {
      const doc = await getUserDoc('deadline_email_prioritization_prefs', userEmail).catch(() => null);
      const ids = Array.isArray(doc?.ignoredEmailIds) ? doc.ignoredEmailIds : [];
      return new Set(ids.map(v => safeStr(v)).filter(Boolean));
    }

    app.post('/api/deadline-email-prioritization/ignore', async (req, res) => {
      try {
        const userEmail = resolveUserEmail(req);
        if (!userEmail) {
          return res.status(400).json({ success: false, error: 'Missing current user' });
        }

        const emailId = safeStr(req.body?.emailId);
        const ignored = req.body?.ignored !== false;
        if (!emailId) {
          return res.status(400).json({ success: false, error: 'emailId is required' });
        }

        const ignoredSet = await loadIgnoredEmailIdSet(userEmail);
        if (ignored) {
          ignoredSet.add(emailId);
        } else {
          ignoredSet.delete(emailId);
        }

        await setUserDoc('deadline_email_prioritization_prefs', userEmail, {
          ignoredEmailIds: Array.from(ignoredSet),
          updatedAt: new Date().toISOString()
        });

        return res.json({
          success: true,
          emailId,
          ignored,
          ignoredCount: ignoredSet.size
        });
      } catch (error) {
        console.error('Deadline Email Prioritization ignore update failed:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to update ignored deadlines list' });
      }
    });

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
        const ignoredSet = await loadIgnoredEmailIdSet(userEmail);
        const clientTimezoneOffsetMinutes = parseClientTimezoneOffsetMinutes(req);

        const allowed = requestedIds.length ? new Set(requestedIds) : null;
        const now = new Date();
        const windowEnd = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));

        const urgent = [];
        for (const email of emails) {
          const id = safeStr(email?.id);
          if (!id) continue;
          if (allowed && !allowed.has(id)) continue;
          if (ignoredSet.has(id)) continue;
          if (!isTrackedCategoryEmail(email)) continue;

          const match = evaluateEmailForUrgency(email, now, windowEnd, clientTimezoneOffsetMinutes);
          if (!match) continue;

          urgent.push({
            id,
            dueAt: match.dueAt.toISOString(),
            matchedText: match.matchedText || '',
            _email: email
          });
        }

        const estimateCap = 20;
        for (let i = 0; i < urgent.length && i < estimateCap; i++) {
          const item = urgent[i];
          const minutes = await estimateTaskMinutes(item._email || {}, item.matchedText || '');
          item.estimatedMinutes = minutes;
          item.estimatedLabel = `${minutes} min`;
        }
        for (let i = estimateCap; i < urgent.length; i++) {
          const item = urgent[i];
          const minutes = heuristicEstimateMinutes(item._email || {}, item.matchedText || '');
          item.estimatedMinutes = minutes;
          item.estimatedLabel = `${minutes} min`;
        }

        urgent.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
        const byEmailId = {};
        urgent.forEach(item => {
          byEmailId[item.id] = {
            dueAt: item.dueAt,
            matchedText: item.matchedText,
            estimatedMinutes: Number.isFinite(item.estimatedMinutes) ? item.estimatedMinutes : null,
            estimatedLabel: safeStr(item.estimatedLabel)
          };
        });
        urgent.forEach(item => { delete item._email; });

        return res.json({
          success: true,
          urgentEmails: urgent,
          urgentByEmailId: byEmailId,
          ignoredCount: ignoredSet.size,
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
