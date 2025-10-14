const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Load OAuth credentials and tokens
const CURRENT_USER_EMAIL = 'ks4190@columbia.edu';
const USER_DATA_DIR = path.join(__dirname, 'data', CURRENT_USER_EMAIL);
const OAUTH_KEYS_PATH = path.join(USER_DATA_DIR, 'gcp-oauth.keys.json');
const TOKENS_PATH = path.join(USER_DATA_DIR, 'gmail-tokens.json');

async function debugThreads() {
  try {
    // Load credentials
    const credentials = JSON.parse(fs.readFileSync(OAUTH_KEYS_PATH, 'utf8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
    
    // Setup auth
    const gmailAuth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    
    // Load tokens
    const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
    gmailAuth.setCredentials(tokens);
    
    const gmail = google.gmail({ version: 'v1', auth: gmailAuth });
    
    console.log('1. Searching for sent emails...');
    const sentResponse = await gmail.users.messages.list({
      userId: 'me',
      q: `from:${CURRENT_USER_EMAIL} in:sent`,
      maxResults: 5
    });
    
    const sentEmails = sentResponse.data.messages || [];
    console.log(`Found ${sentEmails.length} sent emails`);
    
    if (sentEmails.length > 0) {
      console.log('First sent email:', sentEmails[0]);
      
      // Get full email data
      console.log('\n2. Getting full email data...');
      const emailResponse = await gmail.users.messages.get({
        userId: 'me',
        id: sentEmails[0].id,
        format: 'full'
      });
      
      const message = emailResponse.data;
      const headers = message.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      
      console.log(`Subject: ${subject}`);
      console.log(`Thread ID: ${message.threadId}`);
      console.log(`Is Reply: ${subject.toLowerCase().startsWith('re:')}`);
      
      if (subject.toLowerCase().startsWith('re:')) {
        console.log('\n3. Using Gmail threads API directly...');
        try {
          const threadResponse = await gmail.users.threads.get({
            userId: 'me',
            id: message.threadId
          });
          
          const thread = threadResponse.data;
          console.log(`Found thread with ${thread.messages.length} messages`);
          
          let originalMessage = null;
          let responseMessage = null;
          
          for (let i = 0; i < thread.messages.length; i++) {
            const msg = thread.messages[i];
            const msgHeaders = msg.payload.headers;
            const msgFrom = msgHeaders.find(h => h.name === 'From')?.value || 'Unknown';
            const msgSubject = msgHeaders.find(h => h.name === 'Subject')?.value || 'No Subject';
            const msgDate = msgHeaders.find(h => h.name === 'Date')?.value || 'Unknown';
            
            console.log(`Message ${i + 1}: From: ${msgFrom}, Subject: ${msgSubject}, Date: ${msgDate}`);
            
            if (msgFrom.includes(CURRENT_USER_EMAIL)) {
              responseMessage = msg;
              console.log('  ^ This is YOUR response');
            } else {
              originalMessage = msg;
              console.log('  ^ This is the ORIGINAL email');
            }
          }
          
          if (originalMessage && responseMessage) {
            console.log('\n✅ SUCCESS: Found both original email and response!');
            console.log('This thread should work for the load-email-threads feature.');
          } else {
            console.log('\n❌ ISSUE: Missing original email or response');
            console.log(`Original: ${originalMessage ? 'Found' : 'Missing'}`);
            console.log(`Response: ${responseMessage ? 'Found' : 'Missing'}`);
          }
          
        } catch (threadError) {
          console.error('Error using threads API:', threadError);
        }
      }
    }
    
  } catch (error) {
    console.error('Debug error:', error);
  }
}

debugThreads();
