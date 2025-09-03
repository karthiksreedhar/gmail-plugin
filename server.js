const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const { google } = require('googleapis');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: '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'
});

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Current user - can be changed via API
let CURRENT_USER_EMAIL = 'ks4190@columbia.edu';

// Function to get user-specific paths
function getUserPaths(userEmail = CURRENT_USER_EMAIL) {
  const USER_DATA_DIR = path.join(__dirname, 'data', userEmail);
  return {
    USER_DATA_DIR,
    DATA_FILE_PATH: path.join(USER_DATA_DIR, 'scenarios.json'),
    RESPONSE_EMAILS_PATH: path.join(USER_DATA_DIR, 'response-emails.json'),
    EMAIL_THREADS_PATH: path.join(USER_DATA_DIR, 'email-threads.json'),
    TEST_EMAILS_PATH: path.join(USER_DATA_DIR, 'test-emails.json'),
    UNREPLIED_EMAILS_PATH: path.join(USER_DATA_DIR, 'unreplied-emails.json'),
    OAUTH_KEYS_PATH: path.join(USER_DATA_DIR, 'gcp-oauth.keys.json'),
    TOKENS_PATH: path.join(USER_DATA_DIR, 'gmail-tokens.json')
  };
}

// Get current user paths
function getCurrentUserPaths() {
  return getUserPaths(CURRENT_USER_EMAIL);
}

// Gmail API setup
let gmailAuth = null;
let gmail = null;

// Initialize Gmail API
async function initializeGmailAPI() {
  try {
    const paths = getCurrentUserPaths();
    
    // Load OAuth credentials - check user-specific path first, then fallback to root
    let credentialsPath = paths.OAUTH_KEYS_PATH;
    if (!fs.existsSync(credentialsPath)) {
      // Fallback to root directory for backward compatibility
      const rootCredentialsPath = path.join(__dirname, 'gcp-oauth.keys.json');
      if (fs.existsSync(rootCredentialsPath)) {
        credentialsPath = rootCredentialsPath;
        console.log(`Using OAuth keys from root directory for user ${CURRENT_USER_EMAIL}`);
      } else {
        console.warn(`OAuth keys file not found for user ${CURRENT_USER_EMAIL}. Gmail API will not be available.`);
        return false;
      }
    } else {
      console.log(`Using user-specific OAuth keys for ${CURRENT_USER_EMAIL}`);
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    gmailAuth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Load existing tokens if available
    if (fs.existsSync(paths.TOKENS_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(paths.TOKENS_PATH, 'utf8'));
      gmailAuth.setCredentials(tokens);
      
      // Check if tokens are still valid
      try {
        await gmailAuth.getAccessToken();
        gmail = google.gmail({ version: 'v1', auth: gmailAuth });
        console.log(`Gmail API initialized successfully with existing tokens for ${CURRENT_USER_EMAIL}`);
        return true;
      } catch (error) {
        console.log(`Existing tokens are invalid for ${CURRENT_USER_EMAIL}, need to re-authenticate`);
      }
    }

    gmail = google.gmail({ version: 'v1', auth: gmailAuth });
    console.log(`Gmail API initialized for ${CURRENT_USER_EMAIL}, but authentication required`);
    return false;
  } catch (error) {
    console.error(`Error initializing Gmail API for ${CURRENT_USER_EMAIL}:`, error);
    return false;
  }
}

// Get Gmail authentication URL
function getGmailAuthUrl() {
  if (!gmailAuth) return null;
  
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send'
  ];

  return gmailAuth.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });
}

// Handle OAuth callback and save tokens
async function handleGmailAuthCallback(code) {
  try {
    const { tokens } = await gmailAuth.getToken(code);
    gmailAuth.setCredentials(tokens);
    
    const paths = getCurrentUserPaths();
    
    // Save tokens for future use
    if (!fs.existsSync(paths.USER_DATA_DIR)) {
      fs.mkdirSync(paths.USER_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(paths.TOKENS_PATH, JSON.stringify(tokens, null, 2));
    
    console.log('Gmail authentication successful, tokens saved');
    return true;
  } catch (error) {
    console.error('Error handling Gmail auth callback:', error);
    return false;
  }
}

// Search Gmail for emails
async function searchGmailEmails(query, maxResults = 10) {
  try {
    if (!gmail) {
      throw new Error('Gmail API not initialized');
    }

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: maxResults
    });

    return response.data.messages || [];
  } catch (error) {
    console.error('Error searching Gmail emails:', error);
    throw error;
  }
}

// Helper function to clean email response body by removing quoted original content
function cleanResponseBody(emailBody) {
  if (!emailBody || typeof emailBody !== 'string') {
    return emailBody;
  }

  let cleanedBody = emailBody;

  // Method 1: Remove everything after "On ... wrote:" pattern - find "wrote:" first, then look for "On" before it
  const wroteMatches = [...cleanedBody.matchAll(/wrote:\s*[\s\S]*$/gi)];
  
  for (const wroteMatch of wroteMatches) {
    const wroteIndex = wroteMatch.index;
    const beforeWrote = cleanedBody.substring(0, wroteIndex);
    
    // Find the last occurrence of "On" before "wrote:" (simple approach)
    const onIndex = beforeWrote.lastIndexOf('On ');
    
    if (onIndex !== -1) {
      // Cut everything from "On" onwards
      cleanedBody = cleanedBody.substring(0, onIndex).trim();
      console.log(`Cleaned email - removed quoted content using "On...wrote:" pattern`);
      break;
    }
  }

  // Method 2: Remove lines that start with ">" (quoted text)
  const lines = cleanedBody.split('\n');
  const filteredLines = [];
  let inQuotedSection = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // If line starts with ">", it's quoted content - skip it
    if (trimmedLine.startsWith('>')) {
      inQuotedSection = true;
      continue;
    }
    
    // If we were in a quoted section and hit a non-quoted line, we're out
    if (inQuotedSection && trimmedLine.length > 0 && !trimmedLine.startsWith('>')) {
      inQuotedSection = false;
    }
    
    // Only keep non-quoted lines
    if (!inQuotedSection) {
      filteredLines.push(line);
    }
  }

  if (filteredLines.length < lines.length) {
    cleanedBody = filteredLines.join('\n').trim();
    console.log(`Cleaned email - removed ${lines.length - filteredLines.length} quoted lines starting with ">"`);
  }

  return cleanedBody.trim();
}

// Helper function to recursively extract email body from nested parts
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
      console.error('Error decoding body data:', error);
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
          // Basic HTML to text conversion (remove tags)
          return htmlBody.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        }
      }
    }
    
    // If still no body found, recursively search multipart/* parts
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

// Get Gmail email content
async function getGmailEmail(messageId) {
  try {
    if (!gmail) {
      throw new Error('Gmail API not initialized');
    }

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

    // Extract body using recursive function
    let body = extractEmailBody(message.payload);
    
    // Clean up the body text
    if (body) {
      // Remove excessive whitespace and normalize line breaks
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
      snippet: message.snippet || ''
    };
  } catch (error) {
    console.error('Error getting Gmail email:', error);
    throw error;
  }
}

// Function to load data from file
function loadDataFromFile() {
  try {
    const paths = getCurrentUserPaths();
    if (fs.existsSync(paths.DATA_FILE_PATH)) {
      const data = fs.readFileSync(paths.DATA_FILE_PATH, 'utf8');
      const parsedData = JSON.parse(data);
      return {
        scenarios: parsedData.scenarios || [],
        refinements: parsedData.refinements || [],
        savedGenerations: parsedData.savedGenerations || []
      };
    }
  } catch (error) {
    console.error('Error loading data from file:', error);
  }
  return {
    scenarios: [],
    refinements: [],
    savedGenerations: []
  };
}

