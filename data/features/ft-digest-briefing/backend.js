/**
 * FT Digest Briefing Backend
 * Builds a dedicated page of recent FT digest article summaries + links.
 */

module.exports = {
  initialize(context) {
    const {
      app,
      getCurrentUser,
      getUserDoc,
      loadResponseEmails,
      loadEmailThreads,
      loadUnrepliedEmails,
      invokeGemini,
      getGeminiModel
    } = context;

    function safeStr(value) {
      return String(value || '').trim();
    }

    function htmlDecode(text) {
      return safeStr(text)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }

    function stripHtml(raw) {
      return safeStr(raw)
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function unwrapUrlDefense(url) {
      const raw = safeStr(url);
      if (!raw) return '';

      let value = raw;
      const wrapped = value.match(/__([^_].*?)__;/);
      if (wrapped && wrapped[1]) value = wrapped[1];

      value = value
        .replace(/&amp;/g, '&')
        .replace(/[)>.,;]+$/g, '');

      try {
        return decodeURIComponent(value);
      } catch (_) {
        return value;
      }
    }

    function isFtDigestEmail(email) {
      const cats = Array.isArray(email?.categories) && email.categories.length
        ? email.categories
        : (email?.category ? [email.category] : []);
      const categoryHit = cats.some(cat => {
        const label = safeStr(cat).toLowerCase();
        return label === 'financial times digests'
          || (label.includes('financial times') && label.includes('digest'))
          || (label.includes('ft') && label.includes('digest'));
      });
      if (categoryHit) return true;

      const from = safeStr(email?.originalFrom || email?.from).toLowerCase();
      const subject = safeStr(email?.subject).toLowerCase();
      return from.includes('news-alerts.ft.com')
        || from.includes('myft@')
        || from.includes('@ft.com')
        || subject.includes('myft daily digest')
        || subject.includes('financial times');
    }

    function isLikelyArticleUrl(url) {
      const u = safeStr(url).toLowerCase();
      if (!u.startsWith('http')) return false;
      if (u.includes('/preferences') || u.includes('/unsubscribe') || u.includes('/privacy') || u.includes('/terms')) return false;
      if (u.includes('/wf/open') || u.includes('/register') || u.includes('/login')) return false;
      if (u.includes('email.news-alerts.ft.com/c/')) return true;
      if (u.includes('ft.com/content/')) return true;
      return false;
    }

    function looksLikeHeading(text) {
      const value = safeStr(text);
      if (!value) return false;
      const lower = value.toLowerCase();
      if (lower === 'technology' || lower === 'world' || lower === 'us' || lower === 'markets' || lower === 'opinion') return true;
      if (/^[A-Z\s-]+$/.test(value) && value.length <= 24) return true;
      if (/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},\s+\d{4}$/i.test(value)) return true;
      return false;
    }

    function findNearestTitle(lines, urlIndex) {
      for (let i = 1; i <= 4; i++) {
        const candidate = safeStr(lines[urlIndex - i]);
        if (!candidate) continue;
        if (candidate.includes('http://') || candidate.includes('https://')) continue;
        if (looksLikeHeading(candidate)) continue;
        if (candidate.length < 12 || candidate.length > 220) continue;
        return htmlDecode(candidate.replace(/^[-•\s]+/, ''));
      }
      return '';
    }

    function findShortSummary(lines, titleIndex, urlIndex) {
      for (let i = titleIndex + 1; i < urlIndex; i++) {
        const text = safeStr(lines[i]);
        if (!text) continue;
        if (text.includes('http://') || text.includes('https://')) continue;
        if (looksLikeHeading(text)) continue;
        if (text.length < 20 || text.length > 260) continue;
        return htmlDecode(text);
      }
      return '';
    }

    function extractArticlesFromEmail(email) {
      const text = stripHtml(email?.body || email?.originalBody || email?.snippet || '');
      const lines = text.split(/\r?\n/).map(line => safeStr(line)).filter(Boolean);

      const articles = [];
      const seenUrls = new Set();
      const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const matches = line.match(urlRegex);
        if (!matches) continue;

        for (const rawUrl of matches) {
          const url = unwrapUrlDefense(rawUrl);
          if (!url || seenUrls.has(url) || !isLikelyArticleUrl(url)) continue;
          seenUrls.add(url);

          const title = findNearestTitle(lines, i) || safeStr(email?.subject) || 'FT Article';
          const titleIndex = Math.max(0, i - 1);
          const summary = findShortSummary(lines, titleIndex, i);

          articles.push({
            title,
            summary,
            url,
            date: safeStr(email?.date) || null,
            sourceSubject: safeStr(email?.subject) || 'myFT Daily Digest'
          });
        }
      }

      return articles;
    }

    function dateMs(value) {
      const ms = new Date(value || 0).getTime();
      return Number.isFinite(ms) ? ms : 0;
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
            snippet: latest?.snippet || thread?.snippet,
            originalBody: latest?.originalBody,
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
          snippet: thread?.snippet,
          originalBody: thread?.originalBody,
          from: thread?.from,
          originalFrom: thread?.originalFrom,
          date: thread?.date || thread?.lastUpdated,
          category: thread?.category,
          categories: thread?.categories
        });
      }

      return out;
    }

    async function buildHighlights(articles) {
      const input = (articles || []).slice(0, 12).map((a, index) => ({
        i: index + 1,
        title: a.title,
        summary: a.summary
      }));
      if (!input.length) return [];

      if (typeof invokeGemini !== 'function') {
        return input.slice(0, 5).map(item => item.title);
      }

      try {
        const response = await invokeGemini({
          model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
          messages: [
            {
              role: 'system',
              content: 'Summarize FT digest headlines. Return JSON array of max 5 concise bullets, each under 120 chars.'
            },
            {
              role: 'user',
              content: JSON.stringify({ articles: input })
            }
          ],
          temperature: 0.2,
          maxOutputTokens: 500
        });

        const raw = safeStr(response?.content);
        if (!raw) return input.slice(0, 5).map(item => item.title);

        let parsed = null;
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        const candidate = fenced && fenced[1] ? fenced[1].trim() : raw;
        try {
          parsed = JSON.parse(candidate);
        } catch (_) {
          parsed = null;
        }
        if (!Array.isArray(parsed)) return input.slice(0, 5).map(item => item.title);
        return parsed.map(item => safeStr(item)).filter(Boolean).slice(0, 5);
      } catch (error) {
        console.error('FT Digest Briefing: highlight generation failed:', error?.message || error);
        return input.slice(0, 5).map(item => item.title);
      }
    }

    async function loadDigestData(userEmail) {
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

      // If response_emails misses FT digests, also search additional stores used by the app.
      const sources = [];
      sources.push(Array.isArray(emails) ? emails : []);

      try {
        const doc = await getUserDoc('email_threads', userEmail);
        if (doc && Array.isArray(doc.threads)) {
          sources.push(flattenThreadCollection(doc.threads));
        }
      } catch (_) {
        sources.push(flattenThreadCollection(loadEmailThreads() || []));
      }

      try {
        const doc = await getUserDoc('unreplied_emails', userEmail);
        if (doc && Array.isArray(doc.emails)) {
          sources.push(doc.emails);
        }
      } catch (_) {
        sources.push(loadUnrepliedEmails() || []);
      }

      const unified = [];
      const seenIds = new Set();
      for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
        const source = Array.isArray(sources[sourceIndex]) ? sources[sourceIndex] : [];
        for (const rawEmail of source) {
          const email = normalizeEmailShape(rawEmail, `ft-${sourceIndex}`);
          if (!email || !email.id || seenIds.has(email.id)) continue;
          seenIds.add(email.id);
          unified.push(email);
        }
      }

      const digestEmails = unified
        .filter(email => isFtDigestEmail(email))
        .sort((a, b) => dateMs(b.date) - dateMs(a.date))
        .slice(0, 12);

      const allArticles = [];
      const seen = new Set();
      for (const email of digestEmails) {
        const extracted = extractArticlesFromEmail(email);
        for (const article of extracted) {
          const key = `${article.title}::${article.url}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allArticles.push(article);
        }
      }

      allArticles.sort((a, b) => dateMs(b.date) - dateMs(a.date));
      const articles = allArticles.slice(0, 40);
      const highlights = await buildHighlights(articles);

      return {
        digestEmailCount: digestEmails.length,
        articleCount: articles.length,
        highlights,
        articles
      };
    }

    app.get('/api/ft-digest-briefing/recent', async (req, res) => {
      try {
        const user = getCurrentUser();
        const data = await loadDigestData(user);
        return res.json({
          success: true,
          userEmail: user,
          ...data
        });
      } catch (error) {
        console.error('FT Digest Briefing API failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to load FT digest briefing' });
      }
    });

    app.get('/ft-digest-briefing', (req, res) => {
      res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FT Digest Briefing</title>
  <style>
    body { margin:0; font-family: Google Sans, Roboto, Arial, sans-serif; background:#f6f8fc; color:#202124; }
    .wrap { max-width:1100px; margin:0 auto; padding:20px 16px 32px; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:16px; }
    .title { font-size:28px; font-weight:700; }
    .sub { font-size:13px; color:#5f6368; margin-top:4px; }
    .btn { border:1px solid #dadce0; background:#fff; border-radius:18px; font-size:13px; cursor:pointer; padding:8px 12px; }
    .grid { display:grid; grid-template-columns: 1fr 2fr; gap:14px; }
    .card { background:#fff; border:1px solid #e6e9ef; border-radius:12px; padding:14px; }
    .card h3 { margin:0 0 10px; font-size:14px; color:#5f6368; text-transform:uppercase; letter-spacing:.4px; }
    .meta { font-size:12px; color:#5f6368; }
    .list { display:flex; flex-direction:column; gap:10px; }
    .item { border:1px solid #e8ecf1; border-radius:10px; padding:12px; background:#fff; }
    .item a { color:#0b57d0; text-decoration:none; font-size:16px; font-weight:600; line-height:1.35; }
    .item a:hover { text-decoration:underline; }
    .item p { margin:8px 0 0; color:#3c4043; font-size:13px; line-height:1.45; }
    .muted { color:#5f6368; font-size:12px; margin-top:8px; }
    .empty { color:#5f6368; font-size:14px; padding:16px 4px; }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <div class="title">FT Digest Briefing</div>
        <div class="sub">Recent article highlights from your Financial Times Digests emails</div>
      </div>
      <button id="refreshBtn" class="btn">Refresh</button>
    </div>
    <div class="grid">
      <div class="card">
        <h3>Highlights</h3>
        <div id="meta" class="meta">Loading...</div>
        <ul id="highlights"></ul>
      </div>
      <div class="card">
        <h3>Recent Articles</h3>
        <div id="articles" class="list"></div>
      </div>
    </div>
  </div>

  <script>
    const refreshBtn = document.getElementById('refreshBtn');
    const meta = document.getElementById('meta');
    const highlightsEl = document.getElementById('highlights');
    const articlesEl = document.getElementById('articles');

    function esc(v){ return String(v||'').replace(/[&<>\"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[s])); }
    function fmtDate(v){
      const d = new Date(v || 0);
      if (Number.isNaN(d.getTime())) return 'Unknown date';
      return d.toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    }

    async function load() {
      meta.textContent = 'Loading...';
      highlightsEl.innerHTML = '';
      articlesEl.innerHTML = '<div class="empty">Loading recent FT digest articles...</div>';
      try {
        const r = await fetch('/api/ft-digest-briefing/recent');
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Failed');

        meta.textContent = String(d.digestEmailCount || 0) + ' digest emails scanned · ' + String(d.articleCount || 0) + ' articles extracted';
        const highlights = Array.isArray(d.highlights) ? d.highlights : [];
        if (!highlights.length) {
          highlightsEl.innerHTML = '<li class="empty">No highlights yet.</li>';
        } else {
          highlightsEl.innerHTML = highlights
            .map(line => '<li style="margin-bottom:8px; line-height:1.4; color:#3c4043;">' + esc(line) + '</li>')
            .join('');
        }

        const articles = Array.isArray(d.articles) ? d.articles : [];
        if (!articles.length) {
          articlesEl.innerHTML = '<div class="empty">No FT digest articles found yet.</div>';
          return;
        }

        articlesEl.innerHTML = articles.map(item => {
          const summaryHtml = item.summary ? '<p>' + esc(item.summary) + '</p>' : '';
          return (
            '<article class="item">' +
              '<a href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.title || 'FT Article') + '</a>' +
              summaryHtml +
              '<div class="muted">' + esc(fmtDate(item.date)) + ' · ' + esc(item.sourceSubject || 'myFT Daily Digest') + '</div>' +
            '</article>'
          );
        }).join('');
      } catch (error) {
        meta.textContent = 'Failed to load';
        articlesEl.innerHTML = '<div class="empty">Failed to load FT digest briefing.</div>';
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
