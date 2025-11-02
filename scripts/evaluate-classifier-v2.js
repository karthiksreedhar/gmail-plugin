#!/usr/bin/env node
/**
 * Classifier V2 evaluation:
 *
 * Algorithm (per spec):
 * 1) For each existing category name:
 *      - Dump all labeled data for that category (train set) AND the new thread info,
 *      - Ask OpenAI: "Does this email fit in this category?"
 *      - If yes, add category to CONTENDERS.
 * 2) If CONTENDERS has length 1: return that as the suggestion.
 * 3) If CONTENDERS has length > 1:
 *      - Dump all labeled data for the categories in CONTENDERS and the new thread,
 *      - Ask OpenAI: "Which category is best?"
 * 4) If CONTENDERS has length 0:
 *      a) Iterate all senders involved in the new thread (excluding current user):
 *         - If any sender appears in previously labeled data, return the category that has
 *           the most emails from one of the senders in the body (or exact from match).
 *      b) If no sender appears, use keyword search approach:
 *           - A category is a candidate if its name occurs in subject (>=1) or body (>=3)
 *           - Choose the highest scoring category (score = subjectCount*3 + bodyCount)
 *
 * Data/IO:
 * - Loads labeled emails for a user from data/{user}/response-emails.json
 * - Loads category names from data/{user}/categories.json (fallback: derive from labeled data)
 * - Optionally loads category summaries/guidelines if available to reduce token usage:
 *      - data/{user}/categorysummaries.json
 *      - data/{user}/category-guidelines.json
 * - Splits into train/test (seeded, deterministic)
 * - Uses OpenAI for steps (1) "fits?" checks and (3) "best of CONTENDERS"
 * - Computes metrics similar to other evaluators; writes report to ./accuracy with "v2" in filename
 *
 * Requirements:
 * - Node 18+ (for global fetch)
 * - OPENAI_API_KEY in environment
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
  }
  return {
    user: out.user || process.env.CURRENT_USER_EMAIL || 'ks4190@columbia.edu',
    split: Number.isFinite(out.split) ? Math.min(0.95, Math.max(0.5, out.split)) : 0.8,
    seed: Number.isFinite(out.seed) ? out.seed : 42,
    report: (typeof out.report === 'string' ? out.report.trim() : '') || '',
    maxPerCat: Number.isFinite(out.maxPerCat) ? Math.max(1, Math.min(200, out.maxPerCat)) : 50 // safety cap for token cost
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
function textOfEmail(e) {
  const subj = String(e.subject || '');
  const body = String(e.body || e.snippet || '');
  return `${subj}\n${body}`;
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
// OpenAI setup
// -----------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function openaiFitsCategory(newEmail, categoryName, examples, meta) {
  // examples: array of {subject, bodySnippet}
  const ex = examples.map((e, i) => ({
    i: i + 1,
    subject: String(e.subject || '').slice(0, 200),
    body: String(e.body || e.snippet || '').slice(0, 600)
  }));
  const examplesJson = JSON.stringify(ex, null, 2);

  const metaParts = [];
  if (meta?.summary) metaParts.push(`Summary: ${String(meta.summary).slice(0, 600)}`);
  if (meta?.guideline) metaParts.push(`Guideline: ${String(meta.guideline).slice(0, 600)}`);
  const metaText = metaParts.length ? metaParts.join('\n') : '(no meta)';

  const SYSTEM = `You are an email categorization assistant.
Given a CATEGORY NAME and its LABELED EXAMPLES, and a NEW EMAIL, decide if the NEW EMAIL belongs to the category.
Return strictly valid JSON: {"fits": true|false, "confidence": number (0..1), "rationale": string}.
Be strict: only return true if there is a clear fit from content and intent.`;

  const USER = `CATEGORY NAME: ${categoryName}

CATEGORY META (optional):
${metaText}

LABELED EXAMPLES for this CATEGORY (JSON):
${examplesJson}

NEW EMAIL:
From: ${newEmail.from}
Subject: ${newEmail.subject}
Body:
${String(newEmail.body || '').slice(0, 1600)}

Return ONLY JSON like: {"fits": true|false, "confidence": 0.0-1.0, "rationale": "..."}.`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'o3',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: USER }
      ],
      max_completion_tokens: 160,
      response_format: { type: 'json_object' }
    });
    const raw = resp.choices?.[0]?.message?.content || '';
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    const fits = !!(parsed && typeof parsed.fits !== 'undefined' ? parsed.fits : false);
    const confidence = Number.isFinite(parsed?.confidence) ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    const rationale = String(parsed?.rationale || '');
    return { fits, confidence, rationaleRaw: rationale };
  } catch (e) {
    return { fits: false, confidence: 0, rationaleRaw: '' };
  }
}

async function openaiBestOfContenders(newEmail, contenders, perCatExamples, metaMap) {
  // contenders: array of category names
  // perCatExamples: Map(cat -> array of {subject, bodySnippet})
  const payload = [];
  for (const c of contenders) {
    const ex = (perCatExamples.get(c) || []).slice(0, 50).map((e, i) => ({
      i: i + 1,
      subject: String(e.subject || '').slice(0, 200),
      body: String(e.body || e.snippet || '').slice(0, 600)
    }));
    payload.push({
      category: c,
      meta: {
        summary: metaMap?.summaries?.[c] || '',
        guideline: metaMap?.guidelines?.[c] || ''
      },
      examples: ex
    });
  }
  const allowedJson = JSON.stringify(contenders, null, 2);
  const examplesJson = JSON.stringify(payload, null, 2);

  const SYSTEM = `You are an email categorization assistant.
Choose the single best category from ALLOWED CATEGORIES for the NEW EMAIL based on EXAMPLES per category.
Return strictly valid JSON: {"category": "<one of allowed>", "rationale": string}.`;

  const USER = `ALLOWED CATEGORIES (JSON):
${allowedJson}

CANDIDATE CATEGORY BUNDLES (JSON):
${examplesJson}

NEW EMAIL:
From: ${newEmail.from}
Subject: ${newEmail.subject}
Body:
${String(newEmail.body || '').slice(0, 1800)}

Return ONLY JSON like: {"category":"<name>","rationale":"..."} where category is one of the allowed.`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'o3',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: USER }
      ],
      max_completion_tokens: 200,
      response_format: { type: 'json_object' }
    });
    const raw = resp.choices?.[0]?.message?.content || '';
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    const pickedRaw = parsed && typeof parsed.category === 'string' ? parsed.category : '';
    const rationale = String(parsed?.rationale || '');
    return { pickedRaw, rationale };
  } catch (e) {
    return { pickedRaw: '', rationale: '' };
  }
}

// -----------------------------
// Classifier V2
// -----------------------------
function pickSenderCandidates(newEmail, currentUser) {
  const senders = [];
  const p = parseFromParts(newEmail.from);
  if (p.emailKey && p.emailKey !== String(currentUser || '').toLowerCase()) {
    senders.push(p.emailKey);
  }
  // Potential extension: parse quoted senders from body. For now, we only use the "from".
  return uniqCaseInsensitive(senders);
}

async function classifyV2(email, ctx) {
  const {
    categories,
    categoryToTrainRows,
    categoryMeta,
    currentUserEmail,
    maxPerCat
  } = ctx;

  // Step 1: Loop each category, ask "fits?"
  const contenders = [];
  const perCatReasons = {};

  if (openai.apiKey) {
    for (const c of categories) {
      const rows = (categoryToTrainRows.get(c) || []);
      // "Dump all labeled data" with safety caps on per-email length and count to stay within token limits.
      const examples = rows.slice(0, maxPerCat).map(r => ({
        subject: r.subject,
        body: r.body
      }));

      const meta = {
        summary: categoryMeta?.summaries?.[c] || '',
        guideline: categoryMeta?.guidelines?.[c] || ''
      };
      const { fits, confidence, rationaleRaw } = await openaiFitsCategory(
        { from: email.from, subject: email.subject, body: email.body },
        c,
        examples,
        meta
      );
      if (fits) {
        contenders.push(c);
        perCatReasons[c] = rationaleRaw ? `LLM fits? -> true (conf=${confidence.toFixed(2)}): ${rationaleRaw}` : `LLM fits? -> true (conf=${confidence.toFixed(2)})`;
      }
    }
  }

  // Step 2: If single contender, return it
  if (contenders.length === 1) {
    return {
      suggestion: contenders[0],
      reasons: { [contenders[0]]: perCatReasons[contenders[0]] || 'Single contender from fits-check' }
    };
  }

  // Step 3: If multiple contenders, ask OpenAI to pick best among them
  if (contenders.length > 1 && openai.apiKey) {
    const { pickedRaw, rationale } = await openaiBestOfContenders(
      { from: email.from, subject: email.subject, body: email.body },
      contenders,
      categoryToTrainRows,
      categoryMeta
    );
    const picked = mapToExistingCategory(pickedRaw, contenders);
    if (picked) {
      return {
        suggestion: picked,
        reasons: { [picked]: rationale ? `LLM best-of: ${rationale}` : 'LLM best-of' }
      };
    }
  }

  // Step 4: Contenders == 0 -> sender-based then keyword fallback
  // 4a) Sender-based majority category
  const senderList = pickSenderCandidates(email, currentUserEmail);
  if (senderList.length) {
    const counts = new Map(); // cat -> count
    const bodyLC = String(email.body || '').toLowerCase();
    for (const c of categories) counts.set(c, 0);

    for (const s of senderList) {
      const sLC = String(s || '').toLowerCase();
      for (const c of categories) {
        const rows = categoryToTrainRows.get(c) || [];
        let cnt = counts.get(c) || 0;
        for (const r of rows) {
          const fromLC = String(r.from || '').toLowerCase();
          const bodyTrainLC = String(r.body || '').toLowerCase();
          // Count if the sender string appears in the train body OR exact from match
          if (fromLC.includes(sLC) || bodyTrainLC.includes(sLC)) {
            cnt++;
          }
        }
        counts.set(c, cnt);
      }
    }
    // Pick max
    let bestCat = '';
    let bestCnt = 0;
    for (const [c, cnt] of counts.entries()) {
      if (cnt > bestCnt) { bestCnt = cnt; bestCat = c; }
    }
    if (bestCat && bestCnt > 0) {
      return {
        suggestion: bestCat,
        reasons: { [bestCat]: `Sender-based fallback: highest co-occurrence with sender(s) in train (count=${bestCnt})` }
      };
    }
  }

  // 4b) Keyword fallback: subject >=1 OR body >=3; pick highest scoring
  let bestKW = '';
  let bestScore = -1;
  for (const c of categories) {
    const subjCount = countOccurrences(email.subject || '', c);
    const bodyCount = countOccurrences(email.body || '', c);
    const isCandidate = (subjCount >= 1) || (bodyCount >= 3);
    if (!isCandidate) continue;
    const score = subjCount * 3 + bodyCount; // subject weighted 3x
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

  // Last resort: default to "Other" if it exists, else first category
  const other = categories.find(c => normalizeKey(c) === 'other') || categories[0] || '';
  return { suggestion: other || '', reasons: other ? { [other]: 'Last-resort default' } : {} };
}

// -----------------------------
// Main
// -----------------------------
(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required for classifier-v2.');
    process.exit(1);
  }

  console.log('\n=== Evaluate Classifier V2 (category fits + best-of, then sender/keyword fallbacks) ===');
  console.log(`User: ${opts.user}`);
  console.log(`Split: ${(opts.split * 100).toFixed(0)}% train / ${(100 - opts.split * 100).toFixed(0)}% test | Seed: ${opts.seed}`);
  console.log(`Per-category example cap: ${opts.maxPerCat}`);

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

  // Resolve report path to ./accuracy and ensure "v2" in filename
  const accuracyDir = path.join(process.cwd(), 'accuracy');
  ensureDir(accuracyDir);
  let reportPath = opts.report;
  if (reportPath) {
    const base = path.isAbsolute(reportPath) ? reportPath : path.join(accuracyDir, path.basename(reportPath));
    const hasV2 = /v2/i.test(base);
    reportPath = hasV2 ? base : base.replace(/(\.txt)?$/i, '_v2.txt');
  } else {
    reportPath = path.join(accuracyDir, `evaluation_report_v2_${Date.now()}.txt`);
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
    maxPerCat: opts.maxPerCat
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

  for (let i = 0; i < test.length; i++) {
    const row = test[i];
    const subj = (row.subject || 'No Subject').slice(0, 120);

    // Run Classifier V2 to produce exactly one suggestion
    const { suggestion, reasons } = await classifyV2(
      { from: row.from, subject: row.subject, body: row.body },
      ctx
    );

    const actual = row.actualCats.slice();
    const suggested = suggestion ? [suggestion] : [];

    const actualNorm = new Set(actual.map(normalizeKey));
    const suggestedNorm = new Set(suggested.map(normalizeKey));

    const missingCount = actual.filter(a => !suggestedNorm.has(normalizeKey(a))).length;
    const extraCount = suggested.filter(s => !actualNorm.has(normalizeKey(s))).length;

    // Progress log
    const ok = (missingCount === 0 && extraCount === 0);
    console.log(`[${i + 1}/${test.length}] ${subj} | actual=[${actual.join(', ')}] | suggested=[${suggested.join(', ')}] | missing=${missingCount} extra=${extraCount}${ok ? ' | OK' : ''}`);

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
      reasons
    });
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

  console.log(`\nWrote classifier v2 report to: ${reportPath}\n`);
})().catch(e => {
  console.error('Fatal error:', e?.message || e);
  process.exit(1);
});
