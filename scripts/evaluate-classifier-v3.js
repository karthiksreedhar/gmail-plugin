#!/usr/bin/env node
/**
 * Classifier V3 evaluation (batched, fewer API calls):
 *
 * Goal:
 * - Maintain the same fundamental approach as v2 (category "fits?" leading to a best-of choice,
 *   then sender/keyword fallbacks) while significantly reducing the number of OpenAI API calls.
 *
 * Strategy (aggregation):
 * - For a batch of NEW emails, and for ALL categories, send a SINGLE OpenAI request that:
 *    1) Reviews compact per-category examples + optional meta,
 *    2) For EACH new email in the batch, returns:
 *        - contenders: list of categories that plausibly fit (LLM "fits?"),
 *        - pick: if contenders length > 1, the best-of selection for that email.
 * - If an email has 0 contenders, perform local fallbacks (sender-based and keyword scoring) with NO extra API calls.
 *
 * Benefits:
 * - Instead of O(#emails * #categories) "fits?" calls + per-email best-of calls, we do ~O(#emails / batchSize)
 *   calls total (one per batch).
 *
 * Data/IO:
 * - Loads labeled emails for a user from data/{user}/response-emails.json
 * - Loads category names from data/{user}/categories.json (fallback: derive from labeled data)
 * - Optionally loads:
 *      - data/{user}/categorysummaries.json
 *      - data/{user}/category-guidelines.json
 * - Splits into train/test (seeded, deterministic)
 * - Computes metrics similar to other evaluators; writes report to ./accuracy with "v3" in filename
 *
 * Requirements:
 * - Node 18+ (for global fetch)
 * - OPENAI_API_KEY in environment
 *
 * CLI:
 *   --user <email>           user namespace (default env CURRENT_USER_EMAIL or ks4190@columbia.edu)
 *   --split <0.5..0.95>      train/test split (default 0.8)
 *   --seed <int>             RNG seed (default 42)
 *   --report <path>          report filename (auto placed under ./accuracy if relative)
 *   --maxPerCat <n>          max examples per category included in prompt (default 30)
 *   --batch <n>              number of test emails per OpenAI call (default 10)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const OpenAI = require('openai');

// -----------------------------
// CLI args and defaults
// -----------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--user'   && next) { out.user   = next; i++; continue; }
    if (a === '--split'  && next) { out.split  = Number(next); i++; continue; }
    if (a === '--seed'   && next) { out.seed   = Number(next); i++; continue; }
    if (a === '--report' && next) { out.report = next; i++; continue; }
    if (a === '--maxPerCat' && next) { out.maxPerCat = Number(next); i++; continue; }
    if (a === '--batch' && next) { out.batch = Number(next); i++; continue; }
  }
  return {
    user: out.user || process.env.CURRENT_USER_EMAIL || 'ks4190@columbia.edu',
    split: Number.isFinite(out.split) ? Math.min(0.95, Math.max(0.5, out.split)) : 0.8,
    seed: Number.isFinite(out.seed) ? out.seed : 42,
    report: (typeof out.report === 'string' ? out.report.trim() : '') || '',
    maxPerCat: Number.isFinite(out.maxPerCat) ? Math.max(1, Math.min(200, out.maxPerCat)) : 30,
    batch: Number.isFinite(out.batch) ? Math.max(1, Math.min(50, out.batch)) : 10,
  };
}
const opts = parseArgs();

// -----------------------------
// Utilities
// -----------------------------
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function readJson(p, fallback = null) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const s = fs.readFileSync(p, 'utf8');
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}
function writeText(p, text) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, text, 'utf8');
}
function shuffleSeeded(arr, seed) {
  // Mulberry32
  function mulberry32(a) {
    return function() {
      let t = (a += 0x6D2B79F5) | 0;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(Math.floor(seed) || 42);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function uniqCaseInsensitive(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr || []) {
    const k = String(v || '').toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(String(v));
    }
  }
  return out;
}
function mapToExistingCategory(raw, categories) {
  const input = String(raw || '').trim();
  if (!input) return '';

  const cats = Array.isArray(categories) ? categories : [];
  // exact case-insensitive
  const lower = input.toLowerCase();
  const exact = cats.find(c => String(c || '').toLowerCase() === lower);
  if (exact) return exact;

  // normalized-key equality
  const key = normalizeKey(input);
  const byKey = new Map(cats.map(c => [normalizeKey(c), c]));
  if (byKey.has(key)) return byKey.get(key);

  // fallback: first category
  return cats[0] || '';
}
function parseFromParts(fromStr) {
  const s = String(fromStr || '');
  const emailMatch = s.match(/<([^>]+)>/);
  const email = (emailMatch ? emailMatch[1] : (s.includes('@') ? s : '')).trim().toLowerCase();
  let name = s;
  if (emailMatch) {
    name = s.slice(0, emailMatch.index).trim();
  } else {
    name = s.replace(/[^<\s]*@[^>\s]*/g, '').trim();
  }
  name = name.replace(/^"+|"+$/g, '').trim();
  return {
    email,
    name,
    nameKey: normalizeKey(name),
    emailKey: email
  };
}
function countOccurrences(haystack, needle) {
  if (!haystack || !needle) return 0;
  const re = new RegExp(`\\b${escapeRegExp(normalizeKey(needle))}\\b`, 'g');
  const text = normalizeKey(haystack);
  const m = text.match(re);
  return m ? m.length : 0;
}
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function textOfEmail(e) {
  const subj = String(e.subject || '');
  const body = String(e.body || e.snippet || '');
  return `${subj}\n${body}`;
}

