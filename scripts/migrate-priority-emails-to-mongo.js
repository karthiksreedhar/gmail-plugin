#!/usr/bin/env node

/**
 * Migrate priority-emails-5000.json files to MongoDB
 * Collection: priority_emails_{userEmail}
 */

const fs = require('fs');
const path = require('path');
const { initMongo, setUserDoc, getUserDoc } = require('../db');

async function migratePriorityEmails(userEmail) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Migrating priority emails for: ${userEmail}`);
  console.log('='.repeat(70));

  const filePath = path.join(__dirname, '..', 'data', userEmail, 'priority-emails-5000.json');
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${filePath}`);
    return { success: false, error: 'File not found' };
  }

  try {
    // Read the JSON file
    const rawData = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(rawData);
    
    // Extract emails and metadata
    let emails, metadata;
    if (Array.isArray(data)) {
      emails = data;
      metadata = {
        user: userEmail,
        totalEmails: data.length,
        migratedAt: new Date().toISOString()
      };
    } else if (data && Array.isArray(data.emails)) {
      emails = data.emails;
      metadata = {
        ...data.metadata,
        user: userEmail,
        migratedAt: new Date().toISOString()
      };
    } else {
      throw new Error('Invalid file format');
    }

    console.log(`Found ${emails.length} emails to migrate`);

    // Trim email bodies to fit within MongoDB 16MB limit
    // Keep body to max 2000 chars per email
    const trimmedEmails = emails.map(e => ({
      ...e,
      body: typeof e.body === 'string' ? e.body.slice(0, 2000) : e.body,
      snippet: e.snippet || (typeof e.body === 'string' ? e.body.slice(0, 200) : '')
    }));

    // Check if already exists in MongoDB
    const existing = await getUserDoc('priority_emails', userEmail);
    if (existing) {
      console.log(`⚠️  Priority emails already exist in MongoDB for ${userEmail}`);
      console.log(`   Existing: ${existing.emails?.length || 0} emails`);
      console.log(`   Will overwrite with ${trimmedEmails.length} emails`);
    }

    // Store in MongoDB
    const docToStore = {
      metadata,
      emails: trimmedEmails,
      updatedAt: new Date().toISOString()
    };

    await setUserDoc('priority_emails', userEmail, docToStore);
    
    console.log(`✅ Successfully migrated ${emails.length} priority emails to MongoDB`);
    console.log(`   Collection: priority_emails`);
    console.log(`   User: ${userEmail}`);
    
    return { success: true, count: emails.length };
  } catch (error) {
    console.error(`❌ Error migrating ${userEmail}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('\n🔄 Priority Emails MongoDB Migration Script');
  console.log('This will migrate deduplicated priority emails to MongoDB\n');

  try {
    // Initialize MongoDB connection
    console.log('Connecting to MongoDB...');
    await initMongo();
    console.log('✅ Connected to MongoDB\n');

    // Find all user directories
    const dataDir = path.join(__dirname, '..', 'data');
    const users = fs.readdirSync(dataDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name.includes('@'))
      .map(dirent => dirent.name);

    console.log(`Found ${users.length} user(s): ${users.join(', ')}\n`);

    // Migrate each user
    const results = [];
    for (const userEmail of users) {
      const result = await migratePriorityEmails(userEmail);
      results.push({ userEmail, ...result });
    }

    // Summary
    console.log(`\n${'='.repeat(70)}`);
    console.log('Migration Summary:');
    console.log('='.repeat(70));
    
    results.forEach(r => {
      if (r.success) {
        console.log(`✅ ${r.userEmail}: ${r.count} emails migrated`);
      } else {
        console.log(`❌ ${r.userEmail}: ${r.error}`);
      }
    });

    const successCount = results.filter(r => r.success).length;
    console.log(`\n${successCount}/${results.length} users migrated successfully`);
    console.log('='.repeat(70));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
