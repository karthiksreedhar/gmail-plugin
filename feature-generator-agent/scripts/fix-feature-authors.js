#!/usr/bin/env node
/**
 * Reconcile feature authorship against the chat logs.
 *
 * Two bugs stamped wrong authors on generated features (both fixed):
 *   - the feature-generator defaulted unknown actors to the
 *     FEATURE_GENERATOR_CREATED_BY env value, and
 *   - the main system's save-draft fell back to the "most recent login"
 *     global when no author was passed.
 *
 * The chat logs recorded the real userEmail on every generation turn, so for
 * each feature the EARLIEST chat-log entry that references its featureId is
 * the best evidence of who actually built it. This script compares that
 * against generated_features.createdBy and (with --apply) corrects mismatches.
 *
 * Usage:
 *   node scripts/fix-feature-authors.js            # dry run, prints the table
 *   node scripts/fix-feature-authors.js --apply    # write corrections
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const APPLY = process.argv.includes('--apply');
const CHAT_LOGS = process.env.FEATURE_CHAT_LOG_COLLECTION || 'feature_generator_chat_logs';
// Log entries whose author is one of these are attribution FALLBACKS, not
// evidence: they can never prove authorship, only real user emails can.
const UNTRUSTWORTHY = new Set([
  'unknown@feature-generator.local',
  String(process.env.FEATURE_GENERATOR_CREATED_BY || '').trim().toLowerCase()
].filter(Boolean));

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'gmail_plugin');

  const features = await db.collection('generated_features')
    .find({}, { projection: { featureId: 1, createdBy: 1, name: 1 } }).toArray();

  console.log(APPLY ? '=== APPLYING AUTHOR CORRECTIONS ===\n' : '=== DRY RUN (pass --apply to write) ===\n');
  console.log('  ' + 'FEATURE'.padEnd(34) + 'RECORDED AUTHOR'.padEnd(32) + 'LOG EVIDENCE'.padEnd(32) + 'VERDICT');
  console.log('  ' + '-'.repeat(110));

  let corrected = 0;
  for (const feature of features) {
    const recorded = String(feature.createdBy || '').trim().toLowerCase() || '(none)';

    // Earliest log entry for this feature with a real (non-fallback) author.
    const log = await db.collection(CHAT_LOGS)
      .find({ featureId: feature.featureId, userEmail: { $nin: [null, ''] } })
      .sort({ at: 1, _id: 1 })
      .limit(20)
      .toArray();
    const evidence = log
      .map(entry => String(entry.userEmail || '').trim().toLowerCase())
      .find(email => email && email.includes('@') && !UNTRUSTWORTHY.has(email)) || null;

    let verdict;
    if (!evidence) {
      verdict = 'no evidence — left as is';
    } else if (evidence === recorded) {
      verdict = 'consistent';
    } else if (UNTRUSTWORTHY.has(recorded) || recorded === '(none)') {
      verdict = APPLY ? 'CORRECTED' : 'WOULD CORRECT';
      if (APPLY) {
        await db.collection('generated_features').updateOne(
          { featureId: feature.featureId },
          { $set: { createdBy: evidence, authorCorrectedAt: new Date(), authorCorrectedFrom: recorded } }
        );
        corrected++;
      }
    } else {
      // Recorded author is a real user but differs from the earliest log --
      // ambiguous (e.g. a feature legitimately built on someone's behalf).
      // Never auto-correct real-user vs real-user; a human should decide.
      verdict = 'CONFLICT — review manually';
    }

    console.log('  ' + String(feature.featureId).slice(0, 32).padEnd(34) + recorded.padEnd(32) + String(evidence || '—').padEnd(32) + verdict);
  }

  console.log(`\n  ${APPLY ? 'corrected' : 'would correct'}: ${corrected === 0 && !APPLY ? 'see verdicts above' : corrected}`);
  await client.close();
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });
