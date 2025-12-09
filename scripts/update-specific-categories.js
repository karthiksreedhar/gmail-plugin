#!/usr/bin/env node

/**
 * Update specific email categories for lc3251@columbia.edu
 * - Updates both local JSON files and MongoDB
 */

const fs = require('fs');
const path = require('path');
const { initMongo, getUserDoc, setUserDoc } = require('../db');

const USER_EMAIL = 'lc3251@columbia.edu';
const USER_DATA_DIR = path.join(__dirname, '..', 'data', USER_EMAIL);

// Define the updates to make
const UPDATES = [
  {
    description: 'Maddison Hoveida - Request to Access Summer Course Grades',
    matcher: (email) => {
      // Check both from and originalFrom to handle both unreplied and response emails
      const from = String(email.from || '').toLowerCase();
      const originalFrom = String(email.originalFrom || '').toLowerCase();
      const subject = String(email.subject || '').toLowerCase();
      const fromMatch = (from.includes('maddison') && from.includes('hoveida')) ||
                        (originalFrom.includes('maddison') && originalFrom.includes('hoveida'));
      return fromMatch && subject.includes('request to access summer course grades');
    },
    newCategory: 'DS3'
  },
  {
    description: 'Lance Weiler - recreating your bot on the web',
    matcher: (email) => {
      // Check both from and originalFrom to handle both unreplied and response emails
      const from = String(email.from || '').toLowerCase();
      const originalFrom = String(email.originalFrom || '').toLowerCase();
      const subject = String(email.subject || '').toLowerCase();
      const fromMatch = from.includes('lance.weiler@columbia.edu') ||
                        originalFrom.includes('lance.weiler@columbia.edu');
      return fromMatch && 
             (subject.includes('recreating your bot on the web') || 
              subject === 're: recreating your bot on the web');
    },
    newCategory: 'DS3'
  }
];

async function updateLocalFile(filePath, collectionKey, updateFn) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  File not found: ${path.basename(filePath)}`);
    return { updated: 0, total: 0 };
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const items = Array.isArray(data[collectionKey]) ? data[collectionKey] : [];
    let updatedCount = 0;

    const updatedItems = items.map(item => {
      const result = updateFn(item);
      if (result.updated) {
        updatedCount++;
        console.log(`    ✓ Updated: "${result.item.subject}" (${result.oldCategory} → ${result.item.category})`);
        return result.item;
      }
      return item;
    });

    if (updatedCount > 0) {
      data[collectionKey] = updatedItems;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    return { updated: updatedCount, total: items.length };
  } catch (error) {
    console.error(`  ❌ Error updating ${path.basename(filePath)}:`, error.message);
    return { updated: 0, total: 0, error: error.message };
  }
}

async function updateMongoCollection(collectionName, updateFn) {
  try {
    const doc = await getUserDoc(collectionName, USER_EMAIL);
    if (!doc) {
      console.log(`  ⚠️  No MongoDB doc found for ${collectionName}`);
      return { updated: 0, total: 0 };
    }

    const items = Array.isArray(doc.emails) ? doc.emails : 
                  Array.isArray(doc.threads) ? doc.threads : [];
    let updatedCount = 0;

    const updatedItems = items.map(item => {
      const result = updateFn(item);
      if (result.updated) {
        updatedCount++;
        console.log(`    ✓ Updated: "${result.item.subject}" (${result.oldCategory} → ${result.item.category})`);
        return result.item;
      }
      return item;
    });

    if (updatedCount > 0) {
      const key = Array.isArray(doc.emails) ? 'emails' : 'threads';
      await setUserDoc(collectionName, USER_EMAIL, {
        ...doc,
        [key]: updatedItems,
        _manualUpdate: new Date().toISOString()
      });
    }

    return { updated: updatedCount, total: items.length };
  } catch (error) {
    console.error(`  ❌ Error updating MongoDB ${collectionName}:`, error.message);
    return { updated: 0, total: 0, error: error.message };
  }
}

function createUpdateFunction(updates) {
  return (item) => {
    for (const update of updates) {
      if (update.matcher(item)) {
        const oldCategory = item.category || 'None';
        if (oldCategory !== update.newCategory) {
          return {
            updated: true,
            item: { ...item, category: update.newCategory },
            oldCategory
          };
        }
      }
    }
    return { updated: false, item };
  };
}

async function main() {
  console.log('\n🔄 Updating Specific Email Categories');
  console.log(`User: ${USER_EMAIL}`);
  console.log('='.repeat(70));

  try {
    // Connect to MongoDB
    console.log('\n📡 Connecting to MongoDB...');
    await initMongo();
    console.log('✅ Connected to MongoDB\n');

    const updateFn = createUpdateFunction(UPDATES);
    const results = {};

    // 1. Update response-emails.json and MongoDB
    console.log('📝 Updating response-emails.json...');
    results.responseLocal = await updateLocalFile(
      path.join(USER_DATA_DIR, 'response-emails.json'),
      'emails',
      updateFn
    );

    console.log('\n📝 Updating response_emails in MongoDB...');
    results.responseMongo = await updateMongoCollection('response_emails', updateFn);

    // 2. Update email-threads.json and MongoDB
    console.log('\n📝 Updating email-threads.json...');
    results.threadsLocal = await updateLocalFile(
      path.join(USER_DATA_DIR, 'email-threads.json'),
      'threads',
      updateFn
    );

    console.log('\n📝 Updating email_threads in MongoDB...');
    results.threadsMongo = await updateMongoCollection('email_threads', updateFn);

    // 3. Update unreplied-emails.json and MongoDB
    console.log('\n📝 Updating unreplied-emails.json...');
    results.unrepliedLocal = await updateLocalFile(
      path.join(USER_DATA_DIR, 'unreplied-emails.json'),
      'emails',
      updateFn
    );

    console.log('\n📝 Updating unreplied_emails in MongoDB...');
    results.unrepliedMongo = await updateMongoCollection('unreplied_emails', updateFn);

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 Summary:');
    console.log('='.repeat(70));
    
    const totalUpdated = 
      (results.responseLocal?.updated || 0) +
      (results.responseMongo?.updated || 0) +
      (results.threadsLocal?.updated || 0) +
      (results.threadsMongo?.updated || 0) +
      (results.unrepliedLocal?.updated || 0) +
      (results.unrepliedMongo?.updated || 0);

    console.log(`\nLocal Files:`);
    console.log(`  response-emails.json: ${results.responseLocal?.updated || 0}/${results.responseLocal?.total || 0} updated`);
    console.log(`  email-threads.json:   ${results.threadsLocal?.updated || 0}/${results.threadsLocal?.total || 0} updated`);
    console.log(`  unreplied-emails.json: ${results.unrepliedLocal?.updated || 0}/${results.unrepliedLocal?.total || 0} updated`);
    
    console.log(`\nMongoDB Collections:`);
    console.log(`  response_emails:  ${results.responseMongo?.updated || 0}/${results.responseMongo?.total || 0} updated`);
    console.log(`  email_threads:    ${results.threadsMongo?.updated || 0}/${results.threadsMongo?.total || 0} updated`);
    console.log(`  unreplied_emails: ${results.unrepliedMongo?.updated || 0}/${results.unrepliedMongo?.total || 0} updated`);
    
    console.log(`\n✅ Total updates: ${totalUpdated}`);
    console.log('='.repeat(70));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
