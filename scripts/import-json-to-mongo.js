#!/usr/bin/env node
/**
 * Import local JSON data for a specific user into MongoDB Atlas.
 *
 * Usage:
 *   MONGO_URI="mongodb+srv://..." MONGO_DB_NAME="gmail-plugin" node scripts/import-json-to-mongo.js --user ks4190@columbia.edu --root ./data/ks4190@columbia.edu
 *   MONGO_URI="mongodb+srv://..." MONGO_DB_NAME="gmail-plugin" node scripts/import-json-to-mongo.js --user lc3251@columbia.edu --root ./data/lc3251@columbia.edu
 *
 * Options:
 *   --dry-run | -n     Log operations without writing to the DB
 *
 * Behavior:
 *   - Upserts into collections; safe to run multiple times
 *   - Skips files that are missing
 *   - Normalizes arrays and timestamps where needed
 */

const fs = require('fs');
const path = require('path');
const { connectMongo, getCollection, ensureIndexes } = require('../db/mongo');

function parseArgs(argv) {
  const args = { user: '', root: '', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user' && argv[i + 1]) {
      args.user = String(argv[++i]).trim();
    } else if (a === '--root' && argv[i + 1]) {
      args.root = String(argv[++i]).trim();
    } else if (a === '--dry-run' || a === '--dryrun' || a === '-n') {
      args.dryRun = true;
    }
  }
  return args;
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Failed to read/parse JSON: ${filePath} -> ${e.message}`);
    return null;
  }
}

function uniqArr(arr) {
  const out = [];
  const seen = new Set();
  (arr || []).forEach(v => {
    const s = String(v || '').trim();
    const k = s.toLowerCase();
    if (s && !seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  });
  return out;
}

function toDate(iso, fallbackNow = false) {
  try {
    if (!iso) return fallbackNow ? new Date() : null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? (fallbackNow ? new Date() : null) : d;
  } catch {
    return fallbackNow ? new Date() : null;
  }
}

async function upsertUser(user_email, display_name, dryRun) {
  const col = await getCollection('users');
  const doc = {
    user_email,
    display_name: display_name || null,
    updated_at: new Date(),
  };
  if (dryRun) {
    console.log(`DRY-RUN users.upsert:`, { filter: { user_email }, doc });
    return;
  }
  await col.updateOne(
    { user_email },
    {
      $setOnInsert: { created_at: new Date() },
      $set: doc,
    },
    { upsert: true }
  );
}

async function importCategoriesList(user_email, filePath, dryRun) {
  const data = readJson(filePath);
  if (!data || !Array.isArray(data.categories)) return { count: 0 };
  const col = await getCollection('categories_list');
  let pos = 0;
  let count = 0;
  for (const rawName of data.categories) {
    const name = String(rawName || '').trim();
    if (!name) continue;
    const nameLower = name.toLowerCase();
    const filter = { user_email, nameLower };
    const doc = { user_email, name, nameLower, position: pos };
    if (dryRun) {
      console.log(`DRY-RUN categories_list.upsert:`, { filter, doc });
    } else {
      await col.updateOne(
        filter,
        { $set: doc, $setOnInsert: { created_at: new Date() } },
        { upsert: true }
      );
    }
    pos++;
    count++;
  }
  return { count };
}

async function importCategoryGuidelines(user_email, filePath, dryRun) {
  const data = readJson(filePath);
  if (!data || !Array.isArray(data.categories)) return { saved: false };
  const col = await getCollection('category_guidelines');
  const updated_at = toDate(data.updatedAt, true) || new Date();
  const filter = { user_email };
  const doc = { user_email, categories: data.categories, updated_at };
  if (dryRun) {
    console.log(`DRY-RUN category_guidelines.upsert:`, { filter, doc });
    return { saved: true };
  }
  await col.updateOne(filter, { $set: doc }, { upsert: true });
  return { saved: true };
}

async function importCategorySummaries(user_email, filePath, dryRun) {
  const data = readJson(filePath);
  if (!data) return { saved: false };
  let summaries = data.summaries;
  if (!summaries || typeof summaries !== 'object') summaries = data;
  const col = await getCollection('category_summaries');
  const updated_at = toDate(data.updatedAt, true) || new Date();
  const filter = { user_email };
  const doc = { user_email, summaries, updated_at };
  if (dryRun) {
    console.log(`DRY-RUN category_summaries.upsert:`, { filter, doc });
    return { saved: true };
  }
  await col.updateOne(filter, { $set: doc }, { upsert: true });
  return { saved: true };
}

async function importResponseEmails(user_email, filePath, dryRun) {
  const data = readJson(filePath);
  const emails = (data && Array.isArray(data.emails)) ? data.emails : [];
  const col = await getCollection('response_emails');
  let count = 0;
  for (const e of emails) {
    const id = String(e?.id || '').trim();
    if (!id) continue;
    const subject = e.subject || 'No Subject';
    const from_header = e.from || e.from_header || null;
    const original_from = e.originalFrom || e.original_from || null;
    const date = toDate(e.date, false);
    const category = e.category || null;
    const categories = uniqArr(Array.isArray(e.categories) ? e.categories : (category ? [category] : []));
    const body = e.body || '';
    const snippet = e.snippet || (body ? String(body).slice(0, 120) + (String(body).length > 120 ? '...' : '') : null);
    const seeded_original_only = !!e.seededOriginalOnly;
    const original_body = e.originalBody || null;
    const web_url = e.webUrl || null;

    const filter = { user_email, id };
    const doc = {
      user_email, id, subject, from_header, original_from, date,
      category, categories, body, snippet, seeded_original_only, original_body, web_url,
      upserted_at: new Date()
    };

    if (dryRun) {
      console.log(`DRY-RUN response_emails.upsert:`, { filter, subject: subject.slice(0, 60) });
    } else {
      await col.updateOne(
        filter,
        { $set: doc, $setOnInsert: { created_at: new Date() } },
        { upsert: true }
      );
    }
    count++;
  }
  return { count };
}

async function importEmailThreads(user_email, filePath, dryRun) {
  const data = readJson(filePath);
  const threads = (data && Array.isArray(data.threads)) ? data.threads : [];
  const col = await getCollection('email_threads');
  let count = 0;
  for (const t of threads) {
    const id = String(t?.id || '').trim();
    if (!id) continue;
    const subject = t.subject || 'No Subject';
    const from_header = t.from || t.from_header || null;
    const original_from = t.originalFrom || t.original_from || null;
    const date = toDate(t.date, false);
    const response_id = t.responseId || null;
    const messages = Array.isArray(t.messages) ? t.messages : [];

    const filter = { user_email, id };
    const doc = {
      user_email, id, subject, from_header, original_from, date, response_id, messages,
      upserted_at: new Date()
    };

    if (dryRun) {
      console.log(`DRY-RUN email_threads.upsert:`, { filter, subject: subject.slice(0, 60), messages: messages.length });
    } else {
      await col.updateOne(
        filter,
        { $set: doc, $setOnInsert: { created_at: new Date() } },
        { upsert: true }
      );
    }
    count++;
  }
  return { count };
}

async function importUnrepliedEmails(user_email, filePath, dryRun) {
  const data = readJson(filePath);
  const emails = (data && Array.isArray(data.emails)) ? data.emails : [];
  const col = await getCollection('unreplied_emails');
  let count = 0;
  for (const e of emails) {
    const id = String(e?.id || '').trim();
    if (!id) continue;
    const subject = e.subject || 'No Subject';
    const from_header = e.from || e.from_header || null;
    const date = toDate(e.date, false);
    const thread_id = e.threadId || e.thread_id || null;
    const body = e.body || '';
    const snippet = e.snippet || (body ? String(body).slice(0, 120) + (String(body).length > 120 ? '...' : '') : null);
    const category = e.category || null;
    const categories = uniqArr(Array.isArray(e.categories) ? e.categories : (category ? [category] : []));
    const tags = e.tags && typeof e.tags === 'object' ? e.tags : {};
    const source = e.source || null;
    const web_url = e.webUrl || null;

    const filter = { user_email, id };
    const doc = {
      user_email, id, subject, from_header, date, thread_id, body, snippet, category, categories, tags, source, web_url,
      upserted_at: new Date()
    };

    if (dryRun) {
      console.log(`DRY-RUN unreplied_emails.upsert:`, { filter, subject: subject.slice(0, 60) });
    } else {
      await col.updateOne(
        filter,
        { $set: doc, $setOnInsert: { created_at: new Date() } },
        { upsert: true }
      );
    }
    count++;
  }
  return { count };
}

async function importNotes(user_email, filePath, dryRun) {
  const data = readJson(filePath);
  const notes = (data && Array.isArray(data.notes)) ? data.notes : [];
  const col = await getCollection('notes');
  let count = 0;
  for (const n of notes) {
    let id = String(n?.id || '').trim();
    if (!id) id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const category = n.category || null;
    const text = n.text || '';
    const scope = (n.scope === 'GLOBAL' || n.scope === 'LOCAL') ? n.scope : 'GLOBAL';
    const created_at = toDate(n.createdAt, true) || new Date();
    const updated_at = toDate(n.updatedAt, true) || created_at;

    const filter = { user_email, id };
    const doc = { user_email, id, category, text, scope, created_at, updated_at };
    if (dryRun) {
      console.log(`DRY-RUN notes.upsert:`, { filter });
    } else {
      await col.updateOne(
        filter,
        { $set: doc },
        { upsert: true }
      );
    }
    count++;
  }
  return { count };
}

async function importEmailNotes(user_email, filePath, dryRun) {
  const data = readJson(filePath);
  if (!data || typeof data !== 'object') return { count: 0 };
  const map = (data.notesByEmail && typeof data.notesByEmail === 'object') ? data.notesByEmail : {};
  const col = await getCollection('email_notes');
  let count = 0;
  for (const [email_id, list] of Object.entries(map)) {
    const arr = Array.isArray(list) ? list : [];
    for (const n of arr) {
      let id = String(n?.id || '').trim();
      if (!id) id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const text = n.text || '';
      const created_at = toDate(n.createdAt, true) || new Date();
      const updated_at = toDate(n.updatedAt, true) || created_at;

      const filter = { user_email, id };
      const doc = { user_email, id, email_id, text, created_at, updated_at };

      if (dryRun) {
        console.log(`DRY-RUN email_notes.upsert:`, { filter, email_id });
      } else {
        await col.updateOne(
          filter,
          { $set: doc },
          { upsert: true }
        );
      }
      count++;
    }
  }
  return { count };
}

async function importHiddenThreads(user_email, filePath, dryRun) {
  const data = readJson(filePath);
  const list = (data && Array.isArray(data.hidden)) ? data.hidden : [];
  const col = await getCollection('hidden_threads');
  let count = 0;
  for (const h of list) {
    const id = String(h?.id || '').trim();
    if (!id) continue;
    const subject = h.subject || null;
    const response_ids = Array.isArray(h.responseIds) ? h.responseIds : [];
    const original_ids = Array.isArray(h.originalIds) ? h.originalIds : [];
    const date = toDate(h.date, false);

    const filter = { user_email, id };
    const doc = { user_email, id, subject, response_ids, original_ids, date };

    if (dryRun) {
      console.log(`DRY-RUN hidden_threads.upsert:`, { filter });
    } else {
      await col.updateOne(
        filter,
        { $set: doc },
        { upsert: true }
      );
    }
    count++;
  }
  return { count };
}

async function importHiddenInbox(user_email, filePath, dryRun) {
  const data = readJson(filePath);
  const list = (data && Array.isArray(data.hiddenMessages)) ? data.hiddenMessages : [];
  const col = await getCollection('hidden_inbox');
  let count = 0;
  for (const h of list) {
    let id = String(h?.id || '').trim();
    const subject = h.subject || null;
    const date = toDate(h.date, false);

    // Upsert key: prefer id; if missing, fallback to subject+date to avoid duplicates
    const filter = id ? { user_email, id } : { user_email, subject, date };
    const doc = { user_email, id: id || '', subject, date };

    if (dryRun) {
      console.log(`DRY-RUN hidden_inbox.upsert:`, { filter });
    } else {
      await col.updateOne(
        filter,
        { $set: doc },
        { upsert: true }
      );
    }
    count++;
  }
  return { count };
}

async function importScenariosRefinementsGenerations(user_email, filePath, dryRun) {
  const data = readJson(filePath);
  if (!data || typeof data !== 'object') return { scenarios: 0, refinements: 0, savedGenerations: 0 };

  const scenariosArr = Array.isArray(data.scenarios) ? data.scenarios : [];
  const refinementsArr = Array.isArray(data.refinements) ? data.refinements : [];
  const savedArr = Array.isArray(data.savedGenerations) ? data.savedGenerations : [];

  const colSc = await getCollection('scenarios');
  const colRf = await getCollection('refinements');
  const colSg = await getCollection('saved_generations');

  let sc = 0, rf = 0, sg = 0;

  for (const s of scenariosArr) {
    let id = String(s?.id || '').trim();
    if (!id) id = `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const doc = {
      user_email,
      id,
      name: s.name || null,
      description: s.description || null,
      emails: Array.isArray(s.emails) ? s.emails : (s.emails && typeof s.emails === 'object' ? s.emails : []),
      created_at: toDate(s.createdAt, true) || new Date()
    };
    const filter = { user_email, id };
    if (dryRun) {
      console.log(`DRY-RUN scenarios.upsert:`, { filter });
    } else {
      await colSc.updateOne(filter, { $set: doc }, { upsert: true });
    }
    sc++;
  }

  for (const r of refinementsArr) {
    let id = String(r?.id || '').trim();
    if (!id) id = `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const doc = {
      user_email,
      id,
      prompt: r.prompt || '',
      original_response: r.originalResponse || r.original_response || '',
      refined_response: r.refinedResponse || r.refined_response || '',
      analysis: r.analysis && typeof r.analysis === 'object' ? r.analysis : {},
      timestamp: toDate(r.timestamp, true) || new Date()
    };
    const filter = { user_email, id };
    if (dryRun) {
      console.log(`DRY-RUN refinements.upsert:`, { filter });
    } else {
      await colRf.updateOne(filter, { $set: doc }, { upsert: true });
    }
    rf++;
  }

  for (const g of savedArr) {
    let id = String(g?.id || '').trim();
    if (!id) id = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const doc = {
      user_email,
      id,
      original_email: g.originalEmail || g.original_email || {},
      generated_response: g.generatedResponse || g.generated_response || '',
      justification: g.justification || '',
      timestamp: toDate(g.timestamp, true) || new Date()
    };
    const filter = { user_email, id };
    if (dryRun) {
      console.log(`DRY-RUN saved_generations.upsert:`, { filter });
    } else {
      await colSg.updateOne(filter, { $set: doc }, { upsert: true });
    }
    sg++;
  }

  return { scenarios: sc, refinements: rf, savedGenerations: sg };
}

async function importGmailTokens(user_email, filePath, dryRun) {
  const data = readJson(filePath);
  if (!data || typeof data !== 'object') return { saved: false };

  const col = await getCollection('gmail_tokens');

  // Google tokens typically include: access_token, refresh_token, scope, token_type, expiry_date (ms)
  const access_token = data.access_token || null;
  const refresh_token = data.refresh_token || null;
  const scope = data.scope || null;
  const token_type = data.token_type || null;

  // expiry_date may be a millisecond timestamp; normalize to Date
  let expiry_date = null;
  try {
    const ms = typeof data.expiry_date === 'number' ? data.expiry_date
             : (typeof data.expiryDate === 'number' ? data.expiryDate : null);
    if (ms) {
      expiry_date = new Date(ms);
    } else if (data.expiry_date) {
      expiry_date = toDate(data.expiry_date, false);
    } else if (data.expiryDate) {
      expiry_date = toDate(data.expiryDate, false);
    }
  } catch (_) {
    expiry_date = null;
  }

  const filter = { user_email };
  const doc = {
    user_email,
    access_token,
    refresh_token,
    token_type,
    scope,
    expiry_date,
    raw: data,
    updated_at: new Date()
  };

  if (dryRun) {
    console.log('DRY-RUN gmail_tokens.upsert:', { filter, hasAccess: !!access_token, hasRefresh: !!refresh_token });
    return { saved: true };
  }

  await col.updateOne(
    filter,
    { $set: doc, $setOnInsert: { created_at: new Date() } },
    { upsert: true }
  );
  return { saved: true };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.user || !args.user.includes('@')) {
    console.error('ERROR: --user <email> is required');
    process.exit(1);
  }
  const root = args.root ? path.resolve(args.root) : path.resolve('data', args.user);
  if (!fs.existsSync(root)) {
    console.error(`ERROR: Data root not found: ${root}`);
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error('ERROR: MONGO_URI env var is required');
    process.exit(1);
  }
  console.log(`Importing user "${args.user}" from root: ${root}`);
  console.log(`Target DB: ${process.env.MONGO_DB_NAME || 'gmail-plugin'}`);
  console.log(`Mode: ${args.dryRun ? 'DRY-RUN (no writes)' : 'APPLY'}`);

  await connectMongo();
  await ensureIndexes();

  // Ensure user row exists
  const displayName =
    (args.user.toLowerCase() === 'ks4190@columbia.edu')
      ? 'Karthik Sreedhar'
      : (args.user.toLowerCase() === 'lc3251@columbia.edu' ? 'Lydia Chilton' : null);
  await upsertUser(args.user, displayName, args.dryRun);

  // Import Gmail tokens if present (so Render deployment can read tokens from DB)
  await importGmailTokens(args.user, path.join(root, 'gmail-tokens.json'), args.dryRun);

  // Import in roughly the same order used in file-based logic
  await importCategoriesList(args.user, path.join(root, 'categories.json'), args.dryRun);
  await importCategoryGuidelines(args.user, path.join(root, 'category-guidelines.json'), args.dryRun);
  await importCategorySummaries(args.user, path.join(root, 'categorysummaries.json'), args.dryRun);

  const r1 = await importResponseEmails(args.user, path.join(root, 'response-emails.json'), args.dryRun);
  const r2 = await importEmailThreads(args.user, path.join(root, 'email-threads.json'), args.dryRun);
  const r3 = await importUnrepliedEmails(args.user, path.join(root, 'unreplied-emails.json'), args.dryRun);

  const r4 = await importNotes(args.user, path.join(root, 'notes.json'), args.dryRun);
  const r5 = await importEmailNotes(args.user, path.join(root, 'email-notes.json'), args.dryRun);

  const r6 = await importHiddenThreads(args.user, path.join(root, 'hidden-threads.json'), args.dryRun);
  const r7 = await importHiddenInbox(args.user, path.join(root, 'hidden-inbox.json'), args.dryRun);

  const r8 = await importScenariosRefinementsGenerations(args.user, path.join(root, 'scenarios.json'), args.dryRun);

  console.log('\nImport summary:');
  console.log(`- response_emails: ${r1.count}`);
  console.log(`- email_threads:   ${r2.count}`);
  console.log(`- unreplied_emails:${r3.count}`);
  console.log(`- notes:           ${r4.count}`);
  console.log(`- email_notes:     ${r5.count}`);
  console.log(`- hidden_threads:  ${r6.count}`);
  console.log(`- hidden_inbox:    ${r7.count}`);
  console.log(`- scenarios:       ${r8.scenarios}, refinements: ${r8.refinements}, saved_generations: ${r8.savedGenerations}`);
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err?.message || err);
  process.exit(1);
});