// -----------------------------
// Data loading
// -----------------------------
function getUserPaths(userEmail) {
  const base = path.join(process.cwd(), 'data', userEmail);
  return {
    userDir: base,
    responses: path.join(base, 'response-emails.json'),
    categories: path.join(base, 'categories.json'),
    categorySummaries: path.join(base, 'categorysummaries.json'),
    categoryGuidelines: path.join(base, 'category-guidelines.json')
  };
}
function loadLabeledResponses(userEmail) {
  const p = getUserPaths(userEmail);
  const data = readJson(p.responses, { emails: [] });
  const emails = Array.isArray(data.emails) ? data.emails : [];
  return emails.map(e => {
    const primary = (e && e.category) ? String(e.category) : '';
    const extras = Array.isArray(e?.categories) ? e.categories.map(String) : [];
    const all = uniqCaseInsensitive([...extras, primary].filter(Boolean));
    return {
      id: String(e.id || ''),
      subject: String(e.subject || 'No Subject'),
      from: String(e.originalFrom || e.from || 'Unknown Sender'),
      date: String(e.date || new Date().toISOString()),
      body: String(e.body || e.snippet || ''),
      actualCats: all
    };
  }).filter(x => x.id && x.subject && x.body);
}
function loadCategories(userEmail, fallbackFromResponses) {
  const p = getUserPaths(userEmail);
  const data = readJson(p.categories, { categories: [] });
  const arr = Array.isArray(data.categories) ? data.categories : [];
  const cats = uniqCaseInsensitive(arr);
  if (cats.length) return cats;

  // fallback: derive from labeled responses
  const set = new Set();
  for (const e of (fallbackFromResponses || [])) {
    for (const c of (e.actualCats || [])) set.add(String(c));
  }
  const derived = Array.from(set);
  if (derived.length) return derived;

  // last resort
  return [
    'Teaching & Student Support',
    'Research & Lab Work',
    'University Administration',
    'Financial & Reimbursements',
    'Conferences',
    'Networking',
    'Personal & Life Management'
  ];
}
function loadCategoryMeta(userEmail) {
  const p = getUserPaths(userEmail);
  const summaries = readJson(p.categorySummaries, {}) || {};
  const guidelines = readJson(p.categoryGuidelines, {}) || {};
  return { summaries, guidelines };
}
function buildCategoryIndex(train, categories) {
  const map = new Map();
  for (const c of categories) map.set(c, []);
  for (const e of train) {
    for (const c of (e.actualCats || [])) {
      if (map.has(c)) map.get(c).push(e);
    }
  }
  return map;
}

