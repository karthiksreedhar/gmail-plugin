/**
 * Load Priority Emails Script
 * 
 * Loads the last 5000 priority (important) emails/threads from Gmail inbox
 * and saves them to a JSON file.
 * 
 * Usage: node scripts/load-priority-emails.js
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const CURRENT_USER_EMAIL = process.env.CURRENT_USER_EMAIL || 'ks4190@columbia.edu';
const SENDING_EMAIL = process.env.SENDING_EMAIL || process.env.CURRENT_USER_EMAIL || CURRENT_USER_EMAIL;
const MAX_EMAILS = 5000;
const OUTPUT_DIR = path.join(__dirname, '..', 'data', CURRENT_USER_EMAIL);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'priority-emails-5000.json');

// Gmail API setup
let gmailAuth = null;
let gmail = null;

/**
 * Initialize Gmail API
 */
async function initializeGmailAPI() {
  try {
    const USER_DATA_DIR = path.join(__dirname, '..', 'data', CURRENT_USER_EMAIL);
    const OAUTH_KEYS_PATH = path.join(USER_DATA_DIR, 'gcp-oauth.keys.json');
    const TOKENS_PATH = path.join(USER_DATA_DIR, 'gmail-tokens.json');

    // Check for OAuth keys
    if (!fs.existsSync(OAUTH_KEYS_PATH)) {
      const rootCredentialsPath = path.join(__dirname, '..', 'gcp-oauth.keys.json');
      if (!fs.existsSync(rootCredentialsPath)) {
        throw new Error(`OAuth keys file not found at ${OAUTH_KEYS_PATH} or ${rootCredentialsPath}`);
      }
      console.log('Using OAuth keys from root directory');
    }

    const credentialsPath = fs.existsSync(OAUTH_KEYS_PATH) ? OAUTH_KEYS_PATH : path.join(__dirname, '..', 'gcp-oauth.keys.json');
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    gmailAuth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Load existing tokens
    if (!fs.existsSync(TOKENS_PATH)) {
      throw new Error(`Gmail tokens not found at ${TOKENS_PATH}. Please authenticate first via the web interface.`);
    }

    const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
    gmailAuth.setCredentials(tokens);

    // Verify tokens are valid
    await gmailAuth.getAccessToken();
    gmail = google.gmail({ version: 'v1', auth: gmailAuth });

    console.log('✓ Gmail API initialized successfully');
    return true;
  } catch (error) {
    console.error('✗ Error initializing Gmail API:', error.message);
    throw error;
  }
}

/**
 * Search Gmail for emails with pagination support
 */
async function searchGmailEmails(query, maxResults = 10) {
  try {
    const allMessages = [];
    let pageToken = null;
    let remainingToFetch = maxResults;

    console.log(`Searching Gmail with query: "${query}"`);

    do {
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: Math.min(remainingToFetch, 500), // Gmail API max per page is 500
        pageToken: pageToken || undefined
      });

      const messages = response.data.messages || [];
      allMessages.push(...messages);

      // Update remaining count and page token
      remainingToFetch -= messages.length;
      pageToken = response.data.nextPageToken;

      // Log progress
      if (pageToken && remainingToFetch > 0) {
        console.log(`  Fetched ${allMessages.length} message IDs so far...`);
      }

    } while (pageToken && remainingToFetch > 0);

    console.log(`✓ Found ${allMessages.length} total messages`);
    return allMessages;
  } catch (error) {
    console.error('✗ Error searching Gmail emails:', error.message);
    throw error;
  }
}

/**
 * Extract email body from nested parts
 */
function extractEmailBody(payload) {
  let body = '';

  // If this payload has body data directly
  if (payload.body && payload.body.data) {
    try {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      if (body.trim()) {
        return body;
      }
    } catch (error) {
      console.error('Error decoding body data:', error.message);
    }
  }

  // If this payload has parts, recursively search them
  if (payload.parts && payload.parts.length > 0) {
    // First, try to find text/plain parts
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain') {
        const plainTextBody = extractEmailBody(part);
        if (plainTextBody && plainTextBody.trim()) {
          return plainTextBody;
        }
      }
    }

    // If no text/plain found, try text/html parts
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html') {
        const htmlBody = extractEmailBody(part);
        if (htmlBody && htmlBody.trim()) {
          // Basic HTML to text conversion
          return htmlBody.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        }
      }
    }

    // Recursively search multipart/* parts
    for (const part of payload.parts) {
      if (part.mimeType && part.mimeType.startsWith('multipart/')) {
        const nestedBody = extractEmailBody(part);
        if (nestedBody && nestedBody.trim()) {
          return nestedBody;
        }
      }
    }

    // Last resort: try any part that might have body content
    for (const part of payload.parts) {
      const anyBody = extractEmailBody(part);
      if (anyBody && anyBody.trim()) {
        return anyBody;
      }
    }
  }

  return body;
}