// Function to save data to file
function saveDataToFile(data) {
  try {
    const paths = getCurrentUserPaths();
    // Ensure data directory exists
    const dataDir = path.dirname(paths.DATA_FILE_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(paths.DATA_FILE_PATH, JSON.stringify(data, null, 2));
    console.log('Data saved to file successfully');
  } catch (error) {
    console.error('Error saving data to file:', error);
  }
}

// Function to load email data from JSON files
function loadEmailData(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error loading email data from ${filePath}:`, error);
  }
  return null;
}

// Function to load response emails from JSON file
function loadResponseEmails() {
  const paths = getCurrentUserPaths();
  const data = loadEmailData(paths.RESPONSE_EMAILS_PATH);
  return data ? data.emails || [] : [];
}

// Function to load email threads from JSON file
function loadEmailThreads() {
  const paths = getCurrentUserPaths();
  const data = loadEmailData(paths.EMAIL_THREADS_PATH);
  return data ? data.threads || [] : [];
}

// Function to load test emails from JSON file
function loadTestEmails() {
  const paths = getCurrentUserPaths();
  const data = loadEmailData(paths.TEST_EMAILS_PATH);
  return data ? data.emails || [] : [];
}

// Function to load unreplied emails from JSON file
function loadUnrepliedEmails() {
  const paths = getCurrentUserPaths();
  const data = loadEmailData(paths.UNREPLIED_EMAILS_PATH);
  return data ? data.emails || [] : [];
}

// Load initial data from file
const persistentData = loadDataFromFile();

// Store for email memory/categories, refinements, saved generations, and scenarios
let emailMemory = {
  categories: [],
  responses: [],
  refinements: persistentData.refinements,
  savedGenerations: persistentData.savedGenerations,
  scenarios: persistentData.scenarios
};

// Email categorization logic for CS PhD student with MS in Journalism who TAs
function categorizeEmail(subject, body, from) {
  const subjectLower = subject.toLowerCase();
  const bodyLower = body.toLowerCase();
  const fromLower = from.toLowerCase();

  // Teaching & Student Support
  if (subjectLower.includes('hw') || subjectLower.includes('homework') || subjectLower.includes('assignment') ||
      subjectLower.includes('extension') || subjectLower.includes('late pass') || subjectLower.includes('resubmit') ||
      subjectLower.includes('grading') || subjectLower.includes('ta spreadsheet') || subjectLower.includes('midterm') ||
      bodyLower.includes('late pass') || bodyLower.includes('extension') || bodyLower.includes('homework') ||
      bodyLower.includes('assignment') || bodyLower.includes('resubmit') || bodyLower.includes('slack')) {
    return 'Teaching & Student Support';
  }

  // Research & Lab Work
  if (subjectLower.includes('daplab') || subjectLower.includes('lab') || subjectLower.includes('research') ||
      subjectLower.includes('study') || subjectLower.includes('paper') || subjectLower.includes('hci') ||
      fromLower.includes('lydia') || fromLower.includes('chilton') || subjectLower.includes('tweetorials') ||
      bodyLower.includes('research') || bodyLower.includes('study') || bodyLower.includes('paper') ||
      bodyLower.includes('lydia') || subjectLower.includes('pilot study')) {
    return 'Research & Lab Work';
  }

  // Conferences
  if (subjectLower.includes('conference') || subjectLower.includes('iui') || subjectLower.includes('c&c') ||
      subjectLower.includes('nsf') || subjectLower.includes('grant') || subjectLower.includes('review') ||
      subjectLower.includes('pcs') || subjectLower.includes('taps') || subjectLower.includes('acm') ||
      bodyLower.includes('conference') || bodyLower.includes('grant') || bodyLower.includes('review') ||
      bodyLower.includes('submission') || bodyLower.includes('paper')) {
    return 'Conferences';
  }

  // University Administration
  if (subjectLower.includes('cs@cu') || subjectLower.includes('welcome') || subjectLower.includes('clearance') ||
      subjectLower.includes('pdl') || subjectLower.includes('prep day') || subjectLower.includes('graduation') ||
      subjectLower.includes('phd') || subjectLower.includes('ms program') || subjectLower.includes('seas') ||
      fromLower.includes('columbia.edu') && (subjectLower.includes('program') || subjectLower.includes('department') ||
      subjectLower.includes('admin') || bodyLower.includes('program') || bodyLower.includes('department'))) {
    return 'University Administration';
  }

  // Financial & Reimbursements
  if (subjectLower.includes('reimbursement') || subjectLower.includes('scholarship') || subjectLower.includes('nicar') ||
      subjectLower.includes('egsc') || subjectLower.includes('financial') || subjectLower.includes('payment') ||
      bodyLower.includes('reimbursement') || bodyLower.includes('scholarship') || bodyLower.includes('check') ||
      bodyLower.includes('payment') || bodyLower.includes('refund')) {
    return 'Financial & Reimbursements';
  }

  // Networking
  if (subjectLower.includes('tiktok') || subjectLower.includes('job') || subjectLower.includes('opportunity') ||
      subjectLower.includes('chat') || subjectLower.includes('connect') || subjectLower.includes('career') ||
      bodyLower.includes('opportunity') || bodyLower.includes('role') || bodyLower.includes('position') ||
      bodyLower.includes('career') || bodyLower.includes('recruiting')) {
    return 'Networking';
  }

  // Personal & Life Management (default for everything else)
  return 'Personal & Life Management';
}

// API endpoint to get response emails - prioritize JSON data, Gmail API only for specific features
app.get('/api/response-emails', async (req, res) => {
  try {
    // Always load from JSON files for the main UI display
    console.log('Loading response emails from JSON file...');
    const responseEmails = loadResponseEmails();
    
    if (responseEmails.length === 0) {
      console.warn('No response emails found in JSON file');
      return res.json({ emails: [] });
    }
    
    // Validate and fix any email data issues
    const validatedEmails = [];
    
    responseEmails.forEach((email, index) => {
      // Validate required fields
      if (!email.id || !email.subject || !email.from || !email.body) {
        console.error(`Email at index ${index} missing required fields:`, {
          id: !!email.id,
          subject: !!email.subject,
          from: !!email.from,
          body: !!email.body
        });
        return; // Skip invalid emails
      }

      // Ensure all fields have proper values
      const validatedEmail = {
        id: email.id,
        subject: email.subject || 'No Subject',
        from: email.from || 'Unknown Sender',
        originalFrom: email.originalFrom || 'Unknown Sender',
        date: email.date || new Date().toISOString(),
        category: email.category || categorizeEmail(email.subject, email.body, email.from),
        body: email.body || 'No content available',
        snippet: email.snippet || (email.body ? email.body.substring(0, 100) + (email.body.length > 100 ? '...' : '') : 'No content available')
      };

      validatedEmails.push(validatedEmail);
    });

    if (validatedEmails.length !== responseEmails.length) {
      console.warn(`Filtered out ${responseEmails.length - validatedEmails.length} invalid emails`);
    }

    console.log(`Returning ${validatedEmails.length} validated emails from JSON file`);
    res.json({ emails: validatedEmails });
  } catch (error) {
    console.error('Error fetching response emails:', error);
    res.status(500).json({ error: 'Failed to fetch response emails', details: error.message });
  }
});

// API endpoint to get thread for a specific email
app.get('/api/email-thread/:emailId', async (req, res) => {
  try {
    const emailId = req.params.emailId;
    console.log(`Fetching thread for email ID: ${emailId}`);
    
    // Load email threads from JSON file
    const emailThreads = loadEmailThreads();
    
    // Find the specific email thread by matching the id field
    const thread = emailThreads.find(t => t.id === emailId);
    
    if (thread) {
      // Create proper thread data structure from the JSON data
      const threadData = {
        messages: [
          {
            id: 'original-' + thread.id,
            from: thread.originalFrom || 'Unknown Sender',
            to: [thread.from],
            date: new Date(new Date(thread.date).getTime() - 86400000).toISOString(),
            subject: thread.subject.replace('Re: ', ''),
            body: thread.originalBody || 'Original email content not available',
            isResponse: false
          },
          {
            id: thread.id,
            from: thread.from,
            to: [thread.originalFrom || 'Unknown Sender'],
            date: thread.date,
            subject: thread.subject,
            body: cleanResponseBody(thread.body),
            isResponse: true
          }
        ]
      };
      
      console.log(`Returning thread data from JSON file for email: ${thread.subject}`);
      return res.json(threadData);
    }
    
    // If no thread found in JSON, try to construct from response emails
    const responseEmails = loadResponseEmails();
    const email = responseEmails.find(e => e.id === emailId);
    
    if (!email) {
      return res.status(404).json({ error: 'Email thread not found' });
    }
    
    // Create thread data using originalBody from response emails
    const threadData = {
      messages: [
        {
          id: 'original-' + email.id,
          from: email.originalFrom || 'Unknown Sender',
          to: [email.from],
          date: new Date(new Date(email.date).getTime() - 86400000).toISOString(),
          subject: email.subject.replace('Re: ', ''),
          body: email.originalBody || 'Original email content not available',
          isResponse: false
        },
        {
          id: email.id,
          from: email.from,
          to: [email.originalFrom || 'Unknown Sender'],
          date: email.date,
          subject: email.subject,
          body: cleanResponseBody(email.body),
          isResponse: true
        }
      ]
    };
    
    console.log(`Returning constructed thread data for email: ${email.subject}`);
    res.json(threadData);
  } catch (error) {
    console.error('Error fetching email thread:', error);
    res.status(500).json({ error: 'Failed to fetch email thread' });
  }
});

// API endpoint to generate response using OpenAI
app.post('/api/generate-response', async (req, res) => {
  try {
    const { sender, subject, emailBody, context } = req.body;
    
    // Check if this is a missing information case
    const isMissingInfoRequest = context && context.includes('Missing information detected:');
    let missingInfoContext = '';
    
    if (isMissingInfoRequest) {
      const missingInfoMatch = context.match(/Missing information detected: (.+?)(?:\n|$)/);
      const missingInfo = missingInfoMatch ? missingInfoMatch[1] : 'some information';
      missingInfoContext = `\n\nIMPORTANT: This email is missing information (${missingInfo}). Your response should follow your usual tone and style, but must politely ask for the missing information to be provided.`;
    }
    
    // Load response emails from JSON file
    const responseEmails = loadResponseEmails();

    // Build comprehensive prompt with database data
    let prompt = `You are an assistant that helps write email responses. Given the following new email (with sender, subject, and content), a list of previous emails, and responses. Your task is to generate a response email that as closely as possible matches the user's previous tone, style, and response length. DO NOT add any extra explanation, exposition, or content beyond what is typical in the user's previous responses. First, identify the most similar previous email(s) to the new email. Then, model the new response as closely as possible after the user's previous response(s) to those similar emails, matching length, structure, and style (but do not make it identical to any previous email, just similar). DO NOT include links in the response unless it is contextually required. First, identify the sign-off(s) the user uses in previous responses (e.g., 'Thanks, Karthik'). Use the same sign-off in the generated response. The length of the generated response should be as close as possible to the user's previous responses. The response should be written from the user's perspective, as if the user is replying to the original sender, NOT addressed to the user. After the response, provide a justification as a bullet point list. In the justification, explicitly list which previous emails are most similar to the new email and briefly explain why. Reference these by sender, subject, content, or feedback as needed. Do not add extra content or summary in the justification.

NEW EMAIL TO RESPOND TO:
From: ${sender || 'Unknown sender'}
Subject: ${subject || 'No subject'}
Body: ${emailBody}

PREVIOUS EMAIL RESPONSES:
`;

    // Add email responses from JSON data
    responseEmails.forEach((email, index) => {
      prompt += `\n--- EMAIL ${index + 1} ---\n`;
      prompt += `Category: ${email.category}\n`;
      prompt += `Subject: ${email.subject}\n`;
      prompt += `From: ${email.originalFrom || 'Unknown'}\n`;
      prompt += `Your Response: ${email.body}\n\n`;
    });

    // Add only GENERALIZABLE refinements if they exist
    if (emailMemory.refinements && emailMemory.refinements.length > 0) {
      const generalizableRefinements = emailMemory.refinements.filter(refinement => {
        // Check if refinement has analysis and contains generalizable changes
        if (refinement.analysis && refinement.analysis.changes) {
          return refinement.analysis.changes.some(change => change.category === 'GENERALIZABLE');
        }
        // If no analysis exists (legacy refinements), include them for backward compatibility
        return true;
      });

      if (generalizableRefinements.length > 0) {
        prompt += `\nPREVIOUS GENERALIZABLE REFINEMENTS (apply these patterns to new responses):\n`;
        generalizableRefinements.forEach((refinement, index) => {
          prompt += `\n--- GENERALIZABLE REFINEMENT ${index + 1} ---\n`;
          prompt += `Refinement Request: ${refinement.prompt}\n`;
          prompt += `Original Response: ${refinement.originalResponse}\n`;
          prompt += `Refined Response: ${refinement.refinedResponse}\n`;
          
          // Add extracted rules if available
          if (refinement.analysis && refinement.analysis.changes) {
            const generalizableChanges = refinement.analysis.changes.filter(change => change.category === 'GENERALIZABLE');
            if (generalizableChanges.length > 0) {
              prompt += `Generalizable Rules:\n`;
              generalizableChanges.forEach(change => {
                if (change.extractedRule) {
                  prompt += `- ${change.extractedRule}\n`;
                }
              });
            }
          }
          prompt += `\n`;
        });
      }
    }

    // Add ALL saved generations if they exist
    if (emailMemory.savedGenerations && emailMemory.savedGenerations.length > 0) {
      prompt += `\nPREVIOUS SAVED GENERATIONS:\n`;
      emailMemory.savedGenerations.forEach((generation, index) => {
        prompt += `\n--- SAVED GENERATION ${index + 1} ---\n`;
        prompt += `Original Email: ${JSON.stringify(generation.originalEmail)}\n`;
        prompt += `Generated Response: ${generation.generatedResponse}\n`;
        prompt += `Justification: ${generation.justification}\n\n`;
      });
    }

    // Add additional context if provided
    if (context && context !== 'None') {
      prompt += `\nADDITIONAL CONTEXT: ${context}${missingInfoContext}\n`;
    } else if (missingInfoContext) {
      prompt += `\nADDITIONAL CONTEXT: ${missingInfoContext}\n`;
    }

    prompt += `\nGenerate the response following the instructions above. Format your response as:

RESPONSE:
[The actual email response content only - from greeting to sign-off, no subject line or metadata]

JUSTIFICATION:
[Bullet point list explaining which previous emails are most similar and why]`;

    const completion = await openai.chat.completions.create({
      model: "o3",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 2000
    });

    const fullResponse = completion.choices[0].message.content.trim();
    
    // Parse the response to separate the email content from justification
    const responseParts = fullResponse.split('JUSTIFICATION:');
    let emailResponse = responseParts[0].replace('RESPONSE:', '').trim();
    let justification = responseParts[1] ? responseParts[1].trim() : "Generated based on comprehensive analysis of previous email responses to match established tone and style patterns";
    
    // Clean up the email response - remove any remaining metadata
    emailResponse = emailResponse
      .replace(/^(Response:|RESPONSE:)/i, '')
      .replace(/^(Subject:|SUBJECT:).+$/gm, '')
      .replace(/^(From:|FROM:).+$/gm, '')
      .replace(/^(To:|TO:).+$/gm, '')
      .trim();
    
    res.json({ 
      response: emailResponse,
      justification: justification
    });
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// Function to analyze refinement and categorize changes
async function analyzeRefinement(originalResponse, refinement) {
  try {
    const analysisPrompt = `You are analyzing a user's refinement to an email response. Your task is to identify all requested changes and categorize each one as either GENERALIZABLE or EMAIL-SPECIFIC.

GENERALIZABLE changes are:
- Writing style preferences (tone, formality, structure)
- Communication patterns that apply across contexts
- General response strategies or approaches
- Consistent personality traits or professional voice
- Standard ways of handling common situations

EMAIL-SPECIFIC changes are:
- Factual information tied to a specific moment in time
- Personal circumstances that may change
- Context-dependent details (dates, locations, specific people)
- Situational responses that don't apply broadly
- One-time decisions or temporary conditions

Original Email Response: ${originalResponse}
User Refinement: ${refinement}

Please analyze the refinement and return a JSON object with this structure:
{
  "changes": [
    {
      "description": "Brief description of the change",
      "category": "GENERALIZABLE" or "EMAIL-SPECIFIC",
      "reasoning": "Why this change fits this category",
      "extractedRule": "If GENERALIZABLE, the general rule to apply (null if EMAIL-SPECIFIC)"
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: "o3",
      messages: [{ role: "user", content: analysisPrompt }],
      max_completion_tokens: 1000
    });

    const analysisResult = completion.choices[0].message.content.trim();
    
    try {
      return JSON.parse(analysisResult);
    } catch (parseError) {
      console.error('Error parsing refinement analysis:', parseError);
      // Return a fallback structure
      return {
        changes: [{
          description: "Unable to parse analysis",
          category: "EMAIL-SPECIFIC",
          reasoning: "Analysis parsing failed",
          extractedRule: null
        }]
      };
    }
  } catch (error) {
    console.error('Error analyzing refinement:', error);
    // Return a fallback structure
    return {
      changes: [{
        description: "Analysis failed",
        category: "EMAIL-SPECIFIC", 
        reasoning: "Error occurred during analysis",
        extractedRule: null
      }]
    };
  }
}

// API endpoint to refine response
app.post('/api/refine-response', async (req, res) => {
  try {
    const { currentResponse, refinementPrompt } = req.body;
    
    const prompt = `Please refine the following email response based on the user's feedback:

Current response:
${currentResponse}

Refinement request:
${refinementPrompt}

Please provide the refined response:`;

    const completion = await openai.chat.completions.create({
      model: "o3",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1500
    });

    const refinedResponse = completion.choices[0].message.content.trim();
    
    // Analyze the refinement to categorize changes
    const analysis = await analyzeRefinement(currentResponse, refinementPrompt);
    
    // Store refinement in memory with analysis
    emailMemory.refinements.push({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      prompt: refinementPrompt,
      originalResponse: currentResponse,
      refinedResponse: refinedResponse,
      analysis: analysis
    });
    
    res.json({ 
      response: refinedResponse,
      justification: "Refined based on user feedback",
      analysis: analysis
    });
  } catch (error) {
    console.error('Error refining response:', error);
    res.status(500).json({ error: 'Failed to refine response' });
  }
});

// API endpoint to save generated response
app.post('/api/save-generation', async (req, res) => {
  try {
    const { originalEmail, generatedResponse, justification } = req.body;
    
    const savedGeneration = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      originalEmail,
      generatedResponse,
      justification
    };
    
    emailMemory.savedGenerations.push(savedGeneration);
    
    res.json({ success: true, id: savedGeneration.id });
  } catch (error) {
    console.error('Error saving generation:', error);
    res.status(500).json({ error: 'Failed to save generation' });
  }
});