// -----------------------------
// Report helpers
// -----------------------------
function writeReport(reportPath, summary, rows) {
  const lines = [];
  lines.push(`User: ${summary.user}`);
  lines.push(`Train size: ${summary.train} | Test size: ${summary.test}`);
  lines.push(`Accuracy (strict multi-label containment): ${(summary.accuracy * 100).toFixed(2)}% (${summary.correct}/${summary.test})`);
  lines.push(`Correctly assigned tags: ${summary.correctTags}/${summary.totalActualTags}`);
  lines.push(`Extra Tags Suggested: ${summary.incorrectTags}`);
  lines.push(`Emails completely correct (exact match): ${summary.completeCorrectEmails}`);
  lines.push(`Emails mostly correct (<=1 total tag error): ${summary.mostlyCorrectEmails}`);
  lines.push(`Emails almost correct (<=2 total tag error): ${summary.almostCorrectEmails}`);
  lines.push(`Emails somewhat correct (<=3 total tag error): ${summary.somewhatCorrectEmails}`);
  lines.push(`Emails Assigned Correctly Other than Extra Tags: ${summary.emailsCorrectExceptExtras}`);
  lines.push('');
  lines.push('Details per test email:');
  lines.push('-----------------------');
  for (const r of rows) {
    lines.push(`ID: ${r.id}`);
    lines.push(`Subject: ${r.subject}`);
    lines.push(`Actual: ${r.actual.join(', ') || '(none)'}`);
    lines.push(`Suggested: ${r.suggested.join(', ') || '(none)'}`);
    const missing = r.actual.filter(a => !r.suggestedNorm.has(normalizeKey(a)));
    const extra = r.suggested.filter(s => !r.actualNorm.has(normalizeKey(s)));
    lines.push(`Missing (actual not suggested): ${missing.join(', ') || '(none)'}`);
    lines.push(`Extra (suggested not in actual): ${extra.join(', ') || '(none)'}`);
    if (r.reasons && Object.keys(r.reasons).length) {
      lines.push('Reasons:');
      Object.entries(r.reasons).forEach(([cat, why]) => {
        if (Array.isArray(why)) {
          lines.push(`  - ${cat}: ${why.join(' | ')}`);
        } else {
          lines.push(`  - ${cat}: ${String(why || '(no reason provided)')}`);
        }
      });
    }
    lines.push('');
  }
  writeText(reportPath, lines.join('\n'));
}

// -----------------------------
// OpenAI (batched) setup
// -----------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Single API call that:
 *  - sees ALL categories with limited examples + meta,
 *  - sees a BATCH of new emails,
 *  - returns, for each email, contenders[] and pick (best-of).
 */
async function openaiBatchLabel(newEmails, categories, perCatExamples, metaMap, maxPerCat) {
  const catBundles = [];
  for (const c of categories) {
    const ex = (perCatExamples.get(c) || []).slice(0, maxPerCat).map((e, i) => ({
      i: i + 1,
      subject: String(e.subject || '').slice(0, 180),
      body: String(e.body || e.snippet || '').slice(0, 550)
    }));
    catBundles.push({
      category: c,
      meta: {
        summary: metaMap?.summaries?.[c] || '',
        guideline: metaMap?.guidelines?.[c] || ''
      },
      examples: ex
    });
  }
  const allowedJson = JSON.stringify(categories, null, 2);
  const bundlesJson = JSON.stringify(catBundles, null, 2);

  const newItems = newEmails.map(e => ({
    id: e.id,
    from: e.from,
    subject: String(e.subject || '').slice(0, 200),
    body: String(e.body || '').slice(0, 1400)
  }));
  const newItemsJson = JSON.stringify(newItems, null, 2);

  const SYSTEM = `You are an email categorization assistant.
Given ALLOWED CATEGORIES with brief examples and meta, and a LIST of NEW EMAILS,
for EACH new email decide:
  - contenders: the set of category names from ALLOWED CATEGORIES that plausibly fit,
  - pick: if contenders has more than one entry, choose the single best category.
Rules:
- Only use names from ALLOWED CATEGORIES. Do not invent categories or synonyms.
- If no category fits, return an empty contenders array and an empty pick.
- Keep output compact JSON.`;

  const USER = `ALLOWED CATEGORIES (JSON):
${allowedJson}

CATEGORY BUNDLES (JSON):
${bundlesJson}

NEW EMAILS (JSON):
${newItemsJson}

Return ONLY strictly valid JSON of the form:
{
  "results": {
    "<emailId>": {
      "contenders": ["Category A", "Category B", ...],
      "pick": "Category A",
      "rationales": { "Category A": "why...", "Category B": "why..." }
    },
    ...
  }
}`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'o3',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: USER }
      ],
      max_completion_tokens: 2000,
      response_format: { type: 'json_object' }
    });
    const raw = resp.choices?.[0]?.message?.content || '';
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    const results = parsed && parsed.results && typeof parsed.results === 'object' ? parsed.results : {};
    return results;
  } catch (e) {
    // On failure, return empty map; caller will use fallbacks
    return {};
  }
}

