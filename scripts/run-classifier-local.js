/**
 * Run Classifier Local Script
 * 
 * Classifies emails from priority-emails-5000.json using the V4 batched classifier
 * and outputs results to a text file with format: "Category | Subject"
 * 
 * Usage: node scripts/run-classifier-local.js
 */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
require('dotenv').config();

// Load MongoDB helper
const { initMongo, getUserDoc } = require('../db');

// Configuration
const CURRENT_USER_EMAIL = process.env.CURRENT_USER_EMAIL || 'ks4190@columbia.edu';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BATCH_SIZE = 10; // Small batch size to allow up to 500 batches (5000 emails = 500 batches)
const INPUT_DIR = path.join(__dirname, '..', 'data', CURRENT_USER_EMAIL);
const INPUT_FILE = path.join(INPUT_DIR, 'priority-emails-5000.json');
const OUTPUT_FILE = path.join(INPUT_DIR, 'classified-emails-5000.txt');

// Initialize OpenAI
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * Helper: normalize category name for comparison
 */
function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Helper: match category to current categories list
 */
function matchToCurrentCategory(name, currentCategories) {
  const input = String(name || '').trim();
  if (!currentCategories || currentCategories.length === 0) return input;

  // Exact case-insensitive match
  const lower = input.toLowerCase();
  const exact = currentCategories.find(c => String(c || '').toLowerCase() === lower);
  if (exact) return exact;

  // Normalized-key equality
  const key = normalizeKey(input);
  const normalizedMap = new Map();
  currentCategories.forEach(c => normalizedMap.set(normalizeKey(c), c));
  if (normalizedMap.has(key)) return normalizedMap.get(key);

  return input;
}

/**
 * Helper: strict mapping to category (for OpenAI responses)
 */
function strictMapToCategory(name, currentCategories) {
  try {
    const cats = Array.isArray(currentCategories) ? currentCategories : [];
    const hasOther = cats.some(c => String(c || '').toLowerCase() === 'other');
    const input = String(name || '').trim();
    if (!input) return hasOther ? 'Other' : '';

    // Exact case-insensitive
    const lower = input.toLowerCase();
    const exact = cats.find(c => String(c || '').toLowerCase() === lower);
    if (exact) return exact;

    // Normalized-key equality
    const key = normalizeKey(input);
    const mapByKey = new Map(cats.map(c => [normalizeKey(c), c]));
    if (mapByKey.has(key)) return mapByKey.get(key);

    // No strict match -> prefer "Other" or empty
    return hasOther ? 'Other' : '';
  } catch {
    const cats = Array.isArray(currentCategories) ? currentCategories : [];
    const hasOther = cats.some(c => String(c || '').toLowerCase() === 'other');
    return hasOther ? 'Other' : '';
  }
}

/**
 * Helper: count occurrences of needle in haystack (case-insensitive)
 */
