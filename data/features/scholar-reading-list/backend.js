/**
 * Scholar Reading List Backend
 * Builds a reading-feed page from Research and Publications emails.
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
      if (wrapped && wrapped[1]) out = decodeProofpointToken(wrapped[1]);
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

    function toCleanSentence(text, maxLen = 220) {
      const cleaned = stripHtml(text)
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleaned) return '';
      const firstSentence = (cleaned.match(/[^.!?]+[.!?]+/) || [cleaned])[0].trim();
      return firstSentence.slice(0, maxLen);
    }

    function normalizeScholarArticleUrl(url) {
      let current = unwrapUrl(url);
      if (!current) return '';

      for (let i = 0; i < 5; i++) {
        let parsed;
        try {
          parsed = new URL(current);
        } catch (_) {
          break;
        }
        const host = safeStr(parsed.hostname).toLowerCase();
        const path = safeStr(parsed.pathname).toLowerCase();
        const nextCandidate =
          parsed.searchParams.get('url') ||
          parsed.searchParams.get('q') ||
          parsed.searchParams.get('target') ||
          parsed.searchParams.get('dest') ||
          parsed.searchParams.get('redirect');

        const isRedirectHost =
          host.includes('scholar.google.') ||
          host.includes('google.com') ||
          host.includes('googleusercontent.com') ||
          host.includes('urldefense.proofpoint.com') ||
          host.includes('mail.google.com');

        if (nextCandidate && (isRedirectHost || path.includes('scholar_url') || path === '/url')) {
          const next = unwrapUrl(nextCandidate);
          if (next && next !== current) {
            current = next;
            continue;
          }
        }
        break;
      }

      let finalUrl = safeStr(current);
      try {
        const parsed = new URL(finalUrl);
        const noisyParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'sa', 'ei', 'scisig', 'hl', 'ved', 'oi', 'usg'];
        noisyParams.forEach((k) => parsed.searchParams.delete(k));
        finalUrl = parsed.toString();
      } catch (_) {}
      return finalUrl;
    }

    function isLikelyArticleUrl(url) {
      const u = safeStr(url).toLowerCase();
      if (!u.startsWith('http')) return false;
      if (/unsubscribe|privacy|terms|preferences|manage-subscription|support\.google\.com/.test(u)) return false;
      if (/scholar\.google\./.test(u) && !/[?&](url|q)=/.test(u)) return false;
      return true;
    }

    function extractScholarArticles(email) {
      const bodyHtml = safeStr(email?.body || email?.originalBody || '');
      const bodyText = stripHtml(bodyHtml);
      const candidates = [];

      const anchorRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let a;
      while ((a = anchorRegex.exec(bodyHtml)) !== null) {
        candidates.push({
          rawUrl: a[1],
          titleHint: toCleanSentence(a[2], 140),
          context: toCleanSentence(bodyHtml.slice(Math.max(0, a.index - 220), a.index + 320), 220)
        });
      }

      const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;
      let m;
      while ((m = urlRegex.exec(bodyHtml)) !== null) {
        candidates.push({
          rawUrl: m[1],
          titleHint: '',
          context: toCleanSentence(bodyHtml.slice(Math.max(0, m.index - 220), m.index + 320), 220)
        });
      }

      // Scholar and alert emails are often plain text with title + summary lines before a URL.
      const lines = bodyText.split(/\r?\n/).map((line) => safeStr(line));
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/^https?:\/\//i.test(line)) continue;
        const prev1 = safeStr(lines[i - 1]);
        const prev2 = safeStr(lines[i - 2]);
        const next1 = safeStr(lines[i + 1]);
        const next2 = safeStr(lines[i + 2]);
        const titleCandidate = prev1 && !/^https?:\/\//i.test(prev1) ? prev1 : prev2;
        const contextCandidate = next1 && !/^https?:\/\//i.test(next1) ? `${next1} ${next2}` : `${prev1} ${next1}`;
        candidates.push({
          rawUrl: line,
          titleHint: toCleanSentence(titleCandidate, 150),
          context: toCleanSentence(contextCandidate, 220)
        });
      }

      const out = [];
      const seen = new Set();
      for (const c of candidates) {
        const url = normalizeScholarArticleUrl(c.rawUrl);
        if (!isLikelyArticleUrl(url)) continue;
        if (seen.has(url)) continue;
        seen.add(url);

        let title = safeStr(c.titleHint);
        if (!title || /^(view article|read more|open source|link)$/i.test(title)) {
          try {
            const parsed = new URL(url);
            const tail = decodeURIComponent((parsed.pathname.split('/').pop() || '').replace(/[-_]+/g, ' '));
            title = toCleanSentence(tail, 130);
          } catch (_) {}
        }
        if (!title) title = 'Open Article';

        const summary = toCleanSentence(c.context || bodyText || email?.snippet || '', 180) || 'Research article from your scholar feed.';
        out.push({ title, url, summary });
        if (out.length >= 4) break;
      }
      return out;
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

    function isResearchCategoryEmail(email) {
      const categories = getEmailCategories(email).map(normalizeCategory);
      return categories.some(cat =>
        cat === 'research and publications' ||
        cat === 'research & publications' ||
        cat.includes('research and publication') ||
        cat.includes('research') && cat.includes('publication')
      );
    }

    function isGoogleScholarLikeEmail(email) {
      const subject = safeStr(email?.subject).toLowerCase();
      const from = safeStr(email?.originalFrom || email?.from).toLowerCase();
      const body = stripHtml(email?.body || email?.originalBody || email?.snippet).toLowerCase();
      const text = `${subject}\n${from}\n${body}`;
      return from.includes('scholar.google') ||
        from.includes('google scholar') ||
        /google scholar|new articles|new citations|recommended articles|arxiv|publication alert/i.test(text);
    }

    function extractLinks(email) {
      const seen = new Set();
      const links = [];

      function add(url) {
        const cleaned = unwrapUrl(url);
        if (!cleaned || seen.has(cleaned)) return;
        if (!cleaned.startsWith('http')) return;
        if (/unsubscribe|privacy|terms|preferences|manage-subscription/i.test(cleaned)) return;
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
          if (links.length >= 10) return links;
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
          if (links.length >= 10) return links;
        }
      }
      return links;
    }

    function extractHeadlines(email) {
      const text = stripHtml(email?.body || email?.originalBody || '');
      if (!text) return [];
      const lines = text
        .split(/\r?\n/)
        .map(line => safeStr(line))
        .filter(Boolean);

      const out = [];
      const seen = new Set();
      for (const line of lines) {
        if (line.length < 18 || line.length > 180) continue;
        if (/^(unsubscribe|view in browser|privacy|terms|manage preferences|read online)/i.test(line)) continue;
        const likely = /(new articles|new citations|publication|paper|conference|journal|preprint|arxiv|doi|research)/i.test(line) || /^[A-Z][^.!?]{20,}$/.test(line);
        if (!likely) continue;
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
      if (snippet) return snippet.slice(0, 260);
      const text = stripHtml(email?.body || email?.originalBody || '');
      const firstLine = safeStr(text.split(/\r?\n/).find(line => safeStr(line)));
      return (firstLine || 'No preview available').slice(0, 260);
    }

    function normalizeEmailShape(raw, fallbackPrefix = 'scholar') {
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

    async function loadScholarFeed(userEmail) {
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
          const email = normalizeEmailShape(raw, `scholar-src${i}`);
          if (!email || !email.id) continue;
          const key = `${safeStr(email.sourceId)}::${safeStr(email.subject).toLowerCase()}::${safeStr(email.date)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          unified.push(email);
        }
      }

      const inCategory = unified.filter(isResearchCategoryEmail);
      const scholarExtra = unified.filter(e => !isResearchCategoryEmail(e) && isGoogleScholarLikeEmail(e));
      const selected = [...inCategory, ...scholarExtra]
        .sort((a, b) => dateMs(b.date) - dateMs(a.date))
        .slice(0, 150);

      const entries = selected.map((email, idx) => {
        const cards = extractScholarArticles(email);
        return {
          rank: idx + 1,
          id: safeStr(email.sourceId),
          subject: safeStr(email.subject) || '(No subject)',
          from: safeStr(email.originalFrom || email.from) || 'Unknown sender',
          date: safeStr(email.date) || null,
          preview: extractPreview(email),
          categories: getEmailCategories(email),
          items: cards
        };
      });

      return {
        totalScanned: unified.length,
        categoryCount: inCategory.length,
        scholarExtraCount: scholarExtra.length,
        entryCount: entries.length,
        entries
      };
    }

    app.get('/api/scholar-reading-list/feed', async (req, res) => {
      try {
        const user = getCurrentUser();
        const data = await loadScholarFeed(user);
        return res.json({ success: true, userEmail: user, ...data });
      } catch (error) {
        console.error('Scholar Reading List feed failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to load scholar reading list feed' });
      }
    });

    app.get('/scholar-reading-list', (req, res) => {
      res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Scholar Reading List</title>
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
    .items { margin:0; padding-left:18px; }
    .items li { margin:6px 0; }
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
        <div class="title">Scholar Reading List</div>
        <div class="sub">Reading-feed from <strong>Research and Publications</strong> emails and Google Scholar-like updates.</div>
      </div>
      <button id="refreshBtn" class="btn">Refresh</button>
    </div>
    <div id="summary" class="meta"></div>
    <div id="content" class="empty">Loading reading list...</div>
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
      content.textContent = 'Loading reading list...';
      summary.textContent = '';
      try {
        const r = await fetch('/api/scholar-reading-list/feed');
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Failed to load');
        const list = Array.isArray(d.entries) ? d.entries : [];
        summary.textContent = (d.totalScanned || 0) + ' emails scanned · ' + (d.categoryCount || 0) + ' in Research and Publications · ' + (d.scholarExtraCount || 0) + ' Google Scholar-like extras';
        if (!list.length) {
          content.className = 'empty';
          content.innerHTML = 'No reading-list items found yet.';
          return;
        }
        const html = list.map((entry) => {
          const pills = (Array.isArray(entry.categories) ? entry.categories : []).slice(0, 5)
            .map(c => '<span class="pill">' + esc(c) + '</span>').join('');
          const items = Array.isArray(entry.items) ? entry.items : [];
          const itemHtml = items.length
            ? items.map(it => {
                const title = esc(it.title || 'Open Article');
                const summary = esc(it.summary || 'No summary available.');
                if (it.url) {
                  return '<li><a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + title + '</a><div style="color:#5f6368;font-size:12px;margin-top:2px;">' + summary + '</div></li>';
                }
                return '<li>' + title + '<div style="color:#5f6368;font-size:12px;margin-top:2px;">' + summary + '</div></li>';
              }).join('')
            : '<li>No article items extracted from this email.</li>';
          return '<div class="card">' +
            '<div class="subject">' + esc(entry.subject) + '</div>' +
            '<div class="meta">' + esc(fmtDate(entry.date)) + ' · ' + esc(entry.from) + '</div>' +
            '<div>' + pills + '</div>' +
            '<div class="preview">' + esc(entry.preview || '') + '</div>' +
            '<ul class="items">' + itemHtml + '</ul>' +
          '</div>';
        }).join('');
        content.className = 'grid';
        content.innerHTML = html;
      } catch (e) {
        content.className = 'empty';
        content.innerHTML = 'Failed to load scholar reading list: ' + esc(e.message || String(e));
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
