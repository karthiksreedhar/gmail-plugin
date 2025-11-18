#!/usr/bin/env node
/*
 * One-time migration: local JSON (data/<userEmail>/...) -> MongoDB Atlas
 *
 * Usage:
 *   node scripts/migrate-to-mongo.js            # migrate all users under ./data
 *   DRY_RUN=1 node scripts/migrate-to-mongo.js   # print what would be migrated, no writes
 *
 * Requires:
 *   - db.js helpers (initMongo, setUserDoc)
 *   - MONGODB_URI in environment OR db.js fallback will use provided Atlas URI
 */

const fs = require('fs');
const path = require('path');
const { initMongo, setUserDoc, warmCacheForUser } = require('../db');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DRY_RUN = !!process.env.DRY_RUN || process.argv.includes('--dry-run');

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`WARN: Failed to parse ${p}:`, e.message);
    return null;
  }
}

async function migrateUser(userEmail) {
  const userDir = path.join(DATA_DIR, userEmail);
  const exists = fs.existsSync(userDir);
  if (!exists) return { userEmail, migrated: false, reason: 'directory not found' };

  const file = (name) => path.join(userDir, name);

  // Read all known files (defensive parsing + shape normalization)
  const responseEmails = (() => {
    const j = readJsonSafe(file('response-emails.json'));
    const list = Array.isArray(j?.emails) ? j.emails : Array.isArray(j) ? j : [];
    return { emails: list };
  })();

  const emailThreads = (() => {
    const j = readJsonSafe(file('email-threads.json'));
    const list = Array.isArray(j?.threads) ? j.threads : Array.isArray(j) ? j : [];
    return { threads: list };
  })();

  const unrepliedEmails = (() => {
    const j = readJsonSafe(file('unreplied-emails.json'));
    const list = Array.isArray(j?.emails) ? j.emails : Array.isArray(j) ? j : [];
    return { emails: list };
  })();

  const notes = (() => {
    const j = readJsonSafe(file('notes.json'));
    const list = Array.isArray(j?.notes) ? j.notes : Array.isArray(j) ? j : [];
    return { notes: list };
  })();

  const categories = (() => {
    const j = readJsonSafe(file('categories.json'));
    const list = Array.isArray(j?.categories) ? j.categories : Array.isArray(j) ? j : [];
    return { categories: list };
  })();

  const categoryGuidelines = (() => {
    const j = readJsonSafe(file('category-guidelines.json'));
    const list = Array.isArray(j?.categories) ? j.categories : [];
    const updatedAt = typeof j?.updatedAt === 'string' ? j.updatedAt : new Date().toISOString();
    return { categories: list, updatedAt };
  })();

  const categorySummaries = (() => {
    const j = readJsonSafe(file('categorysummaries.json'));
    const obj = j?.summaries && typeof j.summaries === 'object' ? j.summaries : (typeof j === 'object' && j ? j : {});
    const updatedAt = typeof j?.updatedAt === 'string' ? j.updatedAt : new Date().toISOString();
    return { summaries: obj, updatedAt };
  })();

  const emailNotes = (() => {
    const j = readJsonSafe(file('email-notes.json'));
    const map = j?.notesByEmail && typeof j.notesByEmail === 'object' ? j.notesByEmail : {};
    const updatedAt = typeof j?.updatedAt === 'string' ? j.updatedAt : new Date().toISOString();
    return { notesByEmail: map, updatedAt };
  })();

  const hiddenThreads = (() => {
    const j = readJsonSafe(file('hidden-threads.json'));
    const list = Array.isArray(j?.hidden) ? j.hidden : Array.isArray(j) ? j : [];
    return { hidden: list };
  })();

  const hiddenInbox = (() => {
    const j = readJsonSafe(path.join(userDir, 'hidden-inbox.json'));
    const list = Array.isArray(j?.hiddenMessages) ? j.hiddenMessages : [];
    return { hiddenMessages: list };
  })();

  const testEmails = (() => {
    const j = readJsonSafe(file('test-emails.json'));
    const list = Array.isArray(j?.emails) ? j.emails : Array.isArray(j) ? j : [];
    return { emails: list };
  })();

  const userState = (() => {
    const j = readJsonSafe(file('scenarios.json'));
    if (!j || typeof j !== 'object') return { scenarios: [], refinements: [], savedGenerations: [] };
    const scenarios = Array.isArray(j.scenarios) ? j.scenarios : [];
    const refinements = Array.isArray(j.refinements) ? j.refinements : [];
    const savedGenerations = Array.isArray(j.savedGenerations) ? j.savedGenerations : [];
    return { scenarios, refinements, savedGenerations };
  })();

  const plan = [
    { coll: 'response_emails', payload: responseEmails },
    { coll: 'email_threads', payload: emailThreads },
    { coll: 'unreplied_emails', payload: unrepliedEmails },
    { coll: 'notes', payload: notes },
    { coll: 'categories', payload: categories },
    { coll: 'category_guidelines', payload: categoryGuidelines },
    { coll: 'category_summaries', payload: categorySummaries },
    { coll: 'email_notes', payload: emailNotes },
    { coll: 'hidden_threads', payload: hiddenThreads },
    { coll: 'hidden_inbox', payload: hiddenInbox },
    { coll: 'test_emails', payload: testEmails },
    { coll: 'user_state', payload: userState },
  ];

  let written = 0;
  for (const item of plan) {
    const isEmpty = (() => {
      const p = item.payload;
      if (!p || typeof p !== 'object') return true;
      const keys = Object.keys(p);
      if (keys.length === 0) return true;
      // detect all-empty arrays/objects
      if (keys.length === 1 && Array.isArray(p[keys[0]]) && p[keys[0]].length === 0) return true;
      return false;
    })();
    if (isEmpty) {
      console.log(`[${userEmail}] Skip ${item.coll} (empty)`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`[DRY_RUN][${userEmail}] Would upsert ${item.coll}`);
    } else {
      await setUserDoc(item.coll, userEmail, item.payload);
      console.log(`[${userEmail}] Upserted ${item.coll}`);
      written++;
    }
  }

  if (!DRY_RUN) {
    try { await warmCacheForUser(userEmail); } catch (_) {}
  }
  return { userEmail, migrated: true, writes: written };
}

(async function main() {
  try {
    await initMongo();
    if (!fs.existsSync(DATA_DIR)) {
      console.error('No ./data directory found. Nothing to migrate.');
      process.exit(1);
    }

    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .filter(name => name.includes('@'));

    if (!entries.length) {
      console.log('No user directories found under ./data. Nothing to migrate.');
      process.exit(0);
    }

    console.log(`Found ${entries.length} user(s):`, entries.join(', '));
    const results = [];
    for (const userEmail of entries) {
      console.log(`\n=== Migrating ${userEmail} ===`);
      const r = await migrateUser(userEmail);
      results.push(r);
    }

    console.log('\n=== Migration Summary ===');
    results.forEach(r => console.log(`${r.userEmail}: ${r.migrated ? 'OK' : 'SKIP'}${r.writes != null ? ` (writes=${r.writes})` : ''}${r.reason ? ` - ${r.reason}` : ''}`));
    console.log(`\nDone${DRY_RUN ? ' (dry run)' : ''}.`);
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
})();
