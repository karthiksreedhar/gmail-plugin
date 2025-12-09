#!/usr/bin/env node

/**
 * Deduplicate priority-emails-5000.json files by grouping emails into threads
 * based on normalized subject (strip Re:, Fwd:, etc.) and keeping only the
 * latest email per thread.
 */

const fs = require('fs');
const path = require('path');

// Normalize subject to group thread emails together
function normalizeSubject(subject) {
  return String(subject || '')
    .replace(/^(Re|RE|Fwd|FWD|Fw):\s*/gi, '') // Remove Re:, Fwd:, etc.
    .replace(/^(Re|RE|Fwd|FWD|Fw):\s*/gi, '') // Strip again for "Re: Re:"
    .replace(/^(Re|RE|Fwd|FWD|Fw):\s*/gi, '') // And again for "Re: Re: Re:"
    .toLowerCase()
    .trim();
}

function deduplicateEmails(emails) {
  console.log(`\nProcessing ${emails.length} emails...`);
  
  // Group by normalized subject
  const threadMap = new Map();
  
  emails.forEach(email => {
    const key = normalizeSubject(email.subject);
    
    if (!threadMap.has(key)) {
      threadMap.set(key, []);
    }
    threadMap.get(key).push(email);
  });
  
  console.log(`Found ${threadMap.size} unique threads`);
  
  // For each thread, keep only the latest email
  const deduplicated = [];
  let duplicatesRemoved = 0;
  
  for (const [subject, threadEmails] of threadMap.entries()) {
    if (threadEmails.length > 1) {
      // Sort by date descending (most recent first)
      threadEmails.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      
      // Keep the most recent one
      deduplicated.push(threadEmails[0]);
      duplicatesRemoved += (threadEmails.length - 1);
      
      console.log(`  Thread "${subject.slice(0, 60)}...": kept 1 of ${threadEmails.length} emails`);
    } else {
      deduplicated.push(threadEmails[0]);
    }
  }
  
  console.log(`\nRemoved ${duplicatesRemoved} duplicate emails from threads`);
  console.log(`Result: ${deduplicated.length} unique thread representatives`);
  
  // Sort final list by date descending
  return deduplicated.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function processUserFile(userEmail) {
  const filePath = path.join(__dirname, '..', 'data', userEmail, 'priority-emails-5000.json');
  
  if (!fs.existsSync(filePath)) {
    console.log(`\n❌ File not found: ${filePath}`);
    return;
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Processing: ${userEmail}`);
  console.log('='.repeat(70));
  
  // Read file
  const rawData = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(rawData);
  
  // Handle both array format and object with emails property
  let emails;
  let metadata = null;
  
  if (Array.isArray(data)) {
    emails = data;
  } else if (data && Array.isArray(data.emails)) {
    emails = data.emails;
    metadata = data.metadata || null;
  } else {
    console.log('❌ File does not contain emails in expected format');
    return;
  }
  
  // Deduplicate
  const deduplicated = deduplicateEmails(emails);
  
  // Create backup
  const backupPath = filePath + '.backup';
  fs.writeFileSync(backupPath, rawData, 'utf8');
  console.log(`\n✅ Backup saved to: ${backupPath}`);
  
  // Write deduplicated file - preserve original structure
  let outputData;
  if (metadata) {
    outputData = {
      metadata: {
        ...metadata,
        totalEmails: deduplicated.length,
        deduplicatedAt: new Date().toISOString(),
        originalCount: emails.length
      },
      emails: deduplicated
    };
  } else {
    outputData = deduplicated;
  }
  
  fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2), 'utf8');
  console.log(`✅ Deduplicated file saved: ${filePath}`);
  console.log(`   Before: ${emails.length} emails`);
  console.log(`   After:  ${deduplicated.length} emails (${emails.length - deduplicated.length} removed)`);
}

// Main execution
console.log('\n🔄 Email Thread Deduplication Script');
console.log('This will group emails by thread and keep only the latest email per thread\n');

// Process all user directories
const dataDir = path.join(__dirname, '..', 'data');
const users = fs.readdirSync(dataDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory() && dirent.name.includes('@'))
  .map(dirent => dirent.name);

console.log(`Found ${users.length} user(s): ${users.join(', ')}`);

users.forEach(processUserFile);

console.log(`\n${'='.repeat(70)}`);
console.log('✅ Deduplication complete!');
console.log('='.repeat(70));
