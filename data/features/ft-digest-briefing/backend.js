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
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&#34;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');
    }

    function stripHtmlKeepLines(raw) {
      return safeStr(raw)
        .replace(/<style[\s\S]*?<\/style>/gi, '\n')
        .replace(/<script[\s\S]*?<\/script>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
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
      if (u.includes('ft.com/')) return true;
      if (u.includes('ft.com/content/')) return true;
      return false;
    }

    function isNonArticleTitle(title) {
      const t = safeStr(title).toLowerCase();
      if (!t) return true;
      if (t.startsWith('(?desktop=')) return true;
      return (
        t === 'myft daily digest' ||
        t === 'terms & conditions' ||
        t === 'privacy policy' ||
        t === 'register for free' ||
        t === 'find out more' ||
        t === 'north america (2)' ||
        t === 'europe' ||
        t === 'technology' ||
        t === 'world' ||
        t === 'us' ||
        t === 'markets' ||
        t === 'opinion' ||
        t === 'more new stories available in your feed in myft' ||
        t === 'visit your myft feed.' ||
        t === 'visit your myft feed' ||
        t.includes('more new stories available in your feed') ||
        t.includes('visit your myft feed') ||
        t.includes('daily digest of stories from topics') ||
        t.includes('terms') ||
        t.includes('privacy') ||
        t.includes('cookies')
      );
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

    function isDigestBoilerplateLine(text) {
      const lower = safeStr(text).toLowerCase();
      if (!lower) return true;
      return (
        lower.startsWith('myft daily digest') ||
        lower.includes('more new stories available in your feed in myft') ||
        lower.includes('visit your myft feed') ||
        lower.includes('best ft comment and analysis') ||
        lower.includes('most popular stories in the last 24 hours') ||
        lower.includes('see all your stories in the order they were published') ||
        lower === '--------' ||
        lower.includes(':header:plain') ||
        lower.includes(':plain') ||
        lower.includes('this message came from outside your organization')
      );
    }

    function findNearestTitle(lines, urlIndex) {
      for (let i = 1; i <= 8; i++) {
        const candidate = safeStr(lines[urlIndex - i]);
        if (!candidate) continue;
        if (candidate.includes('http://') || candidate.includes('https://')) continue;
        if (isDigestBoilerplateLine(candidate)) continue;
        if (looksLikeHeading(candidate)) continue;
        if (candidate.length < 14 || candidate.length > 220) continue;
        return htmlDecode(candidate.replace(/^[-•\s]+/, ''));
      }
      return '';
    }

    function findShortSummary(lines, titleIndex, urlIndex) {
      for (let i = titleIndex + 1; i < urlIndex; i++) {
        const text = safeStr(lines[i]);
        if (!text) continue;
        if (text.includes('http://') || text.includes('https://')) continue;
        if (isDigestBoilerplateLine(text)) continue;
        if (looksLikeHeading(text)) continue;
        if (text.length < 24 || text.length > 240) continue;
        return htmlDecode(text);
      }
      return '';
    }

    function extractArticlesFromEmail(email) {
      const text = stripHtmlKeepLines(email?.body || email?.originalBody || email?.snippet || '');
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

          const titleCandidate = findNearestTitle(lines, i);
          const title = titleCandidate && !/^myft daily digest$/i.test(titleCandidate)
            ? titleCandidate
            : (safeStr(email?.subject) || 'FT Article');
          const titleIndex = Math.max(0, i - 1);
          const summary = findShortSummary(lines, titleIndex, i);

          articles.push({
            title: htmlDecode(title),
            summary: htmlDecode(summary),
            url,
            date: safeStr(email?.date) || null,
            sourceSubject: safeStr(email?.subject) || 'myFT Daily Digest'
          });
        }
      }

      return articles.filter(article => safeStr(article?.title) && safeStr(article?.url));
    }

    function parseJsonArray(raw) {
      const source = safeStr(raw);
      if (!source) return [];
      const fenced = source.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      const candidate = fenced && fenced[1] ? fenced[1].trim() : source;
      try {
        const parsed = JSON.parse(candidate);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        const start = candidate.indexOf('[');
        const end = candidate.lastIndexOf(']');
        if (start >= 0 && end > start) {
          try {
            const parsed = JSON.parse(candidate.slice(start, end + 1));
            return Array.isArray(parsed) ? parsed : [];
          } catch (_) {
            return [];
          }
        }
        return [];
      }
    }

    function normalizeArticleItem(item, fallbackDate, fallbackSubject) {
      const title = htmlDecode(safeStr(item?.title));
      const summary = htmlDecode(safeStr(item?.summary));
      const url = safeStr(item?.url);
      if (!title || !url) return null;
      if (!isLikelyArticleUrl(url)) return null;
      if (isNonArticleTitle(title)) return null;
      return {
        title,
        summary,
        url,
        date: safeStr(item?.date) || fallbackDate || null,
        sourceSubject: fallbackSubject || 'myFT Daily Digest'
      };
    }

    async function extractArticlesFromEmailWithGemini(email) {
      if (typeof invokeGemini !== 'function') return [];
      const body = safeStr(email?.body || email?.originalBody || email?.snippet).slice(0, 14000);
      if (!body) return [];

      const prompt = `Extract article entries from this Financial Times digest email.

Return STRICT JSON array only (no markdown), with each entry shaped exactly:
{
  "title": "Article title",
  "summary": "One sentence summary (max 30 words)",
  "url": "https://..."
}

Rules:
- Include only real article entries from the digest.
- Exclude ads, promos, subscriptions, account links, and section headers.
- Exclude legal/footer links (Privacy Policy, Terms & Conditions, Register for free, cookie/settings links).
- Keep only items with a valid article URL.
- Max 12 entries.

Email:
Subject: ${safeStr(email?.subject)}
Body:
${body}`;

      try {
        const response = await invokeGemini({
          model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
          messages: [
            { role: 'system', content: 'You extract structured article data from newsletter emails.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          maxOutputTokens: 1500
        });

        const parsed = parseJsonArray(response?.content || '');
        return parsed
          .map(item => normalizeArticleItem(item, safeStr(email?.date), safeStr(email?.subject)))
          .filter(Boolean);
      } catch (error) {
        console.error('FT Digest Briefing: AI extraction failed:', error?.message || error);
        return [];
      }
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

    function normalizeHighlightItem(item) {
      if (typeof item === 'string') return safeStr(item);
      if (!item || typeof item !== 'object') return '';
      return safeStr(item.bullet || item.text || item.summary || item.title || item.item || '');
    }

    function fallbackHighlightsFromArticles(articles) {
      const input = Array.isArray(articles) ? articles : [];
      if (!input.length) return [];

      const stop = new Set([
        'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'under', 'after', 'before', 'amid',
        'about', 'your', 'their', 'more', 'new', 'stories', 'story', 'daily', 'digest', 'myft', 'ft', 'visit',
        'feed', 'available', 'are', 'is', 'in', 'on', 'to', 'of', 'by', 'at', 'as', 'an', 'a'
      ]);
      const scores = new Map();

      for (const article of input.slice(0, 18)) {
        const text = safeStr(article?.title).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
        const words = text.split(/\s+/).filter(Boolean);
        for (const word of words) {
          if (word.length < 4 || stop.has(word)) continue;
          scores.set(word, (scores.get(word) || 0) + 1);
        }
      }

      const topWords = Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([word]) => word);

      if (!topWords.length) {
        return input.slice(0, 4).map(a => safeStr(a?.title)).filter(Boolean);
      }
      return topWords.map(word => `${word[0].toUpperCase()}${word.slice(1)} update`);
    }

    async function buildHighlights(articles) {
      const input = (articles || []).slice(0, 12).map((a, index) => ({
        i: index + 1,
        title: a.title,
        summary: a.summary
      }));
      if (!input.length) return [];

      if (typeof invokeGemini !== 'function') {
        return fallbackHighlightsFromArticles(articles).slice(0, 5);
      }

      try {
        const response = await invokeGemini({
          model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
          messages: [
            {
              role: 'system',
              content: 'Create very short digest highlights. Output must be strict JSON array of strings only.'
            },
            {
              role: 'user',
              content: `Summarize these FT article titles into 3 to 5 short highlight phrases.

Requirements:
- Return STRICT JSON array only, e.g. ["US legal setback for Musk", "French election momentum shift"].
- Each highlight must be 3 to 8 words.
- Do NOT copy article titles verbatim.
- Focus on themes and key developments.
- Exclude boilerplate like "Visit your myFT feed" or "More new stories...".
- No numbering, no markdown, no extra text.

Articles:
${JSON.stringify({ articles: input })}`
            }
          ],
          temperature: 0.15,
          maxOutputTokens: 500
        });

        const raw = safeStr(response?.content);
        if (!raw) return fallbackHighlightsFromArticles(articles).slice(0, 5);

        let parsed = null;
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        const candidate = fenced && fenced[1] ? fenced[1].trim() : raw;
        try {
          parsed = JSON.parse(candidate);
        } catch (_) {
          parsed = null;
        }
        if (!Array.isArray(parsed)) return fallbackHighlightsFromArticles(articles).slice(0, 5);
        const cleaned = parsed
          .map(normalizeHighlightItem)
          .filter(Boolean)
          .map(line => htmlDecode(line))
          .filter(line => {
            const lower = safeStr(line).toLowerCase();
            if (!lower) return false;
            if (lower.includes('visit your myft feed')) return false;
            if (lower.includes('more new stories available in your feed')) return false;
            return true;
          });
        return cleaned.length ? cleaned.slice(0, 5) : fallbackHighlightsFromArticles(articles).slice(0, 5);
      } catch (error) {
        console.error('FT Digest Briefing: highlight generation failed:', error?.message || error);
        return fallbackHighlightsFromArticles(articles).slice(0, 5);
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
        const aiExtracted = await extractArticlesFromEmailWithGemini(email);
        const chosen = aiExtracted.length ? aiExtracted : extracted;
        let filtered = chosen.filter(article => !isNonArticleTitle(article?.title));
        if (!filtered.length) {
          // Safety fallback: if filters are too strict for a given digest, keep raw extracted items.
          filtered = chosen;
        }

        for (const article of filtered) {
          const key = `${safeStr(article.url)}::${safeStr(article.title).toLowerCase()}`;
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
    .modal { position:fixed; inset:0; display:none; align-items:center; justify-content:center; background:rgba(32,33,36,.35); z-index:1200; }
    .modal.show { display:flex; }
    .modal-card { width:min(460px, 92vw); background:#fff; border:1px solid #e6e9ef; border-radius:12px; padding:18px; box-shadow:0 10px 28px rgba(0,0,0,.12); }
    .modal-title { font-size:16px; font-weight:700; margin:0 0 6px; color:#202124; }
    .modal-msg { font-size:13px; color:#5f6368; min-height:18px; }
    .modal-steps { margin-top:10px; padding-left:16px; color:#3c4043; font-size:12px; line-height:1.6; }
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
  <div id="loadingModal" class="modal" aria-hidden="true">
    <div class="modal-card">
      <h3 class="modal-title">Generating FT briefing...</h3>
      <div id="loadingMessage" class="modal-msg">Starting…</div>
      <ul class="modal-steps">
        <li>Scanning recent digest emails</li>
        <li>Extracting and filtering article links</li>
        <li>Generating concise highlights</li>
      </ul>
    </div>
  </div>

  <script>
    const refreshBtn = document.getElementById('refreshBtn');
    const meta = document.getElementById('meta');
    const highlightsEl = document.getElementById('highlights');
    const articlesEl = document.getElementById('articles');
    const loadingModal = document.getElementById('loadingModal');
    const loadingMessage = document.getElementById('loadingMessage');
    const progressMessages = [
      'Scanning Financial Times digest emails…',
      'Extracting candidate article links…',
      'Filtering boilerplate and feed links…',
      'Generating digest highlights…',
      'Finalizing article briefing…'
    ];
    let progressTimer = null;
    let progressIndex = 0;

    function esc(v){ return String(v||'').replace(/[&<>\"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[s])); }
    function fmtDate(v){
      const d = new Date(v || 0);
      if (Number.isNaN(d.getTime())) return 'Unknown date';
      return d.toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    }
    function showLoadingModal() {
      if (!loadingModal) return;
      progressIndex = 0;
      if (loadingMessage) loadingMessage.textContent = progressMessages[0];
      loadingModal.classList.add('show');
      loadingModal.setAttribute('aria-hidden', 'false');
      if (progressTimer) clearInterval(progressTimer);
      progressTimer = setInterval(() => {
        progressIndex = Math.min(progressIndex + 1, progressMessages.length - 1);
        if (loadingMessage) loadingMessage.textContent = progressMessages[progressIndex];
      }, 1200);
    }
    function hideLoadingModal() {
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
      if (!loadingModal) return;
      loadingModal.classList.remove('show');
      loadingModal.setAttribute('aria-hidden', 'true');
    }

    async function load() {
      showLoadingModal();
      refreshBtn.disabled = true;
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
      } finally {
        refreshBtn.disabled = false;
        hideLoadingModal();
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
