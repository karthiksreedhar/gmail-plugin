/**
 * Document Thread History Backend
 * Dedicated page for threads in the user's Documents category, with version timestamps.
 */

module.exports = {
  initialize(context) {
    const { app, getUserDoc, getCurrentUser } = context;

    function safeStr(v) {
      return String(v || '').trim();
    }

    function asArray(v) {
      return Array.isArray(v) ? v : [];
    }

    function isDocumentsCategory(name) {
      const n = safeStr(name).toLowerCase();
      return n === 'document' || n === 'documents';
    }

    function normalizeThreadId(threadId) {
      const raw = safeStr(threadId);
      if (!raw) return '';
      return raw.startsWith('thread-') ? raw.slice('thread-'.length) : raw;
    }

    function getHeader(message, name) {
      const wanted = safeStr(name).toLowerCase();
      const headers = asArray(message?.payload?.headers);
      for (const h of headers) {
        if (safeStr(h?.name).toLowerCase() === wanted) return safeStr(h?.value);
      }
      return '';
    }

    function dateMsFromMessage(message) {
      const internal = Number(message?.internalDate);
      if (Number.isFinite(internal) && internal > 0) return internal;
      const headerDate = Date.parse(getHeader(message, 'Date'));
      if (Number.isFinite(headerDate) && headerDate > 0) return headerDate;
      return 0;
    }

    async function loadDocumentsCategoryEmails(userEmail) {
      const doc = await getUserDoc('response_emails', userEmail);
      const emails = asArray(doc?.emails);
      return emails.filter((email) => {
        const categories = asArray(email?.categories);
        return categories.some(isDocumentsCategory);
      });
    }

    async function loadDocumentThreads(userEmail) {
      const emails = await loadDocumentsCategoryEmails(userEmail);
      if (!emails.length) return [];

      const gmailClient = typeof context.gmail === 'function' ? await context.gmail() : null;
      const byThread = new Map();
      for (const email of emails) {
        const id = safeStr(email?.id);
        if (!id) continue;
        const threadId = normalizeThreadId(email?.threadId || email?.threadID || id);
        if (!byThread.has(threadId)) byThread.set(threadId, []);
        byThread.get(threadId).push(email);
      }

      const output = [];
      for (const [threadId, threadEmails] of byThread.entries()) {
        const sortedDesc = threadEmails
          .slice()
          .sort((a, b) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime());
        const sortedAsc = sortedDesc.slice().sort((a, b) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime());

        const subject = safeStr(sortedDesc[0]?.subject) || '(No Subject)';
        const participants = Array.from(
          new Set(
            sortedDesc
              .map((e) => safeStr(e?.from || e?.originalFrom))
              .filter(Boolean)
          )
        ).slice(0, 8);
        let versions = sortedAsc.map((email, idx) => ({
          version: idx + 1,
          sentAt: email?.date || null,
          from: safeStr(email?.from || email?.originalFrom) || 'Unknown Sender',
          subject: safeStr(email?.subject) || '(No Subject)',
          emailId: safeStr(email?.id)
        }));

        if (gmailClient && threadId) {
          try {
            const threadResp = await gmailClient.users.threads.get({
              userId: 'me',
              id: threadId,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date']
            });
            const messages = asArray(threadResp?.data?.messages);
            if (messages.length) {
              const msgSorted = messages
                .slice()
                .sort((a, b) => dateMsFromMessage(a) - dateMsFromMessage(b));
              versions = msgSorted.map((msg, idx) => ({
                version: idx + 1,
                sentAt: dateMsFromMessage(msg) ? new Date(dateMsFromMessage(msg)).toISOString() : null,
                from: getHeader(msg, 'From') || 'Unknown Sender',
                subject: getHeader(msg, 'Subject') || '(No Subject)',
                emailId: safeStr(msg?.id)
              }));
            }
          } catch (_) {
            // Keep cached fallback versions.
          }
        }

        output.push({
          threadId,
          subject,
          participants: Array.from(new Set(versions.map((v) => safeStr(v.from)).filter(Boolean))).slice(0, 8),
          lastUpdated: versions.length ? (versions[versions.length - 1].sentAt || sortedDesc[0]?.date || null) : (sortedDesc[0]?.date || null),
          emailCount: versions.length || sortedDesc.length,
          versions
        });
      }

      output.sort((a, b) => new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime());
      return output;
    }

    app.get('/api/document-thread-history/threads', async (req, res) => {
      try {
        const user = getCurrentUser();
        const threads = await loadDocumentThreads(user);
        return res.json({
          success: true,
          userEmail: user,
          count: threads.length,
          data: threads
        });
      } catch (error) {
        console.error('Document Thread History: Error fetching threads:', error);
        return res.status(500).json({ success: false, error: 'Failed to load document threads' });
      }
    });

    app.get('/document-thread-history', (req, res) => {
      res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Document Thread History</title>
  <style>
    body { margin:0; font-family: Google Sans, Roboto, Arial, sans-serif; background:#f6f8fc; color:#202124; }
    .wrap { max-width:1180px; margin:0 auto; padding:20px 16px 28px; }
    .head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:16px; }
    .title { font-size:28px; font-weight:700; }
    .sub { color:#5f6368; font-size:13px; margin-top:4px; }
    .btn { border:1px solid #dadce0; border-radius:18px; background:#fff; color:#1f1f1f; padding:8px 12px; cursor:pointer; font-size:13px; }
    .grid { display:grid; grid-template-columns: 1fr; gap:12px; }
    .card { background:#fff; border:1px solid #e5e9ef; border-radius:12px; padding:14px; }
    .subject { font-weight:700; font-size:16px; margin-bottom:6px; }
    .meta { color:#5f6368; font-size:12px; margin-bottom:8px; }
    .doc-list { margin:0; padding-left:18px; }
    .doc-list li { margin:6px 0; }
    .empty { background:#fff; border:1px solid #e5e9ef; border-radius:12px; padding:18px; color:#5f6368; }
    a { color:#0b57d0; text-decoration:none; }
    a:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <div class="title">Document Thread History</div>
        <div class="sub">Version history from email threads in your <strong>Documents</strong> category.</div>
      </div>
      <button id="refreshBtn" class="btn">Refresh</button>
    </div>
    <div id="content" class="empty">Loading document threads...</div>
  </div>
  <script>
    const content = document.getElementById('content');
    const refreshBtn = document.getElementById('refreshBtn');
    function esc(v){ return String(v||'').replace(/[&<>"']/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[s])); }
    function fmtDate(v){
      const d = new Date(v || 0);
      if (Number.isNaN(d.getTime())) return 'Unknown date';
      return d.toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    }
    async function load(){
      content.className = 'empty';
      content.textContent = 'Loading document threads...';
      try {
        const r = await fetch('/api/document-thread-history/threads');
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Failed to load');
        const list = Array.isArray(d.data) ? d.data : [];
        if (!list.length) {
          content.className = 'empty';
          content.innerHTML = "No email threads found in the <strong>Documents</strong> category.";
          return;
        }
        const html = list.map((t) => {
          const versions = Array.isArray(t.versions) ? t.versions : [];
          const versionsHtml = versions.map((v) =>
            '<li>' +
              '<strong>Version ' + esc(String(v.version || '')) + '</strong>: ' +
              esc(fmtDate(v.sentAt)) +
              ' · ' + esc(v.from || 'Unknown Sender') +
            '</li>'
          ).join('');
          const participants = Array.isArray(t.participants) ? t.participants.join(', ') : '';
          return '<div class="card">' +
            '<div class="subject">' + esc(t.subject) + '</div>' +
            '<div class="meta">' + esc(fmtDate(t.lastUpdated)) + ' · ' + esc(String(t.emailCount || 0)) + ' emails in thread</div>' +
            '<div class="meta">' + esc(participants) + '</div>' +
            '<div class="meta"><strong>Version History</strong></div>' +
            '<ul class="doc-list">' + versionsHtml + '</ul>' +
          '</div>';
        }).join('');
        content.className = 'grid';
        content.innerHTML = html;
      } catch (e) {
        content.className = 'empty';
        content.innerHTML = 'Failed to load document thread history: ' + esc(e.message || String(e));
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
