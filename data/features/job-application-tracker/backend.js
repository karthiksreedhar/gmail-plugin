/**
 * Job Application Tracker Backend
 * Creates a dedicated page + API for company/status tracking from "Job Applications" emails.
 */

module.exports = {
  initialize(context) {
    const { app, getCurrentUser, getUserDoc, loadResponseEmails } = context;

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

    function dateMs(email) {
      const ms = new Date(email?.date || 0).getTime();
      return Number.isFinite(ms) ? ms : 0;
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

      const applications = Array.from(byCompany.values())
        .map(({ company, email }) => ({
          company,
          status: statusFromEmail(email),
          lastUpdated: email?.date || null,
          latestSubject: safeStr(email?.subject) || 'No Subject',
          emailId: safeStr(email?.id),
          from: safeStr(email?.originalFrom || email?.from)
        }))
        .sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));

      return applications;
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

    app.get('/job-application-tracker', (req, res) => {
      res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Job Application Tracker</title>
  <style>
    body { margin: 0; font-family: Google Sans, Roboto, Arial, sans-serif; background: #f6f8fc; color: #202124; }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 20px 16px 28px; }
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
            <td><span class="status \${statusClass(it.status)}">\${esc(it.status)}</span></td>
            <td>\${esc(fmtDate(it.lastUpdated))}</td>
            <td>\${esc(it.latestSubject)}</td>
          </tr>\`).join('');
        content.innerHTML = \`
          <table>
            <thead><tr><th>Company</th><th>Status</th><th>Last Updated</th><th>Most Recent Email Subject</th></tr></thead>
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
