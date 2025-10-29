#!/usr/bin/env node
/**
 * Evaluate "Load More" classification methodology against labeled data.
 *
 * What this script does:
 * - Loads labeled emails for a user from data/{user}/response-emails.json
 * - Splits data into train/test (seeded, deterministic)
 * - Spawns the existing server on a separate port with CURRENT_USER_EMAIL pointed to a temporary train-only dataset
 * - Calls the same multi-signal suggestion endpoint used by the Load More flow: POST /api/suggest-categories with stage="all"
 * - Computes accuracy: an item is correct only if ALL ground-truth categories for the email are contained in the suggested categories
 * - Writes a detailed text report listing, for each test email:
 *     - Subject
 *     - Actual categories
 *     - Suggested categories
 *     - Discrepancies (missing vs extra)
 *     - Short reasons per suggested category (from the server's merged rule explanations)
 *
 * Usage examples:
 *   node scripts/evaluate-classifier.js
 *   node scripts/evaluate-classifier.js --user ks4190@columbia.edu --split 0.8 --seed 42 --port 3311 --report reports/eval.txt
 *
 * Notes:
 * - This reuses the real server pipeline to ensure parity with "Load More" behavior.
 * - Requires Node 18+ (for global fetch). OPENAI_API_KEY is optional; without it, the server will fall back to heuristics where possible.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// -----------------------------
// CLI args and defaults
// -----------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--user' && next) { out.user = next; i++; continue; }
    if (a === '--split' && next) { out.split = Number(next); i++; continue; }
    if (a === '--seed' && next) { out.seed = Number(next); i++; continue; }
    if (a === '--port' && next) { out.port = Number(next); i++; continue; }
    if (a === '--report' && next) { out.report = next; i++; continue; }
    if (a === '--keepTmp') { out.keepTmp = true; continue; }
  }
  return {
    user: out.user || process.env.CURRENT_USER_EMAIL || 'ks4190@columbia.edu',
    split: Number.isFinite(out.split) ? Math.min(0.95, Math.max(0.5, out.split)) : 0.8,
    seed: Number.isFinite(out.seed) ? out.seed : 42,
    port: Number.isFinite(out.port) ? out.port : 3311,
    report: out.report || "",
    keepTmp: !!out.keepTmp,
  };
}

const opts = parseArgs();

// Force all reports into ./accuracy (unless an absolute path is provided)
const accuracyDir = path.join(process.cwd(), 'accuracy');
ensureDir(accuracyDir);
if (typeof opts.report === 'string' && opts.report.trim()) {
  const p = opts.report.trim();
  if (!path.isAbsolute(p)) {
    const base = path.basename(p);
    opts.report = path.join(accuracyDir, base);
  } else {
    // absolute path provided; leave as-is
  }
} else {
  opts.report = path.join(accuracyDir, `evaluation_report_${Date.now()}.txt`);
}

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
function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
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
  for (const v of arr) {
    const k = String(v || '').toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(String(v));
    }
  }
  return out;
}

// -----------------------------
// Load labeled dataset
// -----------------------------
function loadLabeledResponses(userEmail) {
  const userDir = path.join(process.cwd(), 'data', userEmail);
  const p = path.join(userDir, 'response-emails.json');
  const data = readJson(p, { emails: [] });
  const emails = Array.isArray(data.emails) ? data.emails : [];
  // Normalize ground-truth multi-label categories for each email
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
      actualCats: all,
    };
  }).filter(x => x.id && x.subject && x.body);
}

// -----------------------------
// Prepare temporary train-only dataset for the server
// -----------------------------
function materializeTrainUser(baseUser, trainRows) {
  const tmpUser = `${baseUser}.__eval_train_${Date.now()}`;
  const tmpDir = path.join(process.cwd(), 'data', tmpUser);
  ensureDir(tmpDir);

  // Build train response-emails.json
  const trainEmails = trainRows.map(r => ({
    id: r.id,
    subject: r.subject,
    from: r.from,
    originalFrom: r.from,
    date: r.date,
    category: r.actualCats[0] || 'Other',
    categories: r.actualCats.slice(),
    body: r.body || '(seeded item)',
    snippet: r.body ? String(r.body).slice(0, 100) + (r.body.length > 100 ? '...' : '') : '',
    originalBody: r.body || ''
  }));
  writeJson(path.join(tmpDir, 'response-emails.json'), { emails: trainEmails });

  // Minimal threads file (not strictly required for stage="all")
  writeJson(path.join(tmpDir, 'email-threads.json'), { threads: [] });

  // Authoritative categories list from train
  const cats = uniqCaseInsensitive(
    trainEmails.flatMap(e => uniqCaseInsensitive([e.category, ...(e.categories || [])]))
  );
  writeJson(path.join(tmpDir, 'categories.json'), { categories: cats });

  return { tmpUser, tmpDir };
}

// -----------------------------
// Server process management
// -----------------------------
async function waitForReady(baseUrl, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${baseUrl}/api/current-user`);
      if (r.ok) return true;
    } catch {}
    await new Promise(res => setTimeout(res, 300));
  }
  return false;
}

function spawnServer({ port, currentUser }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), 'server.js')], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        CURRENT_USER_EMAIL: currentUser,
        SENDING_EMAIL: currentUser,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const baseUrl = `http://localhost:${port}`;

    const onReady = async () => {
      const ok = await waitForReady(baseUrl, 25000);
      if (ok && !resolved) {
        resolved = true;
        resolve({ child, baseUrl });
      }
    };

    // Heuristic: wait a bit then probe readiness
    setTimeout(onReady, 500);

    // Also parse logs to detect startup
    child.stdout.on('data', (buf) => {
      const s = String(buf || '');
      // console.log('[server]', s.trim());
      if (/Server running on/.test(s)) onReady();
    });
    child.stderr.on('data', (buf) => {
      const s = String(buf || '');
      // console.error('[server:err]', s.trim());
    });
    child.on('exit', (code) => {
      if (!resolved) {
        reject(new Error(`Server exited prematurely with code ${code}`));
      }
    });
  });
}

function killServer(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve();
    child.once('exit', () => resolve());
    try {
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
        resolve();
      }, 3000);
    } catch {
      resolve();
    }
  });
}

// -----------------------------
// Suggest categories using stage="all"
// -----------------------------
async function suggestAll(baseUrl, items) {
  // Batch to avoid huge payloads
  const BATCH = 25;
  const choices = {};
  const reasons = {};
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH).map(e => ({
      id: e.id,
      subject: e.subject,
      from: e.from,
      body: e.body,
      snippet: e.body ? String(e.body).slice(0, 120) + (e.body.length > 120 ? '...' : '') : '',
    }));
    const r = await fetch(`${baseUrl}/api/suggest-categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: batch, stage: 'all' })
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`suggest-categories failed (${r.status}): ${txt}`);
    }
    const j = await r.json();
    Object.assign(choices, j.choices || {});
    if (j.reasons) {
      Object.assign(reasons, j.reasons);
    }
  }
  return { choices, reasons };
}

// -----------------------------
// Accuracy computation
// -----------------------------
function isAllActualInSuggested(actualCats, suggestedCats) {
  const aKeys = (actualCats || []).map(normalizeKey).filter(Boolean);
  const sKeys = new Set((suggestedCats || []).map(normalizeKey).filter(Boolean));
  if (!aKeys.length) return true; // degenerate
  return aKeys.every(k => sKeys.has(k));
}

// -----------------------------
// Report writer
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
        lines.push(`  - ${cat}: ${why || '(no reason provided)'}`);
      });
    }
    lines.push('');
  }
  ensureDir(path.dirname(reportPath));
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
}

// -----------------------------
// Main
// -----------------------------
(async () => {
  console.log(`\n=== Evaluate Load More Classification ===`);
  console.log(`User: ${opts.user}`);
  console.log(`Split: ${(opts.split * 100).toFixed(0)}% train / ${(100 - opts.split * 100).toFixed(0)}% test | Seed: ${opts.seed}`);
  console.log(`Server port: ${opts.port}`);
  console.log(`Report: ${opts.report}\n`);

  const all = loadLabeledResponses(opts.user);
  if (!all.length) {
    console.error(`No labeled response emails found for user ${opts.user}. Expected at data/${opts.user}/response-emails.json`);
    process.exit(1);
  }

  const shuffled = shuffleSeeded(all, opts.seed);
  const trainSize = Math.max(1, Math.floor(shuffled.length * opts.split));
  const train = shuffled.slice(0, trainSize);
  const test = shuffled.slice(trainSize);

  if (!test.length) {
    console.error(`Test set is empty after split; reduce --split or add more labeled data.`);
    process.exit(1);
  }

  // Materialize temp user dataset for training-only view
  const { tmpUser, tmpDir } = materializeTrainUser(opts.user, train);
  console.log(`Prepared train-only dataset at: ${tmpDir}`);

  // Spawn server with temp user context
  let child = null;
  const baseUrl = `http://localhost:${opts.port}`;
  try {
    console.log(`Starting server (CURRENT_USER_EMAIL=${tmpUser}) ...`);
    const srv = await spawnServer({ port: opts.port, currentUser: tmpUser });
    child = srv.child;
    console.log(`Server ready at ${srv.baseUrl}`);

    // Request suggestions for test set via stage=all
    console.log(`Requesting category suggestions for ${test.length} test emails (stage=all)...`);
    const { choices, reasons } = await suggestAll(baseUrl, test);

    // Build evaluation rows with progress logs
    let correct = 0;
    const rows = [];
    for (let i = 0; i < test.length; i++) {
      const row = test[i];
      const suggested = Array.isArray(choices[row.id]) ? choices[row.id].slice() : [];
      const ok = isAllActualInSuggested(row.actualCats, suggested);
      if (ok) correct++;

      const actual = row.actualCats.slice();
      const actualNorm = new Set(actual.map(normalizeKey));
      const suggestedNorm = new Set(suggested.map(normalizeKey));
      const missingCount = actual.filter(a => !suggestedNorm.has(normalizeKey(a))).length;
      const extraCount = suggested.filter(s => !actualNorm.has(normalizeKey(s))).length;

      const subjLog = (row.subject || 'No Subject').slice(0, 120);
      console.log(`[${i + 1}/${test.length}] ${subjLog} | actual=[${actual.join(', ')}] | suggested=[${suggested.join(', ')}] | missing=${missingCount} extra=${extraCount}${ok ? ' | OK' : ''}`);

      rows.push({
        id: row.id,
        subject: row.subject,
        actual,
        suggested,
        actualNorm,
        suggestedNorm,
        reasons: reasons?.[row.id] || {}
      });
    }

    // Aggregate additional metrics for report
    let totalActualTags = 0;
    let correctlyAssignedTags = 0;
    let incorrectlyAssignedTags = 0;
    let completeCorrectEmails = 0;
    let mostlyCorrectEmails = 0;
    let almostCorrectEmails = 0;
    let somewhatCorrectEmails = 0;
    let emailsCorrectExceptExtras = 0;

    for (const r of rows) {
      const actualKeys = Array.from(r.actualNorm);
      const suggestedKeys = Array.from(r.suggestedNorm);
      const actualSet = new Set(actualKeys);
      const suggestedSet = new Set(suggestedKeys);

      totalActualTags += actualSet.size;
      for (const a of actualSet) {
        if (suggestedSet.has(a)) correctlyAssignedTags++;
      }
      const missingCount = actualKeys.filter(a => !suggestedSet.has(a)).length;
      const extraCount = suggestedKeys.filter(s => !actualSet.has(s)).length;
      incorrectlyAssignedTags += extraCount;
      if (missingCount === 0 && extraCount === 0) completeCorrectEmails++;
      if (missingCount === 0 && extraCount > 0) emailsCorrectExceptExtras++;
      const totalErr = (missingCount + extraCount);
      if (totalErr <= 1) mostlyCorrectEmails++;
      if (totalErr <= 2) almostCorrectEmails++;
      if (totalErr <= 3) somewhatCorrectEmails++;
    }

    const acc = correct / test.length;
    console.log(`Accuracy (strict multi-label containment): ${(acc * 100).toFixed(2)}% (${correct}/${test.length})`);
    console.log(`Tags: correct ${correctlyAssignedTags}/${totalActualTags}, incorrect (extras) ${incorrectlyAssignedTags}`);
    console.log(`Emails: complete ${completeCorrectEmails}, mostly ${mostlyCorrectEmails}, almost ${almostCorrectEmails}, somewhat ${somewhatCorrectEmails}, correct-except-extras ${emailsCorrectExceptExtras}`);

    // Write report
    writeReport(opts.report, {
      user: opts.user,
      train: train.length,
      test: test.length,
      accuracy: acc,
      correct,
      correctTags: correctlyAssignedTags,
      totalActualTags,
      incorrectTags: incorrectlyAssignedTags,
      completeCorrectEmails,
      mostlyCorrectEmails,
      almostCorrectEmails,
      somewhatCorrectEmails,
      emailsCorrectExceptExtras
    }, rows);
    console.log(`Wrote report to: ${opts.report}`);

  } catch (err) {
    console.error('Evaluation failed:', err?.message || err);
    process.exitCode = 1;
  } finally {
    // Cleanup server and temp data
    await killServer(child);
    if (!opts.keepTmp) {
      try {
        // Recursively remove tmp dir
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    } else {
      console.log(`Temporary train dataset retained at: ${tmpDir}`);
    }
  }
})();
