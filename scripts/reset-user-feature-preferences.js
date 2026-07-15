/**
 * Reset (or just inspect) one user's feature-visibility preferences.
 *
 * Deletes every doc in user_feature_preferences for the given user, so
 * every feature falls back to the default (visible:false, enabled:false)
 * with nothing left over from before the default/race-condition fixes.
 *
 * Usage:
 *   node scripts/reset-user-feature-preferences.js user@example.com          (dry run: lists what would be deleted)
 *   node scripts/reset-user-feature-preferences.js user@example.com --apply  (actually deletes)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initMongo, getDb, listUserFeaturePreferences } = require('../db');

async function main() {
  const userEmail = String(process.argv[2] || '').trim().toLowerCase();
  const apply = process.argv.includes('--apply');

  if (!userEmail || !userEmail.includes('@')) {
    console.error('Usage: node scripts/reset-user-feature-preferences.js <userEmail> [--apply]');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await initMongo();
  console.log('Connected.\n');

  const existing = await listUserFeaturePreferences(userEmail);

  if (existing.length === 0) {
    console.log(`No user_feature_preferences docs found for ${userEmail}.`);
    console.log('Nothing to reset — she is already relying on the default (hidden).');
    process.exit(0);
  }

  console.log(`Found ${existing.length} preference doc(s) for ${userEmail}:\n`);
  existing.forEach(doc => {
    console.log(`  featureId=${doc.featureId}  visible=${doc.visible}  enabled=${doc.enabled}  pinned=${doc.pinned}`);
  });

  if (!apply) {
    console.log('\nDry run only — no changes made. Re-run with --apply to delete these docs.');
    process.exit(0);
  }

  const db = getDb();
  const result = await db.collection('user_feature_preferences').deleteMany({ userEmail });
  console.log(`\nDeleted ${result.deletedCount} preference doc(s) for ${userEmail}.`);
  console.log('She will now see nothing until she explicitly opts into a feature.');
  process.exit(0);
}

main().catch(error => {
  console.error('Failed to reset feature preferences:', error);
  process.exit(1);
});
