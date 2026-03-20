/**
 * See Events Backend
 * Returns recent and upcoming event-like items inferred from recent inbox emails.
 */

module.exports = {
  initialize(context) {
    const {
      app,
      getCurrentUser,
      getUserDoc,
      loadUnrepliedEmails,
      loadResponseEmails
    } = context;

    const EVENT_KEYWORDS = [
      'meeting', 'meet', 'sync', 'standup', 'demo', 'kickoff', 'review',
      'event', 'invite', 'invitation', 'calendar', 'zoom', 'webinar',
      'workshop', 'conference', 'town hall', 'office hours', 'interview'
    ];

    function normalizeText(v) {
      return String(v || '').replace(/\s+/g, ' ').trim();
    }

    function includesEventKeyword(email) {
      const hay = `${normalizeText(email?.subject)} ${normalizeText(email?.snippet)} ${normalizeText(email?.body)}`.toLowerCase();
      return EVENT_KEYWORDS.some((kw) => hay.includes(kw));
    }

    function parseDateCandidate(raw) {
      if (!raw) return null;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return null;
      return d;
    }

    function extractEventDate(text) {
      const source = normalizeText(text);
      if (!source) return null;

      // ISO style date, e.g. 2026-04-03
      const iso = source.match(/\b(20\d{2}-\d{1,2}-\d{1,2})\b/);
      if (iso && iso[1]) {
        const d = parseDateCandidate(iso[1]);
        if (d) return d;
      }

      // US style date, e.g. 4/3/2026 or 4/3
      const us = source.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/);
      if (us && us[1]) {
        let candidate = us[1];
        if (!candidate.includes('/', candidate.indexOf('/') + 1)) {
          const y = new Date().getFullYear();
          candidate = `${candidate}/${y}`;
        }
        const d = parseDateCandidate(candidate);
        if (d) return d;
      }

      // Month name style date, e.g. April 3, 2026
      const monthName = source.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?/i);
      if (monthName && monthName[0]) {
        const d = parseDateCandidate(monthName[0]);
        if (d) return d;
      }

      return null;
    }

    function buildEventItem(email) {
      const subject = normalizeText(email?.subject) || 'No Subject';
      const body = normalizeText(email?.body || email?.snippet);
      const receivedDate = parseDateCandidate(email?.date);
      const extracted = extractEventDate(`${subject} ${body}`);

      return {
        id: String(email?.id || ''),
        subject,
        from: normalizeText(email?.originalFrom || email?.from) || 'Unknown Sender',
        receivedDate: receivedDate ? receivedDate.toISOString() : null,
        eventDate: extracted ? extracted.toISOString() : null,
        summary: subject,
        source: String(email?.source || 'inbox')
      };
    }

    app.get('/api/see-events/list', async (req, res) => {
      try {
        const user = getCurrentUser();
        const requestedLimit = parseInt(String(req.query?.limit || '60'), 10);
        const limit = Number.isFinite(requestedLimit)
          ? Math.max(1, Math.min(200, requestedLimit))
          : 60;

        let unreplied = [];
        let responses = [];

        try {
          const [unrepliedDoc, responseDoc] = await Promise.all([
            getUserDoc('unreplied_emails', user),
            getUserDoc('response_emails', user)
          ]);

          unreplied = Array.isArray(unrepliedDoc?.emails) ? unrepliedDoc.emails : [];
          responses = Array.isArray(responseDoc?.emails) ? responseDoc.emails : [];
        } catch (_) {
          unreplied = loadUnrepliedEmails() || [];
          responses = loadResponseEmails() || [];
        }

        const now = new Date();
        const recencyCutoff = new Date(now.getTime() - (45 * 24 * 60 * 60 * 1000));

        const merged = [...unreplied, ...responses]
          .filter((email) => email && email.id && includesEventKeyword(email))
          .map(buildEventItem)
          .filter((item) => {
            const received = parseDateCandidate(item.receivedDate);
            if (!received) return true;
            return received >= recencyCutoff;
          });

        const byId = new Map();
        for (const item of merged) {
          if (!item.id) continue;
          const existing = byId.get(item.id);
          if (!existing) {
            byId.set(item.id, item);
            continue;
          }

          // Keep the one with an extracted event date if only one has it.
          if (!existing.eventDate && item.eventDate) {
            byId.set(item.id, item);
          }
        }

        const events = Array.from(byId.values()).sort((a, b) => {
          const aEvent = parseDateCandidate(a.eventDate);
          const bEvent = parseDateCandidate(b.eventDate);
          if (aEvent && bEvent) return aEvent - bEvent;
          if (aEvent && !bEvent) return -1;
          if (!aEvent && bEvent) return 1;

          const aRecv = parseDateCandidate(a.receivedDate);
          const bRecv = parseDateCandidate(b.receivedDate);
          return (bRecv ? bRecv.getTime() : 0) - (aRecv ? aRecv.getTime() : 0);
        });

        const upcoming = [];
        const recent = [];

        for (const item of events) {
          if (upcoming.length + recent.length >= limit) break;
          const eventDate = parseDateCandidate(item.eventDate);
          const receivedDate = parseDateCandidate(item.receivedDate);

          if (eventDate && eventDate >= new Date(now.getTime() - 12 * 60 * 60 * 1000)) {
            upcoming.push(item);
            continue;
          }

          if (receivedDate && receivedDate >= recencyCutoff) {
            recent.push(item);
          }
        }

        return res.json({
          success: true,
          upcoming,
          recent,
          total: upcoming.length + recent.length
        });
      } catch (error) {
        console.error('See Events: failed to build event list:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to load events'
        });
      }
    });
  }
};
