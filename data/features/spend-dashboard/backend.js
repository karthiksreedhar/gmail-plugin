/**
 * Spend Dashboard Backend
 *
 * Scans the user's inbox emails for receipts / order confirmations / invoices,
 * uses Anthropic Claude (via invokeAnthropic, batched to stay within token
 * limits) to extract structured transaction data (merchant, amount, currency,
 * date, category), aggregates the results, and serves a dedicated dashboard
 * page at /spend-dashboard.
 *
 * Results are cached per user in the `spend_dashboard_data` collection and only
 * re-extracted when the underlying receipt set changes or the caller forces a
 * refresh (?refresh=1).
 */

module.exports = {
  initialize(context) {
    const {
      app,
      getCurrentUser,
      getUserDoc,
      setUserDoc,
      loadResponseEmails,
      invokeAnthropic,
      getAnthropicModel
    } = context;

    console.log('Spend Dashboard: Initializing backend...');

    // --- Token/batching limits (per system requirements) ---
    const EMAILS_PER_BATCH = 30;
    const MAX_BATCHES = 5;
    const MAX_TOTAL_EMAILS = EMAILS_PER_BATCH * MAX_BATCHES; // 150

    // Categories the model is allowed to assign.
    const ALLOWED_CATEGORIES = [
      'Food & Dining',
      'Groceries',
      'Shopping',
      'Travel',
      'Transportation',
      'Subscriptions',
      'Utilities',
      'Entertainment',
      'Health',
      'Other'
    ];

    // Heuristic that identifies receipt-like emails before we spend any tokens.
    const RECEIPT_RE = /(receipt|invoice|order\s*(confirmation|#|number|placed|summary)|your order|purchase|payment\s*(received|confirmation|succeeded|success)|thank you for your (order|purchase|payment)|thanks for your (order|purchase)|subscription\s*(renewal|confirmation|receipt)|billing statement|has been charged|amount\s*(charged|paid|due)|transaction\s*(confirmation|receipt)|order\s*total)/i;
    const RECEIPT_SENDER_RE = /(orders?|receipts?|billing|invoices?|payments?|noreply|no-reply)/i;

    function safeStr(v) {
      return String(v || '').trim();
    }

    function stripHtmlAndNoise(raw) {
      const text = safeStr(raw);
      if (!text) return '';
      return text
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function parseEmailAddress(fromRaw) {
      const text = safeStr(fromRaw);
      if (!text) return '';
      const angle = text.match(/<([^>]+)>/);
      if (angle && angle[1]) return angle[1].trim().toLowerCase();
      const plain = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      return plain ? plain[0].trim().toLowerCase() : '';
    }

    function looksLikeReceipt(email) {
      const subject = safeStr(email?.subject);
      const snippet = safeStr(email?.snippet);
      const body = stripHtmlAndNoise(email?.body || email?.originalBody || '').slice(0, 2500);
      const haystack = `${subject}\n${snippet}\n${body}`;
      if (RECEIPT_RE.test(haystack)) return true;

      const address = parseEmailAddress(email?.originalFrom || email?.from);
      const localPart = address.split('@')[0] || '';
      // A "billing@"/"orders@" style sender only counts as a candidate when the
      // content also mentions money, to avoid pulling in generic notifications.
      if (RECEIPT_SENDER_RE.test(localPart) && /\d/.test(haystack) && /(\$|€|£|usd|eur|gbp|total|paid|charged)/i.test(haystack)) {
        return true;
      }
      return false;
    }

    function dateMs(email) {
      const ms = new Date(email?.date || 0).getTime();
      return Number.isFinite(ms) ? ms : 0;
    }

    function monthKey(dateValue) {
      const d = new Date(dateValue || 0);
      if (Number.isNaN(d.getTime())) return null;
      const m = d.getUTCMonth() + 1;
      return `${d.getUTCFullYear()}-${m < 10 ? '0' + m : m}`;
    }

    function parseAmount(value) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      let text = safeStr(value);
      if (!text) return null;
      // Keep digits, separators and sign only.
      text = text.replace(/[^0-9.,-]/g, '');
      if (!text) return null;
      // If both separators exist, assume the last one is the decimal separator.
      if (text.includes(',') && text.includes('.')) {
        if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
          text = text.replace(/\./g, '').replace(',', '.');
        } else {
          text = text.replace(/,/g, '');
        }
      } else if (text.includes(',')) {
        // Treat comma as decimal only when it looks like one (e.g. 12,34).
        text = /,\d{1,2}$/.test(text) ? text.replace(',', '.') : text.replace(/,/g, '');
      }
      const num = parseFloat(text);
      return Number.isFinite(num) ? num : null;
    }

    function normalizeCurrency(value) {
      const text = safeStr(value).toUpperCase();
      if (/^[A-Z]{3}$/.test(text)) return text;
      if (text.includes('$') || text === 'DOLLAR' || text === 'DOLLARS') return 'USD';
      if (text.includes('€') || text === 'EURO' || text === 'EUROS') return 'EUR';
      if (text.includes('£') || text === 'POUND' || text === 'POUNDS') return 'GBP';
      return '';
    }

    function normalizeCategory(value) {
      const text = safeStr(value);
      const match = ALLOWED_CATEGORIES.find(c => c.toLowerCase() === text.toLowerCase());
      return match || 'Other';
    }

    function parseJsonFromModel(text) {
      const raw = safeStr(text);
      if (!raw) return null;
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      const candidate = fenced && fenced[1] ? fenced[1].trim() : raw;
      try {
        return JSON.parse(candidate);
      } catch (_) {
        const start = candidate.indexOf('[');
        const end = candidate.lastIndexOf(']');
        if (start >= 0 && end > start) {
          try {
            return JSON.parse(candidate.slice(start, end + 1));
          } catch (_) {
            return null;
          }
        }
        return null;
      }
    }

    // Load approved/categorized inbox emails (Mongo first, in-memory fallback).
    async function loadInboxEmails(userEmail) {
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
      return Array.isArray(emails) ? emails.filter(e => e && e.id) : [];
    }

    function buildExtractionInput(email, idx) {
      const body = stripHtmlAndNoise(email?.body || email?.originalBody || '');
      const snippet = stripHtmlAndNoise(email?.snippet || '');
      return {
        idx,
        subject: safeStr(email?.subject).slice(0, 200),
        from: safeStr(email?.originalFrom || email?.from).slice(0, 160),
        date: safeStr(email?.date),
        // Body carries the amount, so give the model a decent (bounded) slice.
        text: (snippet + ' ' + body).trim().slice(0, 1500)
      };
    }

    const SYSTEM_PROMPT = [
      'You extract purchase/receipt information from emails.',
      'For each email decide if it is a genuine purchase receipt, order confirmation, invoice, or payment/subscription charge (isReceipt=true).',
      'Marketing, shipping-only, abandoned-cart, coupon, and balance-alert emails are NOT receipts (isReceipt=false).',
      'When isReceipt is true, extract: merchant (short brand name), amount (the grand total actually charged, as a number only), currency (ISO 4217 code like USD/EUR/GBP), date (ISO yyyy-mm-dd if present, else null), and category.',
      `category must be exactly one of: ${ALLOWED_CATEGORIES.join(', ')}.`,
      'If you cannot find a clear total amount, set isReceipt=false.',
      'Return ONLY a JSON array, no markdown, no commentary.'
    ].join(' ');

    // Extract transactions from receipt candidates, batched to respect token limits.
    async function extractTransactions(candidates) {
      if (typeof invokeAnthropic !== 'function') {
        console.warn('Spend Dashboard: invokeAnthropic unavailable, skipping extraction');
        return [];
      }

      const limited = candidates.slice(0, MAX_TOTAL_EMAILS);
      const batches = [];
      for (let i = 0; i < limited.length; i += EMAILS_PER_BATCH) {
        batches.push(limited.slice(i, i + EMAILS_PER_BATCH));
      }
      const batchesToProcess = batches.slice(0, MAX_BATCHES);

      console.log(`Spend Dashboard: extracting from ${limited.length} candidate(s) in ${batchesToProcess.length} batch(es)`);

      const transactions = [];
      let globalIdx = 0;

      for (let b = 0; b < batchesToProcess.length; b++) {
        const batch = batchesToProcess[b];
        // Map the batch's local idx -> the email object for this batch.
        const idxToEmail = new Map();
        const inputItems = batch.map((email) => {
          const item = buildExtractionInput(email, globalIdx);
          idxToEmail.set(globalIdx, email);
          globalIdx += 1;
          return item;
        });

        const userPrompt = JSON.stringify({
          output_format: [
            { idx: 0, isReceipt: true, merchant: 'Amazon', amount: 42.99, currency: 'USD', date: '2025-01-05', category: 'Shopping' }
          ],
          emails: inputItems
        });

        try {
          const response = await invokeAnthropic({
            model: typeof getAnthropicModel === 'function' ? getAnthropicModel() : undefined,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0,
            maxOutputTokens: 3000
          });

          if (response && response.stopReason === 'max_tokens') {
            throw new Error('LLM output truncated at token limit');
          }

          const parsed = parseJsonFromModel(response?.content || '');
          if (Array.isArray(parsed)) {
            for (const row of parsed) {
              if (!row || row.isReceipt !== true) continue;
              const email = idxToEmail.get(Number(row.idx));
              if (!email) continue;
              const amount = parseAmount(row.amount);
              if (amount === null || amount <= 0) continue;
              const parsedDate = safeStr(row.date);
              const when = (parsedDate && !Number.isNaN(new Date(parsedDate).getTime()))
                ? parsedDate
                : (email.date || null);
              transactions.push({
                merchant: safeStr(row.merchant) || 'Unknown',
                amount,
                currency: normalizeCurrency(row.currency),
                category: normalizeCategory(row.category),
                date: when,
                subject: safeStr(email.subject) || 'No Subject',
                emailId: safeStr(email.id)
              });
            }
          }
        } catch (error) {
          const msg = error?.message || String(error);
          if (/context length|maximum context|token/i.test(msg)) {
            console.error(`Spend Dashboard: batch ${b + 1} hit token limit, retrying with half the batch...`);
            const half = batch.slice(0, Math.floor(batch.length / 2));
            try {
              const retryItems = half.map((email, i) => {
                const item = buildExtractionInput(email, i);
                item.text = item.text.slice(0, 800); // trim harder on retry
                return { email, item };
              });
              const retryResponse = await invokeAnthropic({
                model: typeof getAnthropicModel === 'function' ? getAnthropicModel() : undefined,
                messages: [
                  { role: 'system', content: SYSTEM_PROMPT },
                  { role: 'user', content: JSON.stringify({ emails: retryItems.map(r => r.item) }) }
                ],
                temperature: 0,
                maxOutputTokens: 2000
              });
              const parsed = parseJsonFromModel(retryResponse?.content || '');
              if (Array.isArray(parsed)) {
                for (const row of parsed) {
                  if (!row || row.isReceipt !== true) continue;
                  const entry = retryItems[Number(row.idx)];
                  if (!entry) continue;
                  const amount = parseAmount(row.amount);
                  if (amount === null || amount <= 0) continue;
                  const email = entry.email;
                  const parsedDate = safeStr(row.date);
                  const when = (parsedDate && !Number.isNaN(new Date(parsedDate).getTime()))
                    ? parsedDate
                    : (email.date || null);
                  transactions.push({
                    merchant: safeStr(row.merchant) || 'Unknown',
                    amount,
                    currency: normalizeCurrency(row.currency),
                    category: normalizeCategory(row.category),
                    date: when,
                    subject: safeStr(email.subject) || 'No Subject',
                    emailId: safeStr(email.id)
                  });
                }
              }
            } catch (retryError) {
              console.error(`Spend Dashboard: batch ${b + 1} failed after retry:`, retryError?.message || retryError);
            }
          } else {
            console.error(`Spend Dashboard: batch ${b + 1} failed:`, msg);
          }
        }

        // Gentle pacing between batches to avoid rate limits.
        if (b < batchesToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return transactions;
    }

    // Resolve a time-duration filter key into a cutoff timestamp + chart window.
    function resolveRange(rangeKey) {
      let key = safeStr(rangeKey).toLowerCase() || '12m';
      const now = new Date();
      let sinceMs = null;
      let chartMonths = 12;
      let label = 'Last 12 months';
      switch (key) {
        case '30d':
          sinceMs = now.getTime() - 30 * 86400000; chartMonths = 2; label = 'Last 30 days'; break;
        case '90d':
          sinceMs = now.getTime() - 90 * 86400000; chartMonths = 4; label = 'Last 90 days'; break;
        case '6m':
          sinceMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1); chartMonths = 6; label = 'Last 6 months'; break;
        case '12m':
          sinceMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1); chartMonths = 12; label = 'Last 12 months'; break;
        case 'ytd':
          sinceMs = Date.UTC(now.getUTCFullYear(), 0, 1); chartMonths = now.getUTCMonth() + 1; label = 'Year to date'; break;
        case 'all':
          sinceMs = null; chartMonths = 0; label = 'All time'; break;
        default:
          key = '12m';
          sinceMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1); chartMonths = 12; label = 'Last 12 months';
      }
      return { key, sinceMs, chartMonths, label };
    }

    // Keep only transactions on/after the range cutoff (all time = keep all).
    function filterByRange(transactions, range) {
      if (range.sinceMs == null) return transactions.slice();
      return transactions.filter(t => {
        const ms = new Date(t.date || 0).getTime();
        return Number.isFinite(ms) && ms > 0 && ms >= range.sinceMs;
      });
    }

    // Ordered list of 'YYYY-MM' keys ending at the current month.
    function buildMonthsList(chartMonths) {
      const months = [];
      const now = new Date();
      const span = Math.max(1, chartMonths);
      for (let i = span - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        months.push(monthKey(d));
      }
      return months;
    }

    // Roll up transactions into the numbers the dashboard renders.
    // monthsList is the ordered set of 'YYYY-MM' buckets to display.
    function aggregate(transactions, monthsList) {
      const currencyCounts = {};
      transactions.forEach(t => {
        if (t.currency) currencyCounts[t.currency] = (currencyCounts[t.currency] || 0) + 1;
      });
      let primaryCurrency = 'USD';
      let best = -1;
      Object.entries(currencyCounts).forEach(([cur, count]) => {
        if (count > best) { best = count; primaryCurrency = cur; }
      });
      const currencies = Object.keys(currencyCounts);

      const byCategory = {};
      const byMerchant = {};
      const byMonth = {};
      let total = 0;

      transactions.forEach(t => {
        total += t.amount;

        const cat = t.category || 'Other';
        if (!byCategory[cat]) byCategory[cat] = { category: cat, total: 0, count: 0 };
        byCategory[cat].total += t.amount;
        byCategory[cat].count += 1;

        const merch = t.merchant || 'Unknown';
        if (!byMerchant[merch]) byMerchant[merch] = { merchant: merch, total: 0, count: 0 };
        byMerchant[merch].total += t.amount;
        byMerchant[merch].count += 1;

        const mk = monthKey(t.date);
        if (mk) byMonth[mk] = (byMonth[mk] || 0) + t.amount;
      });

      // Build the requested month window (bucket totals default to 0).
      const round = (n) => Math.round(n * 100) / 100;
      const months = (Array.isArray(monthsList) ? monthsList : []).map(key => ({
        month: key,
        total: round(byMonth[key] || 0)
      }));
      return {
        totalSpend: round(total),
        transactionCount: transactions.length,
        merchantCount: Object.keys(byMerchant).length,
        primaryCurrency,
        currencies,
        mixedCurrency: currencies.length > 1,
        byCategory: Object.values(byCategory)
          .map(c => ({ ...c, total: round(c.total) }))
          .sort((a, b) => b.total - a.total),
        topMerchants: Object.values(byMerchant)
          .map(m => ({ ...m, total: round(m.total) }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 12),
        byMonth: months
      };
    }

    function computeSignature(candidates) {
      const count = candidates.length;
      let latest = 0;
      candidates.forEach(e => { latest = Math.max(latest, dateMs(e)); });
      return `${count}:${latest}`;
    }

    async function buildSummary(userEmail, forceRefresh, rangeKey) {
      const emails = await loadInboxEmails(userEmail);
      const candidates = emails
        .filter(looksLikeReceipt)
        .sort((a, b) => dateMs(b) - dateMs(a));

      const signature = computeSignature(candidates);

      // Obtain the full (unfiltered) transaction set: reuse cache when the
      // underlying receipt set is unchanged, otherwise re-extract via the LLM.
      let transactions = null;
      let updatedAt = null;

      if (!forceRefresh) {
        try {
          const cached = await getUserDoc('spend_dashboard_data', userEmail);
          if (cached && cached.signature === signature && Array.isArray(cached.transactions)) {
            transactions = cached.transactions;
            updatedAt = cached.updatedAt || null;
          }
        } catch (_) {}
      }

      const fromCache = transactions !== null;

      if (!fromCache) {
        transactions = await extractTransactions(candidates);
        // Newest transactions first for the table.
        transactions.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        updatedAt = new Date().toISOString();
        try {
          await setUserDoc('spend_dashboard_data', userEmail, {
            transactions,
            signature,
            updatedAt
          });
        } catch (error) {
          console.error('Spend Dashboard: failed to cache results:', error?.message || error);
        }
      }

      // Apply the requested time-duration filter, then aggregate.
      const range = resolveRange(rangeKey);
      const filtered = filterByRange(transactions, range);

      let chartMonths = range.chartMonths;
      if (range.key === 'all') {
        // Size the "all time" chart to span from the earliest transaction to now.
        let earliest = null;
        filtered.forEach(t => {
          const ms = new Date(t.date || 0).getTime();
          if (Number.isFinite(ms) && ms > 0) earliest = earliest == null ? ms : Math.min(earliest, ms);
        });
        if (earliest == null) {
          chartMonths = 1;
        } else {
          const now = new Date();
          const e = new Date(earliest);
          const span = (now.getUTCFullYear() - e.getUTCFullYear()) * 12 + (now.getUTCMonth() - e.getUTCMonth()) + 1;
          chartMonths = Math.min(24, Math.max(1, span));
        }
      }

      const monthsList = buildMonthsList(chartMonths);
      const aggregates = aggregate(filtered, monthsList);

      return {
        transactions: filtered,
        aggregates,
        range: range.key,
        rangeLabel: range.label,
        totalTransactionCount: transactions.length,
        candidateCount: candidates.length,
        updatedAt,
        cached: fromCache
      };
    }

    // --- API: aggregated spend summary ---
    app.get('/api/spend-dashboard/summary', async (req, res) => {
      try {
        const user = getCurrentUser();
        const forceRefresh = safeStr(req.query.refresh) === '1' || safeStr(req.query.refresh) === 'true';
        const data = await buildSummary(user, forceRefresh, req.query.range);
        return res.json({ success: true, data });
      } catch (error) {
        console.error('Spend Dashboard: summary failed:', error);
        return res.status(500).json({ success: false, error: 'Failed to build spend summary' });
      }
    });

    // --- Dedicated dashboard page ---
    // NOTE: the client script below deliberately avoids template literals so the
    // outer Node template literal needs no escaping/interpolation.
    app.get('/spend-dashboard', (req, res) => {
      res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Spend Dashboard</title>
  <style>
    body { margin:0; font-family: 'Google Sans', Roboto, Arial, sans-serif; background:#f6f8fc; color:#202124; }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 20px 16px 40px; }
    .head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:18px; flex-wrap:wrap; }
    .title { font-size: 28px; font-weight: 700; }
    .sub { color:#5f6368; font-size:13px; margin-top:4px; }
    .btn { border:1px solid #dadce0; border-radius:18px; background:#fff; color:#1f1f1f; padding:8px 14px; cursor:pointer; font-size:13px; }
    .btn:hover { background:#f1f3f4; }
    .controls { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .range-select { border:1px solid #dadce0; border-radius:18px; background:#fff; color:#1f1f1f; padding:8px 12px; cursor:pointer; font-size:13px; }
    .cards { display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-bottom:20px; }
    .stat { background:#fff; border:1px solid #e5e9ef; border-radius:12px; padding:16px 18px; }
    .stat .label { color:#5f6368; font-size:12px; text-transform:uppercase; letter-spacing:.4px; }
    .stat .value { font-size:26px; font-weight:700; margin-top:6px; }
    .panel { background:#fff; border:1px solid #e5e9ef; border-radius:12px; padding:16px 18px; margin-bottom:20px; }
    .panel h2 { font-size:15px; margin:0 0 14px; color:#3c4043; }
    .bar-row { display:flex; align-items:center; gap:10px; margin-bottom:9px; font-size:13px; }
    .bar-label { width:150px; color:#3c4043; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .bar-track { flex:1; background:#eef1f4; border-radius:6px; overflow:hidden; height:18px; }
    .bar-fill { height:100%; background:#1a73e8; border-radius:6px; }
    .bar-value { width:110px; text-align:right; color:#202124; font-variant-numeric: tabular-nums; }
    .month-chart { display:flex; align-items:flex-end; gap:8px; height:180px; padding-top:8px; }
    .month-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; }
    .month-bar { width:70%; background:#34a853; border-radius:4px 4px 0 0; min-height:2px; }
    .month-cap { font-size:11px; color:#5f6368; margin-top:6px; }
    .month-amt { font-size:10px; color:#3c4043; margin-bottom:4px; }
    table { width:100%; border-collapse: collapse; }
    th, td { text-align:left; padding:10px 12px; border-bottom:1px solid #eef1f4; font-size:13px; }
    th { color:#5f6368; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.4px; background:#fbfcfe; }
    td.amt, th.amt { text-align:right; font-variant-numeric: tabular-nums; }
    .pill { display:inline-block; padding:2px 8px; border-radius:999px; background:#e8f0fe; color:#1a56c4; font-size:11px; font-weight:600; }
    .muted { color:#5f6368; font-size:12px; }
    .warn { background:#fef7e0; border:1px solid #fde293; color:#8a6d00; padding:10px 14px; border-radius:8px; margin-bottom:16px; font-size:13px; }
    .empty { padding:24px; color:#5f6368; text-align:center; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <div class="title">Spend Dashboard</div>
        <div class="sub" id="subline">Spending extracted from receipts &amp; order confirmations in your inbox.</div>
      </div>
      <div class="controls">
        <label for="rangeSelect" class="muted">Period:</label>
        <select id="rangeSelect" class="range-select" aria-label="Time period">
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="6m">Last 6 months</option>
          <option value="12m" selected>Last 12 months</option>
          <option value="ytd">Year to date</option>
          <option value="all">All time</option>
        </select>
        <button id="refreshBtn" class="btn">Rescan inbox</button>
      </div>
    </div>
    <div id="content" class="empty">Analyzing receipts in your inbox&hellip; this can take a moment on first run.</div>
  </div>

  <script>
    var content = document.getElementById('content');
    var refreshBtn = document.getElementById('refreshBtn');
    var subline = document.getElementById('subline');
    var rangeSelect = document.getElementById('rangeSelect');

    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (s) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s];
      });
    }

    function money(amount, currency) {
      var cur = currency || 'USD';
      try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(Number(amount) || 0);
      } catch (e) {
        return (Number(amount) || 0).toFixed(2) + ' ' + cur;
      }
    }

    function fmtDate(v) {
      var d = new Date(v || 0);
      if (isNaN(d.getTime())) return 'Unknown';
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function barRows(items, currency) {
      if (!items.length) return '<div class="muted">No data.</div>';
      var max = 0;
      items.forEach(function (it) { if (it.total > max) max = it.total; });
      if (max <= 0) max = 1;
      return items.map(function (it) {
        var pct = Math.max(2, Math.round((it.total / max) * 100));
        var label = it.category || it.merchant || '';
        return '<div class="bar-row">' +
          '<div class="bar-label" title="' + esc(label) + '">' + esc(label) + '</div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="bar-value">' + esc(money(it.total, currency)) + '</div>' +
          '</div>';
      }).join('');
    }

    function monthChart(months, currency) {
      var max = 0;
      months.forEach(function (m) { if (m.total > max) max = m.total; });
      if (max <= 0) max = 1;
      return '<div class="month-chart">' + months.map(function (m) {
        var h = Math.max(2, Math.round((m.total / max) * 150));
        var short = m.month.slice(2); // YY-MM
        var amt = m.total > 0 ? money(m.total, currency) : '';
        return '<div class="month-col" title="' + esc(m.month) + ': ' + esc(money(m.total, currency)) + '">' +
          '<div class="month-amt">' + esc(amt) + '</div>' +
          '<div class="month-bar" style="height:' + h + 'px"></div>' +
          '<div class="month-cap">' + esc(short) + '</div>' +
          '</div>';
      }).join('') + '</div>';
    }

    function render(data) {
      var agg = data.aggregates || {};
      var tx = data.transactions || [];
      var cur = agg.primaryCurrency || 'USD';
      var rangeLabel = data.rangeLabel || 'Selected period';

      if (!tx.length) {
        content.className = 'empty';
        if (!data.totalTransactionCount) {
          content.innerHTML = 'No receipts detected in your inbox yet.<br><span class="muted">Scanned ' +
            esc(data.candidateCount || 0) + ' receipt-like email(s).</span>';
        } else {
          content.innerHTML = 'No spending found for <strong>' + esc(rangeLabel) + '</strong>.<br>' +
            '<span class="muted">' + esc(data.totalTransactionCount) + ' transaction(s) exist in other periods \u2014 try a wider range.</span>';
        }
        return;
      }

      content.className = '';
      var html = '';

      if (agg.mixedCurrency) {
        html += '<div class="warn">Multiple currencies detected (' + esc((agg.currencies || []).join(', ')) +
          '). Totals below are summed and shown in ' + esc(cur) + '; convert manually for exact figures.</div>';
      }

      html += '<div class="cards">' +
        '<div class="stat"><div class="label">Total Spend</div><div class="value">' + esc(money(agg.totalSpend, cur)) + '</div></div>' +
        '<div class="stat"><div class="label">Transactions</div><div class="value">' + esc(agg.transactionCount || 0) + '</div></div>' +
        '<div class="stat"><div class="label">Merchants</div><div class="value">' + esc(agg.merchantCount || 0) + '</div></div>' +
        '<div class="stat"><div class="label">Categories</div><div class="value">' + esc((agg.byCategory || []).length) + '</div></div>' +
        '</div>';

      html += '<div class="panel"><h2>Spend by month (' + esc(rangeLabel) + ')</h2>' + monthChart(agg.byMonth || [], cur) + '</div>';

      html += '<div class="panel"><h2>Spend by category</h2>' + barRows(agg.byCategory || [], cur) + '</div>';

      html += '<div class="panel"><h2>Top merchants</h2>' + barRows(agg.topMerchants || [], cur) + '</div>';

      var rows = tx.map(function (t) {
        return '<tr>' +
          '<td>' + esc(fmtDate(t.date)) + '</td>' +
          '<td>' + esc(t.merchant) + '</td>' +
          '<td><span class="pill">' + esc(t.category) + '</span></td>' +
          '<td class="muted">' + esc(t.subject) + '</td>' +
          '<td class="amt">' + esc(money(t.amount, t.currency || cur)) + '</td>' +
          '</tr>';
      }).join('');

      html += '<div class="panel"><h2>Transactions (' + esc(tx.length) + ') \u2014 ' + esc(rangeLabel) + '</h2>' +
        '<table><thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Email</th><th class="amt">Amount</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';

      content.innerHTML = html;

      if (data.updatedAt) {
        subline.innerHTML = 'Showing <strong>' + esc(rangeLabel) + '</strong>. Last updated ' +
          esc(fmtDate(data.updatedAt)) + (data.cached ? ' (cached)' : '') + '.';
      }
    }

    function currentRange() {
      return rangeSelect ? rangeSelect.value : '12m';
    }

    function load(refresh) {
      content.className = 'empty';
      content.textContent = refresh
        ? 'Rescanning your inbox for receipts\u2026 this can take a moment.'
        : 'Analyzing receipts in your inbox\u2026 this can take a moment on first run.';
      refreshBtn.disabled = true;
      if (rangeSelect) rangeSelect.disabled = true;
      var params = 'range=' + encodeURIComponent(currentRange());
      if (refresh) params += '&refresh=1';
      var url = '/api/spend-dashboard/summary?' + params;
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.success) throw new Error((d && d.error) || 'Failed to load');
          render(d.data || {});
        })
        .catch(function () {
          content.className = 'empty';
          content.textContent = 'Failed to load spend data. Please try again.';
        })
        .finally(function () {
          refreshBtn.disabled = false;
          if (rangeSelect) rangeSelect.disabled = false;
        });
    }

    refreshBtn.addEventListener('click', function () { load(true); });
    if (rangeSelect) rangeSelect.addEventListener('change', function () { load(false); });
    load(false);
  </script>
</body>
</html>`);
    });

    console.log('Spend Dashboard: Backend initialized');
  }
};
