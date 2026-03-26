/**
 * Document Thread History Backend
 * Dedicated page for threads in the user's Documents category, with PDF attachments.
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

    function walkParts(parts, out) {
      for (const part of asArray(parts)) {
        if (!part || typeof part !== 'object') continue;
        const filename = safeStr(part.filename);
        const mimeType = safeStr(part.mimeType).toLowerCase();
        const attachmentId = safeStr(part?.body?.attachmentId);
        const isPdf = filename.toLowerCase().endsWith('.pdf') || mimeType === 'application/pdf';
        if (isPdf && attachmentId) {
          out.push({
            filename: filename || 'document.pdf',
            mimeType: mimeType || 'application/pdf',
            attachmentId
          });
        }
        if (Array.isArray(part.parts) && part.parts.length) {
          walkParts(part.parts, out);
        }
      }
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

      const byThread = new Map();
      for (const email of emails) {
        const id = safeStr(email?.id);
        if (!id) continue;
        const threadId = safeStr(email?.threadId || email?.threadID || id);
        if (!byThread.has(threadId)) byThread.set(threadId, []);
        byThread.get(threadId).push(email);
      }

      const output = [];
      for (const [threadId, threadEmails] of byThread.entries()) {
        const sorted = threadEmails
          .slice()
          .sort((a, b) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime());

        const subject = safeStr(sorted[0]?.subject) || '(No Subject)';
        const participants = Array.from(
          new Set(
            sorted
              .map((e) => safeStr(e?.from || e?.originalFrom))
              .filter(Boolean)
          )
        ).slice(0, 8);

        const documents = [];
        for (const email of sorted.slice(0, 8)) {
          const messageId = safeStr(email?.id);
          if (!messageId || typeof context.getGmailEmail !== 'function') continue;
          try {
            const gmailEmail = await context.getGmailEmail(messageId);
            const found = [];
            walkParts(gmailEmail?.payload?.parts || [], found);
            if (gmailEmail?.payload && found.length === 0) {
              walkParts([gmailEmail.payload], found);
            }
            for (const doc of found) {
              documents.push({
                messageId,
                attachmentId: doc.attachmentId,
                filename: doc.filename,
                mimeType: doc.mimeType,
                url: `/api/document-thread-history/download/${encodeURIComponent(messageId)}/${encodeURIComponent(doc.attachmentId)}?filename=${encodeURIComponent(doc.filename)}`
              });
            }
          } catch (_) {
            // Skip individual message failures but keep the thread.
          }
        }

        if (!documents.length) continue;
        output.push({
          threadId,
          subject,
          participants,
          lastUpdated: sorted[0]?.date || null,
          emailCount: sorted.length,
          documents
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

    app.get('/api/document-thread-history/download/:messageId/:attachmentId', async (req, res) => {
      try {
        const { messageId, attachmentId } = req.params;
        const filename = safeStr(req.query?.filename) || 'document.pdf';

        if (typeof context.gmail !== 'function') {
          return res.status(500).json({ success: false, error: 'Gmail client unavailable' });
        }

        const gmailClient = await context.gmail();
        const response = await gmailClient.users.messages.attachments.get({
          userId: 'me',
          messageId: decodeURIComponent(messageId),
          id: decodeURIComponent(attachmentId)
        });

        const encoded = safeStr(response?.data?.data);
        if (!encoded) {
          return res.status(404).json({ success: false, error: 'Attachment not found' });
        }

        const fileData = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
        return res.send(fileData);
      } catch (error) {
        console.error('Document Thread History: Error downloading attachment:', error);
        return res.status(500).json({ success: false, error: 'Failed to download attachment' });
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
        <div class="sub">PDF attachments from email threads in your <strong>Documents</strong> category.</div>
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
          content.innerHTML = "No PDF documents found in the <strong>Documents</strong> category threads.";
          return;
        }
        const html = list.map((t) => {
          const docs = Array.isArray(t.documents) ? t.documents : [];
          const docsHtml = docs.map((doc) =>
            '<li><a href="' + esc(doc.url) + '" target="_blank" rel="noopener">' + esc(doc.filename || 'document.pdf') + '</a></li>'
          ).join('');
          const participants = Array.isArray(t.participants) ? t.participants.join(', ') : '';
          return '<div class="card">' +
            '<div class="subject">' + esc(t.subject) + '</div>' +
            '<div class="meta">' + esc(fmtDate(t.lastUpdated)) + ' · ' + esc(String(t.emailCount || 0)) + ' emails in thread</div>' +
            '<div class="meta">' + esc(participants) + '</div>' +
            '<ul class="doc-list">' + docsHtml + '</ul>' +
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