function countOccurrencesInsensitive(haystack, needle) {
  try {
    const h = String(haystack || '');
    const n = String(needle || '').trim();
    if (!n) return 0;
    const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escapeRegExp(n), 'gi');
    const m = h.match(re);
    return m ? m.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Load categories list from MongoDB or local file
 */
async function loadCategoriesList() {
  try {
    // Try MongoDB first
    const doc = await getUserDoc('categories', CURRENT_USER_EMAIL);
    if (doc && Array.isArray(doc.categories)) {
      console.log(`✓ Loaded ${doc.categories.length} categories from MongoDB`);
      return doc.categories;
    }
  } catch (e) {
    console.warn('Could not load categories from MongoDB:', e.message);
  }

  // Fallback to local JSON
  try {
    const categoriesPath = path.join(INPUT_DIR, 'categories.json');
    if (fs.existsSync(categoriesPath)) {
      const data = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
      if (data && Array.isArray(data.categories)) {
        console.log(`✓ Loaded ${data.categories.length} categories from local file`);
        return data.categories;
      }
    }
  } catch (e) {
    console.warn('Could not load categories from local file:', e.message);
  }

  // Ultimate fallback
  console.warn('⚠ Using default canonical categories');
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

/**
 * Load response emails from MongoDB or local file (for training examples)
 */
async function loadResponseEmails() {
  try {
    // Try MongoDB first
    const doc = await getUserDoc('response_emails', CURRENT_USER_EMAIL);
    if (doc && Array.isArray(doc.emails)) {
      console.log(`✓ Loaded ${doc.emails.length} response emails from MongoDB`);
      return doc.emails;
    }
  } catch (e) {
    console.warn('Could not load response emails from MongoDB:', e.message);
  }

  // Fallback to local JSON
  try {
    const responsePath = path.join(INPUT_DIR, 'response-emails.json');
    if (fs.existsSync(responsePath)) {
      const data = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
      if (data && Array.isArray(data.emails)) {
        console.log(`✓ Loaded ${data.emails.length} response emails from local file`);
        return data.emails;
      }
    }
  } catch (e) {
    console.warn('Could not load response emails from local file:', e.message);
  }

  console.warn('⚠ No training examples found');
  return [];
}

/**
 * Load category summaries from MongoDB or local file
 */
async function loadCategorySummaries() {
  try {
    // Try MongoDB first
    const doc = await getUserDoc('category_summaries', CURRENT_USER_EMAIL);
    if (doc && doc.summaries && typeof doc.summaries === 'object') {
      console.log(`✓ Loaded summaries for ${Object.keys(doc.summaries).length} categories from MongoDB`);
      return doc.summaries;
    }
  } catch (e) {
    console.warn('Could not load category summaries from MongoDB:', e.message);
  }

  // Fallback to local JSON
  try {
    const summariesPath = path.join(INPUT_DIR, 'categorysummaries.json');
    if (fs.existsSync(summariesPath)) {
      const data = JSON.parse(fs.readFileSync(summariesPath, 'utf8'));
      if (data && data.summaries && typeof data.summaries === 'object') {
        console.log(`✓ Loaded summaries for ${Object.keys(data.summaries).length} categories from local file`);
        return data.summaries;
      }
    }
  } catch (e) {
    console.warn('Could not load category summaries from local file:', e.message);
  }

  console.warn('⚠ No category summaries found');
  return {};
}

/**
 * Load category guidelines from local file
 */
function loadCategoryGuidelines() {
  try {
    const guidelinesPath = path.join(INPUT_DIR, 'category-guidelines.json');
    if (fs.existsSync(guidelinesPath)) {
      const data = JSON.parse(fs.readFileSync(guidelinesPath, 'utf8'));
      if (data && Array.isArray(data.categories)) {
        const map = Object.fromEntries(data.categories.map(c => [c.name, c.notes || '']));
        console.log(`✓ Loaded guidelines for ${Object.keys(map).length} categories`);
        return map;
      }
    }
  } catch (e) {
    console.warn('Could not load category guidelines:', e.message);
  }

  console.warn('⚠ No category guidelines found');
  return {};
}

/**
 * Build per-category training rows from response emails
 */
function buildCategoryRows(responses) {
  const byCat = new Map();
  for (const e of responses) {
    const name = String(e?.category || '').trim();
    if (!name) continue;
    if (!byCat.has(name)) byCat.set(name, []);
    byCat.get(name).push({
      id: e.id,
      subject: e.subject || 'No Subject',
      from: e.originalFrom || e.from || 'Unknown Sender',
      body: e.body || e.snippet || ''
    });
  }
  return byCat;
}

/**
 * OpenAI batched labeling (V4 classifier logic)
 */
async function openAIBatchLabel(newEmails, categories, perCatRows, summariesMap, guidelinesMap, maxPerCat = 20) {
  const bundles = [];
  for (const c of categories) {
    const rows = (perCatRows.get(c) || []).slice(0, maxPerCat).map((r, i) => ({
      i: i + 1,
      subject: String(r.subject || '').slice(0, 180),
      body: String(r.body || '').slice(0, 550)
    }));
    bundles.push({
      category: c,
      meta: {
        summary: summariesMap?.[c] || '',
        guideline: guidelinesMap?.[c] || ''
      },
      examples: rows
    });
  }

  const allowedJson = JSON.stringify(categories, null, 2);
  const bundlesJson = JSON.stringify(bundles, null, 2);
  const items = newEmails.map(e => ({
    id: String(e.id || ''),
    from: String(e.from || ''),
    subject: String(e.subject || '').slice(0, 200),
    body: String(e.body || '').slice(0, 1400)
  }));
  const itemsJson = JSON.stringify(items, null, 2);

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
${itemsJson}

Return ONLY strictly valid JSON of the form:
{
  "results": {
    "<emailId>": {
      "contenders": ["Category A", "Category B", ...],
      "pick": "Category A",
      "rationales": { "Category A": "why...", "Category B": "why..." }
    }
  }
}`;

  const systemTokens = SYSTEM.length / 4;
  const userTokens = USER.length / 4;
  const totalEstimatedTokens = systemTokens + userTokens;
  console.log(`  Calling OpenAI with ~${Math.round(totalEstimatedTokens)} estimated tokens`);

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
    try { 
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) { 
        try { 
          parsed = JSON.parse(m[0]);
        } catch (regexErr) {
          console.warn(`  JSON extraction failed`);
        }
      }
    }
    
    const results = parsed && parsed.results && typeof parsed.results === 'object' ? parsed.results : {};
    const resultCount = Object.keys(results).length;
    console.log(`  Success: returned results for ${resultCount}/${newEmails.length} emails`);
    
    return results;
  } catch (err) {
    console.error(`  OpenAI batch labeling FAILED:`, err?.message || err);
    return {};
  }
}

/**
 * Sender majority fallback
 */
function senderMajorityFallback(email, categories, perCatRows) {
  try {
    const counts = new Map();
    categories.forEach(c => counts.set(c, 0));
    const senderLc = String(email.from || '').toLowerCase();
    for (const c of categories) {
      const rows = perCatRows.get(c) || [];
      let cnt = counts.get(c) || 0;
      for (const r of rows) {
        const fromLc = String(r.from || '').toLowerCase();
        if (fromLc && senderLc && fromLc.includes(senderLc)) {
          cnt++;
        }
      }
      counts.set(c, cnt);
    }
    let best = '';
    let bestCnt = 0;
    for (const [c, cnt] of counts.entries()) {
      if (cnt > bestCnt) { best = c; bestCnt = cnt; }
    }
    return (best && bestCnt > 0) ? best : '';
  } catch {
    return '';
  }
}

/**
 * Keyword fallback
 */
function keywordFallback(email, categories) {
  try {
    let best = '';
    let bestScore = -1;
    for (const c of categories) {
      const subjCount = countOccurrencesInsensitive(email.subject || '', c);
      const bodyCount = countOccurrencesInsensitive(email.body || '', c);
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

/**
 * Main classifier function
 */
async function classifyEmails() {
  try {
    console.log('='.repeat(60));
    console.log('Run Classifier Local Script (V4)');
    console.log('='.repeat(60));
    console.log(`User: ${CURRENT_USER_EMAIL}`);
    console.log(`Input file: ${INPUT_FILE}`);
    console.log(`Output file: ${OUTPUT_FILE}`);
    console.log(`Batch size: ${BATCH_SIZE} emails`);
    console.log('='.repeat(60));
    console.log('');

    // Check for OpenAI API key
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not found in .env file');
    }

    // Initialize MongoDB
    console.log('Step 1: Connecting to MongoDB...');
    await initMongo();
    console.log('✓ MongoDB connected');

    // Load input emails
    console.log('\nStep 2: Loading input emails...');
    if (!fs.existsSync(INPUT_FILE)) {
      throw new Error(`Input file not found: ${INPUT_FILE}`);
    }
    const inputData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
    const emails = inputData.emails || [];
    console.log(`✓ Loaded ${emails.length} emails from ${INPUT_FILE}`);

    // Load training data and metadata
    console.log('\nStep 3: Loading training data and categories...');
    const categoriesX = await loadCategoriesList();
    const responses = await loadResponseEmails();
    const summaries = await loadCategorySummaries();
    const guidelines = loadCategoryGuidelines();
    const perCatRows = buildCategoryRows(responses);
    console.log(`✓ Training data loaded (${responses.length} examples)`);

    // Process in batches and output results immediately
    console.log('\nStep 4: Running V4 classifier and outputting results...');
    const totalBatches = Math.ceil(emails.length / BATCH_SIZE);
    console.log(`Processing ${emails.length} emails in ${totalBatches} batches\n`);
    
    const outputLines = [];
    const startTime = Date.now();
    
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batch = emails.slice(i, i + BATCH_SIZE);
      console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} emails)...`);
      
      const r = await openAIBatchLabel(
        batch.map(e => ({ id: e.id, subject: e.subject, body: e.body, from: e.from })),
        categoriesX,
        perCatRows,
        summaries,
        guidelines,
        20
      );
      
      // Process and output results for this batch immediately
      for (const e of batch) {
        const id = String(e.id || '');
        if (!id) continue;

        const result = r?.[id] || {};
        const llmContenders = Array.isArray(result.contenders)
          ? result.contenders.filter(c => c && normalizeKey(c) !== 'other')
          : [];
        const pickRaw = typeof result.pick === 'string' ? result.pick : '';

        // V4 decision: sender-augment contenders
        const senderBest = senderMajorityFallback(e, categoriesX, perCatRows);
        const contendersUnion = (() => {
          const seen = new Set();
          const arr = [];
          for (const c of llmContenders) {
            const k = normalizeKey(c);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            arr.push(matchToCurrentCategory(c, categoriesX) || c);
          }
          if (senderBest) {
            const k2 = normalizeKey(senderBest);
            if (k2 && k2 !== 'other' && !seen.has(k2)) {
              seen.add(k2);
              arr.push(matchToCurrentCategory(senderBest, categoriesX) || senderBest);
            }
          }
          return arr;
        })();

        let suggestion = '';
        if (contendersUnion.length > 0) {
          const mappedPick = pickRaw ? (matchToCurrentCategory(pickRaw, categoriesX) || '') : '';
          const unionKeys = new Set(contendersUnion.map(c => normalizeKey(c)));
          if (mappedPick && unionKeys.has(normalizeKey(mappedPick))) {
            suggestion = mappedPick;
          } else if (senderBest && unionKeys.has(normalizeKey(senderBest))) {
            suggestion = matchToCurrentCategory(senderBest, categoriesX) || senderBest;
          } else {
            suggestion = contendersUnion[0] || '';
          }
        } else {
          // No contenders - use keyword fallback
          const kw = keywordFallback(e, categoriesX);
          if (kw && normalizeKey(kw) !== 'other') {
            suggestion = matchToCurrentCategory(kw, categoriesX) || kw;
          } else {
            suggestion = categoriesX.find(c => normalizeKey(c) === 'other') || 'Other';
          }
        }

        const subject = String(e.subject || 'No Subject');
        const outputLine = `${suggestion} | ${subject}`;
        outputLines.push(outputLine);
        console.log(outputLine);
      }
      
      console.log(`✓ Batch ${batchNum}/${totalBatches} completed\n`);
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✓ All batches completed in ${totalTime}s`);
    console.log(`✓ Processed ${outputLines.length} emails total`);

    // Write output file
    console.log('\nStep 6: Writing output file...');
    fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'));
    console.log(`✓ Saved results to: ${OUTPUT_FILE}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total emails processed: ${outputLines.length}`);
    console.log(`Output file: ${OUTPUT_FILE}`);
    console.log(`Total time: ${totalTime}s`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n✗ Script failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  classifyEmails()
    .then(() => {
      console.log('\n✓ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { classifyEmails };
