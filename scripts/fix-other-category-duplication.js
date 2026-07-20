/**
 * Fix emails whose `categories` array contains BOTH "Other" and a real
 * category, caused by a bug in DELETE /api/categories/:name that appended
 * "Other" onto EVERY email in the account any time ANY category was
 * deleted -- not just emails that actually had the deleted category.
 *
 * Rule (matches what the main app already expects): if a record has
 * "Other" plus at least one non-Other value, drop "Other" and keep only
 * the real value(s). If "Other" is the ONLY value present, leave it
 * untouched -- it's genuinely uncategorized.
 *
 * Checks both response_emails and unreplied_emails (both collections were
 * touched by the buggy endpoint).
 *
 * Usage:
 *   node scripts/fix-other-category-duplication.js
 *     Scans ALL known users (from oauth_tokens), reports how many affected
 *     records each has. Read-only, no changes made.
 *
 *   node scripts/fix-other-category-duplication.js user@example.com
 *     Dry run for one user: lists every affected email (subject, before ->
 *     after) without changing anything.
 *
 *   node scripts/fix-other-category-duplication.js user@example.com --apply
 *     Actually fixes that one user's data. --apply always requires a
 *     specific userEmail -- there is no single-command "fix everyone" to
 *     avoid a wide blast radius from one invocation.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initMongo, getDb, getUserDoc, setUserDoc } = require('../db');

function isOtherName(c) {
  return String(c || '').trim().toLowerCase() === 'other';
}

// Returns null if the record needs no change, otherwise the corrected
// { category, categories } to write back.
function computeFix(rec) {
  const arr = Array.isArray(rec.categories) && rec.categories.length
    ? rec.categories
    : (rec.category ? [rec.category] : []);

  const hasOther = arr.some(isOtherName);
  const nonOther = arr.filter(c => !isOtherName(c));

  if (!hasOther || nonOther.length === 0) {
    return null; // no "Other" present, or "Other" genuinely the only category -- leave alone
  }

  const seen = new Set();
  const cleaned = [];
  for (const c of nonOther) {
    const k = String(c || '').trim().toLowerCase();
    if (k && !seen.has(k)) { seen.add(k); cleaned.push(c); }
  }

  const nextCategory = isOtherName(rec.category) ? cleaned[0] : (rec.category || cleaned[0]);
  return { category: nextCategory, categories: cleaned };
}

async function scanCollection(userEmail, collectionName) {
  const doc = await getUserDoc(collectionName, userEmail);
  const emails = Array.isArray(doc?.emails) ? doc.emails : [];
  const affected = [];
  emails.forEach((rec, idx) => {
    const fix = computeFix(rec);
    if (fix) affected.push({ idx, rec, fix });
  });
  return { emails, affected };
}

async function getAllKnownUsers() {
  const db = getDb();
  const rows = await db.collection('oauth_tokens').find({}).project({ userEmail: 1 }).toArray();
  return Array.from(new Set(rows.map(r => String(r?.userEmail || '').trim().toLowerCase()).filter(Boolean)));
}

async function reportForUser(userEmail) {
  const responseScan = await scanCollection(userEmail, 'response_emails');
  const unrepliedScan = await scanCollection(userEmail, 'unreplied_emails');
  return { userEmail, responseScan, unrepliedScan };
}

async function main() {
  const userEmailArg = String(process.argv[2] || '').trim().toLowerCase();
  const apply = process.argv.includes('--apply');

  if (apply && !userEmailArg) {
    console.error('--apply requires a specific userEmail. Usage: node scripts/fix-other-category-duplication.js <userEmail> --apply');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await initMongo();
  console.log('Connected.\n');

  if (!userEmailArg) {
    // Report mode across all users -- read-only.
    const users = await getAllKnownUsers();
    console.log(`Found ${users.length} known user(s). Scanning for affected records (read-only)...\n`);

    let anyAffected = false;
    for (const userEmail of users) {
      const { responseScan, unrepliedScan } = await reportForUser(userEmail);
      const total = responseScan.affected.length + unrepliedScan.affected.length;
      if (total > 0) {
        anyAffected = true;
        console.log(`  ${userEmail}: ${responseScan.affected.length} response_emails, ${unrepliedScan.affected.length} unreplied_emails affected`);
      } else {
        console.log(`  ${userEmail}: none affected`);
      }
    }

    if (!anyAffected) {
      console.log('\nNo affected records found for any user.');
    } else {
      console.log('\nRe-run with a specific userEmail to see per-email detail, then add --apply to fix that user.');
    }
    process.exit(0);
  }

  // Single-user mode (dry run or --apply)
  const { responseScan, unrepliedScan } = await reportForUser(userEmailArg);
  const total = responseScan.affected.length + unrepliedScan.affected.length;

  if (total === 0) {
    console.log(`No affected records found for ${userEmailArg}.`);
    process.exit(0);
  }

  console.log(`response_emails: ${responseScan.affected.length} affected record(s)`);
  responseScan.affected.forEach(({ rec, fix }) => {
    console.log(`  "${rec.subject || rec.id}"  categories: ${JSON.stringify(rec.categories)} -> ${JSON.stringify(fix.categories)}`);
  });

  console.log(`\nunreplied_emails: ${unrepliedScan.affected.length} affected record(s)`);
  unrepliedScan.affected.forEach(({ rec, fix }) => {
    console.log(`  "${rec.subject || rec.id}"  categories: ${JSON.stringify(rec.categories)} -> ${JSON.stringify(fix.categories)}`);
  });

  if (!apply) {
    console.log(`\nDry run only — no changes made. ${total} record(s) would be fixed.`);
    console.log(`Re-run with --apply to write these changes for ${userEmailArg}.`);
    process.exit(0);
  }

  if (responseScan.affected.length > 0) {
    const nextEmails = responseScan.emails.slice();
    responseScan.affected.forEach(({ idx, fix }) => {
      nextEmails[idx] = { ...nextEmails[idx], ...fix };
    });
    await setUserDoc('response_emails', userEmailArg, { emails: nextEmails });
  }

  if (unrepliedScan.affected.length > 0) {
    const nextEmails = unrepliedScan.emails.slice();
    unrepliedScan.affected.forEach(({ idx, fix }) => {
      nextEmails[idx] = { ...nextEmails[idx], ...fix };
    });
    await setUserDoc('unreplied_emails', userEmailArg, { emails: nextEmails });
  }

  console.log(`\nFixed ${total} record(s) for ${userEmailArg}.`);
  process.exit(0);
}

main().catch(error => {
  console.error('Failed to fix category duplication:', error);
  process.exit(1);
});
