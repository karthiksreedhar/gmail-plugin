/**
 * Newsletter Terminal Backend
 * Dedicated Bloomberg-style newsletter page and feed API.
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
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    function unwrapUrl(url) {
      const raw = safeStr(url);
      if (!raw) return '';
      let out = raw.replace(/&amp;/g, '&').replace(/[)>.,;]+$/g, '');
      const wrapped = out.match(/__([^_].*?)__/);
      if (wrapped && wrapped[1]) out = wrapped[1];
      try {
        return decodeURIComponent(out);
      } catch (_) {
        return out;
      }
    }

    function getEmailCategories(email) {
      const fromArray = Array.isArray(email?.categories) ? email.categories : [];
      const fromPrimary = email?.category ? [email.category] : [];
      return [...fromArray, ...fromPrimary]
        .map(v => safeStr(v))
        .filter(Boolean);
    }

    function normalizeCategory(value) {
      return safeStr(value).toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
    }

    function isNewsletterCategory(email) {
      const categories = getEmailCategories(email).map(normalizeCategory);
      return categories.some(cat =>
        cat === 'newsletters and updates' ||
        cat === 'newsletter and updates' ||
        cat === 'newsletters updates' ||
        cat.includes('newsletter')
      );
    }

    function isLikelyNewsletterEmail(email) {
      if (isNewsletterCategory(email)) return true;
      const subject = safeStr(email?.subject).toLowerCase();
      const from = safeStr(email?.originalFrom || email?.from).toLowerCase();
      return subject.includes('newsletter') ||
        subject.includes('digest') ||
        subject.includes('briefing') ||
        subject.includes('weekly update') ||
        from.includes('newsletter') ||
        from.includes('digest') ||
        from.includes('substack') ||
        from.includes('mailchimp');
    }

    function isNoiseLink(url) {
      const u = safeStr(url).toLowerCase();
      if (!u.startsWith('http')) return true;
      return u.includes('unsubscribe') ||
        u.includes('preferences') ||
        u.includes('privacy') ||
        u.includes('terms') ||
        u.includes('view-in-browser') ||
        u.includes('manage') ||
        u.includes('optout');
    }

    function extractLinks(email) {
      const text = stripHtml(email?.body || email?.originalBody || email?.snippet || '');
      const regex = /(https?:\/\/[^\s"'<>]+)/g;
      const seen = new Set();
      const links = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        const url = unwrapUrl(match[1]);
        if (!url || seen.has(url) || isNoiseLink(url)) continue;
        seen.add(url);
        links.push(url);
        if (links.length >= 3) break;
      }
      return links;
    }

    function extractPreview(email) {
      const snippet = safeStr(email?.snippet);
      if (snippet) return snippet.slice(0, 220);
      const text = stripHtml(email?.body || email?.originalBody || '');
      const firstLine = safeStr(text.split(/\r?\n/).find(line => safeStr(line)));
      return (firstLine || 'No preview available').slice(0, 220);
    }

    function normalizeEmailShape(entry, fallbackIdPrefix) {
      if (!entry || typeof entry !== 'object') return null;
      const id = safeStr(entry.id || entry.threadId || entry.messageId || '');
      return {
        ...entry,
        id: id || `${fallbackIdPrefix}-${Math.random().toString(36).slice(2, 10)}`
      };
    }

    function flattenThreadCollection(rawThreads) {
      const out = [];
      if (!Array.isArray(rawThreads)) return out;
      for (const thread of rawThreads) {
        const messages = Array.isArray(thread?.messages) ? thread.messages : [];
        if (messages.length) {
          const latest = messages[messages.length - 1] || {};
          out.push({
            id: safeStr(thread?.id || latest?.id || latest?.messageId),
            threadId: safeStr(thread?.id || latest?.threadId),
            subject: latest?.subject || thread?.subject,
            body: latest?.body || latest?.originalBody,
            originalBody: latest?.originalBody,
            snippet: latest?.snippet || thread?.snippet,
            from: latest?.from,
            originalFrom: latest?.originalFrom || thread?.originalFrom,
            date: latest?.date || thread?.lastUpdated || thread?.date,
            category: latest?.category || thread?.category,
            categories: latest?.categories || thread?.categories
          });
          continue;
        }
        out.push({
          id: safeStr(thread?.id || thread?.threadId),
          subject: thread?.subject,
          body: thread?.body || thread?.originalBody,
          originalBody: thread?.originalBody,
          snippet: thread?.snippet,
          from: thread?.from,
          originalFrom: thread?.originalFrom,
          date: thread?.date || thread?.lastUpdated,
          category: thread?.category,
          categories: thread?.categories
        });
      }
      return out;
    }

    async function loadNewsletterFeed(userEmail) {
      const sources = [];

      try {
        const doc = await getUserDoc('response_emails', userEmail);
        sources.push(Array.isArray(doc?.emails) ? doc.emails : []);
      } catch (_) {
        sources.push(loadResponseEmails() || []);
      }

      try {
        const doc = await getUserDoc('email_threads', userEmail);
        sources.push(flattenThreadCollection(Array.isArray(doc?.threads) ? doc.threads : []));
      } catch (_) {
        sources.push(flattenThreadCollection(loadEmailThreads() || []));
      }

      try {
        const doc = await getUserDoc('unreplied_emails', userEmail);
        sources.push(Array.isArray(doc?.emails) ? doc.emails : []);
      } catch (_) {
        sources.push(loadUnrepliedEmails() || []);
      }

      const unified = [];
      const seenIds = new Set();
      for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
        const source = Array.isArray(sources[sourceIndex]) ? sources[sourceIndex] : [];
        for (const rawEmail of source) {
          const email = normalizeEmailShape(rawEmail, `newsletter-${sourceIndex}`);
          if (!email || !email.id || seenIds.has(email.id)) continue;
          seenIds.add(email.id);
          unified.push(email);
        }
      }

      const inCategory = unified.filter(isNewsletterCategory);
      const fallback = inCategory.length ? inCategory : unified.filter(isLikelyNewsletterEmail);
      const selected = fallback.sort((a, b) => dateMs(b.date) - dateMs(a.date)).slice(0, 80);

      const entries = selected.slice(0, 40).map((email, index) => {
        const categories = getEmailCategories(email);
        const category = categories.find(c => c.toLowerCase().includes('newsletter')) || categories[0] || 'Uncategorized';
        return {
          rank: index + 1,
          id: safeStr(email.id),
          subject: safeStr(email.subject) || '(No subject)',
          from: safeStr(email.originalFrom || email.from) || 'Unknown sender',
          date: safeStr(email.date) || null,
          category,
          preview: extractPreview(email),
          links: extractLinks(email)
        };
      });

      return {
        totalScanned: unified.length,
        matchedCount: selected.length,
        categoryMatchUsed: inCategory.length > 0,
        entries
      };
    }

    app.get('/api/newsletter-terminal/feed', async (req, res) => {
      try {
        const user = getCurrentUser();
        const data = await loadNewsletterFeed(user);
        return res.json({
          success: true,
          userEmail: user,
          ...data
        });
      } catch (error) {
        console.error('Newsletter Terminal feed failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to load newsletter terminal feed' });
      }
    });

    app.get('/newsletter-terminal', (req, res) => {
      res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Newsletter Terminal</title>
  <style>
    :root {
      --term-bg: #050505;
      --term-panel: #0d0d0d;
      --term-grid: #1f1f1f;
      --term-text: #f2f2f2;
      --term-dim: #b7b7b7;
      --term-accent: #ff9f00;
      --term-accent-soft: #2b1e00;
      --term-positive: #25d366;
      --term-negative: #ff4d4d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top right, #1a1a1a 0%, var(--term-bg) 45%);
      color: var(--term-text);
      font-family: "IBM Plex Mono", "JetBrains Mono", "SFMono-Regular", Menlo, Monaco, monospace;
    }
    .wrap {
      max-width: 1400px;
      margin: 0 auto;
      padding: 18px 18px 24px;
    }
    .head {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 14px;
      align-items: center;
      margin-bottom: 14px;
      background: linear-gradient(180deg, #121212 0%, #0a0a0a 100%);
      border: 1px solid #252525;
      border-left: 4px solid var(--term-accent);
      padding: 12px 14px;
    }
    .title {
      font-size: 20px;
      letter-spacing: 1px;
      color: var(--term-accent);
      font-weight: 700;
    }
    .sub {
      color: var(--term-dim);
      font-size: 12px;
      margin-top: 4px;
    }
    .controls { display: flex; gap: 8px; }
    .btn {
      border: 1px solid #404040;
      background: #161616;
      color: var(--term-text);
      padding: 8px 12px;
      font-size: 12px;
      letter-spacing: .2px;
      cursor: pointer;
    }
    .btn:hover { border-color: var(--term-accent); color: var(--term-accent); }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .stat {
      background: var(--term-panel);
      border: 1px solid #282828;
      padding: 10px;
      min-height: 58px;
    }
    .stat .k { color: var(--term-dim); font-size: 11px; }
    .stat .v { margin-top: 4px; font-size: 18px; color: var(--term-accent); font-weight: 700; }
    .grid {
      display: grid;
      grid-template-columns: minmax(420px, 1fr) minmax(420px, 1fr);
      gap: 12px;
    }
    .panel {
      background: var(--term-panel);
      border: 1px solid #2b2b2b;
      min-height: 70vh;
      display: flex;
      flex-direction: column;
    }
    .panel-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #2b2b2b;
      padding: 10px 12px;
      font-size: 12px;
      color: var(--term-dim);
      text-transform: uppercase;
      letter-spacing: .6px;
    }
    .list {
      overflow: auto;
      padding: 4px 0;
    }
    .row {
      padding: 10px 12px;
      border-bottom: 1px solid #1f1f1f;
      cursor: pointer;
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 8px;
    }
    .row:hover { background: #141414; }
    .row.active {
      background: linear-gradient(90deg, var(--term-accent-soft) 0%, #121212 55%);
      border-left: 3px solid var(--term-accent);
      padding-left: 9px;
    }
    .rank { color: var(--term-accent); font-size: 12px; margin-top: 2px; }
    .subject { font-size: 13px; line-height: 1.35; font-weight: 600; }
    .meta { margin-top: 6px; color: var(--term-dim); font-size: 11px; }
    .pill {
      display: inline-block;
      margin-top: 6px;
      font-size: 10px;
      padding: 2px 6px;
      border: 1px solid #3a3a3a;
      color: #ddd;
      background: #111;
    }
    .detail {
      padding: 14px;
      overflow: auto;
    }
    .detail h2 { margin: 0 0 10px; font-size: 18px; color: var(--term-accent); line-height: 1.3; }
    .detail .m { color: var(--term-dim); font-size: 12px; margin-bottom: 10px; }
    .detail p {
      margin: 0;
      color: #e7e7e7;
      line-height: 1.6;
      font-size: 13px;
      white-space: pre-wrap;
    }
    .links { margin-top: 14px; display: grid; gap: 8px; }
    .link {
      border: 1px solid #2f2f2f;
      background: #0b0b0b;
      padding: 8px;
      color: #a7d3ff;
      text-decoration: none;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .link:hover { border-color: var(--term-accent); color: var(--term-accent); }
    .empty {
      color: var(--term-dim);
      padding: 16px;
      font-size: 13px;
      border-top: 1px solid #1f1f1f;
    }
    .loading {
      color: var(--term-accent);
      animation: pulse 1s ease-in-out infinite;
    }
    @keyframes pulse { 0% { opacity:.45; } 50% { opacity:1; } 100% { opacity:.45; } }
    @media (max-width: 980px) {
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid { grid-template-columns: 1fr; }
      .panel { min-height: 42vh; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <div class="title">NEWSLETTER TERMINAL</div>
        <div class="sub">Bloomberg-style live brief for newsletter mailflow</div>
      </div>
      <div class="controls">
        <button id="refreshBtn" class="btn">Refresh Feed</button>
        <button id="closeBtn" class="btn">Close</button>
      </div>
    </div>

    <section class="stats">
      <div class="stat"><div class="k">User</div><div id="statUser" class="v">-</div></div>
      <div class="stat"><div class="k">Emails Scanned</div><div id="statScanned" class="v">0</div></div>
      <div class="stat"><div class="k">Matches</div><div id="statMatched" class="v">0</div></div>
      <div class="stat"><div class="k">Match Mode</div><div id="statMode" class="v">HEUR</div></div>
    </section>

    <section class="grid">
      <div class="panel">
        <div class="panel-head">
          <span>Newsletter Stream</span>
          <span id="listStatus" class="loading">Loading...</span>
        </div>
        <div id="list" class="list"></div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <span>Message Brief</span>
          <span id="detailStatus">Select a row</span>
        </div>
        <div id="detail" class="detail">
          <div class="empty">Select a newsletter from the stream to inspect details and links.</div>
        </div>
      </div>
    </section>
  </div>

  <script>
    const state = { entries: [], selectedId: null };
    const listEl = document.getElementById('list');
    const detailEl = document.getElementById('detail');
    const listStatusEl = document.getElementById('listStatus');
    const detailStatusEl = document.getElementById('detailStatus');
    const statUserEl = document.getElementById('statUser');
    const statScannedEl = document.getElementById('statScanned');
    const statMatchedEl = document.getElementById('statMatched');
    const statModeEl = document.getElementById('statMode');
    const refreshBtn = document.getElementById('refreshBtn');
    const closeBtn = document.getElementById('closeBtn');

    function esc(v) {
      return String(v || '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
    }

    function fmtDate(v) {
      const d = new Date(v || 0);
      if (Number.isNaN(d.getTime())) return 'Unknown date';
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }

    function renderList() {
      if (!state.entries.length) {
        listEl.innerHTML = '<div class="empty">No newsletters found. Try refreshing after sync.</div>';
        return;
      }
      listEl.innerHTML = state.entries.map(entry => {
        const active = state.selectedId === entry.id ? 'active' : '';
        return (
          '<div class="row ' + active + '" data-id="' + esc(entry.id) + '">' +
            '<div class="rank">#' + Number(entry.rank || 0) + '</div>' +
            '<div>' +
              '<div class="subject">' + esc(entry.subject) + '</div>' +
              '<div class="meta">' + esc(entry.from) + ' · ' + esc(fmtDate(entry.date)) + '</div>' +
              '<span class="pill">' + esc(entry.category || 'Uncategorized') + '</span>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      listEl.querySelectorAll('.row').forEach(row => {
        row.addEventListener('click', () => {
          const id = row.getAttribute('data-id');
          state.selectedId = id;
          renderList();
          renderDetail(id);
        });
      });
    }

    function renderDetail(id) {
      const entry = state.entries.find(e => String(e.id) === String(id));
      if (!entry) {
        detailEl.innerHTML = '<div class="empty">Newsletter selection unavailable.</div>';
        detailStatusEl.textContent = 'Unavailable';
        return;
      }
      detailStatusEl.textContent = 'Rank #' + Number(entry.rank || 0);
      const links = Array.isArray(entry.links) ? entry.links : [];
      const linksHtml = links.length
        ? ('<div class="links">' + links.map(link => '<a class="link" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(link) + '</a>').join('') + '</div>')
        : '<div class="empty">No clean links extracted from this email.</div>';

      detailEl.innerHTML =
        '<h2>' + esc(entry.subject) + '</h2>' +
        '<div class="m">' + esc(entry.from) + ' · ' + esc(fmtDate(entry.date)) + ' · ' + esc(entry.category || 'Uncategorized') + '</div>' +
        '<p>' + esc(entry.preview || 'No preview available') + '</p>' +
        linksHtml;
    }

    async function loadFeed() {
      refreshBtn.disabled = true;
      listStatusEl.textContent = 'Loading...';
      listStatusEl.classList.add('loading');
      detailStatusEl.textContent = 'Waiting for feed';
      try {
        const response = await fetch('/api/newsletter-terminal/feed');
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to load feed');
        }
        state.entries = Array.isArray(data.entries) ? data.entries : [];
        if (!state.selectedId && state.entries.length) state.selectedId = state.entries[0].id;
        if (state.selectedId && !state.entries.some(e => String(e.id) === String(state.selectedId))) {
          state.selectedId = state.entries.length ? state.entries[0].id : null;
        }
        statUserEl.textContent = esc(String(data.userEmail || '-').split('@')[0] || '-');
        statScannedEl.textContent = String(data.totalScanned || 0);
        statMatchedEl.textContent = String(data.matchedCount || 0);
        statModeEl.textContent = data.categoryMatchUsed ? 'CATEGORY' : 'HEUR';
        renderList();
        if (state.selectedId) renderDetail(state.selectedId);
        if (!state.entries.length) {
          detailEl.innerHTML = '<div class="empty">No newsletter details to show.</div>';
          detailStatusEl.textContent = 'No data';
        }
        listStatusEl.textContent = state.entries.length ? (state.entries.length + ' loaded') : 'No matches';
      } catch (error) {
        listEl.innerHTML = '<div class="empty">Failed to load newsletter feed.</div>';
        detailEl.innerHTML = '<div class="empty">' + esc(error.message || 'Failed to load') + '</div>';
        detailStatusEl.textContent = 'Error';
        listStatusEl.textContent = 'Error';
      } finally {
        listStatusEl.classList.remove('loading');
        refreshBtn.disabled = false;
      }
    }

    refreshBtn.addEventListener('click', loadFeed);
    closeBtn.addEventListener('click', () => window.close());
    loadFeed();
  </script>
</body>
</html>`);
    });
  }
};