// API endpoint to get refinements
app.get('/api/refinements', (req, res) => {
  res.json({ refinements: emailMemory.refinements });
});

// API endpoint to get saved generations
app.get('/api/saved-generations', (req, res) => {
  res.json({ savedGenerations: emailMemory.savedGenerations });
});

// API endpoint to delete refinement
app.delete('/api/refinements/:id', (req, res) => {
  const id = req.params.id;
  emailMemory.refinements = emailMemory.refinements.filter(r => r.id !== id);
  res.json({ success: true });
});

// API endpoint to delete saved generation
app.delete('/api/saved-generations/:id', (req, res) => {
  const id = req.params.id;
  emailMemory.savedGenerations = emailMemory.savedGenerations.filter(g => g.id !== id);
  res.json({ success: true });
});

// API endpoint to clear all refinements
app.delete('/api/refinements', (req, res) => {
  emailMemory.refinements = [];
  res.json({ success: true });
});

// API endpoint to clear all saved generations
app.delete('/api/saved-generations', (req, res) => {
  emailMemory.savedGenerations = [];
  res.json({ success: true });
});

// API endpoint to detect missing information
app.post('/api/detect-missing-info', async (req, res) => {
  try {
    const { sender, subject, emailBody } = req.body;
    
    const prompt = `You are an email analyst. Analyze this email and look for obvious missing information that would prevent generating a proper response.

From: ${sender || 'Not provided'}
Subject: ${subject || 'Not provided'}
Body: ${emailBody}

Only flag missing information if it's clearly and explicitly mentioned but not provided:
1. ATTACHMENTS: Only if the email explicitly says "attached", "see attachment", or similar but no attachment is present
2. LINKS: Only if the email explicitly says "here's the link", "click here", or similar but no link is provided
3. SPECIFIC REFERENCES: Only if the email explicitly references something that should be included but is clearly missing

Be conservative - only flag obvious cases where something is explicitly mentioned as being included but is clearly absent.

Respond in this exact format:
hasMissingInfo: [true/false]
missingInfo: [brief description of what's obviously missing, or "None" if nothing is clearly missing]

Only flag clear, obvious cases.`;

    const completion = await openai.chat.completions.create({
      model: "o3",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 200
    });

    const analysis = completion.choices[0].message.content.trim();
    
    // Parse the response more robustly
    const lines = analysis.split('\n');
    let hasMissingInfo = false;
    let missingInfo = '';
    
    for (const line of lines) {
      if (line.toLowerCase().includes('hasmissinginfo:')) {
        hasMissingInfo = line.toLowerCase().includes('true');
      } else if (line.toLowerCase().includes('missinginfo:')) {
        missingInfo = line.substring(line.indexOf(':') + 1).trim();
      }
    }
    
    // Fallback parsing if structured format isn't found
    if (!missingInfo && analysis.toLowerCase().includes('missing')) {
      hasMissingInfo = true;
      missingInfo = analysis;
    }
    
    res.json({ hasMissingInfo, missingInfo: missingInfo || 'No missing information detected' });
  } catch (error) {
    console.error('Error detecting missing info:', error);
    res.status(500).json({ error: 'Failed to detect missing information' });
  }
});

