#!/usr/bin/env node
/**
 * Import local JSON data for a specific user into Heroku Postgres.
 *
 * Usage:
 *   node scripts/import-json-to-postgres.js --user ks4190@columbia.edu --root ./data/ks4190@columbia.edu
 *   node scripts/import-json-to-postgres.js --user lc3251@columbia.edu --root ./data/lc3251@columbia.edu
 *
 * Environment:
 *   - DATABASE_URL=postgres://... (Heroku Postgres URL)
 *   - PGSSLMODE=require OR POSTGRES_SSL=true (for SSL on Render/Heroku)
 *
 * Behavior:
 *   - Upserts into tables defined in db/schema.sql
 *   - Idempotent (safe to run multiple times)
 *   - Skips files that are missing
 *   - Validates/normalizes fields where needed
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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

function needSSL() {
  return String(process.env.PGSSLMODE || '').toLowerCase() === 'require' ||
         String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true';
}

function toTs(iso, fallbackNow = false) {
  try {
    if (!iso) return fallbackNow ? new Date() : null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? (fallbackNow ? new Date() : null) : d;
  } catch {
    return fallbackNow ? new Date() : null;
  }
}

async function upsertUsers(client, userEmail, displayName, dryRun) {
  if (dryRun) {
    console.log(`DRY-RUN users: (${userEmail}, ${displayName})`);
    return;
  }
  await client.query(
    `INSERT INTO users (user_email, display_name)
     VALUES ($1, $2)
     ON CONFLICT (user_email) DO UPDATE
     SET display_name = EXCLUDED.display_name, updated_at = now()`,
    [userEmail, displayName || null]
  );
}

async function importCategoriesList(client, userEmail, filePath, dryRun) {
  const data = readJson(filePath);
  if (!data || !Array.isArray(data.categories)) return { count: 0 };
  const names = data.categories.map(String).map(s => s.trim()).filter(Boolean);
  let pos = 0;
  let count = 0;
  for (const name of names) {
    if (dryRun) {
      console.log(`DRY-RUN categories_list: (${userEmail}, ${name}, pos=${pos})`);
    } else {
      await client.query(
        `INSERT INTO categories_list (user_email, name, position)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_email, lower(name)) DO UPDATE
         SET position = EXCLUDED.position`,
        [userEmail, name, pos]
      );
    }
    pos++;
    count++;
  }
  return { count };
}

async function importCategoryGuidelines(client, userEmail, filePath, dryRun) {
  const data = readJson(filePath);
  if (!data || !Array.isArray(data.categories)) return { saved: false };
  const updatedAt = toTs(data.updatedAt, true) || new Date();
  if (dryRun) {
    console.log(`DRY-RUN category_guidelines: (${userEmail}) entries=${data.categories.length}`);
    return { saved: true };
  }
  await client.query(
    `INSERT INTO category_guidelines (user_email, categories, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_email) DO UPDATE
     SET categories = EXCLUDED.categories, updated_at = EXCLUDED.updated_at`,
    [userEmail, JSON.stringify(data.categories), updatedAt]
  );
  return { saved: true };
}

async function importCategorySummaries(client, userEmail, filePath, dryRun) {
  const data = readJson(filePath);
  if (!data) return { saved: false };
  let summaries = data.summaries;
  if (!summaries || typeof summaries !== 'object') summaries = data;
  const updatedAt = toTs(data.updatedAt, true) || new Date();
  if (dryRun) {
    console.log(`DRY-RUN category_summaries: (${userEmail}) keys=${Object.keys(summaries || {}).length}`);
    return { saved: true };
  }
  await client.query(
    `INSERT INTO category_summaries (user_email, summaries, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_email) DO UPDATE
     SET summaries = EXCLUDED.summaries, updated_at = EXCLUDED.updated_at`,
    [userEmail, JSON.stringify(summaries || {}), updatedAt]
  );
  return { saved: true };
}

async function importResponseEmails(client, userEmail, filePath, dryRun) {
  const data = readJson(filePath);
  const emails = (data && Array.isArray(data.emails)) ? data.emails : [];
  let count = 0;
  for (const e of emails) {
    const id = String(e?.id || '').trim();
    if (!id) continue;
    const subject = e.subject || 'No Subject';
    const from_header = e.from || e.from_header || null;
    const original_from = e.originalFrom || e.original_from || null;
    const date = toTs(e.date, false);
    const category = e.category || null;
    const categories = uniqArr(Array.isArray(e.categories) ? e.categories : (category ? [category] : []));
    const body = e.body || '';
    const snippet = e.snippet || (body ? String(body).slice(0, 120) + (String(body).length > 120 ? '...' : '') : null);
    const seeded_original_only = !!e.seededOriginalOnly;
    const original_body = e.originalBody || null;
    const web_url = e.webUrl || null;

    if (dryRun) {
      console.log(`DRY-RUN response_emails: id=${id} subj="${subject.slice(0,60)}" cats=${categories.length}`);
    } else {
      await client.query(
        `INSERT INTO response_emails
           (id, user_email, subject, from_header, original_from, date, category, categories, body, snippet, seeded_original_only, original_body, web_url)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           user_email = EXCLUDED.user_email,
           subject = EXCLUDED.subject,
           from_header = EXCLUDED.from_header,
           original_from = EXCLUDED.original_from,
           date = EXCLUDED.date,
           category = EXCLUDED.category,
           categories = EXCLUDED.categories,
           body = EXCLUDED.body,
           snippet = EXCLUDED.snippet,
           seeded_original_only = EXCLUDED.seeded_original_only,
           original_body = EXCLUDED.original_body,
           web_url = EXCLUDED.web_url`,
        [id, userEmail, subject, from_header, original_from, date, category, JSON.stringify(categories), body, snippet, seeded_original_only, original_body, web_url]
      );
    }
    count++;
  }
  return { count };
}

async function importEmailThreads(client, userEmail, filePath, dryRun) {
  const data = readJson(filePath);
  const threads = (data && Array.isArray(data.threads)) ? data.threads : [];
  let count = 0;
  for (const t of threads) {
    const id = String(t?.id || '').trim();
    if (!id) continue;
    const subject = t.subject || 'No Subject';
    const from_header = t.from || t.from_header || null;
    const original_from = t.originalFrom || t.original_from || null;
    const date = toTs(t.date, false);
    const response_id = t.responseId || null;
    const messages = Array.isArray(t.messages) ? t.messages : [];

    if (dryRun) {
      console.log(`DRY-RUN email_threads: id=${id} subj="${subject.slice(0,60)}" msgs=${messages.length}`);
    } else {
      await client.query(
        `INSERT INTO email_threads
           (id, user_email, subject, from_header, original_from, date, response_id, messages)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           user_email = EXCLUDED.user_email,
           subject = EXCLUDED.subject,
           from_header = EXCLUDED.from_header,
           original_from = EXCLUDED.original_from,
           date = EXCLUDED.date,
           response_id = EXCLUDED.response_id,
           messages = EXCLUDED.messages`,
        [id, userEmail, subject, from_header, original_from, date, response_id, JSON.stringify(messages)]
      );
    }
    count++;
  }
  return { count };
}

async function importUnrepliedEmails(client, userEmail, filePath, dryRun) {
  const data = readJson(filePath);
  const emails = (data && Array.isArray(data.emails)) ? data.emails : [];
  let count = 0;
  for (const e of emails) {
    const id = String(e?.id || '').trim();
    if (!id) continue;
    const subject = e.subject || 'No Subject';
    const from_header = e.from || e.from_header || null;
    const date = toTs(e.date, false);
    const thread_id = e.threadId || e.thread_id || null;
    const body = e.body || '';
    const snippet = e.snippet || (body ? String(body).slice(0, 120) + (String(body).length > 120 ? '...' : '') : null);
    const category = e.category || null;
    const categories = uniqArr(Array.isArray(e.categories) ? e.categories : (category ? [category] : []));
    const tags = e.tags && typeof e.tags === 'object' ? e.tags : {};
    const source = e.source || null;
    const web_url = e.webUrl || null;

    if (dryRun) {
      console.log(`DRY-RUN unreplied_emails: id=${id} subj="${subject.slice(0,60)}" cats=${categories.length}`);
    } else {
      await client.query(
        `INSERT INTO unreplied_emails
           (id, user_email, subject, from_header, date, thread_id, body, snippet, category, categories, tags, source, web_url)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           user_email = EXCLUDED.user_email,
           subject = EXCLUDED.subject,
           from_header = EXCLUDED.from_header,
           date = EXCLUDED.date,
           thread_id = EXCLUDED.thread_id,
           body = EXCLUDED.body,
           snippet = EXCLUDED.snippet,
           category = EXCLUDED.category,
           categories = EXCLUDED.categories,
           tags = EXCLUDED.tags,
           source = EXCLUDED.source,
           web_url = EXCLUDED.web_url`,
        [id, userEmail, subject, from_header, date, thread_id, body, snippet, category, JSON.stringify(categories), JSON.stringify(tags), source, web_url]
      );
    }
    count++;
  }
  return { count };
}

async function importNotes(client, userEmail, filePath, dryRun) {
  const data = readJson(filePath);
  const notes = (data && Array.isArray(data.notes)) ? data.notes : [];
  let count = 0;
  for (const n of notes) {
    let id = String(n?.id || '').trim();
    if (!id) id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const category = n.category || null;
    const text = n.text || '';
    const scope = (n.scope === 'GLOBAL' || n.scope === 'LOCAL') ? n.scope : 'GLOBAL';
    const createdAt = toTs(n.createdAt, true) || new Date();
    const updatedAt = toTs(n.updatedAt, true) || createdAt;

    if (dryRun) {
      console.log(`DRY-RUN notes: id=${id} cat="${category || ''}"`);
    } else {
      await client.query(
        `INSERT INTO notes
           (id, user_email, category, text, scope, created_at, updated_at)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           user_email = EXCLUDED.user_email,
           category = EXCLUDED.category,
           text = EXCLUDED.text,
           scope = EXCLUDED.scope,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`,
        [id, userEmail, category, text, scope, createdAt, updatedAt]
      );
    }
    count++;
  }
  return { count };
}

async function importEmailNotes(client, userEmail, filePath, dryRun) {
  const data = readJson(filePath);
  if (!data || typeof data !== 'object') return { count: 0 };
  const map = (data.notesByEmail && typeof data.notesByEmail === 'object') ? data.notesByEmail : {};
  let count = 0;
  for (const [emailId, list] of Object.entries(map)) {
    const arr = Array.isArray(list) ? list : [];
    for (const n of arr) {
      let id = String(n?.id || '').trim();
      if (!id) id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const text = n.text || '';
      const createdAt = toTs(n.createdAt, true) || new Date();
      const updatedAt = toTs(n.updatedAt, true) || createdAt;

      if (dryRun) {
        console.log(`DRY-RUN email_notes: id=${id} email_id=${emailId}`);
      } else {
        await client.query(
          `INSERT INTO email_notes
             (id, user_email, email_id, text, created_at, updated_at)
           VALUES
             ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             user_email = EXCLUDED.user_email,
             email_id = EXCLUDED.email_id,
             text = EXCLUDED.text,
             created_at = EXCLUDED.created_at,
             updated_at = EXCLUDED.updated_at`,
          [id, userEmail, emailId, text, createdAt, updatedAt]
        );
      }
      count++;
    }
  }
  return { count };
}

async function importHiddenThreads(client, userEmail, filePath, dryRun) {
  const data = readJson(filePath);
  const list = (data && Array.isArray(data.hidden)) ? data.hidden : [];
  let count = 0;
  for (const h of list) {
    const id = String(h?.id || '').trim();
    if (!id) continue;
    const subject = h.subject || null;
    const response_ids = Array.isArray(h.responseIds) ? h.responseIds : [];
    const original_ids = Array.isArray(h.originalIds) ? h.originalIds : [];
    const date = toTs(h.date, false);

    if (dryRun) {
      console.log(`DRY-RUN hidden_threads: id=${id}`);
    } else {
      await client.query(
        `INSERT INTO hidden_threads
           (id, user_email, subject, response_ids, original_ids, date)
         VALUES
           ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
         ON CONFLICT (id) DO UPDATE SET
           user_email = EXCLUDED.user_email,
           subject = EXCLUDED.subject,
           response_ids = EXCLUDED.response_ids,
           original_ids = EXCLUDED.original_ids,
           date = EXCLUDED.date`,
        [id, userEmail, subject, JSON.stringify(response_ids), JSON.stringify(original_ids), date]
      );
    }
    count++;
  }
  return { count };
}

async function importHiddenInbox(client, userEmail, filePath, dryRun) {
  const data = readJson(filePath);
  const list = (data && Array.isArray(data.hiddenMessages)) ? data.hiddenMessages : [];
  let count = 0;
  for (const h of list) {
    let id = String(h?.id || '').trim();
    if (!id) id = ''; // allow subject-only entry
    const subject = h.subject || null;
    const date = toTs(h.date, false);

    if (dryRun) {
      console.log(`DRY-RUN hidden_inbox: id=${id || '(none)'} subj="${subject || ''}"`);
    } else {
      await client.query(
        `INSERT INTO hidden_inbox
           (id, user_email, subject, date)
         VALUES
           ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           user_email = EXCLUDED.user_email,
           subject = EXCLUDED.subject,
           date = EXCLUDED.date`,
        [id, userEmail, subject, date]
      );
    }
    count++;
  }
  return { count };
}

async function importScenariosRefinementsGenerations(client, userEmail, filePath, dryRun) {
  const data = readJson(filePath);
  if (!data || typeof data !== 'object') return { scenarios: 0, refinements: 0, savedGenerations: 0 };
  const scenarios = Array.isArray(data.scenarios) ? data.scenarios : [];
  const refinements = Array.isArray(data.refinements) ? data.refinements : [];
  const savedGenerations = Array.isArray(data.savedGenerations) ? data.savedGenerations : [];

  let sc = 0, rf = 0, sg = 0;

  for (const s of scenarios) {
    let id = String(s?.id || '').trim();
    if (!id) id = `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const name = s.name || null;
    const description = s.description || null;
    const emails = Array.isArray(s.emails) ? s.emails : (s.emails && typeof s.emails === 'object' ? s.emails : []);
    const createdAt = toTs(s.createdAt, true) || new Date();

    if (dryRun) {
      console.log(`DRY-RUN scenarios: id=${id} name="${name || ''}"`);
    } else {
      await client.query(
        `INSERT INTO scenarios
           (id, user_email, name, description, emails, created_at)
         VALUES
           ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (id) DO UPDATE SET
           user_email = EXCLUDED.user_email,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           emails = EXCLUDED.emails,
           created_at = EXCLUDED.created_at`,
        [id, userEmail, name, description, JSON.stringify(emails), createdAt]
      );
    }
    sc++;
  }

  for (const r of refinements) {
    let id = String(r?.id || '').trim();
    if (!id) id = `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const prompt = r.prompt || '';
    const original_response = r.originalResponse || r.original_response || '';
    const refined_response = r.refinedResponse || r.refined_response || '';
    const analysis = r.analysis && typeof r.analysis === 'object' ? r.analysis : {};
    const ts = toTs(r.timestamp, true) || new Date();

    if (dryRun) {
      console.log(`DRY-RUN refinements: id=${id}`);
    } else {
      await client.query(
        `INSERT INTO refinements
           (id, user_email, prompt, original_response, refined_response, analysis, timestamp)
         VALUES
           ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT (id) DO UPDATE SET
           user_email = EXCLUDED.user_email,
           prompt = EXCLUDED.prompt,
           original_response = EXCLUDED.original_response,
           refined_response = EXCLUDED.refined_response,
           analysis = EXCLUDED.analysis,
           timestamp = EXCLUDED.timestamp`,
        [id, userEmail, prompt, original_response, refined_response, JSON.stringify(analysis), ts]
      );
    }
    rf++;
  }

  for (const g of savedGenerations) {
    let id = String(g?.id || '').trim();
    if (!id) id = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const original_email = g.originalEmail || g.original_email || {};
    const generated_response = g.generatedResponse || g.generated_response || '';
    const justification = g.justification || '';
    const ts = toTs(g.timestamp, true) || new Date();

    if (dryRun) {
      console.log(`DRY-RUN saved_generations: id=${id}`);
    } else {
      await client.query(
        `INSERT INTO saved_generations
           (id, user_email, original_email, generated_response, justification, timestamp)
         VALUES
           ($1, $2, $3::jsonb, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           user_email = EXCLUDED.user_email,
           original_email = EXCLUDED.original_email,
           generated_response = EXCLUDED.generated_response,
           justification = EXCLUDED.justification,
           timestamp = EXCLUDED.timestamp`,
        [id, userEmail, JSON.stringify(original_email), generated_response, justification, ts]
      );
    }
    sg++;
  }

  return { scenarios: sc, refinements: rf, savedGenerations: sg };
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
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.error('ERROR: DATABASE_URL env var is required');
    process.exit(1);
  }

  console.log(`Importing user "${args.user}" from root: ${root}`);
  console.log(`DATABASE_URL present: ${!!connStr}`);
  console.log(`SSL: ${needSSL() ? 'enabled (rejectUnauthorized=false)' : 'disabled'}`);
  console.log(`Mode: ${args.dryRun ? 'DRY-RUN (no writes)' : 'APPLY'}`);

  const client = new Client({
    connectionString: connStr,
    ssl: needSSL() ? { rejectUnauthorized: false } : undefined
  });

  await client.connect();

  try {
    if (!args.dryRun) {
      await client.query('BEGIN');
    }

    // Ensure user row exists
    const displayName = (args.user.toLowerCase() === 'ks4190@columbia.edu')
      ? 'Karthik Sreedhar'
      : (args.user.toLowerCase() === 'lc3251@columbia.edu' ? 'Lydia Chilton' : null);
    await upsertUsers(client, args.user, displayName, args.dryRun);

    // Categories list
    await importCategoriesList(client, args.user, path.join(root, 'categories.json'), args.dryRun);

    // Category guidelines
    await importCategoryGuidelines(client, args.user, path.join(root, 'category-guidelines.json'), args.dryRun);

    // Category summaries
    await importCategorySummaries(client, args.user, path.join(root, 'categorysummaries.json'), args.dryRun);

    // Response emails
    const r1 = await importResponseEmails(client, args.user, path.join(root, 'response-emails.json'), args.dryRun);

    // Email threads
    const r2 = await importEmailThreads(client, args.user, path.join(root, 'email-threads.json'), args.dryRun);

    // Unreplied emails
    const r3 = await importUnrepliedEmails(client, args.user, path.join(root, 'unreplied-emails.json'), args.dryRun);

    // Notes
    const r4 = await importNotes(client, args.user, path.join(root, 'notes.json'), args.dryRun);

    // Email notes
    const r5 = await importEmailNotes(client, args.user, path.join(root, 'email-notes.json'), args.dryRun);

    // Hidden threads
    const r6 = await importHiddenThreads(client, args.user, path.join(root, 'hidden-threads.json'), args.dryRun);

    // Hidden inbox
    const r7 = await importHiddenInbox(client, args.user, path.join(root, 'hidden-inbox.json'), args.dryRun);

    // Scenarios + refinements + saved generations (persisted together historically)
    const r8 = await importScenariosRefinementsGenerations(client, args.user, path.join(root, 'scenarios.json'), args.dryRun);

    if (!args.dryRun) {
      await client.query('COMMIT');
    }

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
  } catch (e) {
    if (!args.dryRun) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    console.error('Import failed:', e?.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err?.message || err);
  process.exit(1);
});