/**
 * Get full Gmail email content
 */
async function getGmailEmail(messageId) {
  try {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    const message = response.data;
    const headers = message.payload.headers;

    // Extract email details
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
    const to = headers.find(h => h.name === 'To')?.value || 'Unknown Recipient';
    const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();
    const threadId = message.threadId;
    const messageIdHeader = headers.find(h => String(h.name || '').toLowerCase() === 'message-id')?.value || '';

    // Best-effort Gmail web URL
    let webUrl = '';
    try {
      if (messageIdHeader) {
        const frag = 'rfc822msgid:' + messageIdHeader;
        webUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(frag)}`;
      } else {
        const q = `from:${from} subject:"${subject}"`;
        webUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`;
      }
    } catch (_) {
      webUrl = '';
    }

    // Extract body
    let body = extractEmailBody(message.payload);

    // Clean up the body text
    if (body) {
      body = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      body = body.replace(/\n\s*\n\s*\n/g, '\n\n'); // Remove excessive line breaks
      body = body.trim();
    }

    return {
      id: messageId,
      threadId,
      subject,
      from,
      to,
      date,
      body: body || message.snippet || 'No content available',
      snippet: message.snippet || '',
      webUrl
    };
  } catch (error) {
    console.error(`✗ Error getting email ${messageId}:`, error.message);
    throw error;
  }
}

/**
 * Main function to load and save priority emails
 */
async function loadPriorityEmails() {
  try {
    console.log('='.repeat(60));
    console.log('Load Priority Emails Script');
    console.log('='.repeat(60));
    console.log(`User: ${CURRENT_USER_EMAIL}`);
    console.log(`Max emails to load: ${MAX_EMAILS}`);
    console.log(`Output file: ${OUTPUT_FILE}`);
    console.log('='.repeat(60));
    console.log('');

    // Initialize Gmail API
    await initializeGmailAPI();

    // Search for priority/important emails in inbox
    const query = 'in:inbox is:important';
    console.log(`\nStep 1: Searching for priority emails...`);
    const messageRefs = await searchGmailEmails(query, MAX_EMAILS);

    if (messageRefs.length === 0) {
      console.log('\n✓ No priority emails found in inbox.');
      return;
    }

    // Fetch full content for each email
    console.log(`\nStep 2: Fetching full content for ${messageRefs.length} emails...`);
    const emails = [];
    let processed = 0;
    const startTime = Date.now();

    for (const msgRef of messageRefs) {
      try {
        const email = await getGmailEmail(msgRef.id);
        emails.push(email);
        processed++;

        // Progress update every 100 emails
        if (processed % 100 === 0 || processed === messageRefs.length) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = (processed / (Date.now() - startTime) * 1000).toFixed(1);
          console.log(`  Progress: ${processed}/${messageRefs.length} (${rate} emails/sec, ${elapsed}s elapsed)`);
        }
      } catch (error) {
        console.error(`  Failed to fetch email ${msgRef.id}: ${error.message}`);
        // Continue with other emails
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✓ Successfully fetched ${emails.length} emails in ${totalTime}s`);

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      console.log(`✓ Created output directory: ${OUTPUT_DIR}`);
    }

    // Save to JSON file
    console.log(`\nStep 3: Saving emails to JSON file...`);
    const output = {
      metadata: {
        user: CURRENT_USER_EMAIL,
        sendingEmail: SENDING_EMAIL,
        totalEmails: emails.length,
        query: query,
        maxRequested: MAX_EMAILS,
        timestamp: new Date().toISOString(),
        generatedBy: 'scripts/load-priority-emails.js'
      },
      emails: emails
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`✓ Saved ${emails.length} emails to: ${OUTPUT_FILE}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total emails loaded: ${emails.length}`);
    console.log(`Output file: ${OUTPUT_FILE}`);
    console.log(`File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n✗ Script failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  loadPriorityEmails()
    .then(() => {
      console.log('\n✓ Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { loadPriorityEmails };