// API endpoint to get test emails for response generation testing
app.get('/api/test-emails', async (req, res) => {
  try {
    console.log('Fetching test emails from JSON file...');
    
    // Load test emails from JSON file
    const testEmails = loadTestEmails();
    
    if (testEmails.length === 0) {
      console.warn('No test emails found in JSON file');
      return res.json({ emails: [] });
    }
    
    console.log(`Returning ${testEmails.length} test emails from JSON file`);
    res.json({ emails: testEmails });
  } catch (error) {
    console.error('Error fetching test emails:', error);
    res.status(500).json({ 
      error: 'Failed to fetch test emails', 
      details: error.message,
      emails: [] 
    });
  }
});

// API endpoint to get unreplied emails from Gmail inbox
app.get('/api/unreplied-emails', async (req, res) => {
  try {
    console.log('Fetching unreplied emails from JSON file...');
    
    // Load unreplied emails from JSON file
    const unrepliedEmails = loadUnrepliedEmails();
    
    if (unrepliedEmails.length === 0) {
      console.warn('No unreplied emails found in JSON file');
      return res.json({ emails: [] });
    }
    
    // Sort emails chronologically (newest first)
    unrepliedEmails.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    console.log(`Returning ${unrepliedEmails.length} unreplied emails from JSON file`);
    res.json({ emails: unrepliedEmails });
    
  } catch (error) {
    console.error('Error fetching unreplied emails:', error);
    res.status(500).json({ 
      error: 'Failed to fetch unreplied emails', 
      details: error.message,
      emails: [] // Return empty array as fallback
    });
  }
});

// Scenario management endpoints
app.get('/api/scenarios', (req, res) => {
  res.json({ scenarios: emailMemory.scenarios });
});

app.post('/api/scenarios', (req, res) => {
  try {
    const { name, description, emails } = req.body;
    
    const scenario = {
      id: Date.now().toString(),
      name,
      description,
      emails,
      createdAt: new Date().toISOString()
    };
    
    emailMemory.scenarios.push(scenario);
    
    // Save to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    res.json({ success: true, scenario });
  } catch (error) {
    console.error('Error creating scenario:', error);
    res.status(500).json({ error: 'Failed to create scenario' });
  }
});

app.delete('/api/scenarios/:id', (req, res) => {
  try {
    const id = req.params.id;
    emailMemory.scenarios = emailMemory.scenarios.filter(s => s.id !== id);
    
    // Save to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting scenario:', error);
    res.status(500).json({ error: 'Failed to delete scenario' });
  }
});

// Start a new scenario (clear refinements and saved generations)
app.post('/api/scenarios/new/load', (req, res) => {
  try {
    // Clear refinements and saved generations
    emailMemory.refinements = [];
    emailMemory.savedGenerations = [];
    
    // Save the cleared state to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    res.json({ 
      success: true, 
      message: 'New scenario started! All refinements and saved generations have been cleared.'
    });
  } catch (error) {
    console.error('Error starting new scenario:', error);
    res.status(500).json({ error: 'Failed to start new scenario' });
  }
});

// Load a specific scenario
app.post('/api/scenarios/:id/load', (req, res) => {
  try {
    const id = req.params.id;
    const scenario = emailMemory.scenarios.find(s => s.id === id);
    
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    
    // Load the scenario's refinements and saved generations
    if (scenario.refinements) {
      emailMemory.refinements = scenario.refinements;
    }
    if (scenario.savedGenerations) {
      emailMemory.savedGenerations = scenario.savedGenerations;
    }
    
    // Save the updated state to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    res.json({ 
      success: true, 
      message: `Scenario "${scenario.name}" loaded successfully!`
    });
  } catch (error) {
    console.error('Error loading scenario:', error);
    res.status(500).json({ error: 'Failed to load scenario' });
  }
});

