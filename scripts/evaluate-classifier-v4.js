#!/usr/bin/env node
/**
 * Classifier V4 evaluation (batched, sender-augmented contenders):
 *
 * Goal:
 * - Maintain the v3 batching approach (single OpenAI call per batch that returns contenders + pick)
 * - BEFORE choosing the final suggestion, augment the contender set with a sender-majority category
 *   computed from previously labeled training data (if any sender match exists)
 * - If, after augmentation, there are still no contenders, use a keyword-only fallback
 *   (subject >=1 OR body >=3 matches) to choose a category
 * - If there is STILL no suggestion, choose "Other"
 *
 * Benefits:
 * - Retains v3's low-API-call batch evaluation
 * - Adds a simple signal from previously labeled data to boost precision when the model isn't decisive
 *
 * Data/IO:
 * - Loads labeled emails for a user from data/{user}/response-emails.json
 * - Loads category names from data/{user}/categories.json (fallback: derive from labeled data)
 * - Optionally loads:
 *      - data/{user}/categorysummaries.json
 *      - data/{user}/category-guidelines.json
 * - Splits into train/test (seeded, deterministic)
 * - Computes metrics similar to other evaluators; writes report to ./accuracy with "v4" in filename
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

  // fallback: no mapping (let caller decide, typically "Other" or keyword fallback)
  return '';
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
Strict rules:
- Only use names from ALLOWED CATEGORIES. Do not invent categories or synonyms.
- Do not bias toward the order of categories provided; evaluate each independently.
- Prefer high precision. Limit contenders to at most 2 per email.
- If no category clearly fits, return an empty contenders array and an empty pick (do not guess).
- Do not output "Other" unless it appears in ALLOWED CATEGORIES.
- Keep output compact JSON only (no prose).
- If rationales are returned, ensure they are one short sentence per contender.`;

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
// V4 helpers (no extra API)
// -----------------------------

// Best sender-majority category from training rows for this email's sender.
// Returns { cat: string, count: number } or { cat: '', count: 0 } if none.
function bestSenderCategory(newEmail, categories, perCatRows, currentUserEmail) {
  try {
    const p = parseFromParts(newEmail.from);
    const senderKey = (p && p.emailKey) ? String(p.emailKey).toLowerCase() : '';
    if (!senderKey || senderKey === String(currentUserEmail || '').toLowerCase()) {
      return { cat: '', count: 0 };
    }
    const counts = new Map();
    categories.forEach(c => counts.set(c, 0));

    for (const c of categories) {
      const rows = perCatRows.get(c) || [];
      let cnt = counts.get(c) || 0;
      for (const r of rows) {
        const fromLC = String(r.from || '').toLowerCase();
        const bodyLC = String(r.body || '').toLowerCase();
        if (fromLC.includes(senderKey) || bodyLC.includes(senderKey)) {
          cnt++;
        }
      }
      counts.set(c, cnt);
    }
    let bestCat = '';
    let bestCnt = 0;
    for (const [c, cnt] of counts.entries()) {
      if (cnt > bestCnt) { bestCnt = cnt; bestCat = c; }
    }
    return { cat: bestCat || '', count: bestCnt || 0 };
  } catch {
    return { cat: '', count: 0 };
  }
}

// Keyword-only fallback: subject >=1 OR body >=3; score = 3*subject + body
function keywordFallback(email, categories) {
  try {
    let best = '';
    let bestScore = -1;
    for (const c of categories) {
      const subjCount = countOccurrences(email.subject || '', c);
      const bodyCount = countOccurrences(email.body || '', c);
      const isCandidate = (subjCount >= 1) || (bodyCount >= 3);
      if (!isCandidate) continue;
      const score = subjCount * 3 + bodyCount;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best || '';
  } catch {
    return '';
  }
}

// -----------------------------
// Main
// -----------------------------
(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required for classifier-v4.');
    process.exit(1);
  }

  console.log('\n=== Evaluate Classifier V4 (batched: LLM contenders + sender-augmented union; keyword last; Other default) ===');
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

  // Resolve report path to ./accuracy and ensure "v4" in filename
  const accuracyDir = path.join(process.cwd(), 'accuracy');
  ensureDir(accuracyDir);
  let reportPath = opts.report;
  if (reportPath) {
    const base = path.isAbsolute(reportPath) ? reportPath : path.join(accuracyDir, path.basename(reportPath));
    const hasV4 = /v4/i.test(base);
    reportPath = hasV4 ? base : base.replace(/(\.txt)?$/i, '_v4.txt');
  } else {
    reportPath = path.join(accuracyDir, `evaluation_report_v4_${Date.now()}.txt`);
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
      const llmContenders = Array.isArray(r.contenders) ? uniqCaseInsensitive(r.contenders) : [];
      const rationales = (r.rationales && typeof r.rationales === 'object') ? r.rationales : {};
      const pickRaw = typeof r.pick === 'string' ? r.pick : '';

      // Sender-based augmentation: compute best sender category from training rows
      const senderBest = bestSenderCategory({ from: row.from, subject: row.subject, body: row.body }, categories, ctx.categoryToTrainRows, ctx.currentUserEmail);
      // Union contenders with senderBest.cat (if any)
      let contenders = llmContenders.slice();
      if (senderBest.cat) {
        contenders = uniqCaseInsensitive([...contenders, senderBest.cat]);
      }

      // Decision logic (V4):
      // 1) If contenders exist:
      //    a) If LLM pick maps into contenders -> choose it
      //    b) Else if senderBest.cat is in contenders -> choose senderBest
      //    c) Else choose first contender deterministically
      // 2) Else (no contenders):
      //    a) keyword-only fallback (subject>=1 OR body>=3); if found choose it
      //    b) Else choose "Other"
      let suggestion = '';
      let reasonsMap = {};

      if (contenders.length > 0) {
        if (contenders.length === 1) {
          suggestion = mapToExistingCategory(contenders[0], categories);
          reasonsMap = { [suggestion]: rationales?.[suggestion] || `Single contender (sender-augmented)` };
        } else {
          const mappedPick = mapToExistingCategory(pickRaw, contenders);
          if (mappedPick) {
            suggestion = mappedPick;
            reasonsMap = { [suggestion]: rationales?.[suggestion] || `LLM best-of from contenders (sender-augmented)` };
          } else if (senderBest.cat && contenders.map(c => normalizeKey(c)).includes(normalizeKey(senderBest.cat))) {
            suggestion = mapToExistingCategory(senderBest.cat, categories);
            reasonsMap = { [suggestion]: `Sender augmentation: highest co-occurrence in training (count=${senderBest.count || 0})` };
          } else {
            suggestion = mapToExistingCategory(contenders[0], categories);
            reasonsMap = { [suggestion]: rationales?.[suggestion] || `Augmented contenders; defaulted to first` };
          }
        }
      } else {
        // No contenders at all -> keyword-only fallback
        const kw = keywordFallback({ subject: row.subject, body: row.body }, categories);
        if (kw) {
          suggestion = mapToExistingCategory(kw, categories) || kw;
          reasonsMap = { [suggestion]: `Keyword fallback: subject x${countOccurrences(row.subject || '', suggestion)}, body x${countOccurrences(row.body || '', suggestion)}` };
        } else {
          // Last resort Other
          suggestion = categories.find(c => normalizeKey(c) === 'other') || categories[0] || '';
          if (suggestion) reasonsMap = { [suggestion]: `Last-resort default` };
        }
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

  console.log(`\nWrote classifier v4 report to: ${reportPath}\n`);
})().catch(e => {
  console.error('Fatal error:', e?.message || e);
  process.exit(1);
});
