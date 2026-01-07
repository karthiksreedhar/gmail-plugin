/**
 * Pre-categorize Priority Emails Script
 * 
 * This script loads the 100 earliest emails from the priority_emails collection,
 * runs them through the classifier-v4 to get category suggestions, and stores
 * the pre-computed results in MongoDB for fast retrieval on system load.
 * 
 * Usage: node scripts/precategorize-priority-emails.js [count]
 *   count: Number of earliest emails to pre-categorize (default: 100)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initMongo, getUserDoc, setUserDoc, getDb } = require('../db');

// Default user email (can be overridden by environment variable)
const USER_EMAIL = process.env.CURRENT_USER_EMAIL || 'ks4190@columbia.edu';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function loadPriorityEmails() {
  console.log(`Loading priority emails for user: ${USER_EMAIL}`);
  
  try {
    const doc = await getUserDoc('priority_emails', USER_EMAIL);
    if (doc && Array.isArray(doc.emails)) {
      console.log(`Loaded ${doc.emails.length} priority emails from MongoDB`);
      return doc.emails;
    }
  } catch (err) {
    console.warn('MongoDB load failed:', err?.message || err);
  }
  
  // Fallback to local JSON file
  const fs = require('fs');
  const jsonPath = path.join(__dirname, '..', 'data', USER_EMAIL, 'priority-emails-5000.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.emails) ? raw.emails : []);
      console.log(`Loaded ${list.length} priority emails from JSON file (fallback)`);
      return list;
    } catch (err) {
      console.error('Failed to load from JSON file:', err?.message || err);
    }
  }
  
  return [];
}

async function loadExistingDbIds() {
  // Load IDs from response_emails, email_threads, unreplied_emails to exclude already-processed items
  const existingIds = new Set();
  
  try {
    const responses = await getUserDoc('response_emails', USER_EMAIL);
    if (responses && Array.isArray(responses.emails)) {
      responses.emails.forEach(e => e && e.id && existingIds.add(e.id));
    }
  } catch (_) {}
  
  try {
    const threads = await getUserDoc('email_threads', USER_EMAIL);
    if (threads && Array.isArray(threads.threads)) {
      threads.threads.forEach(t => {
        if (t && t.responseId) existingIds.add(t.responseId);
        if (Array.isArray(t?.messages)) {
          t.messages.forEach(m => m && m.id && existingIds.add(m.id));
        }
      });
    }
  } catch (_) {}
  
  try {
    const unreplied = await getUserDoc('unreplied_emails', USER_EMAIL);
    if (unreplied && Array.isArray(unreplied.emails)) {
      unreplied.emails.forEach(e => e && e.id && existingIds.add(e.id));
    }
  } catch (_) {}
  
  console.log(`Found ${existingIds.size} existing email IDs in database`);
  return existingIds;
}

async function classifyEmails(emails) {
  console.log(`\nClassifying ${emails.length} emails using classifier-v4...`);
  
  const payload = {
    emails: emails.map(e => ({
      id: e.id,
      subject: e.subject || 'No Subject',
      body: e.body || e.snippet || '',
      from: e.from || e.originalFrom || 'Unknown Sender'
    }))
  };
  
  try {
    const resp = await fetch(`${BASE_URL}/api/classifier-v4/suggest-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    
    const data = await resp.json();
    if (!data.success || !data.results) {
      throw new Error('Invalid response from classifier');
    }
    
    console.log(`Successfully classified ${Object.keys(data.results).length} emails`);
    return data.results;
  } catch (err) {
    console.error('Classification failed:', err?.message || err);
    return {};
  }
}

async function savePrecategorizedEmails(emails, classifications) {
  // Enrich emails with classification results
  const enriched = emails.map(e => {
    const r = classifications[e.id] || {};
    const suggestion = r.suggestion || '';
    const contenders = Array.isArray(r.contenders) ? r.contenders : [];
    const rationales = (r.rationales && typeof r.rationales === 'object') ? r.rationales : {};
    const explanation = r.explanation || '';
    
    // Build suggestedCategories array
    let suggestedCategories = [];
    if (suggestion) {
      suggestedCategories = [suggestion, ...contenders.filter(c => c && c !== suggestion)].slice(0, 2);
    } else if (contenders.length) {
      suggestedCategories = contenders.slice(0, 2);
    }
    
    // Build reasons map
    const suggestedReasons = {};
    if (explanation && suggestion) {
      suggestedReasons[suggestion] = explanation;
    }
    Object.assign(suggestedReasons, rationales);
    
    return {
      ...e,
      suggestedCategories,
      suggestedReasons,
      category: suggestion || (suggestedCategories[0] || 'Other'),
      _precategorizedAt: new Date().toISOString()
    };
  });
  
  // Save to MongoDB collection 'precategorized_emails'
  try {
    await setUserDoc('precategorized_emails', USER_EMAIL, {
      emails: enriched,
      count: enriched.length,
      generatedAt: new Date().toISOString()
    });
    console.log(`\nSaved ${enriched.length} pre-categorized emails to MongoDB (precategorized_emails)`);
  } catch (err) {
    console.error('Failed to save to MongoDB:', err?.message || err);
  }
  
  // Also save to local JSON for offline access
  const fs = require('fs');
  const outputDir = path.join(__dirname, '..', 'data', USER_EMAIL);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, 'precategorized-emails.json');
  fs.writeFileSync(outputPath, JSON.stringify({ 
    emails: enriched, 
    count: enriched.length,
    generatedAt: new Date().toISOString() 
  }, null, 2));
  console.log(`Saved to local file: ${outputPath}`);
  
  return enriched;
}

async function main() {
  const count = parseInt(process.argv[2], 10) || 100;
  console.log(`\n=== Pre-categorize Priority Emails ===`);
  console.log(`Target: ${count} earliest emails`);
  console.log(`User: ${USER_EMAIL}`);
  console.log(`API: ${BASE_URL}`);
  console.log('');
  
  // Initialize MongoDB
  await initMongo();
  
  // Load priority emails
  const allEmails = await loadPriorityEmails();
  if (allEmails.length === 0) {
    console.log('No priority emails found. Exiting.');
    process.exit(0);
  }
  
  // Load existing IDs to exclude
  const existingIds = await loadExistingDbIds();
  
  // Filter out already-processed emails
  const newEmails = allEmails.filter(e => e && e.id && !existingIds.has(e.id));
  console.log(`${newEmails.length} emails not yet in database`);
  
  // Sort by date (earliest first)
  newEmails.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  
  // Take the first N
  const targetEmails = newEmails.slice(0, count);
  console.log(`\nProcessing ${targetEmails.length} earliest emails...`);
  
  if (targetEmails.length === 0) {
    console.log('No new emails to categorize. Exiting.');
    process.exit(0);
  }
  
  // Log date range
  const earliest = targetEmails[0];
  const latest = targetEmails[targetEmails.length - 1];
  console.log(`Date range: ${earliest.date} to ${latest.date}`);
  
  // Classify emails
  const classifications = await classifyEmails(targetEmails);
  
  // Save results
  const saved = await savePrecategorizedEmails(targetEmails, classifications);
  
  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total emails processed: ${saved.length}`);
  
  // Category distribution
  const catCounts = {};
  saved.forEach(e => {
    const cat = e.category || 'Other';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });
  console.log('\nCategory distribution:');
  Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });
  
  console.log('\nDone! Pre-categorized emails are now cached for fast retrieval.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
