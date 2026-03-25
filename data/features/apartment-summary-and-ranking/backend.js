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
      loadEmailThreads
    } = context;

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
      const apartmentEmails = allEmails
        .filter(isApartmentEmail)
        .sort((a, b) => dateMs(b.date) - dateMs(a.date));

      const apartments = apartmentEmails.map(email => ({
        emailId: safeStr(email.id),
        title: parseAddress(email),
        neighborhood: parseNeighborhood(email),
        price: parsePrice(email),
        bedrooms: parseBedrooms(email),
        date: safeStr(email.date) || null,
        sourceSubject: safeStr(email.subject) || 'Apartment Listing',
        from: safeStr(email.originalFrom || email.from)
      }));

      apartments.sort((a, b) => {
        const ap = Number.isFinite(a.price) ? a.price : Number.MAX_SAFE_INTEGER;
        const bp = Number.isFinite(b.price) ? b.price : Number.MAX_SAFE_INTEGER;
        if (ap !== bp) return ap - bp;
        return safeStr(a.neighborhood).localeCompare(safeStr(b.neighborhood));
      });

      return apartments.map((apt, idx) => ({
        rank: idx + 1,
        ...apt
      }));
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
    .muted { color:#5f6368; font-size:12px; margin-top:4px; }
    .empty { color:#5f6368; font-size:14px; padding:18px; }
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

  <script>
    const content = document.getElementById('content');
    const meta = document.getElementById('meta');
    const refreshBtn = document.getElementById('refreshBtn');

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
          return (
            '<tr>' +
              '<td><strong>' + esc(item.rank) + '</strong></td>' +
              '<td><div>' + esc(item.title || 'Apartment Listing') + '</div><div class="muted">' + esc(item.sourceSubject || '') + '</div></td>' +
              '<td>' + esc(item.neighborhood || 'Unknown') + '</td>' +
              '<td class="price">' + esc(fmtPrice(item.price)) + '</td>' +
              '<td>' + esc(item.bedrooms || '—') + '</td>' +
              '<td>' + esc(fmtDate(item.date)) + '</td>' +
            '</tr>'
          );
        }).join('');

        content.innerHTML =
          '<table>' +
            '<thead><tr><th>Rank</th><th>Listing</th><th>Neighborhood</th><th>Price</th><th>Beds</th><th>Date</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>';
      } catch (error) {
        meta.textContent = 'Failed to load rankings';
        content.innerHTML = '<div class="empty">Failed to load apartment rankings.</div>';
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

