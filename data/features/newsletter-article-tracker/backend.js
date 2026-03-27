/**
 * Newsletter Article Tracker Backend
 * Dedicated page that lists articles/updates extracted from newsletter emails.
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
      if (wrapped && wrapped[1]) out = wrapped[1];
      try {
        out = decodeURIComponent(out);
      } catch (_) {}

      try {
        const parsed = new URL(out);
        const host = safeStr(parsed.hostname).toLowerCase();
        const wrappedCandidate =
          parsed.searchParams.get('u') ||
          parsed.searchParams.get('url') ||
          parsed.searchParams.get('target') ||
          parsed.searchParams.get('redirect');
        if (wrappedCandidate) {
          out = host.includes('urldefense.proofpoint.com')
            ? decodeProofpointToken(wrappedCandidate)
            : unwrapUrl(wrappedCandidate);
        }
      } catch (_) {}

      return safeStr(out);
    }

    function isNoiseLink(url) {
      const u = safeStr(url).toLowerCase();
      if (!u.startsWith('http')) return true;
      return u.includes('unsubscribe') ||
        u.includes('preferences') ||
        u.includes('privacy') ||
        u.includes('terms') ||
        u.includes('view-in-browser') ||
        u.includes('manage-subscription') ||
        u.includes('help.ft.com') ||
        u.includes('feedback');
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
        cat === 'newsletters' ||
        cat === 'newsletter' ||
        cat === 'newsletters and updates' ||
        cat === 'newsletter and updates' ||
        cat.includes('newsletter')
      );
    }

    function isRelevantNewsletterOrCsUpdate(email) {
      const subject = safeStr(email?.subject).toLowerCase();
      const from = safeStr(email?.originalFrom || email?.from).toLowerCase();
      const body = stripHtml(email?.body || email?.originalBody || email?.snippet).toLowerCase();
      const text = `${subject}\n${from}\n${body}`;

      const newsletterSignal = /(newsletter|digest|briefing|weekly update|daily update|roundup|top stories|bulletin|substack|mailchimp|constant contact)/i.test(text);
      const csSignal = /(computer science|cs |ai\b|machine learning|ml\b|robotics|llm|research update|paper|conference|systems|vision|nlp|security)/i.test(text);
      const articleSignal = /(article|read more|top stories|what happened|today in|headlines|news)/i.test(text);
      return newsletterSignal || (csSignal && articleSignal);
    }

    function extractLinks(email) {
      const seen = new Set();
      const links = [];

      function add(url) {
        const cleaned = unwrapUrl(url);
        if (!cleaned || seen.has(cleaned) || isNoiseLink(cleaned)) return;
        seen.add(cleaned);
        links.push(cleaned);
      }

      const rawBody = safeStr(email?.body);
      const rawOriginalBody = safeStr(email?.originalBody);
      const rawSnippet = safeStr(email?.snippet);

      const htmlSources = [rawBody, rawOriginalBody].filter(Boolean);
      const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
      for (const html of htmlSources) {
        let m;
        while ((m = hrefRegex.exec(html)) !== null) {
          add(m[1]);
          if (links.length >= 12) return links;
        }
      }

      const textCandidates = [
        rawBody,
        rawOriginalBody,
        rawSnippet,
        stripHtml(rawBody),
        stripHtml(rawOriginalBody),
        stripHtml(rawSnippet)
      ].filter(Boolean);
      const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;
      for (const text of textCandidates) {
        let match;
        while ((match = urlRegex.exec(text)) !== null) {
          add(match[1]);
          if (links.length >= 12) return links;
        }
      }
      return links;
    }

    function guessTitleFromUrl(url) {
      const cleaned = safeStr(url);
      if (!cleaned) return '';
      try {
        const parsed = new URL(cleaned);
        const parts = parsed.pathname.split('/').map(p => safeStr(p)).filter(Boolean);
        const candidate = decodeURIComponent(parts[parts.length - 1] || '').replace(/[-_]+/g, ' ').replace(/\.[a-z0-9]+$/i, '');
        const normalized = candidate.replace(/\s+/g, ' ').trim();
        if (normalized && normalized.length > 8 && normalized.length < 120) {
          return normalized.replace(/\b\w/g, c => c.toUpperCase());
        }
      } catch (_) {}
      return '';
    }

    function extractHeadlinesFromBody(email) {
      const text = stripHtml(email?.body || email?.originalBody || '');
      if (!text) return [];
      const lines = text
        .split(/\r?\n/)
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      const out = [];
      const seen = new Set();
      for (const line of lines) {
        if (line.length < 20 || line.length > 180) continue;
        if (/^(unsubscribe|view in browser|privacy|terms|manage preferences|read online)/i.test(line)) continue;
        if (!/[a-zA-Z]/.test(line)) continue;
        const likelyHeadline = /[:\-]/.test(line) || /^[A-Z][^.!?]{20,}$/.test(line) || /(today|weekly|news|update|research|article)/i.test(line);
        if (!likelyHeadline) continue;
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(line);
        if (out.length >= 8) break;
      }
      return out;
    }

    function extractPreview(email) {
      const snippet = safeStr(email?.snippet);
      if (snippet) return snippet.slice(0, 240);
      const text = stripHtml(email?.body || email?.originalBody || '');
      const firstLine = safeStr(text.split(/\r?\n/).find(line => safeStr(line)));
      return (firstLine || 'No preview available').slice(0, 240);
    }

    function normalizeEmailShape(raw, fallbackPrefix = 'newsletter-article') {
      if (!raw || typeof raw !== 'object') return null;
      const id = safeStr(raw.id || raw.messageId || raw.responseId || raw.threadId);
      if (!id) return null;
      return {
        id: `${fallbackPrefix}-${id}`,
        sourceId: id,
        subject: safeStr(raw.subject),
        body: safeStr(raw.body || raw.originalBody),
        originalBody: safeStr(raw.originalBody || raw.body),
        snippet: safeStr(raw.snippet),
        from: safeStr(raw.from),
        originalFrom: safeStr(raw.originalFrom || raw.from),
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
            from: thread?.from,
            originalFrom: thread?.originalFrom,
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
            from: safeStr(msg?.from || thread?.from),
            originalFrom: safeStr(msg?.from || thread?.originalFrom),
            date: safeStr(msg?.date || thread?.date),
            category: thread?.category,
            categories: thread?.categories
          });
        }
      }
      return out;
    }

    async function loadNewsletterArticleFeed(userEmail) {
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
          const email = normalizeEmailShape(raw, `newsletter-src${i}`);
          if (!email || !email.id) continue;
          const dedupeKey = `${safeStr(email.sourceId)}::${safeStr(email.subject).toLowerCase()}::${safeStr(email.date)}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          unified.push(email);
        }
      }

      const inCategory = unified.filter(isNewsletterCategory);
      const relevantExtra = unified.filter(email => !isNewsletterCategory(email) && isRelevantNewsletterOrCsUpdate(email));

      const selected = [...inCategory, ...relevantExtra]
        .sort((a, b) => dateMs(b.date) - dateMs(a.date))
        .slice(0, 140);

      const entries = selected.map((email, index) => {
        const links = extractLinks(email);
        const headlines = extractHeadlinesFromBody(email);
        const articleCards = [];
        const seenArticleKeys = new Set();

        for (const headline of headlines) {
          const key = headline.toLowerCase();
          if (seenArticleKeys.has(key)) continue;
          seenArticleKeys.add(key);
          articleCards.push({
            title: headline,
            url: ''
          });
          if (articleCards.length >= 8) break;
        }

        for (const url of links) {
          if (articleCards.length >= 12) break;
          const title = guessTitleFromUrl(url) || url;
          const key = `${title.toLowerCase()}::${url}`;
          if (seenArticleKeys.has(key)) continue;
          seenArticleKeys.add(key);
          articleCards.push({ title, url });
        }

        const categories = getEmailCategories(email);
        return {
          rank: index + 1,
          id: safeStr(email.sourceId),
          subject: safeStr(email.subject) || '(No subject)',
          from: safeStr(email.originalFrom || email.from) || 'Unknown sender',
          date: safeStr(email.date) || null,
          categories,
          preview: extractPreview(email),
          articles: articleCards
        };
      });

      return {
        totalScanned: unified.length,
        categoryCount: inCategory.length,
        relevantExtraCount: relevantExtra.length,
        entryCount: entries.length,
        entries
      };
    }

    app.get('/api/newsletter-article-tracker/feed', async (req, res) => {
      try {
        const user = getCurrentUser();
        const feed = await loadNewsletterArticleFeed(user);
        return res.json({
          success: true,
          userEmail: user,
          ...feed
        });
      } catch (error) {
        console.error('Newsletter Article Tracker feed failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to load tracked articles feed' });
      }
    });

    app.get('/newsletter-article-tracker', (req, res) => {
      res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Newsletter Article Tracker</title>
  <style>
    body { margin:0; font-family: Google Sans, Roboto, Arial, sans-serif; background:#f6f8fc; color:#202124; }
    .wrap { max-width:1240px; margin:0 auto; padding:20px 16px 28px; }
    .head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:14px; }
    .title { font-size:28px; font-weight:700; }
    .sub { color:#5f6368; font-size:13px; margin-top:4px; line-height:1.35; }
    .btn { border:1px solid #dadce0; border-radius:18px; background:#fff; color:#1f1f1f; padding:8px 12px; cursor:pointer; font-size:13px; }
    .meta { color:#5f6368; font-size:12px; margin:6px 0 10px; }
    .grid { display:grid; grid-template-columns: 1fr; gap:12px; }
    .card { background:#fff; border:1px solid #e5e9ef; border-radius:12px; padding:14px; }
    .subject { font-weight:700; font-size:16px; margin-bottom:6px; }
    .preview { color:#3c4043; font-size:13px; margin-bottom:10px; }
    .articles { margin:0; padding-left:18px; }
    .articles li { margin:6px 0; }
    .pill { display:inline-block; border:1px solid #d2e3fc; color:#0b57d0; background:#edf3fe; border-radius:999px; padding:2px 8px; font-size:11px; margin-right:6px; margin-bottom:5px; }
    .empty { background:#fff; border:1px solid #e5e9ef; border-radius:12px; padding:18px; color:#5f6368; }
    a { color:#0b57d0; text-decoration:none; }
    a:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <div class="title">Newsletter Article Tracker</div>
        <div class="sub">Shows all emails in <strong>Newsletters</strong> plus relevant newsletter/news/computer-science updates, with extracted article items.</div>
      </div>
      <button id="refreshBtn" class="btn">Refresh</button>
    </div>
    <div id="summary" class="meta"></div>
    <div id="content" class="empty">Loading tracked articles...</div>
  </div>

  <script>
    const content = document.getElementById('content');
    const summary = document.getElementById('summary');
    const refreshBtn = document.getElementById('refreshBtn');
    function esc(v){ return String(v||'').replace(/[&<>"']/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;'}[s])); }
    function fmtDate(v){
      const d = new Date(v || 0);
      if (Number.isNaN(d.getTime())) return 'Unknown date';
      return d.toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    }
    async function load(){
      content.className = 'empty';
      content.textContent = 'Loading tracked articles...';
      summary.textContent = '';
      try {
        const r = await fetch('/api/newsletter-article-tracker/feed');
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Failed to load');
        const list = Array.isArray(d.entries) ? d.entries : [];
        summary.textContent = (d.totalScanned || 0) + ' emails scanned · ' + (d.categoryCount || 0) + ' in Newsletters · ' + (d.relevantExtraCount || 0) + ' relevant extras';
        if (!list.length) {
          content.className = 'empty';
          content.innerHTML = 'No newsletter/article emails found yet.';
          return;
        }
        const html = list.map((entry) => {
          const pills = (Array.isArray(entry.categories) ? entry.categories : []).slice(0, 5)
            .map(c => '<span class="pill">' + esc(c) + '</span>').join('');
          const articles = Array.isArray(entry.articles) ? entry.articles : [];
          const articleHtml = articles.length
            ? articles.map(a => {
                if (a.url) return '<li><a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.title || a.url) + '</a></li>';
                return '<li>' + esc(a.title || '') + '</li>';
              }).join('')
            : '<li>No article items extracted from this email.</li>';
          return '<div class="card">' +
            '<div class="subject">' + esc(entry.subject) + '</div>' +
            '<div class="meta">' + esc(fmtDate(entry.date)) + ' · ' + esc(entry.from) + '</div>' +
            '<div>' + pills + '</div>' +
            '<div class="preview">' + esc(entry.preview || '') + '</div>' +
            '<ul class="articles">' + articleHtml + '</ul>' +
          '</div>';
        }).join('');
        content.className = 'grid';
        content.innerHTML = html;
      } catch (e) {
        content.className = 'empty';
        content.innerHTML = 'Failed to load tracked articles: ' + esc(e.message || String(e));
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
