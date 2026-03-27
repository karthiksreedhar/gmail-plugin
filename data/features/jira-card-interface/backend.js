/**
 * JIRA Card Interface Backend
 * Builds a dedicated card UI from emails in the "Akify" category.
 */

module.exports = {
  initialize(context) {
    const {
      app,
      getCurrentUser,
      getUserDoc,
      loadResponseEmails,
      loadEmailThreads,
      loadUnrepliedEmails
    } = context;

    function safeStr(value) {
      return String(value || '').trim();
    }

    function normalize(value) {
      return safeStr(value).toLowerCase();
    }

    function dateMs(value) {
      const ms = new Date(value || 0).getTime();
      return Number.isFinite(ms) ? ms : 0;
    }

    function stripHtml(raw) {
      return safeStr(raw)
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function decodeHtmlEntities(value) {
      return safeStr(value)
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&#34;/g, '"')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    }

    function decodeProofpointToken(token) {
      let value = safeStr(token);
      if (!value) return '';
      value = value.replace(/-([0-9a-fA-F]{2})/g, '%$1');
      try {
        value = decodeURIComponent(value);
      } catch (_) {}
      if (value.includes('_')) value = value.replace(/_/g, '/');
      return value;
    }

    function unwrapUrl(url) {
      const raw = decodeHtmlEntities(url);
      if (!raw) return '';
      let out = raw.replace(/[)>.,;]+$/g, '');

      const wrapped = out.match(/__([^_].*?)__/);
      if (wrapped && wrapped[1]) out = decodeProofpointToken(wrapped[1]);

      for (let i = 0; i < 5; i++) {
        let parsed;
        try {
          parsed = new URL(out);
        } catch (_) {
          break;
        }
        const nextCandidate =
          parsed.searchParams.get('url') ||
          parsed.searchParams.get('u') ||
          parsed.searchParams.get('target') ||
          parsed.searchParams.get('dest') ||
          parsed.searchParams.get('redirect') ||
          parsed.searchParams.get('q');
        if (!nextCandidate) break;
        const next = safeStr(nextCandidate).includes('__')
          ? decodeProofpointToken(nextCandidate)
          : decodeHtmlEntities(nextCandidate);
        if (!next || next === out) break;
        out = next;
      }

      try {
        out = decodeURIComponent(out);
      } catch (_) {}
      return safeStr(out);
    }

    function getCategories(email) {
      const arr = Array.isArray(email?.categories) && email.categories.length
        ? email.categories
        : (email?.category ? [email.category] : []);
      return arr.map(v => safeStr(v)).filter(Boolean);
    }

    function isAkifyEmail(email) {
      const categories = getCategories(email).map(normalize);
      return categories.some(c => c === 'akify');
    }

    function normalizeEmailShape(raw, sourcePrefix = 'jira') {
      if (!raw || typeof raw !== 'object') return null;
      const sourceId = safeStr(raw.id || raw.messageId || raw.responseId || raw.threadId);
      if (!sourceId) return null;
      return {
        id: `${sourcePrefix}-${sourceId}`,
        sourceId,
        subject: safeStr(raw.subject),
        body: safeStr(raw.body || raw.originalBody),
        originalBody: safeStr(raw.originalBody || raw.body),
        snippet: safeStr(raw.snippet),
        from: safeStr(raw.originalFrom || raw.from),
        date: safeStr(raw.date || raw.lastUpdated),
        category: safeStr(raw.category),
        categories: Array.isArray(raw.categories) ? raw.categories : []
      };
    }

    function flattenThreadCollection(threads) {
      const out = [];
      for (const thread of (Array.isArray(threads) ? threads : [])) {
        const messages = Array.isArray(thread?.messages) ? thread.messages : [];
        if (!messages.length) {
          out.push({
            id: safeStr(thread?.responseId || thread?.id || thread?.threadId),
            subject: thread?.subject,
            body: thread?.body || thread?.originalBody,
            originalBody: thread?.originalBody,
            snippet: thread?.snippet,
            from: thread?.from || thread?.originalFrom,
            date: thread?.date || thread?.lastUpdated,
            category: thread?.category,
            categories: thread?.categories
          });
          continue;
        }
        for (const msg of messages) {
          out.push({
            id: safeStr(msg?.id || `${safeStr(thread?.id)}-${dateMs(msg?.date)}`),
            subject: safeStr(msg?.subject || thread?.subject),
            body: safeStr(msg?.body),
            originalBody: safeStr(msg?.body),
            snippet: '',
            from: safeStr(msg?.from || thread?.from || thread?.originalFrom),
            date: safeStr(msg?.date || thread?.date),
            category: thread?.category,
            categories: thread?.categories
          });
        }
      }
      return out;
    }

    function extractJiraKeys(text) {
      const src = safeStr(text).toUpperCase();
      if (!src) return [];
      const matches = src.match(/\b[A-Z][A-Z0-9]{1,9}-\d{1,7}\b/g) || [];
      return [...new Set(matches)];
    }

    function extractUrls(htmlOrText) {
      const src = safeStr(htmlOrText);
      if (!src) return [];
      const urls = [];
      const seen = new Set();

      const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
      let m;
      while ((m = hrefRegex.exec(src)) !== null) {
        const u = unwrapUrl(m[1]);
        if (!u || seen.has(u)) continue;
        seen.add(u);
        urls.push(u);
      }

      const urlRegex = /(https?:\/\/[^\s"'<>]+)/gi;
      while ((m = urlRegex.exec(src)) !== null) {
        const u = unwrapUrl(m[1]);
        if (!u || seen.has(u)) continue;
        seen.add(u);
        urls.push(u);
      }
      return urls;
    }

    function getJiraBaseUrl(urls) {
      for (const raw of urls || []) {
        const url = unwrapUrl(raw);
        let parsed;
        try {
          parsed = new URL(url);
        } catch (_) {
          continue;
        }
        const host = normalize(parsed.hostname);
        if (host.includes('atlassian.net')) {
          return `${parsed.protocol}//${parsed.host}`;
        }
      }
      return '';
    }

    function extractJiraUrl(email, key, fallbackBaseUrl) {
      const candidates = [
        ...extractUrls(email?.body),
        ...extractUrls(email?.originalBody),
        ...extractUrls(email?.snippet)
      ];
      const keyLower = normalize(key);
      for (const url of candidates) {
        const lower = normalize(url);
        if (!lower.startsWith('http')) continue;
        if (lower.includes('/browse/') && lower.includes(keyLower)) return url;
      }
      const base = getJiraBaseUrl(candidates) || safeStr(fallbackBaseUrl);
      if (base) return `${base}/browse/${key}`;
      for (const url of candidates) {
        const lower = normalize(url);
        if (!lower.startsWith('http')) continue;
        if (lower.includes('atlassian.net') || lower.includes('jira')) return url;
      }
      return '';
    }

    function extractDueDateText(email) {
      const text = `${safeStr(email?.subject)}\n${stripHtml(email?.body || email?.originalBody || '')}\n${safeStr(email?.snippet)}`;
      const patterns = [
        /\bdue\s+(?:on|by)?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?)/i,
        /\bdue\s+(?:on|by)?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
        /\bdeadline(?:\s+is|\s*:)?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?)/i
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m && m[1]) return safeStr(m[1]);
      }
      return '';
    }

    function formatDate(value) {
      const d = new Date(value || 0);
      if (Number.isNaN(d.getTime())) return 'Unknown';
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }

    function shortTitleFromSubject(subject, key) {
      const raw = safeStr(subject);
      if (!raw) return key || '(No subject)';
      let out = raw;
      if (key) {
        const rx = new RegExp(`\\b${key}\\b\\s*[:\\-]?\\s*`, 'i');
        out = out.replace(rx, '').trim();
      }
      return out || raw;
    }

    async function loadAkifyCards(userEmail) {
      const sources = [];
      try {
        const doc = await getUserDoc('response_emails', userEmail);
        sources.push(Array.isArray(doc?.emails) ? doc.emails : []);
      } catch (_) {
        sources.push(typeof loadResponseEmails === 'function' ? (loadResponseEmails() || []) : []);
      }

      try {
        const doc = await getUserDoc('email_threads', userEmail);
        sources.push(flattenThreadCollection(Array.isArray(doc?.threads) ? doc.threads : []));
      } catch (_) {
        sources.push(flattenThreadCollection(typeof loadEmailThreads === 'function' ? (loadEmailThreads() || []) : []));
      }

      try {
        const doc = await getUserDoc('unreplied_emails', userEmail);
        sources.push(Array.isArray(doc?.emails) ? doc.emails : []);
      } catch (_) {
        sources.push(typeof loadUnrepliedEmails === 'function' ? (loadUnrepliedEmails() || []) : []);
      }

      const unified = [];
      const seen = new Set();
      for (let i = 0; i < sources.length; i++) {
        const source = Array.isArray(sources[i]) ? sources[i] : [];
        for (const raw of source) {
          const email = normalizeEmailShape(raw, `jira-src${i}`);
          if (!email || !email.sourceId) continue;
          const dedupeKey = `${email.sourceId}::${normalize(email.subject)}::${email.date}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          unified.push(email);
        }
      }

      const akifyEmails = unified
        .filter(isAkifyEmail)
        .sort((a, b) => dateMs(b.date) - dateMs(a.date));
      const fallbackJiraBaseUrl = getJiraBaseUrl(
        akifyEmails.flatMap((email) => [
          ...extractUrls(email?.body),
          ...extractUrls(email?.originalBody),
          ...extractUrls(email?.snippet)
        ])
      );

      const byKey = new Map();
      for (const email of akifyEmails) {
        const combined = `${email.subject}\n${stripHtml(email.body || email.originalBody || '')}\n${email.snippet}`;
        const keys = extractJiraKeys(combined);
        if (!keys.length) continue;

        for (const key of keys) {
          const existing = byKey.get(key);
          const currentDateMs = dateMs(email.date);
          const row = {
            key,
            subject: shortTitleFromSubject(email.subject, key),
            date: email.date || null,
            dateLabel: formatDate(email.date),
            dueDateText: extractDueDateText(email),
            url: extractJiraUrl(email, key, fallbackJiraBaseUrl),
            from: safeStr(email.from) || 'Unknown sender',
            emailId: email.sourceId,
            matchedCount: existing ? existing.matchedCount + 1 : 1
          };

          if (!existing || currentDateMs >= dateMs(existing.date)) {
            byKey.set(key, row);
          } else if (existing) {
            existing.matchedCount += 1;
            if (!existing.url && row.url) existing.url = row.url;
            if (!existing.dueDateText && row.dueDateText) existing.dueDateText = row.dueDateText;
            byKey.set(key, existing);
          }
        }
      }

      const cards = Array.from(byKey.values())
        .sort((a, b) => dateMs(b.date) - dateMs(a.date));

      return {
        totalScanned: unified.length,
        akifyEmailCount: akifyEmails.length,
        cardCount: cards.length,
        cards
      };
    }

    app.get('/api/jira-card-interface/cards', async (req, res) => {
      try {
        const user = getCurrentUser();
        const data = await loadAkifyCards(user);
        return res.json({ success: true, userEmail: user, ...data });
      } catch (error) {
        console.error('JIRA Card Interface cards failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to load JIRA cards' });
      }
    });

    app.get('/jira-card-interface', (req, res) => {
      res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>JIRA Card Interface</title>
  <style>
    :root {
      --bg:#f6f8fc;
      --card:#ffffff;
      --text:#202124;
      --muted:#5f6368;
      --border:#e4e8ef;
      --brand:#0b57d0;
      --chip:#e8f0fe;
    }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:Google Sans, Roboto, Arial, sans-serif; }
    .wrap { max-width:1240px; margin:0 auto; padding:20px 16px 28px; }
    .head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; }
    .title { font-size:30px; font-weight:700; }
    .sub { color:var(--muted); font-size:13px; margin-top:4px; line-height:1.45; }
    .meta { color:var(--muted); font-size:12px; margin:8px 0 12px; }
    .controls { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
    .controls label { font-size:13px; color:#3c4043; }
    .select { border:1px solid #d8dce3; background:#fff; border-radius:8px; padding:8px 10px; font-size:13px; color:#1f1f1f; min-width:190px; }
    .btn { border:1px solid #d8dce3; background:#fff; color:#1f1f1f; border-radius:18px; padding:8px 12px; font-size:13px; cursor:pointer; }
    .empty { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:18px; color:var(--muted); }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:12px; }
    .card { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:14px; box-shadow:0 1px 2px rgba(15,23,42,0.05); }
    .key { display:inline-block; border-radius:999px; background:var(--chip); color:var(--brand); border:1px solid #d2e3fc; padding:3px 9px; font-size:11px; font-weight:700; margin-bottom:8px; }
    .subject { font-size:16px; line-height:1.35; font-weight:700; margin:0 0 8px; }
    .row { font-size:12px; color:#3c4043; margin:4px 0; line-height:1.35; }
    .label { color:var(--muted); margin-right:6px; }
    a { color:var(--brand); text-decoration:none; font-weight:600; }
    a:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <div class="title">JIRA Card Interface</div>
        <div class="sub">JIRA cards parsed from emails in your <strong>Akify</strong> category.</div>
      </div>
      <button id="refreshBtn" class="btn">Refresh</button>
    </div>
    <div id="meta" class="meta"></div>
    <div class="controls">
      <label for="dateFilter">Date:</label>
      <select id="dateFilter" class="select" disabled>
        <option value="all">All Dates</option>
      </select>
    </div>
    <div id="content" class="empty">Loading JIRA cards...</div>
  </div>

  <script>
    const meta = document.getElementById('meta');
    const content = document.getElementById('content');
    const refreshBtn = document.getElementById('refreshBtn');
    const dateFilter = document.getElementById('dateFilter');
    let allCards = [];

    function esc(v){ return String(v || '').replace(/[&<>"']/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
    function dateKey(value){
      const d = new Date(value || 0);
      if (Number.isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }
    function dateLabel(key){
      const d = new Date(key + 'T12:00:00');
      if (Number.isNaN(d.getTime())) return key;
      return d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
    }

    function renderCards() {
      const selected = dateFilter.value || 'all';
      const cards = selected === 'all'
        ? allCards
        : allCards.filter((c) => dateKey(c.date) === selected);

      if (!cards.length) {
        content.className = 'empty';
        content.innerHTML = selected === 'all'
          ? 'No JIRA cards were found in Akify emails yet.'
          : 'No JIRA cards found for the selected date.';
        return;
      }

      content.className = 'grid';
      content.innerHTML = cards.map((c) => {
          const due = c.dueDateText ? '<div class="row"><span class="label">Due:</span>' + esc(c.dueDateText) + '</div>' : '';
          const url = c.url
            ? '<div class="row"><a href="' + esc(c.url) + '" target="_blank" rel="noopener">Open JIRA URL</a></div>'
            : '<div class="row" style="color:#9aa0a6;">No JIRA URL found</div>';
          return '<div class="card">' +
            '<div class="key">' + esc(c.key) + '</div>' +
            '<div class="subject">' + esc(c.subject || '(No subject)') + '</div>' +
            '<div class="row"><span class="label">Latest Email:</span>' + esc(c.dateLabel || 'Unknown') + '</div>' +
            due +
            '<div class="row"><span class="label">Owner Email:</span>' + esc(c.from || 'Unknown sender') + '</div>' +
            '<div class="row"><span class="label">Matched Emails:</span>' + esc(c.matchedCount || 1) + '</div>' +
            url +
          '</div>';
        }).join('');
    }

    function populateDateFilter() {
      const keys = [...new Set(allCards.map((c) => dateKey(c.date)).filter(Boolean))]
        .sort((a, b) => b.localeCompare(a));
      dateFilter.innerHTML = '<option value="all">All Dates</option>' +
        keys.map((key) => '<option value="' + esc(key) + '">' + esc(dateLabel(key)) + '</option>').join('');
      dateFilter.disabled = false;
    }

    async function loadCards() {
      content.className = 'empty';
      content.textContent = 'Loading JIRA cards...';
      meta.textContent = '';
      dateFilter.disabled = true;
      try {
        const r = await fetch('/api/jira-card-interface/cards');
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Failed to load cards');

        allCards = Array.isArray(d.cards) ? d.cards : [];
        meta.textContent = (d.totalScanned || 0) + ' emails scanned · ' + (d.akifyEmailCount || 0) + ' Akify emails · ' + (d.cardCount || 0) + ' unique JIRA cards';
        populateDateFilter();
        renderCards();
      } catch (e) {
        content.className = 'empty';
        content.innerHTML = 'Failed to load JIRA cards: ' + esc(e.message || String(e));
      }
    }

    dateFilter.addEventListener('change', renderCards);
    refreshBtn.addEventListener('click', loadCards);
    loadCards();
  </script>
</body>
</html>`);
    });
  }
};