// Clear all scenarios
app.delete('/api/scenarios', (req, res) => {
  try {
    emailMemory.scenarios = [];
    
    // Save to file
    saveDataToFile({
      scenarios: emailMemory.scenarios,
      refinements: emailMemory.refinements,
      savedGenerations: emailMemory.savedGenerations
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing all scenarios:', error);
    res.status(500).json({ error: 'Failed to clear scenarios' });
  }
});

// User management endpoints
app.get('/api/current-user', (req, res) => {
  res.json({ currentUser: CURRENT_USER_EMAIL });
});

app.get('/api/users', (req, res) => {
  try {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      return res.json({ users: [] });
    }
    
    const users = fs.readdirSync(dataDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .filter(name => name.includes('@')); // Only email-like directory names
    
    res.json({ users });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

app.post('/api/switch-user', async (req, res) => {
  try {
    const { userEmail } = req.body;
    
    if (!userEmail || !userEmail.includes('@')) {
      return res.status(400).json({ error: 'Invalid user email' });
    }
    
    // Check if user directory exists
    const userDataDir = path.join(__dirname, 'data', userEmail);
    if (!fs.existsSync(userDataDir)) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Switch current user
    CURRENT_USER_EMAIL = userEmail;
    
    // Reinitialize Gmail API for new user
    gmailAuth = null;
    gmail = null;
    
    // Load new user's data
    const newPersistentData = loadDataFromFile();
    emailMemory = {
      categories: [],
      responses: [],
      refinements: newPersistentData.refinements,
      savedGenerations: newPersistentData.savedGenerations,
      scenarios: newPersistentData.scenarios
    };
    
    // Try to initialize Gmail API for new user
    const gmailInitialized = await initializeGmailAPI();
    
    console.log(`Switched to user: ${userEmail}`);
    res.json({ 
      success: true, 
      currentUser: CURRENT_USER_EMAIL,
      gmailInitialized: gmailInitialized,
      message: `Switched to user ${userEmail}` 
    });
  } catch (error) {
    console.error('Error switching user:', error);
    res.status(500).json({ error: 'Failed to switch user' });
  }
});

// API endpoint to upload OAuth keys for a user
app.post('/api/upload-oauth-keys', async (req, res) => {
  try {
    const { userEmail, oauthKeys } = req.body;
    
    if (!userEmail || !userEmail.includes('@')) {
      return res.status(400).json({ error: 'Invalid user email' });
    }
    
    if (!oauthKeys) {
      return res.status(400).json({ error: 'OAuth keys data is required' });
    }
    
    // Validate OAuth keys structure
    const hasValidStructure = (oauthKeys.installed || oauthKeys.web) && 
                             (oauthKeys.installed?.client_id || oauthKeys.web?.client_id);
    
    if (!hasValidStructure) {
      return res.status(400).json({ error: 'Invalid OAuth keys format. Expected Google Cloud credentials JSON.' });
    }
    
    // Get user paths
    const userPaths = getUserPaths(userEmail);
    
    // Ensure user directory exists
    if (!fs.existsSync(userPaths.USER_DATA_DIR)) {
      fs.mkdirSync(userPaths.USER_DATA_DIR, { recursive: true });
    }
    
    // Save OAuth keys to user-specific location
    fs.writeFileSync(userPaths.OAUTH_KEYS_PATH, JSON.stringify(oauthKeys, null, 2));
    
    console.log(`OAuth keys uploaded successfully for user: ${userEmail}`);
    
    // If this is the current user, reinitialize Gmail API
    if (userEmail === CURRENT_USER_EMAIL) {
      gmailAuth = null;
      gmail = null;
      const gmailInitialized = await initializeGmailAPI();
      
      res.json({ 
        success: true, 
        message: `OAuth keys uploaded successfully for ${userEmail}`,
        gmailInitialized: gmailInitialized
      });
    } else {
      res.json({ 
        success: true, 
        message: `OAuth keys uploaded successfully for ${userEmail}`
      });
    }
    
  } catch (error) {
    console.error('Error uploading OAuth keys:', error);
    res.status(500).json({ error: 'Failed to upload OAuth keys: ' + error.message });
  }
});

// Gmail authentication endpoints
app.get('/api/auth', (req, res) => {
  try {
    const authUrl = getGmailAuthUrl();
    if (!authUrl) {
      return res.status(500).json({ error: 'Gmail authentication not available' });
    }
    res.json({ authUrl });
  } catch (error) {
    console.error('Error getting auth URL:', error);
    res.status(500).json({ error: 'Failed to get authentication URL' });
  }
});

app.post('/api/auth/callback', async (req, res) => {
  try {
    const { code } = req.body;
    const success = await handleGmailAuthCallback(code);
    
    if (success) {
      res.json({ success: true, message: 'Authentication successful' });
    } else {
      res.status(400).json({ success: false, error: 'Authentication failed' });
    }
  } catch (error) {
    console.error('Error handling auth callback:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

// Handle OAuth2 callback redirect from Google
app.get('/oauth2callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    
    if (error) {
      console.error('OAuth error:', error);
      return res.send(`
        <html>
          <head><title>Authentication Error</title></head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h2>❌ Authentication Error</h2>
            <p>There was an error during authentication: ${error}</p>
            <p>Please close this window and try again.</p>
          </body>
        </html>
      `);
    }
    
    if (!code) {
      return res.send(`
        <html>
          <head><title>Authentication Error</title></head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h2>❌ No Authorization Code</h2>
            <p>No authorization code received from Google.</p>
            <p>Please close this window and try again.</p>
          </body>
        </html>
      `);
    }
    
    // Handle the OAuth callback
    const success = await handleGmailAuthCallback(code);
    
    if (success) {
      res.send(`
        <html>
          <head><title>Authentication Successful</title></head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h2>✅ Authentication Successful!</h2>
            <p>Your Gmail account has been successfully connected.</p>
            <p>You can now close this window and return to the application.</p>
            <script>
              // Try to close the window after a short delay
              setTimeout(() => {
                window.close();
              }, 2000);
            </script>
          </body>
        </html>
      `);
    } else {
      res.send(`
        <html>
          <head><title>Authentication Failed</title></head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h2>❌ Authentication Failed</h2>
            <p>There was an error processing your authentication.</p>
            <p>Please close this window and try again.</p>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.send(`
      <html>
        <head><title>Authentication Error</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h2>❌ Authentication Error</h2>
          <p>An unexpected error occurred during authentication.</p>
          <p>Please close this window and try again.</p>
        </body>
      </html>
    `);
  }
});

// API endpoint to load email threads using Gmail API
app.post('/api/load-email-threads', async (req, res) => {
  try {
    const { threadCount } = req.body;
    
    if (!threadCount || threadCount < 1 || threadCount > 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'Thread count must be between 1 and 10' 
      });
    }

    console.log(`Loading ${threadCount} email threads using Gmail API...`);

    // Check if Gmail API is available and authenticated
    if (!gmail) {
      return res.status(401).json({
        success: false,
        needsAuth: true,
        error: 'Gmail authentication required'
      });
    }

    try {
      // Load existing response emails and threads to avoid duplicates
      const existingResponseEmails = loadResponseEmails();
      const existingEmailThreads = loadEmailThreads();
      
      // Create sets of existing email IDs and thread IDs for fast lookup
      const existingEmailIds = new Set(existingResponseEmails.map(email => email.id));
      const existingThreadIds = new Set(existingEmailThreads.map(thread => thread.id));
      const existingSubjectFromPairs = new Set(
        existingResponseEmails.map(email => `${email.subject.toLowerCase()}|${email.originalFrom?.toLowerCase() || 'unknown'}`)
      );

      // Search for sent emails (your responses) - get more to account for filtering
      const sentEmails = await searchGmailEmails(`from:${CURRENT_USER_EMAIL} in:sent`, threadCount * 5);
      
      if (sentEmails.length === 0) {
        return res.json({
          success: false,
          error: 'No sent emails found to create threads from'
        });
      }

      console.log(`Found ${sentEmails.length} sent emails, processing threads...`);

      const threads = [];
      const processedThreadIds = new Set();

      // Process each sent email to find threads
      for (const sentEmail of sentEmails) {
        try {
          // Skip if we already processed this thread in this request
          if (processedThreadIds.has(sentEmail.threadId)) {
            continue;
          }

          // Get the full sent email content
          const sentEmailData = await getGmailEmail(sentEmail.id);
          
          // Skip if this email is already in our database
          if (existingEmailIds.has(sentEmailData.id)) {
            console.log(`Skipping email ${sentEmailData.id} - already in database`);
            continue;
          }
          
          // Check if this is a reply (has "Re:" in subject)
          const isReply = sentEmailData.subject.toLowerCase().startsWith('re:');
          if (!isReply) {
            continue; // Skip emails that aren't replies
          }

          // Use Gmail threads API to get all messages in the thread
          const threadResponse = await gmail.users.threads.get({
            userId: 'me',
            id: sentEmail.threadId
          });

          const threadMessages = threadResponse.data.messages || [];
          
          // Find the original email (not from current user)
          const originalMessage = threadMessages.find(msg => {
            const msgHeaders = msg.payload.headers;
            const msgFrom = msgHeaders.find(h => h.name === 'From')?.value || '';
            return !msgFrom.includes(CURRENT_USER_EMAIL);
          });

          if (!originalMessage) {
            continue;
          }

          // Get the original email content using the message data we already have
          const originalEmailData = await getGmailEmail(originalMessage.id);

          // Check for duplicates based on subject and original sender
          const subjectFromKey = `${sentEmailData.subject.toLowerCase()}|${originalEmailData.from.toLowerCase()}`;
          if (existingSubjectFromPairs.has(subjectFromKey)) {
            console.log(`Skipping thread - similar email already exists: ${sentEmailData.subject} from ${originalEmailData.from}`);
            continue;
          }

          // Check if thread ID already exists
          const threadId = `thread-${sentEmail.threadId}`;
          if (existingThreadIds.has(threadId)) {
            console.log(`Skipping thread ${threadId} - already in database`);
            continue;
          }

          // Create thread object with unique ID based on timestamp and thread ID
          const uniqueThreadId = `thread-${sentEmail.threadId}-${Date.now()}`;
          
          // Safely handle the 'to' field which might be a string or undefined
          const originalTo = originalEmailData.to ? originalEmailData.to.split(',').map(email => email.trim()) : [CURRENT_USER_EMAIL];
          const sentTo = sentEmailData.to ? sentEmailData.to.split(',').map(email => email.trim()) : [originalEmailData.from];
          
          const thread = {
            id: uniqueThreadId,
            subject: sentEmailData.subject,
            messages: [
              {
                id: originalEmailData.id,
                from: originalEmailData.from,
                to: originalTo,
                date: originalEmailData.date,
                subject: originalEmailData.subject,
                body: originalEmailData.body || 'No content available',
                isResponse: false
              },
              {
                id: sentEmailData.id,
                from: sentEmailData.from,
                to: sentTo,
                date: sentEmailData.date,
                subject: sentEmailData.subject,
                body: sentEmailData.body || 'No content available',
                isResponse: true
              }
            ]
          };

          threads.push(thread);
          processedThreadIds.add(sentEmail.threadId);
          
          // Add to our tracking sets to avoid duplicates within this request
          existingEmailIds.add(sentEmailData.id);
          existingThreadIds.add(threadId);
          existingSubjectFromPairs.add(subjectFromKey);

          // Stop when we have enough threads
          if (threads.length >= threadCount) {
            break;
          }

        } catch (emailError) {
          console.error('Error processing email thread:', emailError);
          continue; // Skip this email and continue with others
        }
      }

      console.log(`Successfully loaded ${threads.length} new email threads from Gmail`);
      
      res.json({
        success: true,
        threads: threads,
        message: `Loaded ${threads.length} new email threads from your Gmail inbox`
      });

    } catch (gmailError) {
      console.error('Gmail API Error:', gmailError);
      
      // Check if it's an authentication error
      if (gmailError.code === 401 || gmailError.message?.includes('invalid_grant')) {
        return res.status(401).json({
          success: false,
          needsAuth: true,
          error: 'Gmail authentication expired. Please re-authenticate.'
        });
      }
      
      // Fallback to simulated data if Gmail API fails
      console.log('Falling back to simulated data due to Gmail API error');
      const simulatedThreads = [];
      
      for (let i = 1; i <= threadCount; i++) {
        const thread = {
          id: `simulated-thread-${Date.now()}-${i}`,
          subject: `Re: Simulated Email Thread ${i}`,
          messages: [
            {
              id: `original-${Date.now()}-${i}`,
              from: `sender${i}@example.com`,
              to: [CURRENT_USER_EMAIL],
              date: new Date(Date.now() - (i * 86400000)).toISOString(),
              subject: `Simulated Email Thread ${i}`,
              body: `This is a simulated original email ${i}. Gmail API failed, so this is sample data.`,
              isResponse: false
            },
            {
              id: `response-${Date.now()}-${i}`,
              from: CURRENT_USER_EMAIL,
              to: [`sender${i}@example.com`],
              date: new Date(Date.now() - (i * 86400000) + 3600000).toISOString(),
              subject: `Re: Simulated Email Thread ${i}`,
              body: `This is your simulated response ${i}. Gmail API failed, so this is sample data.`,
              isResponse: true
            }
          ]
        };
        
        simulatedThreads.push(thread);
      }

      res.json({
        success: true,
        threads: simulatedThreads,
        message: `Gmail API failed. Showing ${simulatedThreads.length} simulated threads as fallback.`,
        fallback: true
      });
    }

  } catch (error) {
    console.error('Error in load email threads endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load email threads: ' + error.message
    });
  }
});

// Store for tracking previously shown results during refresh operations
let refreshExclusionCache = {
  emails: new Set(),
  threads: new Set(),
  lastClearTime: Date.now()
};

// Clear exclusion cache every 30 minutes to prevent it from growing indefinitely
setInterval(() => {
  refreshExclusionCache.emails.clear();
  refreshExclusionCache.threads.clear();
  refreshExclusionCache.lastClearTime = Date.now();
  console.log('Cleared refresh exclusion cache');
}, 30 * 60 * 1000);

// API endpoint to fetch more emails from inbox using Gmail API directly
app.post('/api/fetch-more-emails', async (req, res) => {
  try {
    const { query, maxResults, refresh } = req.body;
    const emailCount = maxResults || 10;
    const isRefresh = refresh === true;
    
    if (emailCount < 1 || emailCount > 50) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email count must be between 1 and 50' 
      });
    }

    console.log(`Fetching ${emailCount} emails from Gmail inbox${query ? ` with query: ${query}` : ''}...`);

    // Check if Gmail API is available and authenticated
    if (!gmail || !gmailAuth) {
      return res.status(401).json({
        success: false,
        needsAuth: true,
        error: 'Gmail authentication required',
        message: 'Please authenticate with Gmail to access your emails'
      });
    }

    // Check if we have valid credentials
    const paths = getCurrentUserPaths();
    if (!fs.existsSync(paths.TOKENS_PATH)) {
      return res.status(401).json({
        success: false,
        needsAuth: true,
        error: 'Gmail authentication required',
        message: 'Please authenticate with Gmail to access your emails'
      });
    }

    // Verify credentials are valid by checking if we have access token
    try {
      const credentials = gmailAuth.credentials;
      if (!credentials || !credentials.access_token) {
        return res.status(401).json({
          success: false,
          needsAuth: true,
          error: 'Gmail authentication required',
          message: 'Please authenticate with Gmail to access your emails'
        });
      }
    } catch (credError) {
      return res.status(401).json({
        success: false,
        needsAuth: true,
        error: 'Gmail authentication required',
        message: 'Please authenticate with Gmail to access your emails'
      });
    }

    try {
      // Load existing emails to avoid duplicates
      const existingUnrepliedEmails = loadUnrepliedEmails();
      const existingResponseEmails = loadResponseEmails();
      
      // Create sets for fast duplicate checking
      const existingEmailIds = new Set([
        ...existingUnrepliedEmails.map(email => email.id),
        ...existingResponseEmails.map(email => email.id)
      ]);
      
      const existingSubjectFromPairs = new Set([
        ...existingUnrepliedEmails.map(email => `${email.subject.toLowerCase()}|${email.from.toLowerCase()}`),
        ...existingResponseEmails.map(email => `${email.subject.toLowerCase()}|${email.originalFrom?.toLowerCase() || email.from.toLowerCase()}`)
      ]);

      // If this is a refresh request, also exclude previously shown emails in this session
      if (isRefresh) {
        console.log(`Refresh request - excluding ${refreshExclusionCache.emails.size} previously shown emails`);
      }

      // Build Gmail search query - get more emails to account for filtering
      let searchQuery = 'in:inbox';
      if (query && query.trim()) {
        searchQuery += ` ${query.trim()}`;
      }

      console.log(`Searching Gmail with query: ${searchQuery}`);

      // Search for emails using Gmail API - get more to account for duplicates and exclusions
      const searchMultiplier = isRefresh ? 5 : 3; // Get more emails for refresh to account for exclusions
      const emailMessages = await searchGmailEmails(searchQuery, emailCount * searchMultiplier);
      
      if (emailMessages.length === 0) {
        return res.json({
          success: true,
          message: 'No emails found matching the criteria',
          emails: []
        });
      }

      console.log(`Found ${emailMessages.length} emails, processing content and filtering duplicates...`);

      // Get full email content for each message and filter duplicates
      const processedEmails = [];
      
      for (const message of emailMessages) {
        try {
          const emailData = await getGmailEmail(message.id);
          
          // Skip if email ID already exists
          if (existingEmailIds.has(emailData.id)) {
            console.log(`Skipping email ${emailData.id} - already in database`);
            continue;
          }
          
          // Skip if this email was shown in a previous request during this session (for refresh)
          if (isRefresh && refreshExclusionCache.emails.has(emailData.id)) {
            console.log(`Skipping email ${emailData.id} - shown in previous request`);
            continue;
          }
          
          // Skip if subject+sender combination already exists
          const subjectFromKey = `${emailData.subject.toLowerCase()}|${emailData.from.toLowerCase()}`;
          if (existingSubjectFromPairs.has(subjectFromKey)) {
            console.log(`Skipping email - similar already exists: ${emailData.subject} from ${emailData.from}`);
            continue;
          }
          
          // Skip if this subject+sender was shown in a previous request (for refresh)
          if (isRefresh && refreshExclusionCache.emails.has(subjectFromKey)) {
            console.log(`Skipping email - similar shown in previous request: ${emailData.subject} from ${emailData.from}`);
            continue;
          }
          
          const processedEmail = {
            id: emailData.id,
            subject: emailData.subject,
            from: emailData.from,
            date: emailData.date,
            body: emailData.body,
            snippet: emailData.snippet || (emailData.body ? emailData.body.substring(0, 100) + (emailData.body.length > 100 ? '...' : '') : 'No content available'),
            category: categorizeEmail(emailData.subject, emailData.body, emailData.from),
            source: 'gmail-api'
          };
          
          processedEmails.push(processedEmail);
          
          // Add to tracking sets to avoid duplicates within this request
          existingEmailIds.add(emailData.id);
          existingSubjectFromPairs.add(subjectFromKey);
          
          // Add to refresh exclusion cache for future refresh requests
          refreshExclusionCache.emails.add(emailData.id);
          refreshExclusionCache.emails.add(subjectFromKey);
          
          // Stop when we have enough unique emails
          if (processedEmails.length >= emailCount) {
            break;
          }
          
        } catch (emailError) {
          console.error('Error processing email:', emailError);
          continue; // Skip this email and continue with others
        }
      }

      console.log(`Successfully processed ${processedEmails.length} new emails from Gmail`);

      // If no new emails found during refresh, clear the cache and try again once
      if (isRefresh && processedEmails.length === 0 && refreshExclusionCache.emails.size > 0) {
        console.log('No new emails found during refresh, clearing exclusion cache and retrying...');
        refreshExclusionCache.emails.clear();
        
        // Retry the search with cleared cache
        const retryMessages = await searchGmailEmails(searchQuery, emailCount * 2);
        const retryEmails = [];
        
        for (const message of retryMessages.slice(0, emailCount)) {
          try {
            const emailData = await getGmailEmail(message.id);
            
            if (existingEmailIds.has(emailData.id)) continue;
            
            const subjectFromKey = `${emailData.subject.toLowerCase()}|${emailData.from.toLowerCase()}`;
            if (existingSubjectFromPairs.has(subjectFromKey)) continue;
            
            const processedEmail = {
              id: emailData.id,
              subject: emailData.subject,
              from: emailData.from,
              date: emailData.date,
              body: emailData.body,
              snippet: emailData.snippet || (emailData.body ? emailData.body.substring(0, 100) + (emailData.body.length > 100 ? '...' : '') : 'No content available'),
              category: categorizeEmail(emailData.subject, emailData.body, emailData.from),
              source: 'gmail-api'
            };
            
            retryEmails.push(processedEmail);
            refreshExclusionCache.emails.add(emailData.id);
            refreshExclusionCache.emails.add(subjectFromKey);
            
          } catch (emailError) {
            continue;
          }
        }
        
        if (retryEmails.length > 0) {
          console.log(`Retry successful: found ${retryEmails.length} emails after clearing cache`);
          return res.json({
            success: true,
            message: `Refreshed with ${retryEmails.length} new emails from Gmail inbox`,
            emails: retryEmails,
            fallback: false
          });
        }
      }

      res.json({
        success: true,
        message: isRefresh ? 
          `Refreshed with ${processedEmails.length} new emails from Gmail inbox` :
          `Fetched ${processedEmails.length} new emails from Gmail inbox`,
        emails: processedEmails,
        fallback: false
      });

    } catch (gmailError) {
      console.error('Gmail API Error:', gmailError);
      
      // Check if it's an authentication error
      if (gmailError.code === 401 || gmailError.message?.includes('invalid_grant') || 
          gmailError.message?.includes('No access, refresh token')) {
        return res.status(401).json({
          success: false,
          needsAuth: true,
          error: 'Gmail authentication expired',
          message: 'Please re-authenticate with Gmail to access your emails'
        });
      }
      
      // For other Gmail API errors, fall back to simulated data
      console.log('Gmail API failed, generating simulated emails for testing');
      const simulatedEmails = [];
      
      const sampleSenders = [
        'professor@columbia.edu',
        'student@columbia.edu', 
        'admin@columbia.edu',
        'conference@acm.org',
        'journal@ieee.org',
        'colleague@cs.columbia.edu'
      ];
      
      const sampleSubjects = [
        'Research Paper Review Request',
        'Meeting Scheduling Request', 
        'Conference Submission Deadline',
        'Course Registration Question',
        'Lab Meeting Tomorrow',
        'Collaboration Opportunity'
      ];
      
      for (let i = 1; i <= emailCount; i++) {
        const sender = sampleSenders[Math.floor(Math.random() * sampleSenders.length)];
        const subject = query ? `${sampleSubjects[Math.floor(Math.random() * sampleSubjects.length)]} (${query})` : sampleSubjects[Math.floor(Math.random() * sampleSubjects.length)];
        
        const email = {
          id: `gmail-fallback-${Date.now()}-${i}`,
          subject: subject,
          from: sender,
          date: new Date(Date.now() - (i * 3600000 * Math.random() * 24)).toISOString(),
          body: `This is a simulated email ${i} from ${sender}. ${query ? `It matches your search query "${query}". ` : ''}Gmail API failed, so this is fallback data.`,
          snippet: `This is a simulated email ${i} from ${sender}...`,
          category: categorizeEmail(subject, `Simulated email content ${i}`, sender),
          source: 'gmail-fallback'
        };
        
        simulatedEmails.push(email);
      }

      res.json({
        success: true,
        message: `Gmail API failed. Generated ${simulatedEmails.length} simulated emails as fallback.`,
        emails: simulatedEmails,
        fallback: true
      });
    }

  } catch (error) {
    console.error('Error in fetch more emails endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch emails: ' + error.message
    });
  }
});

// API endpoint to load more emails from inbox using MCP
app.post('/api/load-more-emails', async (req, res) => {
  try {
    const { emailCount } = req.body;
    
    if (!emailCount || emailCount < 1 || emailCount > 50) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email count must be between 1 and 50' 
      });
    }

    console.log(`Loading ${emailCount} more emails from inbox using MCP...`);

    // Use MCP Gmail server to search for emails
    try {
      const mcpResponse = await fetch('http://localhost:3001/mcp/search_emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'in:inbox',
          maxResults: emailCount
        })
      });

      if (!mcpResponse.ok) {
        throw new Error(`MCP request failed: ${mcpResponse.status}`);
      }

      const mcpData = await mcpResponse.json();
      
      if (mcpData.emails && mcpData.emails.length > 0) {
        // Process and categorize the emails
        const processedEmails = mcpData.emails.map(email => ({
          id: email.id || `inbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          subject: email.subject || 'No Subject',
          from: email.from || 'Unknown Sender',
          date: email.date || new Date().toISOString(),
          body: email.body || email.snippet || 'No content available',
          snippet: email.snippet || (email.body ? email.body.substring(0, 100) + '...' : 'No content available'),
          category: categorizeEmail(email.subject || '', email.body || email.snippet || '', email.from || ''),
          source: 'inbox'
        }));

        // Load existing unreplied emails
        const paths = getCurrentUserPaths();
        const existingUnrepliedEmails = loadUnrepliedEmails();
        
        // Merge with existing emails (avoid duplicates by subject and from)
        const allUnrepliedEmails = [...existingUnrepliedEmails];
        
        processedEmails.forEach(newEmail => {
          const isDuplicate = allUnrepliedEmails.some(existing => 
            existing.subject === newEmail.subject && 
            existing.from === newEmail.from &&
            Math.abs(new Date(existing.date) - new Date(newEmail.date)) < 86400000 // Within 24 hours
          );
          
          if (!isDuplicate) {
            allUnrepliedEmails.push(newEmail);
          }
        });

        // Save updated unreplied emails
        if (!fs.existsSync(paths.USER_DATA_DIR)) {
          fs.mkdirSync(paths.USER_DATA_DIR, { recursive: true });
        }

        fs.writeFileSync(paths.UNREPLIED_EMAILS_PATH, JSON.stringify({
          emails: allUnrepliedEmails
        }, null, 2));

        const newEmailsAdded = allUnrepliedEmails.length - existingUnrepliedEmails.length;

        console.log(`Successfully loaded ${processedEmails.length} emails, added ${newEmailsAdded} new emails to unreplied emails`);
        
        res.json({
          success: true,
          message: `Loaded ${processedEmails.length} emails from inbox, ${newEmailsAdded} new emails added`,
          emailsLoaded: processedEmails.length,
          newEmailsAdded: newEmailsAdded,
          emails: processedEmails
        });

      } else {
        res.json({
          success: false,
          error: 'No emails found in inbox'
        });
      }

    } catch (mcpError) {
      console.error('MCP Gmail Error:', mcpError);
      
      // Fallback to simulated data if MCP fails
      console.log('MCP failed, generating simulated inbox emails');
      const simulatedEmails = [];
      
      for (let i = 1; i <= emailCount; i++) {
        const email = {
          id: `simulated-inbox-${Date.now()}-${i}`,
          subject: `Simulated Inbox Email ${i}`,
          from: `sender${i}@example.com`,
          date: new Date(Date.now() - (i * 3600000)).toISOString(), // Each email 1 hour apart
          body: `This is a simulated inbox email ${i}. MCP Gmail integration failed, so this is sample data for testing the load more emails feature.`,
          snippet: `This is a simulated inbox email ${i}. MCP Gmail integration failed...`,
          category: categorizeEmail(`Simulated Inbox Email ${i}`, `This is a simulated inbox email ${i}`, `sender${i}@example.com`),
          source: 'inbox-simulated'
        };
        
        simulatedEmails.push(email);
      }

      // Add simulated emails to unreplied emails
      const paths = getCurrentUserPaths();
      const existingUnrepliedEmails = loadUnrepliedEmails();
      const allUnrepliedEmails = [...existingUnrepliedEmails, ...simulatedEmails];

      if (!fs.existsSync(paths.USER_DATA_DIR)) {
        fs.mkdirSync(paths.USER_DATA_DIR, { recursive: true });
      }

      fs.writeFileSync(paths.UNREPLIED_EMAILS_PATH, JSON.stringify({
        emails: allUnrepliedEmails
      }, null, 2));

      res.json({
        success: true,
        message: `MCP failed. Loaded ${simulatedEmails.length} simulated emails as fallback.`,
        emailsLoaded: simulatedEmails.length,
        newEmailsAdded: simulatedEmails.length,
        emails: simulatedEmails,
        fallback: true
      });
    }

  } catch (error) {
    console.error('Error in load more emails endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load more emails: ' + error.message
    });
  }
});

// API endpoint to add approved email to the database
app.post('/api/add-approved-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.id || !email.subject || !email.from || !email.body) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email data provided'
      });
    }

    console.log(`Adding approved email to database: ${email.subject}`);

    // Load existing unreplied emails
    const existingUnrepliedEmails = loadUnrepliedEmails();
    
    // Check if email already exists (avoid duplicates)
    const isDuplicate = existingUnrepliedEmails.some(existing => 
      existing.id === email.id || 
      (existing.subject === email.subject && 
       existing.from === email.from &&
       Math.abs(new Date(existing.date) - new Date(email.date)) < 3600000) // Within 1 hour
    );
    
    if (isDuplicate) {
      return res.json({
        success: true,
        message: 'Email already exists in database',
        duplicate: true
      });
    }

    // Process and categorize the email
    const processedEmail = {
      id: email.id,
      subject: email.subject || 'No Subject',
      from: email.from || 'Unknown Sender',
      date: email.date || new Date().toISOString(),
      body: email.body || 'No content available',
      snippet: email.snippet || (email.body ? email.body.substring(0, 100) + (email.body.length > 100 ? '...' : '') : 'No content available'),
      category: email.category || categorizeEmail(email.subject || '', email.body || '', email.from || ''),
      source: 'approved-fetch'
    };

    // Add to unreplied emails
    const allUnrepliedEmails = [...existingUnrepliedEmails, processedEmail];

    // Save updated unreplied emails
    try {
      const paths = getCurrentUserPaths();
      
      // Ensure data directory exists
      if (!fs.existsSync(paths.USER_DATA_DIR)) {
        fs.mkdirSync(paths.USER_DATA_DIR, { recursive: true });
      }

      fs.writeFileSync(paths.UNREPLIED_EMAILS_PATH, JSON.stringify({
        emails: allUnrepliedEmails
      }, null, 2));

      console.log(`Successfully added approved email to database: ${email.subject}`);
      
      res.json({
        success: true,
        message: 'Email approved and added to database',
        email: processedEmail
      });

    } catch (saveError) {
      console.error('Error saving approved email to database:', saveError);
      res.status(500).json({
        success: false,
        error: 'Failed to save approved email to database'
      });
    }

  } catch (error) {
    console.error('Error adding approved email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add approved email: ' + error.message
    });
  }
});