// -----------------------------
// Fallback helpers (no API)
// -----------------------------
function pickSenderCandidates(newEmail, currentUser) {
  const senders = [];
  const p = parseFromParts(newEmail.from);
  if (p.emailKey && p.emailKey !== String(currentUser || '').toLowerCase()) {
    senders.push(p.emailKey);
  }
  return uniqCaseInsensitive(senders);
}

function fallbackSuggest(email, ctx) {
  const { categories, categoryToTrainRows, currentUserEmail } = ctx;

  // Sender-based majority category
  const senderList = pickSenderCandidates(email, currentUserEmail);
  if (senderList.length) {
    const counts = new Map(); // cat -> count
    for (const c of categories) counts.set(c, 0);

    for (const s of senderList) {
      const sLC = String(s || '').toLowerCase();
      for (const c of categories) {
        const rows = categoryToTrainRows.get(c) || [];
        let cnt = counts.get(c) || 0;
        for (const r of rows) {
          const fromLC = String(r.from || '').toLowerCase();
          const bodyTrainLC = String(r.body || '').toLowerCase();
          if (fromLC.includes(sLC) || bodyTrainLC.includes(sLC)) {
            cnt++;
          }
        }
        counts.set(c, cnt);
      }
    }
    let bestCat = '';
    let bestCnt = 0;
    for (const [c, cnt] of counts.entries()) {
      if (cnt > bestCnt) { bestCnt = cnt; bestCat = c; }
    }
    if (bestCat && bestCnt > 0) {
      return { suggestion: bestCat, reasons: { [bestCat]: `Sender-based fallback: highest co-occurrence (count=${bestCnt})` } };
    }
  }

  // Keyword fallback: subject >=1 OR body >=3; score = 3*subject + body
  let bestKW = '';
  let bestScore = -1;
  for (const c of categories) {
    const subjCount = countOccurrences(email.subject || '', c);
    const bodyCount = countOccurrences(email.body || '', c);
    const isCandidate = (subjCount >= 1) || (bodyCount >= 3);
    if (!isCandidate) continue;
    const score = subjCount * 3 + bodyCount;
    if (score > bestScore) {
      bestScore = score;
      bestKW = c;
    }
  }
  if (bestKW) {
    return {
      suggestion: bestKW,
      reasons: { [bestKW]: `Keyword fallback: subject x${countOccurrences(email.subject || '', bestKW)}, body x${countOccurrences(email.body || '', bestKW)}` }
    };
  }

  const other = categories.find(c => normalizeKey(c) === 'other') || categories[0] || '';
  return { suggestion: other || '', reasons: other ? { [other]: 'Last-resort default' } : {} };
}

