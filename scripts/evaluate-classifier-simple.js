#!/usr/bin/env node
/**
 * Simple classifier evaluation:
 * For each email in the test set, ask OpenAI in a single prompt:
 *  "Which existing category does this email best fit into?"
 *
 * - Loads labeled emails for a user from data/{user}/response-emails.json
 * - Loads category names from data/{user}/categories.json (fallback: derive from labeled data)
 * - Splits into train/test (seeded, deterministic) but DOES NOT train anything (pure inference)
 * - For each test email, calls OpenAI once to pick exactly ONE category from the allowed list
 * - Computes metrics similar to the main evaluate-classifier.js
 * - Writes report to ./accuracy (default filename includes "simple")
 * - Prints per-email progress with [i/N] and a final summary
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
  }
  return {
    user: out.user || process.env.CURRENT_USER_EMAIL || 'ks4190@columbia.edu',
    split: Number.isFinite(out.split) ? Math.min(0.95, Math.max(0.5, out.split)) : 0.8,
    seed: Number.isFinite(out.seed) ? out.seed : 42,
    report: (typeof out.report === 'string' ? out.report.trim() : '') || ''
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

// -----------------------------
// Data loading
// -----------------------------
function getUserPaths(userEmail) {
  const base = path.join(process.cwd(), 'data', userEmail);
  return {
    userDir: base,
    responses: path.join(base, 'response-emails.json'),
    categories: path.join(base, 'categories.json')
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

  // last resort: canonical set
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
    if (r.reason) {
      lines.push('Reason:');
      lines.push(`  - ${r.reason}`);
    }
    lines.push('');
  }
  writeText(reportPath, lines.join('\n'));
}

// -----------------------------
// OpenAI simple classifier
// -----------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chooseCategoryOpenAI(email, categories) {
  // Keep shortlist as given; append "Other" for robustness
  const allowed = uniqCaseInsensitive(categories.slice(0, 24));
  if (!allowed.map(s => s.toLowerCase()).includes('other')) {
    allowed.push('Other');
  }
  const allowedJson = JSON.stringify(allowed);

  const SYSTEM = `You are an assistant that classifies emails into categories.
You MUST choose exactly one category name from the provided list. Do not invent names or synonyms.
Return strictly valid JSON of the form: {"category":"<one of the allowed names>"}.
Evaluate fit carefully using sender, subject, and body.`;

  const USER = `ALLOWED CATEGORY NAMES (JSON):
${allowedJson}

EMAIL:
From: ${email.from}
Subject: ${email.subject}
Body:
${email.body.slice(0, 1200)}

Return ONLY JSON matching {"category":"<name>"} with the category chosen from the allowed list.`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'o3',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: USER }
      ],
      max_completion_tokens: 120,
      response_format: { type: 'json_object' }
    });
    const raw = resp.choices?.[0]?.message?.content || '';
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    const catRaw = parsed && typeof parsed.category === 'string' ? parsed.category : '';
    const mapped = mapToExistingCategory(catRaw, allowed);
    return { category: mapped || 'Other', raw: catRaw };
  } catch (e) {
    return { category: 'Other', raw: '' };
  }
}

// -----------------------------
// Main
// -----------------------------
(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required for the simple classifier.');
    process.exit(1);
  }

  console.log('\n=== Evaluate Simple Classifier (single OpenAI prompt per email) ===');
  console.log(`User: ${opts.user}`);
  console.log(`Split: ${(opts.split * 100).toFixed(0)}% train / ${(100 - opts.split * 100).toFixed(0)}% test | Seed: ${opts.seed}`);

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

  // Resolve report path to ./accuracy and ensure "simple" in filename
  const accuracyDir = path.join(process.cwd(), 'accuracy');
  ensureDir(accuracyDir);
  let reportPath = opts.report;
  if (reportPath) {
    const base = path.isAbsolute(reportPath) ? reportPath : path.join(accuracyDir, path.basename(reportPath));
    const hasSimple = /simple/i.test(base);
    reportPath = hasSimple ? base : base.replace(/(\.txt)?$/i, '_simple.txt');
  } else {
    reportPath = path.join(accuracyDir, `evaluation_report_simple_${Date.now()}.txt`);
  }
  console.log(`Report: ${reportPath}`);
  console.log('');

  // Evaluate
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

    // Ask OpenAI for single category
    const { category: picked, raw } = await chooseCategoryOpenAI(
      { from: row.from, subject: row.subject, body: row.body },
      categories
    );

    const suggested = [picked].filter(Boolean);
    const actual = row.actualCats.slice();

    const actualNorm = new Set(actual.map(normalizeKey));
    const suggestedNorm = new Set(suggested.map(normalizeKey));

    const missingCount = actual.filter(a => !suggestedNorm.has(normalizeKey(a))).length;
    const extraCount = suggested.filter(s => !actualNorm.has(normalizeKey(s))).length;

    // Progress log
    console.log(`[${i + 1}/${test.length}] ${subj} | actual=[${actual.join(', ')}] | suggested=[${suggested.join(', ')}] | missing=${missingCount} extra=${extraCount}${(missingCount === 0 && extraCount === 0) ? ' | OK' : ''}`);

    // Metrics
    totalActualTags += actualNorm.size;
    // Correct tag overlap (at most 1 here)
    for (const a of actualNorm) {
      if (suggestedNorm.has(a)) correctlyAssignedTags++;
    }
    incorrectlyAssignedTags += extraCount;

    if (missingCount === 0 && extraCount === 0) {
      completeCorrectEmails++;
      correctEmailsStrict++;
    }
    if (missingCount === 0 && extraCount > 0) {
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
      reason: raw ? `Model chose "${raw}" mapped to "${picked}"` : ''
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

  console.log(`\nWrote simple classifier report to: ${reportPath}\n`);
})().catch(e => {
  console.error('Fatal error:', e?.message || e);
  process.exit(1);
});
