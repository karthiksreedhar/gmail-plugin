/**
 * Apartment Summary And Ranking Backend
 * Opens a standalone page and ranks apartment options from apartment emails.
 */

module.exports = {
  initialize(context) {
    const {
      app,
      getCurrentUser,
      getUserDoc,
      loadResponseEmails,
      loadUnrepliedEmails,
      loadEmailThreads,
      invokeGemini,
      getGeminiModel
    } = context;

    const savesByUrlCache = new Map(); // url -> { value, updatedAt }
    const neighborhoodInsightCache = new Map(); // neighborhood -> { value, updatedAt }
    const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

    function safeStr(value) {
      return String(value || '').trim();
    }

    function normalizeForSearch(value) {
      return safeStr(value).toLowerCase();
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
        } else {
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
      }

      return out;
    }

    function isApartmentEmail(email) {
      const cats = Array.isArray(email?.categories) && email.categories.length
        ? email.categories
        : (email?.category ? [email.category] : []);

      const categoryHit = cats.some(cat => normalizeForSearch(cat).includes('apartment'));
      if (categoryHit) return true;

      const haystack = [
        email?.subject,
        email?.snippet,
        email?.body,
        email?.originalBody
      ].map(normalizeForSearch).join(' ');

      return /\b(apartment|studio|1br|2br|3br|bedroom|rent|lease|unit)\b/.test(haystack);
    }

    function isApartmentCategoryEmail(email) {
      const cats = Array.isArray(email?.categories) && email.categories.length
        ? email.categories
        : (email?.category ? [email.category] : []);
      return cats.some(cat => normalizeForSearch(cat).includes('apartment'));
    }

    function parsePrice(email) {
      const haystack = [
        safeStr(email?.subject),
        safeStr(email?.snippet),
        safeStr(email?.body),
        safeStr(email?.originalBody)
      ].join('\n');

      const regex = /\$\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?|[0-9]{3,5}(?:\.[0-9]{2})?)/g;
      const matches = [];
      let m;
      while ((m = regex.exec(haystack)) !== null) {
        const num = Number(String(m[1]).replace(/,/g, ''));
        if (Number.isFinite(num) && num >= 500 && num <= 20000) {
          matches.push(num);
        }
      }
      if (!matches.length) return null;
      return Math.min(...matches);
    }

    function parseNeighborhood(email) {
      const text = [
        safeStr(email?.subject),
        safeStr(email?.snippet),
        safeStr(email?.body),
        safeStr(email?.originalBody)
      ].join('\n');
      const lower = text.toLowerCase();

      const known = [
        'upper west side', 'upper east side', 'west village', 'east village', 'greenwich village',
        'chelsea', 'soho', 'tribeca', 'financial district', 'fidi', 'midtown', 'hells kitchen',
        'harlem', 'washington heights', 'inwood', 'morningside heights', 'manhattan valley',
        'williamsburg', 'greenpoint', 'bushwick', 'bed-stuy', 'brooklyn heights', 'dumbo',
        'park slope', 'crown heights', 'astoria', 'long island city', 'lic', 'sunnyside',
        'forest hills', 'jersey city', 'hoboken'
      ];

      for (const n of known) {
        if (lower.includes(n)) {
          return n
            .split(/\s+/)
            .map(token => token ? token[0].toUpperCase() + token.slice(1) : '')
            .join(' ');
        }
      }

      const generic = text.match(/\b(?:in|near|at)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\b/);
      if (generic && generic[1]) return safeStr(generic[1]);

      return 'Unknown';
    }

    function parseBedrooms(email) {
      const text = [
        safeStr(email?.subject),
        safeStr(email?.snippet),
        safeStr(email?.body)
      ].join(' ').toLowerCase();

      const explicit = text.match(/\b([0-9])\s*(?:bed|br|bedroom)\b/);
      if (explicit && explicit[1]) return `${explicit[1]} BR`;
      if (/\bstudio\b/.test(text)) return 'Studio';
      return '';
    }

    function parseAddress(email) {
      const subject = safeStr(email?.subject);
      const body = safeStr(email?.body || email?.originalBody || '');
      const from = safeStr(email?.originalFrom || email?.from);

      const addressInSubject = subject.match(/\b\d{1,5}\s+[A-Za-z0-9.\- ]{3,60}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane)\b/i);
      if (addressInSubject && addressInSubject[0]) return safeStr(addressInSubject[0]);

      const addressInBody = body.match(/\b\d{1,5}\s+[A-Za-z0-9.\- ]{3,60}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane)\b/i);
      if (addressInBody && addressInBody[0]) return safeStr(addressInBody[0]);

      if (subject) return subject;
      if (from) return from;
      return 'Apartment Listing';
    }

    function unwrapUrl(url) {
      const raw = safeStr(url);
      if (!raw) return '';
      let out = raw.replace(/&amp;/g, '&').replace(/[)>.,;]+$/g, '');
      try { out = decodeURIComponent(out); } catch (_) {}
      try {
        const parsed = new URL(out);
        const wrapped = parsed.searchParams.get('u') || parsed.searchParams.get('url') || parsed.searchParams.get('target');
        if (wrapped) return unwrapUrl(wrapped);
      } catch (_) {}
      return out;
    }

    function extractUrlsFromText(text) {
      const source = safeStr(text);
      if (!source) return [];
      const matches = source.match(/https?:\/\/[^\s"'<>]+/gi) || [];
      return matches.map(unwrapUrl).filter(Boolean);
    }

    function isStreetEasyHost(url) {
      try {
        const parsed = new URL(url);
        const host = normalizeForSearch(parsed.hostname).replace(/^www\./, '');
        return host === 'streeteasy.com';
      } catch (_) {
        return false;
      }
    }

    function isLikelyStreetEasyListing(url) {
      try {
        const parsed = new URL(url);
        if (!isStreetEasyHost(url)) return false;
        const path = normalizeForSearch(parsed.pathname || '');
        // Listing-like pages usually have deeper, specific paths.
        if (path === '/' || path === '/nyc' || path === '/for-sale/nyc' || path === '/rental/nyc') return false;
        if (path.includes('/saved_searches') || path.includes('/search') || path.includes('/building')) return false;
        if (path.includes('/for-sale/') || path.includes('/rental/')) return true;
        // Fallback: any deep path with id-like token.
        if (path.split('/').filter(Boolean).length >= 2 && /[0-9]/.test(path)) return true;
        return false;
      } catch (_) {
        return false;
      }
    }

    function streetEasyListingScore(url) {
      try {
        const parsed = new URL(url);
        const path = normalizeForSearch(parsed.pathname || '');
        let score = 0;
        if (path.includes('/rental/')) score += 40;
        if (path.includes('/for-sale/')) score += 35;
        if (/[0-9]/.test(path)) score += 20;
        if (path.split('/').filter(Boolean).length >= 3) score += 10;
        // Penalize generic/marketing pages.
        if (path === '/' || path === '/nyc') score -= 50;
        if (path.includes('/search') || path.includes('/saved_searches') || path.includes('/building')) score -= 30;
        return score;
      } catch (_) {
        return -999;
      }
    }

    function parseStreetEasyUrl(email) {
      const text = [
        safeStr(email?.subject),
        safeStr(email?.snippet),
        safeStr(email?.body),
        safeStr(email?.originalBody)
      ].join('\n');

      const allUrls = extractUrlsFromText(text);
      const streetEasyUrls = allUrls.filter(isStreetEasyHost);
      if (!streetEasyUrls.length) return '';

      const listingCandidates = streetEasyUrls.filter(isLikelyStreetEasyListing);
      if (!listingCandidates.length) return '';

      listingCandidates.sort((a, b) => streetEasyListingScore(b) - streetEasyListingScore(a));
      return listingCandidates[0] || '';
    }

    async function fetchPageHtml(url, timeoutMs = 7000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'user-agent': 'Mozilla/5.0 ApartmentRanking/1.0',
            'accept': 'text/html,application/xhtml+xml'
          }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
      } finally {
        clearTimeout(timer);
      }
    }

    function parseSavesCountFromHtml(html) {
      const source = safeStr(html);
      if (!source) return null;

      // Typical visible label formats.
      const patterns = [
        /this home has been saved by\s+([0-9]{1,3}(?:,[0-9]{3})*)\s+users?/i,
        /([0-9]{1,3}(?:,[0-9]{3})*)\s+Saves?\b/i,
        /"savesCount"\s*:\s*([0-9]+)/i,
        /"saved_count"\s*:\s*([0-9]+)/i
      ];
      for (const p of patterns) {
        const m = source.match(p);
        if (m && m[1]) {
          const n = Number(String(m[1]).replace(/,/g, ''));
          if (Number.isFinite(n) && n >= 0 && n < 1000000) return n;
        }
      }
      return null;
    }

    function competitionNoteFromSaves(saves) {
      const n = Number(saves);
      if (!Number.isFinite(n) || n < 0) return '';
      if (n >= 100) return `Highly competitive (${n} saves)`;
      if (n >= 50) return `Competitive (${n} saves)`;
      if (n >= 20) return `Moderately competitive (${n} saves)`;
      return `Lower competition (${n} saves)`;
    }

    async function fetchStreetEasySavesCount(url) {
      const key = safeStr(url);
      if (!key) return null;
      const cached = savesByUrlCache.get(key);
      if (cached && (Date.now() - cached.updatedAt) < CACHE_TTL_MS) return cached.value;

      let value = null;
      try {
        const html = await fetchPageHtml(key, 7000);
        value = parseSavesCountFromHtml(html);
      } catch (_) {
        value = null;
      }

      savesByUrlCache.set(key, { value, updatedAt: Date.now() });
      return value;
    }

    function hasStrongListingSignal(email) {
      const subject = safeStr(email?.subject);
      const snippet = safeStr(email?.snippet);
      const body = safeStr(email?.body || email?.originalBody || '');
      const text = `${subject}\n${snippet}\n${body}`;

      if (parsePrice(email) !== null) return true;
      if (/\b([0-9])\s*(?:bed|br|bedroom)\b/i.test(text) || /\bstudio\b/i.test(text)) return true;
      if (/\b\d{1,5}\s+[A-Za-z0-9.\- ]{3,60}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane)\b/i.test(text)) return true;
      if (/\b(square feet|sq ?ft|doorman|laundry|elevator|lease term|broker fee|move-in)\b/i.test(text)) return true;
      return false;
    }

    function isLikelyPromotion(email) {
      const text = [
        safeStr(email?.subject),
        safeStr(email?.snippet),
        safeStr(email?.body),
        safeStr(email?.originalBody)
      ].join(' ').toLowerCase();

      if (!text) return false;
      if (hasStrongListingSignal(email)) return false;
      return (
        text.includes('unsubscribe') ||
        text.includes('sponsored') ||
        text.includes('advertisement') ||
        text.includes('promo') ||
        text.includes('promotion') ||
        text.includes('recommended for you') ||
        text.includes('you may also like')
      );
    }

    function canonicalAddressKey(listing) {
      const title = safeStr(listing?.title);
      const subject = safeStr(listing?.sourceSubject);
      const combined = `${title} ${subject}`;

      // Prefer stable street-address style keys.
      const match = combined.match(/\b\d{1,5}\s+[A-Za-z0-9.\- ]{2,60}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane)\b/i);
      if (match && match[0]) {
        return normalizeForSearch(match[0]).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      }

      // Fallback for cases where no explicit street address is present.
      return normalizeForSearch(title).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    async function loadAllCandidateEmails(userEmail) {
      let responseEmails = [];
      try {
        const doc = await getUserDoc('response_emails', userEmail);
        if (doc && Array.isArray(doc.emails)) responseEmails = doc.emails;
      } catch (_) {}
      if (!responseEmails.length) {
        responseEmails = loadResponseEmails() || [];
      }

      let unreplied = [];
      try {
        const doc = await getUserDoc('unreplied_emails', userEmail);
        if (doc && Array.isArray(doc.emails)) unreplied = doc.emails;
      } catch (_) {}
      if (!unreplied.length) {
        unreplied = loadUnrepliedEmails() || [];
      }

      let threads = [];
      try {
        const doc = await getUserDoc('email_threads', userEmail);
        if (doc && Array.isArray(doc.threads)) threads = flattenThreadCollection(doc.threads);
      } catch (_) {}
      if (!threads.length) {
        threads = flattenThreadCollection(loadEmailThreads() || []);
      }

      const sources = [responseEmails, unreplied, threads];
      const unified = [];
      const seen = new Set();
      for (let i = 0; i < sources.length; i++) {
        const arr = Array.isArray(sources[i]) ? sources[i] : [];
        for (const raw of arr) {
          const email = normalizeEmailShape(raw, `apt-${i}`);
          if (!email || !email.id || seen.has(email.id)) continue;
          seen.add(email.id);
          unified.push(email);
        }
      }

      return unified;
    }

    async function buildApartmentRankings(userEmail) {
      const allEmails = await loadAllCandidateEmails(userEmail);
      const categoryOnly = allEmails.filter(isApartmentCategoryEmail);
      const seedEmails = categoryOnly.length ? categoryOnly : allEmails.filter(isApartmentEmail);
      const apartmentEmails = seedEmails
        .filter(email => !isLikelyPromotion(email) || hasStrongListingSignal(email))
        .sort((a, b) => dateMs(b.date) - dateMs(a.date));

      const apartmentsRaw = apartmentEmails.map(email => ({
        emailId: safeStr(email.id),
        title: parseAddress(email),
        neighborhood: parseNeighborhood(email),
        price: parsePrice(email),
        bedrooms: parseBedrooms(email),
        streetEasyUrl: parseStreetEasyUrl(email),
        date: safeStr(email.date) || null,
        sourceSubject: safeStr(email.subject) || 'Apartment Listing',
        from: safeStr(email.originalFrom || email.from)
      }));

      const dedupedByAddress = new Map();
      for (const apt of apartmentsRaw) {
        const key = canonicalAddressKey(apt);
        if (!key) continue;

        const existing = dedupedByAddress.get(key);
        if (!existing) {
          dedupedByAddress.set(key, apt);
          continue;
        }

        // For duplicate addresses across multiple emails, keep the "best" row:
        // 1) lower price, then 2) newer date.
        const existingPrice = Number.isFinite(existing.price) ? existing.price : Number.MAX_SAFE_INTEGER;
        const currentPrice = Number.isFinite(apt.price) ? apt.price : Number.MAX_SAFE_INTEGER;
        if (currentPrice < existingPrice) {
          dedupedByAddress.set(key, apt);
          continue;
        }
        if (currentPrice === existingPrice && dateMs(apt.date) > dateMs(existing.date)) {
          dedupedByAddress.set(key, apt);
        }
      }

      const deduped = Array.from(dedupedByAddress.values());

      // Enrich with StreetEasy saves counts where available.
      const uniqueUrls = Array.from(new Set(
        deduped.map(item => safeStr(item.streetEasyUrl)).filter(Boolean)
      ));
      const savesByUrl = new Map();
      for (const url of uniqueUrls) {
        const saves = await fetchStreetEasySavesCount(url);
        savesByUrl.set(url, saves);
      }

      for (const apt of deduped) {
        const url = safeStr(apt.streetEasyUrl);
        const savesCount = url ? savesByUrl.get(url) : null;
        apt.savesCount = Number.isFinite(savesCount) ? savesCount : null;
        apt.competitionNote = competitionNoteFromSaves(apt.savesCount);
      }

      deduped.sort((a, b) => {
        const ap = Number.isFinite(a.price) ? a.price : Number.MAX_SAFE_INTEGER;
        const bp = Number.isFinite(b.price) ? b.price : Number.MAX_SAFE_INTEGER;
        if (ap !== bp) return ap - bp;
        return safeStr(a.neighborhood).localeCompare(safeStr(b.neighborhood));
      });

      return deduped.map((apt, idx) => ({
        rank: idx + 1,
        ...apt
      }));
    }

    async function getNeighborhoodInsight(neighborhood) {
      const key = normalizeForSearch(neighborhood);
      if (!key || key === 'unknown') return 'Neighborhood details unavailable.';

      const cached = neighborhoodInsightCache.get(key);
      if (cached && (Date.now() - cached.updatedAt) < CACHE_TTL_MS) {
        return cached.value;
      }

      let insight = '';
      if (typeof invokeGemini === 'function') {
        const prompt = `You are helping a renter in their early/mid 20s evaluate NYC neighborhoods.

Neighborhood: ${safeStr(neighborhood)}

Return exactly 3 sentences total:
1) One concrete pro.
2) One concrete con.
3) One balanced takeaway for someone in their early/mid 20s.

Keep it practical (commute, social scene, safety, noise, cost, amenities). Avoid fluff.`;

        try {
          const completion = await invokeGemini({
            model: typeof getGeminiModel === 'function' ? getGeminiModel() : undefined,
            messages: [
              { role: 'system', content: 'You provide concise neighborhood pros/cons.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            maxOutputTokens: 220
          });
          insight = safeStr(completion?.content || '');
        } catch (_) {
          insight = '';
        }
      }

      if (!insight) {
        insight = `A major pro is neighborhood-specific convenience and amenities; a major con is that rent and lifestyle fit can vary block by block. For someone in their early/mid 20s, visit at day and night and compare commute plus social fit before deciding.`;
      }

      neighborhoodInsightCache.set(key, { value: insight, updatedAt: Date.now() });
      return insight;
    }

    app.get('/api/apartment-summary-and-ranking/list', async (req, res) => {
      try {
        const user = getCurrentUser();
        const apartments = await buildApartmentRankings(user);
        return res.json({
          success: true,
          userEmail: user,
          total: apartments.length,
          apartments
        });
      } catch (error) {
        console.error('Apartment Summary And Ranking API failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to load apartment rankings' });
      }
    });

    app.post('/api/apartment-summary-and-ranking/neighborhood-insight', async (req, res) => {
      try {
        const neighborhood = safeStr(req.body?.neighborhood);
        if (!neighborhood) {
          return res.status(400).json({ success: false, error: 'neighborhood is required' });
        }
        const insight = await getNeighborhoodInsight(neighborhood);
        return res.json({ success: true, neighborhood, insight });
      } catch (error) {
        console.error('Apartment neighborhood-insight API failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to load neighborhood insight' });
      }
    });

    app.get('/apartment-summary-and-ranking', (req, res) => {
      res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Apartment Summary And Ranking</title>
  <style>
    body { margin:0; font-family: Google Sans, Roboto, Arial, sans-serif; background:#f6f8fc; color:#202124; }
    .wrap { max-width:1100px; margin:0 auto; padding:20px 16px 32px; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:16px; }
    .title { font-size:28px; font-weight:700; }
    .sub { font-size:13px; color:#5f6368; margin-top:4px; }
    .btn { border:1px solid #dadce0; background:#fff; border-radius:18px; font-size:13px; cursor:pointer; padding:8px 12px; }
    .meta { font-size:13px; color:#5f6368; margin-bottom:12px; }
    .card { background:#fff; border:1px solid #e6e9ef; border-radius:12px; overflow:hidden; }
    table { width:100%; border-collapse:collapse; }
    th, td { text-align:left; padding:12px 14px; border-bottom:1px solid #eef1f4; font-size:14px; vertical-align:top; }
    th { color:#5f6368; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.4px; background:#fbfcfe; }
    tr:last-child td { border-bottom:none; }
    .price { font-weight:700; color:#137333; }
    .neighborhood-link { color:#0b57d0; text-decoration:none; cursor:pointer; font-weight:600; }
    .neighborhood-link:hover { text-decoration:underline; }
    .muted { color:#5f6368; font-size:12px; margin-top:4px; }
    .competition-high { color:#b3261e; font-weight:700; }
    .competition-med { color:#9a6700; font-weight:700; }
    .competition-low { color:#137333; font-weight:700; }
    .empty { color:#5f6368; font-size:14px; padding:18px; }
    .modal { position:fixed; inset:0; background:rgba(32,33,36,.35); display:none; align-items:center; justify-content:center; z-index:1200; }
    .modal.show { display:flex; }
    .modal-card { width:min(560px, 92vw); background:#fff; border:1px solid #e6e9ef; border-radius:12px; padding:16px; box-shadow:0 10px 28px rgba(0,0,0,.12); }
    .modal-title { font-size:18px; font-weight:700; margin:0 0 8px; }
    .modal-text { font-size:14px; color:#3c4043; line-height:1.6; white-space:pre-wrap; }
    .modal-actions { margin-top:12px; display:flex; justify-content:flex-end; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <div class="title">Apartment Rankings</div>
        <div class="sub">Ranked by lowest price first, then neighborhood</div>
      </div>
      <button id="refreshBtn" class="btn">Refresh</button>
    </div>
    <div id="meta" class="meta">Loading...</div>
    <div class="card">
      <div id="content" class="empty">Loading apartment listings...</div>
    </div>
  </div>
  <div id="neighborhoodModal" class="modal" aria-hidden="true">
    <div class="modal-card">
      <h3 id="neighborhoodTitle" class="modal-title">Neighborhood Insight</h3>
      <div id="neighborhoodText" class="modal-text">Loading...</div>
      <div class="modal-actions">
        <button id="closeNeighborhoodBtn" class="btn">Close</button>
      </div>
    </div>
  </div>

  <script>
    const content = document.getElementById('content');
    const meta = document.getElementById('meta');
    const refreshBtn = document.getElementById('refreshBtn');
    const neighborhoodModal = document.getElementById('neighborhoodModal');
    const neighborhoodTitle = document.getElementById('neighborhoodTitle');
    const neighborhoodText = document.getElementById('neighborhoodText');
    const closeNeighborhoodBtn = document.getElementById('closeNeighborhoodBtn');

    function esc(v){ return String(v||'').replace(/[&<>\"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[s])); }
    function fmtDate(v){
      const d = new Date(v || 0);
      if (Number.isNaN(d.getTime())) return 'Unknown date';
      return d.toLocaleString(undefined, { year:'numeric', month:'short', day:'numeric' });
    }
    function fmtPrice(v){
      const n = Number(v);
      if (!Number.isFinite(n)) return 'N/A';
      return '$' + n.toLocaleString();
    }
    function competitionClass(note){
      const n = String(note || '').toLowerCase();
      if (n.includes('highly competitive') || n.includes('competitive (')) return 'competition-high';
      if (n.includes('moderately')) return 'competition-med';
      if (n.includes('lower')) return 'competition-low';
      return '';
    }
    function openNeighborhoodModal(name, text){
      neighborhoodTitle.textContent = name ? ('Neighborhood: ' + name) : 'Neighborhood Insight';
      neighborhoodText.textContent = text || 'No insight available.';
      neighborhoodModal.classList.add('show');
      neighborhoodModal.setAttribute('aria-hidden', 'false');
    }
    function closeNeighborhoodModal(){
      neighborhoodModal.classList.remove('show');
      neighborhoodModal.setAttribute('aria-hidden', 'true');
    }

    async function loadNeighborhoodInsight(neighborhood){
      if (!neighborhood || neighborhood === 'Unknown') return;
      openNeighborhoodModal(neighborhood, 'Loading neighborhood pros/cons...');
      try {
        const r = await fetch('/api/apartment-summary-and-ranking/neighborhood-insight', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ neighborhood })
        });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Failed');
        openNeighborhoodModal(neighborhood, d.insight || 'No insight available.');
      } catch (error) {
        openNeighborhoodModal(neighborhood, 'Failed to load neighborhood insight.');
      }
    }

    async function load() {
      meta.textContent = 'Loading...';
      content.innerHTML = '<div class="empty">Loading apartment listings...</div>';
      try {
        const r = await fetch('/api/apartment-summary-and-ranking/list');
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Failed');

        const list = Array.isArray(d.apartments) ? d.apartments : [];
        meta.textContent = String(list.length) + ' apartment options found';

        if (!list.length) {
          content.innerHTML = '<div class="empty">No apartment emails found in your apartment category yet.</div>';
          return;
        }

        const rows = list.map(item => {
          const listingTitle = item.streetEasyUrl
            ? ('<a href=\"' + esc(item.streetEasyUrl) + '\" target=\"_blank\" rel=\"noopener noreferrer\">' + esc(item.title || 'Apartment Listing') + '</a>')
            : esc(item.title || 'Apartment Listing');
          const neighborhoodHtml = item.neighborhood && item.neighborhood !== 'Unknown'
            ? ('<a class=\"neighborhood-link\" data-neighborhood=\"' + esc(item.neighborhood) + '\">' + esc(item.neighborhood) + '</a>')
            : esc(item.neighborhood || 'Unknown');
          const competition = item.competitionNote || (Number.isFinite(Number(item.savesCount)) ? (String(item.savesCount) + ' saves') : 'Unknown');
          const compClass = competitionClass(competition);
          return (
            '<tr>' +
              '<td><strong>' + esc(item.rank) + '</strong></td>' +
              '<td><div>' + listingTitle + '</div><div class="muted">' + esc(item.sourceSubject || '') + '</div></td>' +
              '<td>' + neighborhoodHtml + '</td>' +
              '<td class="price">' + esc(fmtPrice(item.price)) + '</td>' +
              '<td><span class=\"' + esc(compClass) + '\">' + esc(competition) + '</span></td>' +
              '<td>' + esc(item.bedrooms || '—') + '</td>' +
              '<td>' + esc(fmtDate(item.date)) + '</td>' +
            '</tr>'
          );
        }).join('');

        content.innerHTML =
          '<table>' +
            '<thead><tr><th>Rank</th><th>Listing</th><th>Neighborhood</th><th>Price</th><th>Competition</th><th>Beds</th><th>Date</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>';

        content.querySelectorAll('.neighborhood-link').forEach(el => {
          el.addEventListener('click', () => {
            const neighborhood = el.getAttribute('data-neighborhood') || '';
            loadNeighborhoodInsight(neighborhood);
          });
        });
      } catch (error) {
        meta.textContent = 'Failed to load rankings';
        content.innerHTML = '<div class="empty">Failed to load apartment rankings.</div>';
      }
    }

    closeNeighborhoodBtn.addEventListener('click', closeNeighborhoodModal);
    neighborhoodModal.addEventListener('click', (e) => {
      if (e.target === neighborhoodModal) closeNeighborhoodModal();
    });
    refreshBtn.addEventListener('click', load);
    load();
  </script>
</body>
</html>`);
    });
  }
};
