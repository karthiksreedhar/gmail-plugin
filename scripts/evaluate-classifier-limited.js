#!/usr/bin/env node
/**
 * "Limited" classifier evaluation:
 *
 * Implements a constrained multi-signal classifier with the following steps:
 * 1) Sender/participants prior: suggest all categories previously used for that sender
 * 2) If sender's name exactly matches an existing category, suggest it
 * 3) Keyword rule: category name appears in subject (>=1) or body (>=2) -> suggest
 * 4) OpenAI ranker: choose the best category among the allowed set, add as suggestion
 * 5) TF-IDF: compute similarity to category centroids; add top-1 match
 * 6) If after steps 1-5 there is ONLY ONE suggestion, compute average semantic similarity
 *    (OpenAI embeddings) between the new email/thread and every email/thread in each category;
 *    suggest the category with the highest average similarity (include as second suggestion if different)
 *
 * Constraints:
 * - Suggest at most 2 categories per email/thread total.
 *
 * Data/IO:
 * - Loads labeled emails for a user from data/{user}/response-emails.json
 * - Loads category names from data/{user}/categories.json (fallback: derive from labeled data)
 * - Splits into train/test (seeded, deterministic); trains TF-IDF on train only
 * - Uses OpenAI for (4) and (6) with OPENAI_API_KEY
 * - Computes metrics similar to other evaluators; writes report to ./accuracy with "limited" in filename
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
  const lower = input.toLowerCase();
  const exact = cats.find(c => String(c || '').toLowerCase() === lower);
  if (exact) return exact;

  const key = normalizeKey(input);
  const byKey = new Map(cats.map(c => [normalizeKey(c), c]));
  if (byKey.has(key)) return byKey.get(key);

  return cats[0] || '';
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

// -----------------------------
// Sender parsing / keys
// -----------------------------
function parseFromParts(fromStr) {
  const s = String(fromStr || '');
  // Extract email if present <email>
  const emailMatch = s.match(/<([^>]+)>/);
  const email = (emailMatch ? emailMatch[1] : (s.includes('@') ? s : '')).trim().toLowerCase();
  // Extract name portion before <...> or before '('
  let name = s;
  if (emailMatch) {
    name = s.slice(0, emailMatch.index).trim();
  } else {
    // Remove email if raw
    name = s.replace(/[^<\s]*@[^>\s]*/g, '').trim();
  }
  // Cleanup quotes
  name = name.replace(/^"+|"+$/g, '').trim();
  return {
    email,
    name,
    nameKey: normalizeKey(name),
    emailKey: email
  };
}

// -----------------------------
// Keyword matching
// -----------------------------
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
// TF-IDF utilities
// -----------------------------
const STOP = new Set([
  'the','and','for','you','your','from','with','this','that','are','was','were','will',
  'have','has','had','but','not','can','could','would','should','a','an','of','to','in',
  'on','at','by','is','it','as','be','or','we','our','us','me','i','my','they','them',
  'their','there','here','if','so','do','does','did','about','regarding','regards','dear',
  'hello','hi','thanks','thank','best','sincerely','please'
]);
function tokenize(text) {
  const t = normalizeKey(text);
  const parts = t.split(/\s+/).filter(Boolean);
  return parts.filter(w => w.length >= 3 && !STOP.has(w));
}
function tfVector(tokens) {
  const map = new Map();
  for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
  // Normalize TF by max frequency
  let maxf = 1;
  for (const v of map.values()) if (v > maxf) maxf = v;
  for (const [k,v] of map.entries()) map.set(k, v / maxf);
  return map;
}
function cosineSim(mapA, mapB) {
  // dot / (||A|| * ||B||)
  let dot = 0;
  let a2 = 0;
  let b2 = 0;
  for (const v of mapA.values()) a2 += v*v;
  for (const v of mapB.values()) b2 += v*v;
  if (a2 === 0 || b2 === 0) return 0;
  const [small, big] = mapA.size <= mapB.size ? [mapA, mapB] : [mapB, mapA];
  for (const [k, v] of small.entries()) {
    const w = big.get(k);
    if (w) dot += v * w;
  }
  return dot / (Math.sqrt(a2) * Math.sqrt(b2));
}