// API endpoint to add email threads to the database
app.post('/api/add-email-threads', async (req, res) => {
  try {
    const { threads } = req.body;
    
    if (!threads || !Array.isArray(threads) || threads.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No threads provided'
      });
    }

    console.log(`Adding ${threads.length} email threads to database...`);

    // Load existing data
    const existingResponseEmails = loadResponseEmails();
    const existingEmailThreads = loadEmailThreads();

    // Convert threads to response emails format
    const newResponseEmails = [];
    const newEmailThreads = [];

    threads.forEach(thread => {
      // Find the response message (user's reply)
      const responseMessage = thread.messages.find(msg => msg.isResponse);
      const originalMessage = thread.messages.find(msg => !msg.isResponse);
      
      if (responseMessage && originalMessage) {
        // Add to response emails
        const responseEmail = {
          id: responseMessage.id,
          subject: responseMessage.subject,
          from: responseMessage.from,
          originalFrom: originalMessage.from,
          date: responseMessage.date,
          category: categorizeEmail(responseMessage.subject, responseMessage.body, originalMessage.from),
          body: responseMessage.body,
          snippet: responseMessage.body.substring(0, 100) + (responseMessage.body.length > 100 ? '...' : ''),
          originalBody: originalMessage.body
        };
        
        newResponseEmails.push(responseEmail);

        // Add to email threads
        const emailThread = {
          id: thread.id,
          subject: thread.subject,
          from: responseMessage.from,
          originalFrom: originalMessage.from,
          date: responseMessage.date,
          body: responseMessage.body,
          originalBody: originalMessage.body
        };
        
        newEmailThreads.push(emailThread);
      }
    });

    // Merge with existing data (avoid duplicates)
    const allResponseEmails = [...existingResponseEmails];
    const allEmailThreads = [...existingEmailThreads];

    newResponseEmails.forEach(newEmail => {
      if (!allResponseEmails.find(existing => existing.id === newEmail.id)) {
        allResponseEmails.push(newEmail);
      }
    });

    newEmailThreads.forEach(newThread => {
      if (!allEmailThreads.find(existing => existing.id === newThread.id)) {
        allEmailThreads.push(newThread);
      }
    });

    // Save updated data back to files
    try {
      const paths = getCurrentUserPaths();
      
      // Ensure data directory exists
      if (!fs.existsSync(paths.USER_DATA_DIR)) {
        fs.mkdirSync(paths.USER_DATA_DIR, { recursive: true });
      }

      // Save response emails
      fs.writeFileSync(paths.RESPONSE_EMAILS_PATH, JSON.stringify({
        emails: allResponseEmails
      }, null, 2));

      // Save email threads
      fs.writeFileSync(paths.EMAIL_THREADS_PATH, JSON.stringify({
        threads: allEmailThreads
      }, null, 2));

      console.log(`Successfully added ${newResponseEmails.length} new email threads to database`);
      
      res.json({
        success: true,
        message: `Added ${newResponseEmails.length} email threads to database`,
        addedCount: newResponseEmails.length
      });

    } catch (saveError) {
      console.error('Error saving email threads to files:', saveError);
      res.status(500).json({
        success: false,
        error: 'Failed to save email threads to database'
      });
    }

  } catch (error) {
    console.error('Error adding email threads:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add email threads: ' + error.message
    });
  }
});

