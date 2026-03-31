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
      loadUnrepliedEmails,
      invokeGemini,
      getGeminiModel
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

    function stripArticleHtml(raw) {
      return safeStr(raw)
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<header[\s\S]*?<\/header>/gi, ' ')
        .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
        .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
        .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
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
      } catch (_) {
        // keep best effort
      }

      // Common redirect/tracking wrappers.
      try {
        const parsed = new URL(out);
        const host = safeStr(parsed.hostname).toLowerCase();
        const wrappedCandidate =
          parsed.searchParams.get('u') ||
          parsed.searchParams.get('url') ||
          parsed.searchParams.get('target') ||
          parsed.searchParams.get('redirect');
        if (wrappedCandidate) {
          if (host.includes('urldefense.proofpoint.com')) {
            out = decodeProofpointToken(wrappedCandidate);
          } else {
            out = unwrapUrl(wrappedCandidate);
          }
        }
      } catch (_) {}

      return safeStr(out);
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

      // 1) Parse href links directly from raw HTML first.
      const htmlSources = [rawBody, rawOriginalBody].filter(Boolean);
      const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
      for (const html of htmlSources) {
        let m;
        while ((m = hrefRegex.exec(html)) !== null) {
          add(m[1]);
          if (links.length >= 5) return links;
        }
      }

      // 2) Fallback to plain URL scan from both raw and stripped text.
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
          if (links.length >= 5) return links;
        }
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

    const REGION_TERMS = [
      'United States', 'US', 'USA', 'North America', 'Latin America', 'South America',
      'Europe', 'European Union', 'UK', 'United Kingdom', 'Germany', 'France', 'Italy', 'Spain',
      'Middle East', 'UAE', 'Saudi Arabia', 'Israel', 'Turkey',
      'Africa', 'South Africa',
      'Asia', 'China', 'Japan', 'India', 'Singapore', 'South Korea', 'Taiwan', 'Hong Kong',
      'Australia', 'New Zealand'
    ];

    const TICKER_STOPWORDS = new Set([
      'THE', 'AND', 'FOR', 'WITH', 'FROM', 'THIS', 'THAT', 'WILL', 'HAVE', 'YOUR', 'YOU',
      'USD', 'EUR', 'CEO', 'CFO', 'GDP', 'ETF', 'IPO', 'SEC', 'API', 'AI', 'ML', 'LLM',
      'NEWS', 'UPDATE', 'TODAY', 'WEEK', 'NOW', 'NEW', 'ALL', 'ANY', 'NOT', 'ARE', 'HAS'
    ]);

    function normalizeDisplayRegion(term) {
      const map = {
        usa: 'USA',
        us: 'US',
        uk: 'UK',
        uae: 'UAE',
        'united states': 'United States',
        'united kingdom': 'United Kingdom',
        'european union': 'European Union',
        'north america': 'North America',
        'south america': 'South America',
        'latin america': 'Latin America',
        'middle east': 'Middle East',
        'south korea': 'South Korea',
        'new zealand': 'New Zealand',
        'hong kong': 'Hong Kong'
      };
      const key = safeStr(term).toLowerCase();
      if (map[key]) return map[key];
      return safeStr(term)
        .split(/\s+/)
        .filter(Boolean)
        .map(w => w[0] ? (w[0].toUpperCase() + w.slice(1).toLowerCase()) : w)
        .join(' ');
    }

    function extractKeywordsFromEntry(email, previewText) {
      const rawText = [
        safeStr(email?.subject),
        safeStr(previewText),
        safeStr(email?.snippet),
        stripHtml(email?.body || ''),
        stripHtml(email?.originalBody || '')
      ].filter(Boolean).join('\n');

      const keywords = [];
      const seen = new Set();

      function addTicker(token) {
        const ticker = safeStr(token).toUpperCase().replace(/-/g, '.');
        if (!ticker || TICKER_STOPWORDS.has(ticker)) return;
        if (/^\d+$/.test(ticker)) return;
        const key = `ticker:${ticker}`;
        if (seen.has(key)) return;
        seen.add(key);
        keywords.push({ type: 'ticker', value: ticker, label: `$${ticker}` });
      }

      const explicitTickerRegex = /(?:\$|(?:NASDAQ|NYSE|NYSEARCA|AMEX)\s*:\s*|\b)([A-Z]{1,5}(?:\.[A-Z])?)\b/g;
      let m;
      while ((m = explicitTickerRegex.exec(rawText)) !== null) {
        addTicker(m[1]);
        if (keywords.length >= 12) break;
      }

      if (keywords.length < 12) {
        const contextualTickerRegex = /\b([A-Z]{2,5}(?:\.[A-Z])?)\b(?=\s+(?:shares?|stock|stocks|surges?|rises?|falls?|drops?|jumps?|slips?|gains?|sinks?|soars?|plunges?|up|down|\d+%))/g;
        while ((m = contextualTickerRegex.exec(rawText)) !== null) {
          addTicker(m[1]);
          if (keywords.length >= 12) break;
        }
      }

      if (keywords.length < 12) {
        const parentheticalTickerRegex = /\(([A-Z]{2,5}(?:\.[A-Z])?)\)/g;
        while ((m = parentheticalTickerRegex.exec(rawText)) !== null) {
          addTicker(m[1]);
          if (keywords.length >= 12) break;
        }
      }

      const lowerText = rawText.toLowerCase();
      for (const term of REGION_TERMS) {
        const lowerTerm = term.toLowerCase();
        if (!lowerTerm) continue;
        const escaped = lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`, 'i');
        if (!re.test(lowerText)) continue;
        const display = normalizeDisplayRegion(term);
        const key = `region:${display.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        keywords.push({ type: 'region', value: display, label: display });
        if (keywords.length >= 20) break;
      }

      return keywords.slice(0, 20);
    }

    async function fetchPageHtml(url, timeoutMs = 8000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'user-agent': 'Mozilla/5.0 NewsletterTerminal/1.0',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        return safeStr(text);
      } finally {
        clearTimeout(timer);
      }
    }

    function extractTitleFromHtml(html) {
      const h = safeStr(html);
      if (!h) return '';
      const og = h.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
      if (og && og[1]) return decodeHtmlEntities(og[1]);
      const tt = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (tt && tt[1]) return decodeHtmlEntities(tt[1].replace(/\s+/g, ' ').trim());
      return '';
    }

    function fallbackSummaryFromText(text) {
      const cleaned = safeStr(text).replace(/\s+/g, ' ').trim();
      if (!cleaned) return 'Could not extract readable article text.';
      const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [];
      const summary = (sentences.slice(0, 2).join(' ') || cleaned.slice(0, 280)).trim();
      return summary.slice(0, 320);
    }

    const summaryCache = new Map();

    async function summarizeArticleUrl(url) {
      const key = safeStr(url);
      if (!key) return { url: '', summary: 'Invalid URL.', title: '' };
      if (summaryCache.has(key)) return summaryCache.get(key);

      let result = { url: key, title: '', summary: 'Unable to summarize this article.' };
      try {
        const html = await fetchPageHtml(key, 9000);
        const title = extractTitleFromHtml(html);
        const articleText = stripArticleHtml(html).slice(0, 14000);
        if (!articleText) {
          result = { url: key, title, summary: 'Could not extract readable text from this page.' };
          summaryCache.set(key, result);
          return result;
        }

        if (typeof invokeGemini === 'function') {
          try {
            const llm = await invokeGemini({
              model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
              messages: [
                {
                  role: 'system',
                  content: 'Summarize article content for a newsletter feed. Be factual and concise.'
                },
                {
                  role: 'user',
                  content: `Summarize this article in 2-3 sentences.

Requirements:
- Focus on concrete facts and the key development.
- Do not include fluff or generic commentary.
- If the page is not an article, say so briefly.

URL: ${key}
Title: ${title || '(unknown)'}
Content:
${articleText}`
                }
              ],
              temperature: 0.15,
              maxOutputTokens: 240
            });
            const summary = safeStr(llm?.content || '');
            if (summary) {
              result = { url: key, title: title || key, summary: summary.slice(0, 600) };
              summaryCache.set(key, result);
              return result;
            }
          } catch (_) {
            // fall through to fallback summarization
          }
        }

        result = { url: key, title: title || key, summary: fallbackSummaryFromText(articleText) };
      } catch (error) {
        result = {
          url: key,
          title: '',
          summary: `Could not fetch article (${safeStr(error?.message) || 'network error'}).`
        };
      }

      summaryCache.set(key, result);
      return result;
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
        const preview = extractPreview(email);
        return {
          rank: index + 1,
          id: safeStr(email.id),
          subject: safeStr(email.subject) || '(No subject)',
          from: safeStr(email.originalFrom || email.from) || 'Unknown sender',
          date: safeStr(email.date) || null,
          category,
          preview,
          links: extractLinks(email),
          keywords: extractKeywordsFromEntry(email, preview)
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

    app.post('/api/newsletter-terminal/summarize-links', async (req, res) => {
      try {
        const links = Array.isArray(req.body?.links) ? req.body.links.map(v => safeStr(v)).filter(Boolean) : [];
        if (!links.length) {
          return res.status(400).json({ success: false, error: 'No links provided' });
        }

        const unique = Array.from(new Set(links.map(unwrapUrl).filter(Boolean))).slice(0, 5);
        const summaries = [];
        for (const link of unique) {
          summaries.push(await summarizeArticleUrl(link));
        }
        return res.json({ success: true, summaries });
      } catch (error) {
        console.error('Newsletter Terminal summarize-links failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to summarize links' });
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
    .filters {
      background: var(--term-panel);
      border: 1px solid #2b2b2b;
      margin-bottom: 12px;
      padding: 10px 12px;
    }
    .filters-head {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      margin-bottom:8px;
    }
    .filters-title {
      color: var(--term-dim);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .6px;
    }
    .chips {
      display:flex;
      flex-wrap:wrap;
      gap:6px;
    }
    .chip-group {
      margin-top: 8px;
    }
    .chip-group:first-child {
      margin-top: 0;
    }
    .chip-group-title {
      color: var(--term-dim);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .5px;
      margin-bottom: 6px;
    }
    .chip {
      border:1px solid #3a3a3a;
      background:#111;
      color:#d9d9d9;
      padding:4px 8px;
      font-size:11px;
      cursor:pointer;
    }
    .chip:hover {
      border-color: var(--term-accent);
      color: var(--term-accent);
    }
    .chip.active {
      border-color: var(--term-accent);
      color: #111;
      background: var(--term-accent);
      font-weight:700;
    }
    .chip.ticker {
      border-color: #2f4f73;
      color: #9ecbff;
    }
    .chip.region {
      border-color: #4b4b4b;
      color: #d4d4d4;
    }
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

    <section class="filters">
      <div class="filters-head">
        <span class="filters-title">Keyword Filter (Tickers + Regions)</span>
        <button id="clearFilterBtn" class="btn">Clear Filter</button>
      </div>
      <div id="keywordChips"></div>
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
    const state = { entries: [], selectedId: null, summariesById: {}, summarizeBusyById: {}, activeKeyword: null };
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
    const keywordChipsEl = document.getElementById('keywordChips');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

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

    const REGION_TERMS = [
      'united states', 'us', 'usa', 'north america', 'latin america', 'south america',
      'europe', 'european union', 'uk', 'united kingdom', 'germany', 'france', 'italy', 'spain',
      'middle east', 'uae', 'saudi arabia', 'israel', 'turkey',
      'africa', 'south africa',
      'asia', 'china', 'japan', 'india', 'singapore', 'south korea', 'taiwan', 'hong kong',
      'australia', 'new zealand'
    ];
    const TICKER_STOPWORDS = new Set([
      'THE','AND','FOR','WITH','FROM','THIS','THAT','WILL','HAVE','YOUR','YOU',
      'USD','EUR','CEO','CFO','GDP','ETF','IPO','SEC','API','AI','ML','LLM',
      'NEWS','UPDATE','TODAY','WEEK','NOW','NEW','ALL','ANY','NOT','ARE','HAS'
    ]);
    function keywordKey(k) {
      return String(k?.type || '') + ':' + String(k?.value || '');
    }

    function extractKeywordsFromText(text) {
      const source = String(text || '');
      const out = [];
      const seen = new Set();

      function addTicker(token) {
        const ticker = String(token || '').toUpperCase().replace(/-/g, '.');
        if (!ticker || TICKER_STOPWORDS.has(ticker) || /^\\d+$/.test(ticker)) return;
        const key = 'ticker:' + ticker;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ type: 'ticker', value: ticker, label: '$' + ticker });
      }

      const explicitTickerRegex = /(?:\\$|(?:NASDAQ|NYSE|NYSEARCA|AMEX)\\s*:\\s*|\\b)([A-Z]{1,5}(?:\\.[A-Z])?)\\b/g;
      let m;
      while ((m = explicitTickerRegex.exec(source)) !== null) {
        addTicker(m[1]);
      }

      const contextualTickerRegex = /\\b([A-Z]{2,5}(?:\\.[A-Z])?)\\b(?=\\s+(?:shares?|stock|stocks|surges?|rises?|falls?|drops?|jumps?|slips?|gains?|sinks?|soars?|plunges?|up|down|\\d+%))/g;
      while ((m = contextualTickerRegex.exec(source)) !== null) {
        addTicker(m[1]);
      }

      const parentheticalTickerRegex = /\\(([A-Z]{2,5}(?:\\.[A-Z])?)\\)/g;
      while ((m = parentheticalTickerRegex.exec(source)) !== null) {
        addTicker(m[1]);
      }

      function escapeRegex(value) {
        return String(value || '').replace(/[-\/\\^*+?.()|[\]{}]/g, '\\$&');
      }

      const lower = source.toLowerCase();
      for (const term of REGION_TERMS) {
        const escaped = escapeRegex(term);
        const re = new RegExp('\\\\b' + escaped + '\\\\b', 'i');
        if (!re.test(lower)) continue;
        const label = term.split(/\\s+/).map(w => w ? (w[0].toUpperCase() + w.slice(1)) : w).join(' ');
        const key = 'region:' + label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ type: 'region', value: label, label });
      }
      return out;
    }

    function ensureEntryKeywords(entry) {
      const base = Array.isArray(entry?.keywords) ? entry.keywords : [];
      const baseSafe = base
        .map(k => ({
          type: String(k?.type || '').toLowerCase(),
          value: String(k?.value || '').trim(),
          label: String(k?.label || k?.value || '').trim()
        }))
        .filter(k => k.type && k.value);

      if (baseSafe.length) return baseSafe;
      const inferred = extractKeywordsFromText([entry?.subject, entry?.preview].filter(Boolean).join('\\n'));
      return inferred.slice(0, 20);
    }

    function filteredEntries() {
      if (!state.activeKeyword) return state.entries;
      const key = keywordKey(state.activeKeyword);
      return state.entries.filter(entry => ensureEntryKeywords(entry).some(k => keywordKey(k) === key));
    }

    function renderKeywordChips() {
      const counts = new Map();
      for (const entry of state.entries) {
        const keywords = ensureEntryKeywords(entry);
        for (const keyword of keywords) {
          const key = keywordKey(keyword);
          if (!key || key === ':') continue;
          const prev = counts.get(key) || { keyword, count: 0 };
          prev.count += 1;
          counts.set(key, prev);
        }
      }

      const ordered = Array.from(counts.values())
        .sort((a, b) => b.count - a.count || String(a.keyword.label).localeCompare(String(b.keyword.label)))
        .slice(0, 24);

      if (!ordered.length) {
        keywordChipsEl.innerHTML = '<span class="meta">No ticker/region terms found yet.</span>';
        return;
      }

      const tickerItems = ordered.filter(item => String(item?.keyword?.type || '') === 'ticker');
      const regionItems = ordered.filter(item => String(item?.keyword?.type || '') === 'region');

      function buildGroupHtml(title, items, cls) {
        if (!items.length) return '';
        const chipsHtml = items.map(item => {
          const keyword = item.keyword || {};
          const key = keywordKey(keyword);
          const active = state.activeKeyword && keywordKey(state.activeKeyword) === key;
          return '<button class="chip ' + cls + ' ' + (active ? 'active' : '') + '" data-key="' + esc(key) + '">' +
            esc(keyword.label || keyword.value || key) + ' (' + Number(item.count || 0) + ')' +
          '</button>';
        }).join('');
        return '<div class="chip-group"><div class="chip-group-title">' + esc(title) + '</div><div class="chips">' + chipsHtml + '</div></div>';
      }

      keywordChipsEl.innerHTML =
        buildGroupHtml('Tickers', tickerItems, 'ticker') +
        buildGroupHtml('Regions / Countries', regionItems, 'region');

      keywordChipsEl.querySelectorAll('button.chip').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = String(btn.getAttribute('data-key') || '');
          if (!key) return;
          if (state.activeKeyword && keywordKey(state.activeKeyword) === key) {
            state.activeKeyword = null;
          } else {
            const parts = key.split(':');
            state.activeKeyword = { type: parts[0] || '', value: parts.slice(1).join(':') || '' };
          }
          renderList();
          renderKeywordChips();
        });
      });
    }

    function renderList() {
      const visible = filteredEntries();
      if (!visible.length) {
        listEl.innerHTML = '<div class="empty">No newsletters found. Try refreshing after sync.</div>';
        if (state.activeKeyword) {
          listStatusEl.textContent = 'No keyword matches';
        }
        return;
      }
      if (!visible.some(e => String(e.id) === String(state.selectedId))) {
        state.selectedId = visible[0].id;
      }
      listEl.innerHTML = visible.map(entry => {
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

      listStatusEl.textContent = visible.length + ' shown' + (state.activeKeyword ? ' (filtered)' : '');

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
      const busy = !!state.summarizeBusyById[entry.id];
      const summaries = Array.isArray(state.summariesById[entry.id]) ? state.summariesById[entry.id] : [];

      const loadingHtml = (links.length && busy && !summaries.length)
        ? '<div class="empty">Summarizing linked articles...</div>'
        : '';

      const summaryHtml = summaries.length
        ? ('<div class="links" style="margin-top:10px;">' + summaries.map(item =>
            '<div class="link" style="color:#f2f2f2;">' +
              '<div style="margin-bottom:4px;"><a href="' + esc(item.url || '#') + '" target="_blank" rel="noopener noreferrer" style="color:#ffb347; font-weight:700; text-decoration:none;">' + esc(item.title || 'Article') + '</a></div>' +
              '<div style="color:#d9d9d9; line-height:1.5;">' + esc(item.summary || '') + '</div>' +
            '</div>'
          ).join('') + '</div>')
        : (links.length ? loadingHtml : '<div class="empty">No clean links extracted from this email.</div>');

      detailEl.innerHTML =
        '<h2>' + esc(entry.subject) + '</h2>' +
        '<div class="m">' + esc(entry.from) + ' · ' + esc(fmtDate(entry.date)) + ' · ' + esc(entry.category || 'Uncategorized') + '</div>' +
        '<p>' + esc(entry.preview || 'No preview available') + '</p>' +
        summaryHtml;

      // Auto-summarize when a message is selected.
      if (links.length && !summaries.length && !busy) {
        summarizeEntry(entry);
      }
    }

    async function summarizeEntry(entry) {
      const id = String(entry?.id || '');
      if (!id) return;
      if (state.summarizeBusyById[id]) return;
      state.summarizeBusyById[id] = true;
      renderDetail(id);
      try {
        const response = await fetch('/api/newsletter-terminal/summarize-links', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ links: Array.isArray(entry.links) ? entry.links : [] })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to summarize links');
        }
        state.summariesById[id] = (Array.isArray(data.summaries) ? data.summaries : []).map(item => ({
          url: String(item?.url || ''),
          title: String(item?.title || item?.url || 'Article'),
          summary: String(item?.summary || '')
        }));
      } catch (error) {
        state.summariesById[id] = [{
          url: '',
          title: 'Summary unavailable',
          summary: String(error?.message || 'Failed to summarize article links')
        }];
      } finally {
        state.summarizeBusyById[id] = false;
        if (String(state.selectedId) === id) renderDetail(id);
      }
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
        state.entries = state.entries.map(entry => ({
          ...entry,
          keywords: ensureEntryKeywords(entry)
        }));
        if (!state.selectedId && state.entries.length) state.selectedId = state.entries[0].id;
        if (state.selectedId && !state.entries.some(e => String(e.id) === String(state.selectedId))) {
          state.selectedId = state.entries.length ? state.entries[0].id : null;
        }
        statUserEl.textContent = esc(String(data.userEmail || '-').split('@')[0] || '-');
        statScannedEl.textContent = String(data.totalScanned || 0);
        statMatchedEl.textContent = String(data.matchedCount || 0);
        statModeEl.textContent = data.categoryMatchUsed ? 'CATEGORY' : 'HEUR';
        renderKeywordChips();
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
    clearFilterBtn.addEventListener('click', () => {
      state.activeKeyword = null;
      renderKeywordChips();
      renderList();
      if (state.selectedId) renderDetail(state.selectedId);
    });
    loadFeed();
  </script>
</body>
</html>`);
    });
  }
};