// -----------------------------
// Main
// -----------------------------
(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required for classifier-v3.');
    process.exit(1);
  }

  console.log('\n=== Evaluate Classifier V3 (batched: contenders + best-of per call; sender/keyword fallbacks) ===');
  console.log(`User: ${opts.user}`);
  console.log(`Split: ${(opts.split * 100).toFixed(0)}% train / ${(100 - opts.split * 100).toFixed(0)}% test | Seed: ${opts.seed}`);
  console.log(`Per-category example cap: ${opts.maxPerCat} | Batch size: ${opts.batch}`);

  const all = loadLabeledResponses(opts.user);
  if (!all.length) {
    console.error(`No labeled response emails found for user ${opts.user}. Expected at data/${opts.user}/response-emails.json`);
    process.exit(1);
  }
  const categories = loadCategories(opts.user, all);
  console.log(`Loaded ${all.length} labeled emails; using ${categories.length} categories.`);

  const shuffled = shuffleSeeded(all, opts.seed);
  const trainSize = Math.max(1, Math.floor(shuffled.length * opts.split));
  const train = shuffled.slice(0, trainSize);
  const test = shuffled.slice(trainSize);

  if (!test.length) {
    console.error('Test set is empty after split; reduce --split or add more labeled data.');
    process.exit(1);
  }
  console.log(`Train size: ${train.length} | Test size: ${test.length}`);

  // Resolve report path to ./accuracy and ensure "v3" in filename
  const accuracyDir = path.join(process.cwd(), 'accuracy');
  ensureDir(accuracyDir);
  let reportPath = opts.report;
  if (reportPath) {
    const base = path.isAbsolute(reportPath) ? reportPath : path.join(accuracyDir, path.basename(reportPath));
    const hasV3 = /v3/i.test(base);
    reportPath = hasV3 ? base : base.replace(/(\.txt)?$/i, '_v3.txt');
  } else {
    reportPath = path.join(accuracyDir, `evaluation_report_v3_${Date.now()}.txt`);
  }
  console.log(`Report: ${reportPath}`);
  console.log('');

  // Build per-category train index and meta
  const categoryToTrainRows = buildCategoryIndex(train, categories);
  const categoryMeta = loadCategoryMeta(opts.user);

  const ctx = {
    categories,
    categoryToTrainRows,
    categoryMeta,
    currentUserEmail: (process.env.SENDING_EMAIL || opts.user || '').toLowerCase(),
  };

  // Metrics accumulators
  let correctEmailsStrict = 0;
  const rows = [];

  let totalActualTags = 0;
  let correctlyAssignedTags = 0;
  let incorrectlyAssignedTags = 0;
  let completeCorrectEmails = 0;
  let mostlyCorrectEmails = 0;
  let almostCorrectEmails = 0;
  let somewhatCorrectEmails = 0;
  let emailsCorrectExceptExtras = 0;

  // Process test set in batches, each batch -> one OpenAI call
  for (let i = 0; i < test.length; i += opts.batch) {
    const batch = test.slice(i, i + opts.batch);
    const results = await openaiBatchLabel(
      batch,
      categories,
      categoryToTrainRows,
      categoryMeta,
      opts.maxPerCat
    );

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const subj = (row.subject || 'No Subject').slice(0, 120);

      const r = results?.[row.id] || {};
      const contenders = Array.isArray(r.contenders) ? uniqCaseInsensitive(r.contenders) : [];
      const rationales = (r.rationales && typeof r.rationales === 'object') ? r.rationales : {};
      const pickRaw = typeof r.pick === 'string' ? r.pick : '';

      // Decision logic
      let suggestion = '';
      let reasonsMap = {};
      if (contenders.length === 1) {
        suggestion = mapToExistingCategory(contenders[0], categories);
        reasonsMap = { [suggestion]: rationales?.[suggestion] || `Single contender from LLM batch` };
      } else if (contenders.length > 1) {
        const mappedPick = mapToExistingCategory(pickRaw, contenders);
        if (mappedPick) {
          suggestion = mappedPick;
          reasonsMap = { [suggestion]: rationales?.[suggestion] || `LLM best-of from contenders` };
        } else {
          // If model didn't provide a valid pick, just choose first contender deterministically
          suggestion = mapToExistingCategory(contenders[0], categories);
          reasonsMap = { [suggestion]: rationales?.[suggestion] || `LLM contenders; defaulted to first` };
        }
      } else {
        // No contenders -> fallbacks
        const fb = fallbackSuggest({ from: row.from, subject: row.subject, body: row.body }, ctx);
        suggestion = fb.suggestion || '';
        reasonsMap = fb.reasons || {};
      }

      const actual = row.actualCats.slice();
      const suggested = suggestion ? [suggestion] : [];
      const actualNorm = new Set(actual.map(normalizeKey));
      const suggestedNorm = new Set(suggested.map(normalizeKey));

      const missingCount = actual.filter(a => !suggestedNorm.has(normalizeKey(a))).length;
      const extraCount = suggested.filter(s => !actualNorm.has(normalizeKey(s))).length;

      const ok = (missingCount === 0 && extraCount === 0);
      console.log(`[${i + j + 1}/${test.length}] ${subj} | actual=[${actual.join(', ')}] | suggested=[${suggested.join(', ')}] | missing=${missingCount} extra=${extraCount}${ok ? ' | OK' : ''}`);

      // Metrics
      totalActualTags += actualNorm.size;
      for (const a of actualNorm) {
        if (suggestedNorm.has(a)) correctlyAssignedTags++;
      }
      incorrectlyAssignedTags += extraCount;

      if (ok) {
        completeCorrectEmails++;
        correctEmailsStrict++;
      } else if (missingCount === 0 && extraCount > 0) {
        emailsCorrectExceptExtras++;
      }
      const totalErr = (missingCount + extraCount);
      if (totalErr <= 1) mostlyCorrectEmails++;
      if (totalErr <= 2) almostCorrectEmails++;
      if (totalErr <= 3) somewhatCorrectEmails++;

      rows.push({
        id: row.id,
        subject: row.subject,
        actual,
        suggested,
        actualNorm,
        suggestedNorm,
        reasons: reasonsMap
      });
    }
  }

  const acc = correctEmailsStrict / test.length;
  console.log('');
  console.log(`Accuracy (strict multi-label containment): ${(acc * 100).toFixed(2)}% (${correctEmailsStrict}/${test.length})`);
  console.log(`Tags: correct ${correctlyAssignedTags}/${totalActualTags}, incorrect (extras) ${incorrectlyAssignedTags}`);
  console.log(`Emails: complete ${completeCorrectEmails}, mostly ${mostlyCorrectEmails}, almost ${almostCorrectEmails}, somewhat ${somewhatCorrectEmails}, correct-except-extras ${emailsCorrectExceptExtras}`);

  // Write report
  writeReport(reportPath, {
    user: opts.user,
    train: train.length,
    test: test.length,
    accuracy: acc,
    correct: correctEmailsStrict,
    correctTags: correctlyAssignedTags,
    totalActualTags,
    incorrectTags: incorrectlyAssignedTags,
    completeCorrectEmails,
    mostlyCorrectEmails,
    almostCorrectEmails,
    somewhatCorrectEmails,
    emailsCorrectExceptExtras
  }, rows);

  console.log(`\nWrote classifier v3 report to: ${reportPath}\n`);

  // Guidance: Options to further reduce API calls while keeping approach
  const options = [
    '- Per-batch gating: Before the batch LLM call, pre-filter per-email category list using cheap heuristics (sender match, keyword hits) to top-K (e.g., 8–12). This shrinks prompt size and enables larger batches with one call.',
    '- Category prototypes once: Precompute an LLM-generated summary/prototype per category one time (or per run) and send only the prototypes in batch calls instead of many raw examples.',
    '- Embedding prefilter: Use local embeddings (OpenAI or open-source) to select top-K categories per email; then one batch LLM call evaluates only those categories and picks best.',
    '- Larger batches with stricter truncation: Increase --batch (e.g., 20–30) while lowering --maxPerCat and truncation lengths to stay in token budget; still one call per batch.',
    '- Hybrid tiering: First batch call returns contenders for many emails; for those with multiple contenders and low confidence, optionally do a second, smaller batch call just for disambiguation emails.'
  ];
  console.log('Performance options to reduce API calls:\n' + options.map(o => `  * ${o}`).join('\n'));
})().catch(e => {
  console.error('Fatal error:', e?.message || e);
  process.exit(1);
});