// -----------------------------
// OpenAI setup
// -----------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Step 4: OpenAI ranking
async function chooseCategoryOpenAI(email, categories) {
  const allowed = uniqCaseInsensitive(categories.slice(0, 48)); // keep limit sane
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
${String(email.body || '').slice(0, 1400)}

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

// Step 6: Embeddings and semantic similarity
async function embedText(text) {
  const input = String(text || '').slice(0, 6000);
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input
  });
  return r.data?.[0]?.embedding || [];
}
function cosineSimDense(a, b) {
  let dot = 0, a2 = 0, b2 = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    dot += x*y;
    a2 += x*x;
    b2 += y*y;
  }
  if (a2 === 0 || b2 === 0) return 0;
  return dot / (Math.sqrt(a2) * Math.sqrt(b2));
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
      Object.entries(r.reasons).forEach(([cat, whyArr]) => {
        const why = Array.isArray(whyArr) ? whyArr.join(' | ') : String(whyArr || '');
        lines.push(`  - ${cat}: ${why || '(no reason provided)'}`);
      });
    }
    lines.push('');
  }
  writeText(reportPath, lines.join('\n'));
}

// -----------------------------
// Classifier (steps 1-6)
// -----------------------------
function buildSenderIndex(train) {
  // Map senderKey -> Map(category -> count) based on training labels
  const map = new Map();
  for (const e of train) {
    const parts = parseFromParts(e.from);
    const keys = [];
    if (parts.emailKey) keys.push(`email:${parts.emailKey}`);
    if (parts.nameKey) keys.push(`name:${parts.nameKey}`);
    keys.push(`raw:${normalizeKey(e.from)}`);

    const cats = Array.isArray(e.actualCats) ? e.actualCats : [];
    for (const k of keys) {
      if (!map.has(k)) map.set(k, new Map());
      const counter = map.get(k);
      for (const c of cats) {
        counter.set(c, (counter.get(c) || 0) + 1);
      }
    }
  }
  return map;
}