// API endpoint to delete an email thread
app.delete('/api/email-thread/:emailId', async (req, res) => {
  try {
    const emailId = req.params.emailId;
    
    if (!emailId) {
      return res.status(400).json({
        success: false,
        error: 'Email ID is required'
      });
    }

    console.log(`Deleting email thread with ID: ${emailId}`);

    // Load existing data
    const existingResponseEmails = loadResponseEmails();
    const existingEmailThreads = loadEmailThreads();

    // Find the email to delete
    const emailToDelete = existingResponseEmails.find(email => email.id === emailId);
    
    if (!emailToDelete) {
      return res.status(404).json({
        success: false,
        error: 'Email thread not found'
      });
    }

    // Remove from response emails
    const updatedResponseEmails = existingResponseEmails.filter(email => email.id !== emailId);
    
    // Remove from email threads
    const updatedEmailThreads = existingEmailThreads.filter(thread => thread.id !== emailId);

    // Save updated data back to files
    try {
      const paths = getCurrentUserPaths();
      
      // Ensure data directory exists
      if (!fs.existsSync(paths.USER_DATA_DIR)) {
        fs.mkdirSync(paths.USER_DATA_DIR, { recursive: true });
      }

      // Save updated response emails
      fs.writeFileSync(paths.RESPONSE_EMAILS_PATH, JSON.stringify({
        emails: updatedResponseEmails
      }, null, 2));

      // Save updated email threads
      fs.writeFileSync(paths.EMAIL_THREADS_PATH, JSON.stringify({
        threads: updatedEmailThreads
      }, null, 2));

      console.log(`Successfully deleted email thread: ${emailToDelete.subject}`);
      
      res.json({
        success: true,
        message: `Email thread "${emailToDelete.subject}" deleted successfully`,
        deletedEmail: {
          id: emailToDelete.id,
          subject: emailToDelete.subject
        }
      });

    } catch (saveError) {
      console.error('Error saving updated data after deletion:', saveError);
      res.status(500).json({
        success: false,
        error: 'Failed to save changes after deletion'
      });
    }

  } catch (error) {
    console.error('Error deleting email thread:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete email thread: ' + error.message
    });
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Current user: ${CURRENT_USER_EMAIL}`);
  console.log(`Data directory: ${getCurrentUserPaths().USER_DATA_DIR}`);
  console.log(`Loaded ${emailMemory.scenarios.length} scenarios, ${emailMemory.refinements.length} refinements, ${emailMemory.savedGenerations.length} saved generations`);
  
  // Initialize Gmail API on startup
  const gmailInitialized = await initializeGmailAPI();
  if (gmailInitialized) {
    console.log('Gmail API ready for use');
  } else {
    console.log('Gmail API requires authentication - visit /api/auth to authenticate');
  }
});
