/**
 * Job Application Tracker Backend
 * Creates a dedicated page + API for company/status tracking from "Job Applications" emails.
 */

module.exports = {
  initialize(context) {
    const {
      app,
      getCurrentUser,
      getUserDoc,
      loadResponseEmails,
      invokeGemini,
      getGeminiModel
    } = context;

    function safeStr(v) {
      return String(v || '').trim();
    }

    function parseEmailAddress(fromRaw) {
      const text = safeStr(fromRaw);
      if (!text) return '';
      const angle = text.match(/<([^>]+)>/);
      if (angle && angle[1]) return angle[1].trim().toLowerCase();
      const plain = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      return plain ? plain[0].trim().toLowerCase() : '';
    }

    function toTitleCase(text) {
      return safeStr(text)
        .split(/\s+/)
        .map(token => token ? token[0].toUpperCase() + token.slice(1).toLowerCase() : '')
        .join(' ');
    }

    function companyFromSender(fromRaw) {
      const fromText = safeStr(fromRaw);
      const displayName = safeStr(fromText.replace(/<[^>]*>/g, '').replace(/["']/g, ''));
      const email = parseEmailAddress(fromRaw);

      const genericName = /^(no-?reply|notifications?|jobs?|careers?|talent|recruiting|hr|team)$/i;
      if (displayName && !genericName.test(displayName.toLowerCase())) {
        return toTitleCase(displayName.replace(/\s+\(.*?\)\s*$/, '').trim());
      }

      if (email.includes('@')) {
        const domain = email.split('@')[1] || '';
        const domainNoTld = domain.replace(/\.[a-z]{2,}$/i, '');
        const parts = domainNoTld.split('.').filter(Boolean);
        const core = parts.length >= 2 ? parts[parts.length - 2] : parts[0] || domainNoTld;
        if (core) return toTitleCase(core.replace(/[-_]/g, ' '));
      }

      return displayName || 'Unknown Company';
    }

    function categoryMatch(email) {
      const cats = Array.isArray(email?.categories) && email.categories.length
        ? email.categories
        : (email?.category ? [email.category] : []);
      return cats.some(c => {
        const n = safeStr(c).toLowerCase();
        return n === 'job applications' || n === 'job application';
      });
    }

    function statusFromEmail(email) {
      const text = [
        safeStr(email?.subject),
        safeStr(email?.snippet),
        safeStr(email?.body)
      ].join('\n').toLowerCase();

      if (/offer|congratulations|congrats|we are pleased|extend.*offer/.test(text)) return 'Offer';
      if (/rejected|regret to inform|not moving forward|unfortunately/.test(text)) return 'Rejected';
      if (/withdraw|withdrawn/.test(text)) return 'Withdrawn';
      if (/interview|phone screen|onsite|final round|hiring manager/.test(text)) return 'Interviewing';
      if (/assessment|take-?home|coding challenge|hackerrank|oa\b|online assessment/.test(text)) return 'Assessment';
      if (/received your application|application received|thank you for applying|we have received/.test(text)) return 'Applied';
      if (/under review|reviewing your application|in review/.test(text)) return 'Under Review';
      return 'Waiting';
    }

    function stripHtmlAndNoise(raw) {
      const text = safeStr(raw);
      if (!text) return '';
      return text
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\bZjQcmQRYFpfptBanner(Start|End)\b/gi, ' ')
        .replace(/This Message Is From an External Sender[\s\S]*?(?=\n\n|$)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function buildStatusInput(email) {
      const body = stripHtmlAndNoise(email?.body || email?.originalBody || '');
      const snippet = stripHtmlAndNoise(email?.snippet || '');
      return {
        subject: safeStr(email?.subject).slice(0, 300),
        snippet: snippet.slice(0, 600),
        body: body.slice(0, 1800)
      };
    }

    function parseJsonFromModel(text) {
      const raw = safeStr(text);
      if (!raw) return null;

      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      const candidate = fenced && fenced[1] ? fenced[1].trim() : raw;

      try {
        return JSON.parse(candidate);
      } catch (_) {
        const start = candidate.indexOf('[');
        const end = candidate.lastIndexOf(']');
        if (start >= 0 && end > start) {
          try {
            return JSON.parse(candidate.slice(start, end + 1));
          } catch (_) {
            return null;
          }
        }
        return null;
      }
    }

    function cleanPosition(value) {
      const text = safeStr(value)
        .replace(/\s+/g, ' ')
        .replace(/^[\-"'\s:]+/, '')
        .replace(/[\-"'\s:]+$/, '');
      if (!text) return '';
      return text
        .replace(/\s+\(id:\s*[^)]+\)$/i, '')
        .replace(/\s+\|\s+.+$/i, '')
        .replace(/\s+-\s+.+$/i, '')
        .trim();
    }

    function cleanTodo(value) {
      return safeStr(value)
        .replace(/\s+/g, ' ')
        .replace(/^(todo[:\s-]*)/i, '')
        .replace(/[•\-\s]+$/, '')
        .trim();
    }

    function sanitizeTodos(values) {
      const out = [];
      const seen = new Set();
      const arr = Array.isArray(values) ? values : [];
      for (const raw of arr) {
        const item = cleanTodo(raw);
        if (!item) continue;
        if (/(https?:\/\/|www\.)/i.test(item)) continue;
        if (/^no (apparent )?todos?$/i.test(item)) continue;
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        if (out.length >= 3) break;
      }
      return out;
    }

    function fallbackPositionFromEmail(email) {
      const subject = safeStr(email?.subject);
      const body = stripHtmlAndNoise(email?.body || email?.originalBody || '');
      const corpus = `${subject}\n${body.slice(0, 1500)}`;

      const patterns = [
        /thank you for your interest in\s+(.{3,140}?)(?:\.|,|\n|$)/i,
        /application for\s+(.{3,140}?)(?:\.|,|\n|$)/i,
        /interview for\s+(.{3,140}?)(?:\.|,|\n|$)/i,
        /position\s*(?:for|:)?\s+(.{3,140}?)(?:\.|,|\n|$)/i,
        /role\s*(?:for|:)?\s+(.{3,140}?)(?:\.|,|\n|$)/i
      ];

      for (const pattern of patterns) {
        const match = corpus.match(pattern);
        if (match && match[1]) {
          const candidate = cleanPosition(match[1]);
          if (candidate && !/application status|your application/i.test(candidate)) {
            return candidate;
          }
        }
      }

      const subjectCandidate = cleanPosition(
        subject
          .replace(/^re:\s*/i, '')
          .replace(/^fwd:\s*/i, '')
          .replace(/your job application status.*$/i, '')
      );
      return subjectCandidate || 'Unknown Position';
    }

    async function classifyApplicationsWithGemini(items) {
      if (!Array.isArray(items) || !items.length || typeof invokeGemini !== 'function') {
        return new Map();
      }

      const limitedItems = items.slice(0, 120).map((item, idx) => ({
        idx,
        company: item.company,
        from: item.from,
        ...buildStatusInput(item.email)
      }));

      const systemPrompt = [
        'You extract job application position title and classify status from latest email updates.',
        'Return ONLY JSON (no markdown).',
        'Statuses must be one of: Offer, Rejected, Withdrawn, Interviewing, Assessment, Applied, Under Review, Waiting.',
        'Use latest email only. Position should be the role title (for example: Software Engineer Intern).',
        'If position is not identifiable, set position to "Unknown Position".',
        'If uncertain about status, choose the most conservative status.',
        'Also extract immediate action TODOs from the latest email only.',
        'Do not include URLs in TODOs.',
        'If there is no immediate action, return todos as [].'
      ].join(' ');

      const userPrompt = JSON.stringify({
        task: 'Classify each item status from latest email content',
        output_format: [
          {
            idx: 0,
            position: 'Software Engineer Intern',
            status: 'Waiting',
            todos: ['Send follow-up if no response in 10 business days'],
            confidence: 'low|medium|high',
            reason: 'brief reason'
          }
        ],
        items: limitedItems
      });

      try {
        const response = await invokeGemini({
          model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0,
          maxOutputTokens: 2400
        });

        const parsed = parseJsonFromModel(response?.content || '');
        if (!Array.isArray(parsed)) return new Map();

        const allowed = new Set(['Offer', 'Rejected', 'Withdrawn', 'Interviewing', 'Assessment', 'Applied', 'Under Review', 'Waiting']);
        const byIndex = new Map();
        for (const row of parsed) {
          const idx = Number(row?.idx);
          const status = safeStr(row?.status);
          const position = cleanPosition(row?.position) || 'Unknown Position';
          const todos = sanitizeTodos(row?.todos);
          if (!Number.isInteger(idx) || idx < 0 || idx >= limitedItems.length) continue;
          if (!allowed.has(status)) continue;
          byIndex.set(idx, { status, position, todos });
        }

        const mapped = new Map();
        for (let i = 0; i < limitedItems.length; i++) {
          const entry = byIndex.get(i);
          if (entry) mapped.set(items[i].key, entry);
        }
        return mapped;
      } catch (error) {
        console.error('Job Application Tracker: Gemini status classification failed:', error?.message || error);
        return new Map();
      }
    }

    function dateMs(email) {
      const ms = new Date(email?.date || 0).getTime();
      return Number.isFinite(ms) ? ms : 0;
    }

    function daysSince(dateValue) {
      const ms = new Date(dateValue || 0).getTime();
      if (!Number.isFinite(ms) || ms <= 0) return null;
      return Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
    }

    function followUpTodoForStale(status, lastUpdated) {
      const st = safeStr(status).toLowerCase();
      const quietDays = daysSince(lastUpdated);
      if (quietDays === null) return '';
      const pendingStates = new Set(['waiting', 'applied', 'under review', 'assessment', 'interviewing']);
      if (!pendingStates.has(st)) return '';
      if (quietDays < 10) return '';
      return `Follow up with recruiter/hiring team (${quietDays} days since last update).`;
    }

    async function loadTrackedApplications(userEmail) {
      let emails = [];
      try {
        const doc = await getUserDoc('response_emails', userEmail);
        if (doc && Array.isArray(doc.emails)) {
          emails = doc.emails;
        } else {
          emails = loadResponseEmails() || [];
        }
      } catch (_) {
        emails = loadResponseEmails() || [];
      }

      const filtered = (Array.isArray(emails) ? emails : []).filter(e => e && e.id && categoryMatch(e));
      const byCompany = new Map();

      for (const email of filtered) {
        const company = companyFromSender(email?.originalFrom || email?.from || '');
        const key = safeStr(company).toLowerCase();
        if (!key) continue;
        const existing = byCompany.get(key);
        if (!existing || dateMs(email) > dateMs(existing.email)) {
          byCompany.set(key, { company, email });
        }
      }

      const companyRows = Array.from(byCompany.values()).map(({ company, email }) => ({
        key: safeStr(company).toLowerCase(),
        company,
        email,
        from: safeStr(email?.originalFrom || email?.from)
      }));

      const aiResults = await classifyApplicationsWithGemini(companyRows);

      const applications = companyRows
        .map(({ key, company, email, from }) => {
          const ai = aiResults.get(key) || {};
          const status = ai.status || statusFromEmail(email);
          const modelTodos = sanitizeTodos(ai.todos);
          const followUpTodo = followUpTodoForStale(status, email?.date);
          const todos = followUpTodo
            ? sanitizeTodos([...modelTodos, followUpTodo])
            : modelTodos;

          return {
            position: ai.position || fallbackPositionFromEmail(email),
            company,
            status,
            todos,
            followUpSuggested: !!followUpTodo,
            lastUpdated: email?.date || null,
            latestSubject: safeStr(email?.subject) || 'No Subject',
            emailId: safeStr(email?.id),
            from
          };
        })
        .sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));

      return applications;
    }

    async function loadEmailMapForUser(userEmail, emailIds) {
      const wanted = new Set((emailIds || []).map(safeStr).filter(Boolean));
      const map = new Map();
      if (!wanted.size) return map;

      let emails = [];
      try {
        const doc = await getUserDoc('response_emails', userEmail);
        if (doc && Array.isArray(doc.emails)) emails = doc.emails;
      } catch (_) {}
      if (!emails.length) emails = loadResponseEmails() || [];

      for (const e of (Array.isArray(emails) ? emails : [])) {
        const id = safeStr(e?.id);
        if (!id || !wanted.has(id)) continue;
        map.set(id, e);
      }
      return map;
    }

    app.get('/api/job-application-tracker/list', async (req, res) => {
      try {
        const user = getCurrentUser();
        const applications = await loadTrackedApplications(user);
        return res.json({
          success: true,
          userEmail: user,
          count: applications.length,
          applications
        });
      } catch (error) {
        console.error('Job Application Tracker list failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to load job applications' });
      }
    });

    app.post('/api/job-application-tracker/followup-priority', async (req, res) => {
      try {
        const user = getCurrentUser();
        const idsInput = Array.isArray(req.body?.emailIds) ? req.body.emailIds : [];
        const emailIds = Array.from(new Set(idsInput.map(safeStr).filter(Boolean))).slice(0, 100);
        if (!emailIds.length) {
          return res.status(400).json({ success: false, error: 'emailIds are required' });
        }

        const emailMap = await loadEmailMapForUser(user, emailIds);
        const followUpByEmailId = {};
        for (const id of emailIds) {
          const email = emailMap.get(id);
          if (!email || !categoryMatch(email)) continue;
          const ageDays = daysSince(email?.date);
          if (ageDays === null || ageDays <= 2) continue;
          followUpByEmailId[id] = {
            daysOld: ageDays,
            message: `Follow up suggested (${ageDays} days since last update)`
          };
        }

        return res.json({ success: true, followUpByEmailId });
      } catch (error) {
        console.error('Job Application Tracker followup-priority failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to compute follow-up priority' });
      }
    });

    app.get('/job-application-tracker', (req, res) => {
      res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Job Application Tracker</title>
  <style>
    body { margin: 0; font-family: Google Sans, Roboto, Arial, sans-serif; background: #f6f8fc; color: #202124; }
    .wrap { max-width: 1480px; margin: 0 auto; padding: 20px 16px 28px; }
    .head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:16px; }
    .title { font-size: 28px; font-weight: 700; }
    .sub { color:#5f6368; font-size:13px; margin-top:4px; }
    .btn { border:1px solid #dadce0; border-radius:18px; background:#fff; color:#1f1f1f; padding:8px 12px; cursor:pointer; font-size:13px; }
    .card { background:#fff; border:1px solid #e5e9ef; border-radius:12px; overflow:hidden; }
    table { width:100%; border-collapse: collapse; }
    th, td { text-align:left; padding:12px 14px; border-bottom:1px solid #eef1f4; font-size:14px; vertical-align:top; }
    th { color:#5f6368; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.4px; background:#fbfcfe; }
    tr:last-child td { border-bottom:none; }
    .status { font-weight:600; }
    .status.offer { color:#137333; }
    .status.rejected, .status.withdrawn { color:#b3261e; }
    .status.interviewing, .status.assessment { color:#0b57d0; }
    .todo-cell { max-width: 360px; }
    .todo-list { margin:0; padding-left:16px; color:#3c4043; font-size:13px; line-height:1.4; }
    .todo-followup { color:#b3261e; font-weight:700; }
    .muted { color:#5f6368; font-size:12px; margin-top:4px; }
    .empty { padding:20px; color:#5f6368; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <div class="title">Job Application Tracker</div>
        <div class="sub">Grouped by company from emails in category "Job Applications". Status is based on the most recent email.</div>
      </div>
      <button id="refreshBtn" class="btn">Refresh</button>
    </div>
    <div class="card">
      <div id="content" class="empty">Loading...</div>
    </div>
  </div>

  <script>
    const content = document.getElementById('content');
    const refreshBtn = document.getElementById('refreshBtn');
    function esc(v){ return String(v||'').replace(/[&<>\"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[s])); }
    function fmtDate(v){
      const d = new Date(v || 0);
      if (Number.isNaN(d.getTime())) return 'Unknown';
      return d.toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    }
    function statusClass(s){
      const k = String(s||'').toLowerCase();
      if (k === 'offer') return 'offer';
      if (k === 'rejected') return 'rejected';
      if (k === 'withdrawn') return 'withdrawn';
      if (k === 'interviewing') return 'interviewing';
      if (k === 'assessment') return 'assessment';
      return '';
    }
    async function load(){
      content.textContent = 'Loading...';
      try {
        const r = await fetch('/api/job-application-tracker/list');
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Failed to load');
        const list = Array.isArray(d.applications) ? d.applications : [];
        if (!list.length) {
          content.innerHTML = '<div class=\"empty\">No emails found in category <strong>Job Applications</strong>.</div>';
          return;
        }
        const rows = list.map(it => \`
          <tr>
            <td><div>\${esc(it.company)}</div><div class="muted">\${esc(it.from || '')}</div></td>
            <td>\${esc(it.position || 'Unknown Position')}</td>
            <td><span class="status \${statusClass(it.status)}">\${esc(it.status)}</span></td>
            <td class="todo-cell">\${(() => {
              const todos = Array.isArray(it.todos) ? it.todos : [];
              if (!todos.length) return '<span class="muted">None</span>';
              const lis = todos.map(t => {
                const follow = /follow up/i.test(String(t || ''));
                return '<li class=\"' + (follow ? 'todo-followup' : '') + '\">' + esc(t) + '</li>';
              }).join('');
              return '<ul class=\"todo-list\">' + lis + '</ul>';
            })()}</td>
            <td>\${esc(fmtDate(it.lastUpdated))}</td>
            <td>\${esc(it.latestSubject)}</td>
          </tr>\`).join('');
        content.innerHTML = \`
          <table>
            <thead><tr><th>Company</th><th>Position</th><th>Status</th><th>TODOs (Latest Email)</th><th>Last Updated</th><th>Most Recent Email Subject</th></tr></thead>
            <tbody>\${rows}</tbody>
          </table>\`;
      } catch (e) {
        content.innerHTML = '<div class=\"empty\">Failed to load tracker data.</div>';
      }
    }
    refreshBtn.addEventListener('click', load);
    load();
  </script>
</body>
</html>`);
    });
  }
};