function buildTfidfModel(train, categories) {
  // Build DF across all train docs
  const docs = train.map(e => textOfEmail(e));
  const tokenized = docs.map(t => tokenize(t));
  const N = tokenized.length || 1;
  const df = new Map();
  for (const toks of tokenized) {
    const seen = new Set(toks);
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = new Map();
  for (const [t, dfi] of df.entries()) {
    idf.set(t, Math.log((N + 1) / (dfi + 1)) + 1); // smoothed idf
  }

  // Category centroids: average of tf-idf vectors across docs that contain that category
  const catSum = new Map();   // cat -> Map(token -> sumWeight)
  const catCount = new Map(); // cat -> number of docs
  const catSet = new Set(categories);

  for (let i = 0; i < train.length; i++) {
    const e = train[i];
    const toks = tokenized[i];
    const tf = tfVector(toks);
    const vec = new Map();
    for (const [tok, tfv] of tf.entries()) {
      const w = tfv * (idf.get(tok) || 0);
      if (w > 0) vec.set(tok, w);
    }
    const cats = Array.isArray(e.actualCats) ? e.actualCats : [];
    for (const c of cats) {
      if (!catSet.has(c)) continue;
      if (!catSum.has(c)) catSum.set(c, new Map());
      if (!catCount.has(c)) catCount.set(c, 0);
      catCount.set(c, catCount.get(c) + 1);
      const acc = catSum.get(c);
      for (const [tok, w] of vec.entries()) {
        acc.set(tok, (acc.get(tok) || 0) + w);
      }
    }
  }

  const centroids = new Map();
  for (const c of categories) {
    const sum = catSum.get(c);
    const n = catCount.get(c) || 0;
    if (!sum || !n) {
      centroids.set(c, new Map());
      continue;
    }
    const avg = new Map();
    for (const [tok, w] of sum.entries()) {
      avg.set(tok, w / n);
    }
    centroids.set(c, avg);
  }

  function inferTfidfVector(text) {
    const toks = tokenize(text);
    const tf = tfVector(toks);
    const v = new Map();
    for (const [tok, tfv] of tf.entries()) {
      const w = tfv * (idf.get(tok) || 0);
      if (w > 0) v.set(tok, w);
    }
    return v;
  }

  function bestByTfidf(email) {
    const v = inferTfidfVector(textOfEmail(email));
    let best = { cat: '', score: 0 };
    for (const c of categories) {
      const centroid = centroids.get(c) || new Map();
      const s = cosineSim(v, centroid);
      if (s > best.score) best = { cat: c, score: s };
    }
    return best;
  }

  return { bestByTfidf };
}

function capToTwo(sortedCats) {
  const out = [];
  for (const c of sortedCats) {
    if (!out.includes(c)) out.push(c);
    if (out.length === 2) break;
  }
  return out;
}

async function classifyLimited(email, ctx) {
  const { categories, senderIndex, tfidfModel, ensureTrainEmbeddings, train } = ctx;

  // Candidates: cat -> { score: number, reasons: string[] }
  const cand = new Map();
  const bump = (cat, pts, reason) => {
    if (!cat) return;
    if (!cand.has(cat)) cand.set(cat, { score: 0, reasons: [] });
    const o = cand.get(cat);
    o.score += pts;
    if (reason) o.reasons.push(reason);
  };

  const parts = parseFromParts(email.from);

  // Step 1: sender/participants prior (only suggest the single most frequent category)
  const senderKeys = [];
  if (parts.emailKey) senderKeys.push(`email:${parts.emailKey}`);
  if (parts.nameKey) senderKeys.push(`name:${parts.nameKey}`);
  senderKeys.push(`raw:${normalizeKey(email.from)}`);
  // Aggregate category frequencies across matching sender keys
  const bySenderCounts = new Map();
  for (const k of senderKeys) {
    const counter = senderIndex.get(k);
    if (counter) {
      for (const [cat, cnt] of counter.entries()) {
        bySenderCounts.set(cat, (bySenderCounts.get(cat) || 0) + cnt);
      }
    }
  }
  // Pick only the most frequent category for this sender
  let priorBestCat = '';
  let priorBestCount = 0;
  for (const [cat, cnt] of bySenderCounts.entries()) {
    if (cnt > priorBestCount) { priorBestCount = cnt; priorBestCat = cat; }
  }
  if (priorBestCat) {
    bump(priorBestCat, 2.0, `Sender prior: most frequent "${priorBestCat}" (count=${priorBestCount})`);
  }

  // Step 2: sender name equals a category
  if (parts.nameKey) {
    const nameMap = new Map(categories.map(c => [normalizeKey(c), c]));
    const match = nameMap.get(parts.nameKey);
    if (match) bump(match, 3.0, `Sender name matches category "${match}"`);
  }

  // Step 3: keyword rule (subject: >=1, body: >=2)
  for (const c of categories) {
    const subjCount = countOccurrences(email.subject || '', c);
    const bodyCount = countOccurrences(email.body || '', c);
    if (subjCount >= 1 || bodyCount >= 2) {
      bump(c, 1.5 + 0.2 * subjCount + 0.1 * bodyCount, `Keyword rule: "${c}" in subject x${subjCount} body x${bodyCount}`);
    }
  }

  // Step 4: OpenAI best-of
  if (openai.apiKey) {
    const { category: picked, raw } = await chooseCategoryOpenAI(
      { from: email.from, subject: email.subject, body: email.body },
      categories
    );
    bump(picked, 3.5, raw ? `LLM best-of chose "${raw}" mapped to "${picked}"` : `LLM best-of chose "${picked}"`);
  }

  // Step 5: TF-IDF (only if there are absolutely NO suggestions from steps 1–4)
  // Treat any candidate (including "Other") as a prior suggestion; TF-IDF acts only as a last-resort fallback.
  const preRuleHasCandidates = cand.size > 0;
  if (!preRuleHasCandidates) {
    const tf = tfidfModel.bestByTfidf(email);
    if (tf.cat) {
      bump(tf.cat, 2.5 * Math.max(0.2, Math.min(1, tf.score)), `TF-IDF top match "${tf.cat}" (sim=${tf.score.toFixed(3)})`);
    }
  }
  // If any pre-rule candidates existed, scrub TF-IDF-only candidates and remove TF-IDF reasons
  // so TF-IDF cannot influence suggestions/reasons once steps 1–4 have already suggested something.
  if (preRuleHasCandidates) {
    for (const [cat, v] of Array.from(cand.entries())) {
      const reasonsArr = Array.isArray(v.reasons) ? v.reasons : [];
      const nonTfidfReasons = reasonsArr.filter(r => !/^TF-IDF top match\b/.test(String(r || '')));
      if (nonTfidfReasons.length === 0) {
        // Candidate was TF-IDF-only; drop entirely
        cand.delete(cat);
      } else if (nonTfidfReasons.length !== reasonsArr.length) {
        // Remove TF-IDF reason text
        v.reasons = nonTfidfReasons;
      }
    }
  }

  // Accumulate final suggestions (top-2 by score). Do not include "Other" if any other exists.
  const scored = Array.from(cand.entries())
    .map(([cat, v]) => ({ cat, score: v.score, reasons: v.reasons }))
    .sort((a,b) => b.score - a.score);
  const scoredCats = scored.map(x => x.cat);
  const nonOtherCats = scoredCats.filter(c => normalizeKey(c) !== 'other');
  let suggestions = capToTwo(nonOtherCats.length ? nonOtherCats : scoredCats);

  // Step 6: If there are no suggestions, do semantic average sim across categories via embeddings
  let step6Cat = '';
  if (suggestions.length === 0 && openai.apiKey) {
    await ensureTrainEmbeddings(); // lazily materialize once
    const testVec = await embedText(textOfEmail(email));
    let best = { cat: '', score: -1 };
    for (const c of categories) {
      const rows = ctx.categoryToTrainRows.get(c) || [];
      if (!rows.length) continue;
      let sum = 0;
      let count = 0;
      for (const r of rows) {
        const emb = ctx.trainEmbeddings.get(r.id);
        if (!emb) continue;
        sum += cosineSimDense(testVec, emb);
        count++;
      }
      const avg = count ? (sum / count) : 0;
      if (avg > best.score) best = { cat: c, score: avg };
    }
    step6Cat = best.cat || '';
    if (step6Cat) {
      // No suggestions exist yet; seed with the best embedding match
      suggestions = [step6Cat];
      if (!cand.has(step6Cat)) cand.set(step6Cat, { score: 0, reasons: [] });
      cand.get(step6Cat).reasons.push(`Embeddings: highest avg similarity "${step6Cat}"`);
    }
  }

  // Final enforcement: remove "Other" if any non-"Other" suggestion exists
  if (suggestions.some(c => normalizeKey(c) !== 'other')) {
    suggestions = capToTwo(suggestions.filter(c => normalizeKey(c) !== 'other'));
  }
  // Compile reasons mapping for output
  const reasonsMap = {};
  for (const s of suggestions) {
    reasonsMap[s] = cand.get(s)?.reasons || [];
  }

  return { suggestions, reasons: reasonsMap };
}

// -----------------------------
// Main
// -----------------------------
(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required for steps 4 and 6 of the limited classifier.');
    process.exit(1);
  }

  console.log('\n=== Evaluate Limited Classifier (multi-signal with constraints) ===');
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

  // Resolve report path to ./accuracy and ensure "limited" in filename
  const accuracyDir = path.join(process.cwd(), 'accuracy');
  ensureDir(accuracyDir);
  let reportPath = opts.report;
  if (reportPath) {
    const base = path.isAbsolute(reportPath) ? reportPath : path.join(accuracyDir, path.basename(reportPath));
    const hasLimited = /limited/i.test(base);
    reportPath = hasLimited ? base : base.replace(/(\.txt)?$/i, '_limited.txt');
  } else {
    reportPath = path.join(accuracyDir, `evaluation_report_limited_${Date.now()}.txt`);
  }
  console.log(`Report: ${reportPath}`);
  console.log('');

  // Precompute indices/models
  const senderIndex = buildSenderIndex(train);
  const tfidfModel = buildTfidfModel(train, categories);

  // Prepare step-6 (lazy embeddings) context
  const categoryToTrainRows = new Map();
  for (const c of categories) categoryToTrainRows.set(c, []);
  for (const e of train) {
    for (const c of (e.actualCats || [])) {
      if (categoryToTrainRows.has(c)) categoryToTrainRows.get(c).push(e);
    }
  }
  const trainEmbeddings = new Map(); // id -> dense vector
  let embeddingsReady = false;
  async function ensureTrainEmbeddings() {
    if (embeddingsReady) return;
    console.log('Computing embeddings for train set (for step 6)...');
    // Simple sequential loop to avoid hitting rate limits
    for (let i = 0; i < train.length; i++) {
      const e = train[i];
      try {
        const vec = await embedText(textOfEmail(e));
        trainEmbeddings.set(e.id, vec);
      } catch (err) {
        // leave missing if failed
      }
      if ((i+1) % 25 === 0) {
        console.log(`  Embedded ${i+1}/${train.length}...`);
      }
    }
    embeddingsReady = true;
    console.log('Train embeddings ready.');
  }

  const ctx = { categories, senderIndex, tfidfModel, ensureTrainEmbeddings, categoryToTrainRows, trainEmbeddings, train };

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

    // Run limited classifier
    const { suggestions, reasons } = await classifyLimited(
      { from: row.from, subject: row.subject, body: row.body },
      ctx
    );

    const actual = row.actualCats.slice();
    const suggested = (suggestions || []).slice(0, 2); // enforce at most 2

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

  console.log(`\nWrote limited classifier report to: ${reportPath}\n`);
})().catch(e => {
  console.error('Fatal error:', e?.message || e);
  process.exit(1);
});
