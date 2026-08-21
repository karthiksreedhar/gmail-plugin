#!/usr/bin/env node
/**
 * Reclaim headroom in the per-user email documents.
 *
 * Every user's whole mailbox lives in a single MongoDB document
 * (`response_emails.emails`, `email_threads.threads`). MongoDB caps ANY single
 * document at 16MB — that is a BSON format limit, identical on every Atlas
 * tier, and no amount of paid storage raises it. Once a user's document
 * reaches it, every write for that user fails and their mailbox goes
 * read-only.
 *
 * Two reclaimable wins, neither of which changes what the user sees:
 *
 *   1. Compaction. server.js already truncates bodies (20k chars, or 1.2k for
 *      messages older than 45 days) but only on the sync write path, so users
 *      whose sync has been failing never had it applied.
 *
 *   2. HTML stripping. Html-only messages had their raw markup stored as the
 *      plain-text body (an extractEmailBody bug, now fixed). Those records hold
 *      entire HTML documents; stripping runs before truncation so the surviving
 *      text is content rather than <head> boilerplate.
 *
 *   3. De-duplication. `originalBody` was written as a copy of `body` even
 *      when identical, which for single-message threads doubled the stored
 *      size. server.js now stores it only when it genuinely differs, and
 *      resolveOriginalBody() falls back to `body` when it is absent.
 *
 * Usage:
 *   node scripts/compact-user-documents.js              # dry run, writes nothing
 *   node scripts/compact-user-documents.js --apply      # actually write
 *   node scripts/compact-user-documents.js --apply --user someone@example.com
 */

require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });
const { initMongo, getDb } = require('../db');

const BSON_LIMIT = 16 * 1024 * 1024;
const COMPACT_AGE_DAYS = 45;
const COMPACT_OLD_BODY_CHARS = 1200;
const COMPACT_MAX_BODY_CHARS = 20000;

const APPLY = process.argv.includes('--apply');
const userFlagIndex = process.argv.indexOf('--user');
const ONLY_USER = userFlagIndex !== -1 ? process.argv[userFlagIndex + 1] : null;

// Some stored "text" bodies are actually whole HTML documents: extractEmailBody
// used to return raw markup for html-only messages instead of stripping tags
// (fixed in server.js). Those records hold `<!DOCTYPE html>...` where readable
// text belongs — up to 250KB of markup for a few KB of content. Stripping runs
// BEFORE truncation, so what survives the cut is real content rather than the
// <head> boilerplate that happened to come first.
function looksLikeHtml(text) {
  return typeof text === 'string' && /<(html|body|div|table|p|br|a|span)\b/i.test(text);
}

function stripHtmlBodies(record) {
  const next = { ...record };
  let changed = false;
  for (const field of ['body', 'originalBody']) {
    if (looksLikeHtml(next[field])) {
      const plain = String(next[field]).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
      // Only accept the rewrite if it actually yielded readable text; a body
      // that strips to nothing was probably not prose to begin with.
      if (plain.length > 0) {
        next[field] = plain;
        changed = true;
      }
    }
  }
  return changed ? next : record;
}

function truncateBodies(record) {
  const cutoffMs = Date.now() - COMPACT_AGE_DAYS * 24 * 3600 * 1000;
  const isOld = new Date(record.date || 0).getTime() < cutoffMs;
  const limit = isOld ? COMPACT_OLD_BODY_CHARS : COMPACT_MAX_BODY_CHARS;
  const next = { ...record };
  let cut = false;
  for (const field of ['body', 'originalBody']) {
    if (typeof next[field] === 'string' && next[field].length > limit) {
      next[field] = next[field].slice(0, limit);
      cut = true;
    }
  }
  // Also catch records truncated by earlier runs, before the flag existed:
  // a body sitting exactly at a limit was cut, since real bodies are never
  // exactly 1200 or 20000 characters.
  const alreadyAtLimit = typeof next.body === 'string' && next.body.length === limit;
  if (cut || alreadyAtLimit) {
    // Marks the stored text as a prefix so the reader restores the rest from
    // Gmail rather than silently showing a partial message.
    next.bodyTruncated = true;
  }
  return next;
}

function dedupeOriginalBody(record) {
  if (typeof record.originalBody === 'string' && record.originalBody === record.body) {
    const next = { ...record };
    delete next.originalBody;
    return next;
  }
  return record;
}

function shrinkArray(items) {
  return (Array.isArray(items) ? items : []).map(item => {
    if (!item || typeof item !== 'object') return item;
    // Order matters: strip markup first so truncation keeps real content.
    let next = dedupeOriginalBody(truncateBodies(stripHtmlBodies(item)));
    // Thread records carry their messages inline; those bodies count too.
    if (Array.isArray(next.messages)) {
      next = {
        ...next,
        messages: next.messages.map(m => (m && typeof m === 'object' ? truncateBodies(stripHtmlBodies(m)) : m))
      };
    }
    return next;
  });
}

const bytesOf = (value) => Buffer.byteLength(JSON.stringify(value));
const mb = (bytes) => (bytes / 1048576).toFixed(2) + 'MB';
const pctOfCap = (bytes) => (bytes / BSON_LIMIT * 100).toFixed(1) + '%';

async function main() {
  await initMongo();
  const db = getDb();

  const targets = [
    { collection: 'response_emails', field: 'emails' },
    { collection: 'email_threads', field: 'threads' }
  ];

  console.log(APPLY ? '=== APPLYING CHANGES ===\n' : '=== DRY RUN (nothing will be written; pass --apply to commit) ===\n');
  console.log('  ' + 'USER'.padEnd(30) + 'COLLECTION'.padEnd(18) + 'BEFORE'.padEnd(10) + 'AFTER'.padEnd(10) + 'SAVED'.padEnd(10) + '% OF CAP');
  console.log('  ' + '-'.repeat(88));

  let totalSaved = 0;
  let documentsChanged = 0;

  for (const { collection, field } of targets) {
    const filter = ONLY_USER ? { userEmail: ONLY_USER } : {};
    const docs = await db.collection(collection).find(filter).toArray();

    for (const doc of docs) {
      const original = doc[field] || [];
      const before = bytesOf(original);
      const shrunk = shrinkArray(original);
      const after = bytesOf(shrunk);
      const saved = before - after;

      // Not `saved > 0`: a record that an earlier run already truncated gains
      // the `bodyTruncated` flag without shedding any bytes, and skipping it
      // would leave the reader unable to tell that its text is a prefix.
      if (JSON.stringify(original) === JSON.stringify(shrunk)) continue;

      totalSaved += saved;
      documentsChanged++;
      console.log(
        '  ' + String(doc.userEmail).padEnd(30) + collection.padEnd(18) +
        mb(before).padEnd(10) + mb(after).padEnd(10) + mb(saved).padEnd(10) + pctOfCap(after)
      );

      if (APPLY) {
        await db.collection(collection).updateOne(
          { userEmail: doc.userEmail },
          { $set: { [field]: shrunk, _updatedAt: new Date(), _compactedAt: new Date() } }
        );
      }
    }
  }

  console.log('\n  documents ' + (APPLY ? 'rewritten' : 'that would change') + ': ' + documentsChanged);
  console.log('  total reclaimed: ' + mb(totalSaved));
  if (!APPLY) console.log('\n  Re-run with --apply to write these changes.');
  process.exit(0);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
