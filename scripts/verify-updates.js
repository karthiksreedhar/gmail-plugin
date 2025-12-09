#!/usr/bin/env node

/**
 * Verify the category updates for both emails
 */

const fs = require('fs');
const path = require('path');
const { initMongo, getUserDoc } = require('../db');

const USER_EMAIL = 'lc3251@columbia.edu';
const USER_DATA_DIR = path.join(__dirname, '..', 'data', USER_EMAIL);

async function verifyLocalFile(filePath, collectionKey, emailName, matcher) {
  if (!fs.existsSync(filePath)) {
    return { found: false, error: 'File not found' };
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const items = Array.isArray(data[collectionKey]) ? data[collectionKey] : [];
    
    const found = items.find(matcher);
    if (found) {
      return {
        found: true,
        subject: found.subject,
        from: found.from || found.originalFrom,
        category: found.category
      };
    }
    return { found: false };
  } catch (error) {
    return { found: false, error: error.message };
  }
}

async function verifyMongoCollection(collectionName, emailName, matcher) {
  try {
    const doc = await getUserDoc(collectionName, USER_EMAIL);
    if (!doc) {
      return { found: false, error: 'No MongoDB doc found' };
    }

    const items = Array.isArray(doc.emails) ? doc.emails : 
                  Array.isArray(doc.threads) ? doc.threads : [];
    
    const found = items.find(matcher);
    if (found) {
      return {
        found: true,
        subject: found.subject,
        from: found.from || found.originalFrom,
        category: found.category
      };
    }
    return { found: false };
  } catch (error) {
    return { found: false, error: error.message };
  }
}

async function main() {
  console.log('\n🔍 Verifying Category Updates for lc3251@columbia.edu');
  console.log('='.repeat(70));

  try {
    await initMongo();
    console.log('✅ Connected to MongoDB\n');

    // Define matchers for both emails
    const maddisonMatcher = (email) => {
      const from = String(email.from || email.originalFrom || '').toLowerCase();
      const subject = String(email.subject || '').toLowerCase();
      return from.includes('maddison') && from.includes('hoveida') && 
             subject.includes('request to access summer course grades');
    };

    const lanceMatcher = (email) => {
      const from = String(email.from || email.originalFrom || '').toLowerCase();
      const subject = String(email.subject || '').toLowerCase();
      return from.includes('lance.weiler@columbia.edu') && 
             (subject.includes('recreating your bot on the web') || 
              subject === 're: recreating your bot on the web');
    };

    // Verify Email 1: Maddison Hoveida
    console.log('📧 Email 1: Maddison Hoveida - "Request to Access Summer Course Grades"');
    console.log('-'.repeat(70));
    
    const maddison_local = await verifyLocalFile(
      path.join(USER_DATA_DIR, 'unreplied-emails.json'),
      'emails',
      'Maddison',
      maddisonMatcher
    );
    
    const maddison_mongo = await verifyMongoCollection(
      'unreplied_emails',
      'Maddison',
      maddisonMatcher
    );

    if (maddison_local.found) {
      console.log(`✅ LOCAL: Found in unreplied-emails.json`);
      console.log(`   Category: ${maddison_local.category}`);
      console.log(`   From: ${maddison_local.from}`);
    } else {
      console.log(`❌ LOCAL: Not found`);
    }

    if (maddison_mongo.found) {
      console.log(`✅ MONGO: Found in unreplied_emails collection`);
      console.log(`   Category: ${maddison_mongo.category}`);
      console.log(`   From: ${maddison_mongo.from}`);
    } else {
      console.log(`❌ MONGO: Not found`);
    }

    // Verify Email 2: Lance Weiler
    console.log('\n📧 Email 2: Lance Weiler - "Re: recreating your bot on the web"');
    console.log('-'.repeat(70));
    
    const lance_local = await verifyLocalFile(
      path.join(USER_DATA_DIR, 'unreplied-emails.json'),
      'emails',
      'Lance',
      lanceMatcher
    );
    
    const lance_mongo = await verifyMongoCollection(
      'unreplied_emails',
      'Lance',
      lanceMatcher
    );

    if (lance_local.found) {
      console.log(`✅ LOCAL: Found in unreplied-emails.json`);
      console.log(`   Category: ${lance_local.category}`);
      console.log(`   From: ${lance_local.from}`);
    } else {
      console.log(`❌ LOCAL: Not found`);
    }

    if (lance_mongo.found) {
      console.log(`✅ MONGO: Found in unreplied_emails collection`);
      console.log(`   Category: ${lance_mongo.category}`);
      console.log(`   From: ${lance_mongo.from}`);
    } else {
      console.log(`❌ MONGO: Not found`);
    }

    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 Verification Summary:');
    console.log('='.repeat(70));
    
    const allGood = 
      maddison_local.found && maddison_local.category === 'DS3' &&
      maddison_mongo.found && maddison_mongo.category === 'DS3' &&
      lance_local.found && lance_local.category === 'DS3' &&
      lance_mongo.found && lance_mongo.category === 'DS3';

    if (allGood) {
      console.log('\n✅ SUCCESS: Both emails updated to "DS3" in both local files and MongoDB!');
    } else {
      console.log('\n⚠️  WARNING: Some updates may not have been applied correctly.');
      console.log('Please review the details above.');
    }
    console.log('='.repeat(70));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
