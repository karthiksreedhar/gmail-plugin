/**
 * Feature Generator Agent Server
 * Express server for generating Gmail Plugin features using Gemini
 * Also supports Email Chat mode for querying email data
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const { FeatureGeneratorAgent } = require('./agent');
const { invokeGemini, getGeminiModel } = require('./gemini');

// Import database module from parent directory (graceful fallback in serverless if unavailable)
let initMongo = async () => { throw new Error('DB module unavailable'); };
let getUserDoc = async () => null;
let getDb = () => { throw new Error('DB module unavailable'); };
let setUserDoc = async () => false;
let dbModuleLoadError = null;
try {
  const dbModule = require('./db');
  initMongo = dbModule.initMongo;
  getUserDoc = dbModule.getUserDoc;
  getDb = dbModule.getDb;
  setUserDoc = dbModule.setUserDoc;
} catch (error) {
  try {
    const dbModule = require('../db');
    initMongo = dbModule.initMongo;
    getUserDoc = dbModule.getUserDoc;
    getDb = dbModule.getDb;
    setUserDoc = dbModule.setUserDoc;
  } catch (fallbackError) {
    dbModuleLoadError = fallbackError;
    console.error('DB module failed to load:', fallbackError.message);
  }
}

// =====================================================
// OPERATIONS LOGGING INFRASTRUCTURE
// =====================================================

class OperationsLogger {
  constructor() {
    this.reset();
  }

  reset() {
    this.startTime = Date.now();
    this.mongoQueries = [];
    this.apiCalls = [];
    this.dataSummary = {
      totalEmails: 0,
      contextSize: 0,
      usersQueried: []
    };
    this.errors = [];
  }

  logMongoQuery(collection, userEmail, resultCount, duration, success = true, error = null, rawResult = null) {
    this.mongoQueries.push({
      collection,
      userEmail,
      resultCount,
      duration,
      success,
      error: error?.message || null,
      timestamp: new Date().toISOString(),
      // Store a summary of the raw result (truncated for large data)
      resultPreview: rawResult ? this.truncateResult(rawResult, collection) : null
    });
  }

  logApiCall(model, inputTokens, outputTokens, duration, success = true, error = null, systemPrompt = null, userMessage = null, response = null) {
    this.apiCalls.push({
      model,
      inputTokens,
      outputTokens,
      duration,
      success,
      error: error?.message || null,
      timestamp: new Date().toISOString(),
      // Store full input/output details
      details: {
        systemPrompt: systemPrompt ? this.truncateText(systemPrompt, 5000) : null,
        userMessage: userMessage || null,
        response: response ? this.truncateText(response, 3000) : null
      }
    });
  }

  // Truncate text for storage
  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + `\n\n... [truncated, ${text.length - maxLength} more chars]`;
  }

  // Truncate result based on collection type
  truncateResult(result, collection) {
    if (!result) return null;
    
    try {
      // For arrays, show first few items
      if (result.emails && Array.isArray(result.emails)) {
        return {
          type: 'emails',
          totalCount: result.emails.length,
          sample: result.emails.slice(0, 3).map(e => ({
            subject: e.subject,
            from: e.from || e.originalFrom,
            category: e.category || e._cat,
            date: e.date
          }))
        };
      }
      if (result.categories && Array.isArray(result.categories)) {
        return { type: 'categories', data: result.categories };
      }
      if (result.guidelines) {
        return { type: 'guidelines', data: result.guidelines };
      }
      if (result.summaries) {
        return { type: 'summaries', data: result.summaries };
      }
      if (result.responses && Array.isArray(result.responses)) {
        return { type: 'responses', totalCount: result.responses.length };
      }
      if (result.threads && Array.isArray(result.threads)) {
        return { type: 'threads', totalCount: result.threads.length };
      }
      if (result.notes && Array.isArray(result.notes)) {
        return { type: 'notes', totalCount: result.notes.length };
      }
      
      // For other types, stringify limited portion
      const str = JSON.stringify(result);
      return { type: 'raw', data: str.substring(0, 500) };
    } catch (e) {
      return { type: 'error', message: 'Could not serialize result' };
    }
  }

  logDataSummary(totalEmails, contextSize, usersQueried) {
    this.dataSummary = {
      totalEmails,
      contextSize,
      usersQueried
    };
  }

  logError(operation, error) {
    this.errors.push({
      operation,
      message: error?.message || String(error),
      timestamp: new Date().toISOString()
    });
  }

  getLog() {
    const totalDuration = Date.now() - this.startTime;
    const totalMongoTime = this.mongoQueries.reduce((sum, q) => sum + q.duration, 0);
    const totalApiTime = this.apiCalls.reduce((sum, a) => sum + a.duration, 0);

    return {
      timestamp: new Date().toISOString(),
      totalDuration,
      mongoQueries: {
        count: this.mongoQueries.length,
        totalDuration: totalMongoTime,
        queries: this.mongoQueries
      },
      apiCalls: {
        count: this.apiCalls.length,
        totalDuration: totalApiTime,
        calls: this.apiCalls
      },
      dataSummary: this.dataSummary,
      errors: this.errors
    };
  }
}

// Wrapped getUserDoc with logging
async function getUserDocWithLogging(collection, userEmail, logger) {
  const startTime = Date.now();
  try {
    const result = await getUserDoc(collection, userEmail);
    const duration = Date.now() - startTime;
    
    // Calculate result count based on collection type
    let resultCount = 0;
    if (result) {
      if (result.emails) resultCount = result.emails.length;
      else if (result.categories) resultCount = result.categories.length;
      else if (result.responses) resultCount = result.responses.length;
      else if (result.threads) resultCount = result.threads.length;
      else if (result.notes) resultCount = result.notes.length;
      else if (result.guidelines) resultCount = Object.keys(result.guidelines).length;
      else if (result.summaries) resultCount = Object.keys(result.summaries).length;
      else resultCount = 1; // Document exists
    }
    
    // Log with raw result for detailed view
    logger.logMongoQuery(collection, userEmail, resultCount, duration, true, null, result);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.logMongoQuery(collection, userEmail, 0, duration, false, error, null);
    logger.logError(`MongoDB query: ${collection}`, error);
    throw error;
  }
}

const app = express();
const PORT = process.env.PORT || 5000;
const MAIN_SYSTEM_BASE_URL = String(process.env.MAIN_SYSTEM_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const FEATURE_PUBLISH_TOKEN = String(process.env.FEATURE_PUBLISH_TOKEN || '').trim();

// Initialize MongoDB connection
let mongoInitialized = false;
let mongoInitError = null;
initMongo().then(() => {
  mongoInitialized = true;
  mongoInitError = null;
  console.log('MongoDB connected for Email Chat');
}).catch(err => {
  mongoInitError = err;
  console.error('MongoDB connection failed:', err.message);
});

let mongoInitPromise = null;
async function ensureMongoReady() {
  if (mongoInitialized) return true;
  if (!mongoInitPromise) {
    mongoInitPromise = initMongo()
      .then(() => {
        mongoInitialized = true;
        mongoInitError = null;
        return true;
      })
      .catch((err) => {
        mongoInitError = err;
        throw err;
      })
      .finally(() => {
        mongoInitPromise = null;
      });
  }
  await mongoInitPromise;
  return true;
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory session storage
const sessions = new Map();

// Session cleanup (remove sessions older than 2 hours)
setInterval(() => {
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  for (const [sessionId, session] of sessions.entries()) {
    if (session.lastAccess < twoHoursAgo) {
      sessions.delete(sessionId);
      console.log(`Session ${sessionId} cleaned up due to inactivity`);
    }
  }
}, 30 * 60 * 1000); // Check every 30 minutes

// Get or create session
function getSession(sessionId) {
  if (!sessionId || !sessions.has(sessionId)) {
    const newSessionId = sessionId || uuidv4();
    sessions.set(newSessionId, {
      id: newSessionId,
      agent: new FeatureGeneratorAgent(),
      generatedFiles: null,
      featureId: null,
      chatHistory: [],
      lastAccess: Date.now()
    });
    return { session: sessions.get(newSessionId), isNew: true };
  }
  const session = sessions.get(sessionId);
  session.lastAccess = Date.now();
  return { session, isNew: false };
}

async function publishFeatureToMainSystem(featureId, files) {
  if (!featureId || !files || typeof files !== 'object') {
    return { success: false, error: 'Missing featureId or files for publish' };
  }

  const endpoint = `${MAIN_SYSTEM_BASE_URL}/api/feature-management/publish`;
  const headers = { 'Content-Type': 'application/json' };
  if (FEATURE_PUBLISH_TOKEN) {
    headers['x-feature-publish-token'] = FEATURE_PUBLISH_TOKEN;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ featureId, files })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      return {
        success: false,
        status: response.status,
        error: data.error || `Publish failed with status ${response.status}`
      };
    }
    return {
      success: true,
      message: data.message || 'Published successfully',
      writtenFiles: data.writtenFiles || []
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Publish request failed'
    };
  }
}

// API Routes

// Create new session
app.post('/api/session/new', (req, res) => {
  const sessionId = uuidv4();
  const { session } = getSession(sessionId);
  res.json({ 
    success: true, 
    sessionId: session.id,
    message: 'New session created'
  });
});

// Get session status
app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { session, isNew } = getSession(sessionId);
  
  res.json({
    success: true,
    sessionId: session.id,
    isNew,
    hasGeneratedFiles: !!session.generatedFiles,
    featureId: session.featureId,
    chatHistoryLength: session.chatHistory.length
  });
});

// Main chat endpoint - handles both initial generation and refinements
app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;
  
  if (!message || message.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Message is required'
    });
  }

  try {
    const { session } = getSession(sessionId);
    
    // Add user message to history
    session.chatHistory.push({
      role: 'user',
      content: message,
      timestamp: Date.now()
    });

    // Determine if this is initial generation or refinement
    const isRefinement = session.generatedFiles !== null;
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Session: ${session.id}`);
    console.log(`Mode: ${isRefinement ? 'REFINEMENT' : 'INITIAL GENERATION'}`);
    console.log(`Message: ${message.substring(0, 100)}...`);
    console.log('='.repeat(50));

    let result;
    
    if (isRefinement) {
      // Refinement mode - fix/modify existing files
      result = await session.agent.refineFeature(
        message,
        session.generatedFiles,
        session.featureId,
        session.chatHistory
      );
    } else {
      // Initial generation mode
      result = await session.agent.generateFeature(message);
      session.featureId = result.featureId;
    }

    // Update session with generated files
    session.generatedFiles = result.files;
    
    const publishResult = await publishFeatureToMainSystem(session.featureId, session.generatedFiles);

    // Add assistant response to history
    session.chatHistory.push({
      role: 'assistant',
      content: result.response,
      timestamp: Date.now(),
      filesGenerated: Object.keys(result.files),
      filesUpdated: result.updatedFiles || [],
      publish: publishResult
    });

    res.json({
      success: true,
      sessionId: session.id,
      response: result.response,
      featureId: result.featureId,
      files: result.files,
      updatedFiles: result.updatedFiles || [],
      isRefinement,
      publish: publishResult
    });

  } catch (error) {
    console.error('Chat error:', error);
    
    // Add error to chat history
    const { session } = getSession(sessionId);
    session.chatHistory.push({
      role: 'assistant',
      content: `Error: ${error.message}`,
      timestamp: Date.now(),
      isError: true
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process request'
    });
  }
});

// Get generated files for a session
app.get('/api/files/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }

  const session = sessions.get(sessionId);
  
  if (!session.generatedFiles) {
    return res.status(404).json({
      success: false,
      error: 'No files generated yet'
    });
  }

  res.json({
    success: true,
    featureId: session.featureId,
    files: session.generatedFiles
  });
});

// Download files as ZIP
app.get('/api/download/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }

  const session = sessions.get(sessionId);
  
  if (!session.generatedFiles || !session.featureId) {
    return res.status(404).json({
      success: false,
      error: 'No files generated yet'
    });
  }

  try {
    const featureId = session.featureId;
    
    // Set response headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${featureId}.zip"`);

    // Create archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).json({ success: false, error: 'Failed to create ZIP' });
    });

    // Pipe archive to response
    archive.pipe(res);

    // Add files to archive in the feature folder structure
    for (const [filename, content] of Object.entries(session.generatedFiles)) {
      archive.append(content, { name: `${featureId}/${filename}` });
    }

    // Finalize archive
    await archive.finalize();
    
    console.log(`ZIP downloaded for feature: ${featureId}`);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create download'
    });
  }
});

// Get chat history
app.get('/api/history/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({
      success: false,
      error: 'Session not found'
    });
  }

  const session = sessions.get(sessionId);
  
  res.json({
    success: true,
    chatHistory: session.chatHistory,
    featureId: session.featureId
  });
});

// Clear session (start fresh)
app.delete('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (sessions.has(sessionId)) {
    sessions.delete(sessionId);
  }
  
  res.json({
    success: true,
    message: 'Session cleared'
  });
});

// =====================================================
// EMAIL CHAT MODE - Query email data using AI
// =====================================================

// Available user emails in the system
const AVAILABLE_USERS = ['ks4190@columbia.edu', 'lc3251@columbia.edu'];

// Email chat system prompt
const EMAIL_CHAT_SYSTEM_PROMPT = `You are an intelligent Email Assistant with access to email data from the Gmail Plugin system. You can help users:

1. **Analyze emails** - Count, summarize, or analyze email threads and conversations
2. **Find emails** - Search for specific emails based on criteria
3. **Get insights** - Provide statistics and patterns about email habits
4. **Review responses** - Look at draft responses and sent emails
5. **Answer questions** - Answer any questions about the email data
6. **Modify data** - Add categories, update guidelines, modify email classifications, add notes

AVAILABLE USERS IN THE SYSTEM:
{{AVAILABLE_USERS}}

You have access to email data for the user(s) listed above. 

AVAILABLE DATA FOR EACH USER:
- **Email Threads**: Conversation threads with full context (PRIMARY SOURCE)
- **Response Emails**: Draft and sent email responses (PRIMARY SOURCE)
- **Categories**: The categories defined by the user
- **Category Guidelines**: How emails are classified
- **Category Summaries**: Summary of what each category contains
- **Notes**: User notes

When answering questions:
- Be helpful and conversational
- Provide specific numbers when asked for counts
- Quote email subjects or snippets when relevant
- Email threads contain the full conversation context
- Response emails show what the user has drafted or sent
- Format your responses nicely with markdown

**MODIFICATION CAPABILITIES:**
You can modify the database when users request changes. When a user asks you to make changes (add categories, update guidelines, etc.), you MUST respond with BOTH:

1. A conversational response explaining what you'll do
2. A JSON modification block in this exact format:

\`\`\`json
{
  "modifications": [
    {
      "type": "addCategory|removeCategory|updateGuideline|updateSummary|addNote|updateEmailCategory",
      "collection": "categories|category_guidelines|category_summaries|notes|response_emails",
      "userEmail": "user@example.com",
      "description": "Human readable description of the change",
      "data": {
        "category": "New Category Name",
        "guideline": "Category guideline text",
        "summary": "Category summary text",
        "note": "Note text",
        "emailId": "email123",
        "newCategory": "Category Name"
      }
    }
  ]
}
\`\`\`

**Example modification types:**
- "Add category 'Travel Plans'" → type: "addCategory"
- "Update Research guideline to include conference papers" → type: "updateGuideline" 
- "Change email abc123 to Important category" → type: "updateEmailCategory"
- "Add note about this conversation" → type: "addNote"

**CATEGORY SUGGESTION WORKFLOW:**
When the user asks you to create/suggest new categories AND show emails that would fit them (e.g., "create categories X and Y and suggest emails for them", "please create categories Research and Travel and suggest emails"), you MUST:

1. **IMPORTANT: Look specifically at emails currently in the "Other" or "Uncategorized" category** - these are emails that don't fit existing categories
2. Analyze which of those "Other" emails would fit better into the new requested categories
3. Provide suggested emails that would be good candidates to move from "Other" to the new categories

Include BOTH in your response:
1. A conversational response explaining the new categories and why these emails fit
2. A JSON category suggestions block in this exact format:

\`\`\`json
{
  "categorySuggestions": {
    "action": "createCategories",
    "categories": [
      {
        "name": "Category Name",
        "description": "Brief description of what this category is for",
        "guideline": "Guideline for classifying emails into this category",
        "suggestedEmails": [
          {
            "id": "email_id_from_data",
            "subject": "Email Subject",
            "from": "sender@example.com",
            "date": "2024-01-15",
            "snippet": "Brief preview of the email content...",
            "reason": "Why this email fits this category better than Other"
          }
        ]
      }
    ]
  }
}
\`\`\`

**IMPORTANT RULES FOR CATEGORY SUGGESTIONS:**
- ONLY suggest emails that are currently categorized as "Other" or "Uncategorized"
- Use the actual email IDs from the data (thread id or responseId)
- Include 5-10 of the most relevant emails per category
- Always explain WHY each email fits the new category in the "reason" field
- Make sure the email data (subject, from, date, snippet) matches the actual email

The frontend will show a RHS panel with:
- Tabs to switch between the new categories
- List of emails from "Other" that would fit each category
- Checkboxes (selected by default) to include/exclude emails
- Click on emails to see full thread content
- Approve button to create categories and move selected emails

**EMAIL LIST DISPLAY:**
When the user asks to see, show, list, or find emails (e.g., "show me my emails", "list emails from category X", "find emails about Y"), you MUST include BOTH:

1. A conversational response summarizing what you found
2. A JSON email list block in this exact format:

\`\`\`json
{
  "emailList": {
    "title": "Title for the email list (e.g., 'Emails in Research category')",
    "count": 5,
    "emails": [
      {
        "id": "thread_id_here",
        "subject": "Email Subject",
        "from": "sender@example.com",
        "date": "2024-01-15",
        "category": "Category Name",
        "snippet": "Brief preview of email content...",
        "messageCount": 3,
        "messages": [
          {
            "from": "sender@example.com",
            "to": "recipient@example.com",
            "date": "2024-01-15T10:30:00Z",
            "body": "Full message body text here..."
          }
        ]
      }
    ]
  }
}
\`\`\`

**IMPORTANT RULES FOR EMAIL LISTS:**
- Show each EMAIL THREAD only ONCE - do NOT show duplicate entries for the same conversation
- Group all messages in a thread together under one email entry
- Use the thread's most recent date as the "date" field
- The "messageCount" should reflect how many messages are in that thread
- Limit results to 10-15 most relevant threads to keep the list manageable
- Sort by date (most recent first) unless the user requests otherwise

DATA FOR SELECTED USER(S):
{{DATA_CONTEXT}}

Remember: You're analyzing real email data. Be accurate and helpful! When making modifications, always explain what you're doing and format the JSON modification block correctly. When showing emails, always include the emailList JSON block.`;

// Helper to load user email data (with optional logging)
async function loadUserEmailData(userEmail, logger = null) {
  try {
    await ensureMongoReady();
  } catch (_) {}

  if (!mongoInitialized) {
    throw new Error(mongoInitError ? `Database unavailable: ${mongoInitError.message}` : 'Database not connected');
  }
  
  const data = {};
  const getDoc = logger ? 
    (collection, email) => getUserDocWithLogging(collection, email, logger) :
    getUserDoc;
  
  try {
    // Load categories
    const categoriesDoc = await getDoc('categories', userEmail);
    data.categories = categoriesDoc?.categories || [];
    
    // Load category guidelines
    const guidelinesDoc = await getDoc('category_guidelines', userEmail);
    data.categoryGuidelines = guidelinesDoc?.guidelines || {};
    
    // Load category summaries
    const summariesDoc = await getDoc('category_summaries', userEmail);
    data.categorySummaries = summariesDoc?.summaries || {};
    
    // Load email threads - PRIMARY SOURCE for email conversations
    const threadsDoc = await getDoc('email_threads', userEmail);
    data.emailThreads = threadsDoc?.threads || [];
    
    // Load response emails - PRIMARY SOURCE for sent/draft responses  
    const responsesDoc = await getDoc('response_emails', userEmail);
    data.responseEmails = responsesDoc?.emails || responsesDoc?.responses || [];
    
    // Create category mapping from response emails to threads
    const emailIdToCategoryMap = {};
    console.log(`Creating category mapping for ${userEmail}: ${data.responseEmails.length} response emails`);
    for (const email of data.responseEmails) {
      if (email.id && (email.category || email.categories)) {
        emailIdToCategoryMap[email.id] = {
          category: email.category,
          categories: email.categories || [email.category].filter(Boolean)
        };
        console.log(`Mapped ${email.id} -> ${email.category}`);
      }
    }
    console.log(`Created ${Object.keys(emailIdToCategoryMap).length} category mappings`);
    data.emailIdToCategoryMap = emailIdToCategoryMap;
    
    // Load notes
    const notesDoc = await getDoc('notes', userEmail);
    data.notes = notesDoc?.notes || [];
    
  } catch (error) {
    console.error('Error loading user data:', error);
    if (logger) logger.logError('loadUserEmailData', error);
  }
  
  return data;
}

// Format email data as context for the AI
function formatEmailDataContext(data) {
  const lines = [];

  // Category counts summary derived from response_emails (authoritative for UI category badges)
  if (data.responseEmails && data.responseEmails.length > 0) {
    const categoryCounts = {};
    for (const email of data.responseEmails) {
      const categories = Array.isArray(email?.categories) && email.categories.length
        ? email.categories
        : [email?.category || 'Uncategorized'];
      for (const cat of categories) {
        const name = String(cat || '').trim() || 'Uncategorized';
        categoryCounts[name] = (categoryCounts[name] || 0) + 1;
      }
    }
    const sortedCategoryCounts = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1]);
    const categoriesWithEmails = sortedCategoryCounts.filter(([, count]) => count > 0);

    lines.push(`**Category Counts (from response_emails):**`);
    if (categoriesWithEmails.length === 0) {
      lines.push('- No categories currently have emails.');
    } else {
      lines.push(`- Total categories with >=1 email: ${categoriesWithEmails.length}`);
      for (const [name, count] of categoriesWithEmails) {
        lines.push(`- ${name}: ${count}`);
      }
    }
  }
  
  // Categories overview
  if (data.categories && data.categories.length > 0) {
    lines.push(`\n**Categories (${data.categories.length}):** ${data.categories.join(', ')}`);
  }
  
  // Category guidelines
  if (data.categoryGuidelines && Object.keys(data.categoryGuidelines).length > 0) {
    lines.push('\n**Category Guidelines:**');
    for (const [cat, guideline] of Object.entries(data.categoryGuidelines)) {
      lines.push(`- **${cat}**: ${guideline}`);
    }
  }
  
  // Category summaries
  if (data.categorySummaries && Object.keys(data.categorySummaries).length > 0) {
    lines.push('\n**Category Summaries:**');
    for (const [cat, summary] of Object.entries(data.categorySummaries)) {
      lines.push(`- **${cat}**: ${summary}`);
    }
  }
  
  // Email threads (PRIMARY SOURCE)
  if (data.emailThreads && data.emailThreads.length > 0) {
    lines.push(`\n**Email Threads: ${data.emailThreads.length} conversations**`);
    
    // Recent threads summary
    lines.push('\n**Recent Conversations (last 15):**');
    const recentThreads = data.emailThreads.slice(0, 15);
    for (const thread of recentThreads) {
      const subject = thread.subject || 'No Subject';
      const from = thread.from || thread.originalFrom || 'Unknown';
      
      // Get category from response emails mapping using responseId or thread id
      const responseId = thread.responseId || thread.id;
      const categoryInfo = data.emailIdToCategoryMap?.[responseId];
      const category = categoryInfo?.category || thread.category || thread._cat || 'Uncategorized';
      
      const messageCount = thread.messages?.length || 1;
      lines.push(`- **${subject}** from ${from} [${category}] (${messageCount} messages)`);
    }
    
    // Full threads data for searching
    lines.push('\n**All Email Threads (for search):**');
    lines.push('```json');
    lines.push(JSON.stringify(data.emailThreads.map(t => {
      const responseId = t.responseId || t.id;
      const categoryInfo = data.emailIdToCategoryMap?.[responseId];
      return {
        id: t.id,
        responseId: responseId,
        subject: t.subject,
        from: t.from || t.originalFrom,
        category: categoryInfo?.category || t.category || t._cat || 'Uncategorized',
        categories: categoryInfo?.categories || (t.category ? [t.category] : []),
        messageCount: t.messages?.length || 1,
        snippet: t.snippet?.substring(0, 150) || t.messages?.[0]?.snippet?.substring(0, 150)
      };
    }), null, 2).substring(0, 20000)); // Limit size
    lines.push('```');
  }
  
  // Response emails (PRIMARY SOURCE)
  if (data.responseEmails && data.responseEmails.length > 0) {
    lines.push(`\n**Response Emails: ${data.responseEmails.length} responses**`);
    
    // Recent responses summary
    lines.push('\n**Recent Responses (last 10):**');
    const recentResponses = data.responseEmails.slice(0, 10);
    for (const resp of recentResponses) {
      const subject = resp.subject || 'No Subject';
      const to = resp.to || 'Unknown recipient';
      const status = resp.status || resp.type || 'draft';
      lines.push(`- **${subject}** to ${to} (${status})`);
    }
    
    // Full response data for searching
    lines.push('\n**All Response Emails (for search):**');
    lines.push('```json');
    lines.push(JSON.stringify(data.responseEmails.map(r => ({
      id: r.id,
      subject: r.subject,
      to: r.to,
      status: r.status || r.type,
      bodyPreview: r.body?.substring(0, 200) || r.draftBody?.substring(0, 200)
    })), null, 2).substring(0, 15000)); // Limit size
    lines.push('```');
  }
  
  // Notes
  if (data.notes && data.notes.length > 0) {
    lines.push(`\n**User Notes: ${data.notes.length} notes**`);
    for (const note of data.notes.slice(0, 10)) {
      lines.push(`- ${note.text || note.content || JSON.stringify(note).substring(0, 100)}`);
    }
  }
  
  return lines.join('\n');
}

// Load and format data for specified users (with optional logging)
async function loadUsersData(users, logger = null) {
  const usersContext = [];
  let totalThreads = 0;
  let totalResponses = 0;
  
  for (const userEmail of users) {
    try {
      const userData = await loadUserEmailData(userEmail, logger);
      const userContext = formatEmailDataContext(userData);
      totalThreads += (userData.emailThreads?.length || 0);
      totalResponses += (userData.responseEmails?.length || 0);
      
      usersContext.push(`\n${'='.repeat(60)}\n## USER: ${userEmail}\n${'='.repeat(60)}\n${userContext}`);
    } catch (error) {
      console.error(`Error loading data for ${userEmail}:`, error);
      if (logger) logger.logError(`loadUsersData:${userEmail}`, error);
      usersContext.push(`\n${'='.repeat(60)}\n## USER: ${userEmail}\n${'='.repeat(60)}\n**Error loading data for this user**`);
    }
  }
  
  const contextString = usersContext.join('\n');
  
  // Log data summary if logger provided (total items = threads + responses)
  if (logger) {
    logger.logDataSummary(totalThreads + totalResponses, contextString.length, [...users]);
  }
  
  return contextString;
}

// Load and format data for ALL users (with optional logging) - legacy wrapper
async function loadAllUsersData(logger = null) {
  return loadUsersData(AVAILABLE_USERS, logger);
}

// =====================================================
// MODIFICATION PARSING AND EXECUTION
// =====================================================

function parseModificationsFromResponse(responseContent, defaultUserEmail) {
  const modifications = [];
  
  try {
    // Look for JSON blocks in the response
    const jsonRegex = /```json\s*(\{[\s\S]*?\})\s*```/g;
    let match;
    
    while ((match = jsonRegex.exec(responseContent)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.modifications && Array.isArray(parsed.modifications)) {
          for (const mod of parsed.modifications) {
            // Validate and normalize modification
            if (mod.type && mod.collection && mod.description && mod.data) {
              modifications.push({
                ...mod,
                userEmail: mod.userEmail || defaultUserEmail,
                id: uuidv4(),
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      } catch (parseError) {
        console.error('Failed to parse modification JSON:', parseError);
      }
    }
  } catch (error) {
    console.error('Error parsing modifications:', error);
  }
  
  return modifications;
}

async function validateModification(modification) {
  const errors = [];
  
  // Validate required fields
  if (!modification.type) errors.push('Missing modification type');
  if (!modification.collection) errors.push('Missing collection name');
  if (!modification.userEmail) errors.push('Missing user email');
  if (!modification.data) errors.push('Missing modification data');
  
  // Validate user email exists in system
  if (modification.userEmail && !AVAILABLE_USERS.includes(modification.userEmail)) {
    errors.push(`User ${modification.userEmail} not found in system`);
  }
  
  // Validate modification type
  const validTypes = ['addCategory', 'removeCategory', 'updateGuideline', 'updateSummary', 'addNote', 'updateEmailCategory'];
  if (modification.type && !validTypes.includes(modification.type)) {
    errors.push(`Invalid modification type: ${modification.type}`);
  }
  
  // Type-specific validation
  switch (modification.type) {
    case 'addCategory':
      if (!modification.data.category) errors.push('Missing category name');
      // Check if category already exists
      try {
        const categoriesDoc = await getUserDoc('categories', modification.userEmail);
        const existingCategories = categoriesDoc?.categories || [];
        if (existingCategories.includes(modification.data.category)) {
          errors.push(`Category '${modification.data.category}' already exists`);
        }
      } catch (err) {
        errors.push('Unable to check existing categories');
      }
      break;
      
    case 'removeCategory':
      if (!modification.data.category) errors.push('Missing category name');
      break;
      
    case 'updateGuideline':
      if (!modification.data.category) errors.push('Missing category name');
      if (!modification.data.guideline) errors.push('Missing guideline text');
      break;
      
    case 'updateSummary':
      if (!modification.data.category) errors.push('Missing category name');
      if (!modification.data.summary) errors.push('Missing summary text');
      break;
      
    case 'addNote':
      if (!modification.data.note) errors.push('Missing note text');
      break;
      
    case 'updateEmailCategory':
      if (!modification.data.emailId) errors.push('Missing email ID');
      if (!modification.data.newCategory) errors.push('Missing new category');
      break;
  }
  
  return errors;
}

async function executeModification(modification) {
  const result = {
    success: false,
    id: modification.id,
    type: modification.type,
    description: modification.description,
    error: null,
    changesPreview: null
  };
  
  try {
    const { userEmail, type, collection, data } = modification;
    
    switch (type) {
      case 'addCategory':
        // Add category to categories collection
        const categoriesDoc = await getUserDoc('categories', userEmail) || { categories: [] };
        const updatedCategories = [...(categoriesDoc.categories || []), data.category];
        await setUserDoc('categories', userEmail, { categories: updatedCategories });
        result.success = true;
        result.changesPreview = `Added category '${data.category}' to categories list`;
        break;
        
      case 'removeCategory':
        // Remove category from categories collection
        const currentCategoriesDoc = await getUserDoc('categories', userEmail) || { categories: [] };
        const filteredCategories = (currentCategoriesDoc.categories || []).filter(cat => cat !== data.category);
        await setUserDoc('categories', userEmail, { categories: filteredCategories });
        result.success = true;
        result.changesPreview = `Removed category '${data.category}' from categories list`;
        break;
        
      case 'updateGuideline':
        // Update category guideline
        const guidelinesDoc = await getUserDoc('category_guidelines', userEmail) || { guidelines: {} };
        const updatedGuidelines = { ...(guidelinesDoc.guidelines || {}), [data.category]: data.guideline };
        await setUserDoc('category_guidelines', userEmail, { guidelines: updatedGuidelines });
        result.success = true;
        result.changesPreview = `Updated guideline for '${data.category}': ${data.guideline.substring(0, 100)}...`;
        break;
        
      case 'updateSummary':
        // Update category summary
        const summariesDoc = await getUserDoc('category_summaries', userEmail) || { summaries: {} };
        const updatedSummaries = { ...(summariesDoc.summaries || {}), [data.category]: data.summary };
        await setUserDoc('category_summaries', userEmail, { summaries: updatedSummaries });
        result.success = true;
        result.changesPreview = `Updated summary for '${data.category}': ${data.summary.substring(0, 100)}...`;
        break;
        
      case 'addNote':
        // Add note to notes collection
        const notesDoc = await getUserDoc('notes', userEmail) || { notes: [] };
        const newNote = {
          id: uuidv4(),
          text: data.note,
          timestamp: new Date().toISOString()
        };
        const updatedNotes = [...(notesDoc.notes || []), newNote];
        await setUserDoc('notes', userEmail, { notes: updatedNotes });
        result.success = true;
        result.changesPreview = `Added note: ${data.note.substring(0, 100)}...`;
        break;
        
      case 'updateEmailCategory':
        // Update email category in response_emails collection
        const responseEmailsDoc = await getUserDoc('response_emails', userEmail);
        if (responseEmailsDoc && responseEmailsDoc.emails) {
          const updatedEmails = responseEmailsDoc.emails.map(email => {
            if (email.id === data.emailId) {
              return { ...email, category: data.newCategory };
            }
            return email;
          });
          await setUserDoc('response_emails', userEmail, { emails: updatedEmails });
          result.success = true;
          result.changesPreview = `Updated email '${data.emailId}' to category '${data.newCategory}'`;
        } else {
          throw new Error('Email not found or invalid email collection structure');
        }
        break;
        
      default:
        throw new Error(`Unsupported modification type: ${type}`);
    }
    
    // Log successful modification
    console.log(`✅ Executed modification: ${type} for ${userEmail}`);
    
  } catch (error) {
    result.error = error.message;
    console.error(`❌ Failed to execute modification ${modification.id}:`, error);
  }
  
  return result;
}

// Detect if user is asking for emails
function isEmailListQuery(message) {
  const lowerMessage = message.toLowerCase();
  const emailKeywords = [
    'show me', 'list', 'display', 'see my', 'view', 'find', 'get',
    'emails', 'email', 'inbox', 'messages', 'threads', 'conversations'
  ];
  const emailPatterns = [
    /show\s+(me\s+)?(my\s+)?emails?/i,
    /list\s+(my\s+)?emails?/i,
    /what\s+(are\s+)?(my\s+)?emails?/i,
    /display\s+(my\s+)?emails?/i,
    /see\s+(my\s+)?emails?/i,
    /view\s+(my\s+)?emails?/i,
    /find\s+(my\s+)?emails?/i,
    /get\s+(my\s+)?emails?/i,
    /emails?\s+(in|from|about|for)/i,
    /show\s+inbox/i,
    /what.*inbox/i,
    /recent\s+emails?/i,
    /my\s+emails?/i,
    /all\s+emails?/i
  ];
  
  return emailPatterns.some(pattern => pattern.test(lowerMessage));
}

// Build email list from loaded user data
function buildEmailListFromData(userData, title = 'Your Emails') {
  const emails = [];
  const seenIds = new Set();
  
  // Get emails from threads
  if (userData.emailThreads && userData.emailThreads.length > 0) {
    for (const thread of userData.emailThreads) {
      if (seenIds.has(thread.id)) continue;
      seenIds.add(thread.id);
      
      const responseId = thread.responseId || thread.id;
      const categoryInfo = userData.emailIdToCategoryMap?.[responseId];
      
      emails.push({
        id: thread.id,
        subject: thread.subject || 'No Subject',
        from: thread.from || thread.originalFrom || 'Unknown',
        date: thread.date || thread.internalDate || '',
        category: categoryInfo?.category || thread.category || thread._cat || 'Uncategorized',
        snippet: thread.snippet || thread.messages?.[0]?.snippet || '',
        messageCount: thread.messages?.length || 1,
        messages: thread.messages?.map(m => ({
          from: m.from || thread.from || 'Unknown',
          to: m.to || '',
          date: m.date || '',
          body: m.body || m.snippet || ''
        })) || []
      });
    }
  }
  
  // Sort by date (most recent first)
  emails.sort((a, b) => {
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    return dateB - dateA;
  });
  
  // Limit to 15 emails
  const limitedEmails = emails.slice(0, 15);
  
  return {
    title,
    count: limitedEmails.length,
    emails: limitedEmails
  };
}

// Parse email list from AI response
function parseEmailListFromResponse(responseContent) {
  try {
    const jsonRegex = /```json\s*(\{[\s\S]*?\})\s*```/g;
    let match;
    
    while ((match = jsonRegex.exec(responseContent)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.emailList && parsed.emailList.emails) {
          return parsed.emailList;
        }
      } catch (parseError) {
        // Continue to next match
      }
    }
  } catch (error) {
    console.error('Error parsing email list from response:', error);
  }
  return null;
}

// Parse category suggestions from AI response
function parseCategorySuggestionsFromResponse(responseContent) {
  try {
    const jsonRegex = /```json\s*(\{[\s\S]*?\})\s*```/g;
    let match;
    
    while ((match = jsonRegex.exec(responseContent)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.categorySuggestions && parsed.categorySuggestions.categories) {
          return parsed.categorySuggestions;
        }
      } catch (parseError) {
        // Continue to next match
      }
    }
  } catch (error) {
    console.error('Error parsing category suggestions from response:', error);
  }
  return null;
}

function normalizeLooseText(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isExactOtherSuggestionPrompt(message) {
  const normalized = normalizeLooseText(message);
  return normalized === 'can you please suggest new categories for emails currently in other';
}

function buildDynamicCategorySuggestions(userData) {
  const all = Array.isArray(userData?.responseEmails) ? userData.responseEmails : [];
  const others = all.filter(email => {
    const c = String(email?.category || '').trim().toLowerCase();
    return !c || c === 'other' || c === 'uncategorized';
  });

  if (!others.length) return { action: 'createCategories', categories: [] };

  const sorted = others.slice().sort((a, b) => Date.parse(String(b?.date || 0)) - Date.parse(String(a?.date || 0)));
  const used = new Set();

  const toItem = (e, reason) => {
    const ms = Date.parse(String(e?.date || ''));
    return {
      id: String(e?.id || ''),
      subject: String(e?.subject || 'No Subject'),
      from: String(e?.originalFrom || e?.from || 'Unknown Sender'),
      date: Number.isFinite(ms) ? new Date(ms).toISOString() : new Date(0).toISOString(),
      snippet: String(e?.snippet || e?.body || '').slice(0, 220),
      reason
    };
  };

  const textOf = (e) => `${String(e?.subject || '')} ${String(e?.snippet || '')} ${String(e?.body || '')} ${String(e?.from || '')}`.toLowerCase();
  const keywordCategoryDefs = [
    {
      name: 'Personal Finances',
      description: 'Emails related to personal financial activity and money management.',
      guideline: 'Use for account notifications, payments, card activity, bills, and other finance updates.',
      reason: 'This email appears related to personal finance activity.',
      match: (t) => /(bank|credit|capital one|chase|amex|payment|bill|statement|invoice|balance|transaction|receipt|venmo|zelle|account alert)/.test(t)
    },
    {
      name: 'Deployment Infrastructure',
      description: 'Emails related to deployment workflows and infrastructure operations.',
      guideline: 'Use for deploy events, infra alerts, service updates, and environment/configuration notifications.',
      reason: 'This email appears related to deployment or infrastructure operations.',
      match: (t) => /(vercel|deploy|deployment|production|staging|preview|build failed|ci|pipeline|infrastructure|uptime|incident|cron|domain|dns)/.test(t)
    },
    {
      name: 'Newsletters',
      description: 'Recurring digest and newsletter content.',
      guideline: 'Use for recurring newsletters, daily digests, and informational updates.',
      reason: 'This appears to be a recurring newsletter/digest.',
      match: (t) => /(newsletter|digest|the download|daily digest|weekly digest|top stories)/.test(t)
    },
    {
      name: 'Promotions & Orders',
      description: 'Promotional and transactional order-related updates.',
      guideline: 'Use for offers, discounts, order updates, and purchase confirmations.',
      reason: 'This appears to be a promotional or order-related email.',
      match: (t) => /(offer|discount|promo|sale|coupon|order|ubereats|uber eats|tracking|shipped|delivery)/.test(t)
    }
  ];

  const buildCategory = (def, limit = 3) => {
    const picked = [];
    for (const e of sorted) {
      const id = String(e?.id || '');
      if (!id || used.has(id)) continue;
      if (!def.match(textOf(e))) continue;
      picked.push(toItem(e, def.reason));
      used.add(id);
      if (picked.length >= limit) break;
    }
    if (!picked.length) return null;
    return {
      name: def.name,
      description: def.description,
      guideline: def.guideline,
      suggestedEmails: picked
    };
  };

  const categories = [];
  for (const def of keywordCategoryDefs) {
    const built = buildCategory(def, 3);
    if (built) categories.push(built);
    if (categories.length >= 2) break;
  }

  while (categories.length < 2) {
    const fallback = [];
    for (const e of sorted) {
      const id = String(e?.id || '');
      if (!id || used.has(id)) continue;
      fallback.push(toItem(e, 'This email fits a general updates bucket better than Other.'));
      used.add(id);
      if (fallback.length >= 3) break;
    }
    if (!fallback.length) break;
    categories.push({
      name: categories.length === 0 ? 'General Updates' : 'Miscellaneous Follow-ups',
      description: 'A compact bucket for uncategorized updates.',
      guideline: 'Use for messages that do not clearly fit existing focused categories.',
      suggestedEmails: fallback
    });
  }

  return { action: 'createCategories', categories: categories.slice(0, 2) };
}

// Email Chat endpoint
app.post('/api/email-chat', async (req, res) => {
  const { sessionId, message, userEmail } = req.body;
  
  // Initialize operations logger
  const logger = new OperationsLogger();
  
  if (!message || message.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Message is required'
    });
  }
  
  try {
    await ensureMongoReady();
  } catch (_) {}

  if (!mongoInitialized) {
    return res.status(503).json({
      success: false,
      error: mongoInitError
        ? `Database unavailable: ${mongoInitError.message}`
        : 'Database connection not ready. Please try again in a moment.'
    });
  }
  
  // Validate userEmail if provided
  const selectedUser = userEmail && AVAILABLE_USERS.includes(userEmail) ? userEmail : null;
  const usersToQuery = selectedUser ? [selectedUser] : AVAILABLE_USERS;
  
  // Detect if this is an email list query
  const isEmailQuery = isEmailListQuery(message);
  console.log(`📧 Email list query detected: ${isEmailQuery}`);
  
  try {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`EMAIL CHAT - Loading data for: ${usersToQuery.join(', ')}`);
    console.log(`Message: ${message.substring(0, 100)}...`);
    console.log('='.repeat(50));
    
    // Special-case exact category-suggestion prompt so the UI always gets
    // compact structured data (2 categories, ~3 emails each) and can render
    // the approve/cancel confirmation reliably.
    if (isExactOtherSuggestionPrompt(message)) {
      const targetUser = usersToQuery[0] || AVAILABLE_USERS[0];
      const targetData = await loadUserEmailData(targetUser, logger);
      const categorySuggestions = buildDynamicCategorySuggestions(targetData);
      const categoryCount = Array.isArray(categorySuggestions?.categories) ? categorySuggestions.categories.length : 0;
      const emailCount = (categorySuggestions?.categories || []).reduce((sum, c) => sum + ((c?.suggestedEmails || []).length), 0);
      const assistantResponse = categoryCount
        ? `I analyzed emails currently in "Other" and prepared ${categoryCount} suggested categories with about 3 emails each. Review them in the preview panel and click Approve or Cancel.`
        : 'I checked emails currently in "Other", but I could not find enough candidates to suggest new categories right now.';

      return res.json({
        success: true,
        response: assistantResponse,
        availableUsers: AVAILABLE_USERS,
        operationsLog: logger.getLog(),
        categorySuggestions,
        isEmailQuery: false,
        summary: {
          categories: categoryCount,
          suggestedEmails: emailCount,
          source: 'exact-other-suggestion-fast-path'
        }
      });
    }

    // Load email data for selected user(s) (with logging)
    // Store the raw data for potential email list building
    let rawUserData = null;
    if (isEmailQuery) {
      rawUserData = await loadUserEmailData(usersToQuery[0], logger);
    }
    const dataContext = await loadUsersData(usersToQuery, logger);
    
    // Build system prompt with data for selected user(s)
    const systemPrompt = EMAIL_CHAT_SYSTEM_PROMPT
      .replace('{{AVAILABLE_USERS}}', usersToQuery.map(u => `- ${u}`).join('\n'))
      .replace('{{DATA_CONTEXT}}', dataContext);
    
    // Create chat model
    const modelName = getGeminiModel();
    
    // Call the model and track timing
    const apiStartTime = Date.now();
    let response;
    try {
      response = await invokeGemini({
        model: modelName,
        temperature: 0.7,
        maxOutputTokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ]
      });
      
      const apiDuration = Date.now() - apiStartTime;
      
      // Estimate token counts (rough approximation: ~4 chars per token)
      const inputTokens = Math.ceil((systemPrompt.length + message.length) / 4);
      const outputTokens = Math.ceil((response.content?.length || 0) / 4);
      
      logger.logApiCall(modelName, inputTokens, outputTokens, apiDuration, true, null, systemPrompt, message, response.content);
    } catch (apiError) {
      const apiDuration = Date.now() - apiStartTime;
      logger.logApiCall(modelName, 0, 0, apiDuration, false, apiError, systemPrompt, message, null);
      logger.logError('Gemini API call', apiError);
      throw apiError;
    }
    
    const assistantResponse = response.content;
    
    // Parse for modifications
    const modifications = parseModificationsFromResponse(assistantResponse, usersToQuery[0]);
    const hasModifications = modifications.length > 0;
    
    console.log('Email Chat Response generated successfully');
    if (hasModifications) {
      console.log(`📝 Found ${modifications.length} modification(s) in response`);
    }
    
    // ONLY use AI-generated email list - the AI knows which specific emails match the user's query
    // Do NOT use database fallback as it would show random/generic emails instead of the relevant ones
    let emailList = parseEmailListFromResponse(assistantResponse);
    
    if (emailList) {
      console.log('📧 Using AI-generated email list:', emailList.count, 'emails');
    } else if (isEmailQuery) {
      console.log('📧 AI did not include email list JSON block - the chat response may describe emails in prose format');
    }
    
    if (emailList) {
      console.log(`📧 Email list: ${emailList.count} emails`);
    }
    
    // Parse for category suggestions
    const categorySuggestions = parseCategorySuggestionsFromResponse(assistantResponse);
    if (categorySuggestions) {
      console.log(`📂 Category suggestions: ${categorySuggestions.categories.length} categories`);
    }
    
    // Get the operations log
    const operationsLog = logger.getLog();
    
    // Log summary to console
    console.log(`📊 Operations Summary: ${operationsLog.mongoQueries.count} MongoDB queries (${operationsLog.mongoQueries.totalDuration}ms), ` +
                `${operationsLog.apiCalls.count} API calls (${operationsLog.apiCalls.totalDuration}ms), ` +
                `Total: ${operationsLog.totalDuration}ms`);
    
    res.json({
      success: true,
      response: assistantResponse,
      availableUsers: AVAILABLE_USERS,
      operationsLog,
      modifications: hasModifications ? modifications : undefined,
      requiresConfirmation: hasModifications,
      emailList: emailList || undefined,
      categorySuggestions: categorySuggestions || undefined,
      isEmailQuery
    });
    
  } catch (error) {
    console.error('Email chat error:', error);
    logger.logError('email-chat endpoint', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process email chat',
      operationsLog: logger.getLog()
    });
  }
});

// Execute category suggestions (create categories + move selected emails)
app.post('/api/email-chat-category-suggestions', async (req, res) => {
  const { categorySuggestions, userEmail } = req.body;
  
  if (!categorySuggestions || !categorySuggestions.categories || categorySuggestions.categories.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No category suggestions provided'
    });
  }
  
  try {
    await ensureMongoReady();
  } catch (_) {}

  if (!mongoInitialized) {
    return res.status(503).json({
      success: false,
      error: mongoInitError
        ? `Database unavailable: ${mongoInitError.message}`
        : 'Database connection not ready'
    });
  }
  
  const targetUser = userEmail || AVAILABLE_USERS[0];
  const results = {
    categoriesCreated: [],
    emailsMoved: [],
    errors: []
  };
  
  try {
    console.log(`\n📂 EXECUTING CATEGORY SUGGESTIONS for ${targetUser}`);
    console.log(`   Categories to create: ${categorySuggestions.categories.map(c => c.name).join(', ')}`);
    console.log(`   Input data structure:`, JSON.stringify(categorySuggestions, null, 2));
    
    // Step 1: Create the new categories
    const categoriesDoc = await getUserDoc('categories', targetUser) || { categories: [] };
    const existingCategories = categoriesDoc.categories || [];
    const newCategories = [...existingCategories];
    
    for (const cat of categorySuggestions.categories) {
      if (!existingCategories.includes(cat.name)) {
        newCategories.push(cat.name);
        results.categoriesCreated.push(cat.name);
        console.log(`   ✅ Adding category: ${cat.name}`);
      } else {
        console.log(`   ⏭️ Category already exists: ${cat.name}`);
        results.categoriesCreated.push(cat.name); // Still count as "created" for user feedback
      }
    }
    
    // Save updated categories
    if (results.categoriesCreated.length > 0) {
      await setUserDoc('categories', targetUser, { categories: newCategories });
      console.log(`   💾 Saved categories to database`);
    }
    
    // Step 2: Add guidelines for new categories
    const guidelinesDoc = await getUserDoc('category_guidelines', targetUser) || { guidelines: {} };
    const updatedGuidelines = { ...(guidelinesDoc.guidelines || {}) };
    
    for (const cat of categorySuggestions.categories) {
      if (cat.guideline) {
        updatedGuidelines[cat.name] = cat.guideline;
        console.log(`   📝 Added guideline for: ${cat.name}`);
      }
    }
    
    await setUserDoc('category_guidelines', targetUser, { guidelines: updatedGuidelines });
    
    // Step 3: Add summaries for new categories
    const summariesDoc = await getUserDoc('category_summaries', targetUser) || { summaries: {} };
    const updatedSummaries = { ...(summariesDoc.summaries || {}) };
    
    for (const cat of categorySuggestions.categories) {
      if (cat.description) {
        updatedSummaries[cat.name] = cat.description;
        console.log(`   📄 Added summary for: ${cat.name}`);
      }
    }
    
    await setUserDoc('category_summaries', targetUser, { summaries: updatedSummaries });
    
    // Step 4: Move selected emails to new categories
    console.log(`\n📧 MOVING EMAILS:`);
    const responseEmailsDoc = await getUserDoc('response_emails', targetUser);
    console.log(`   Loaded response emails doc:`, responseEmailsDoc ? 'SUCCESS' : 'FAILED');
    
    if (responseEmailsDoc && responseEmailsDoc.emails) {
      const updatedEmails = [...responseEmailsDoc.emails];
      const byId = new Map();
      for (let i = 0; i < updatedEmails.length; i++) {
        const rawId = updatedEmails[i] && updatedEmails[i].id != null ? String(updatedEmails[i].id).trim() : '';
        if (!rawId) continue;
        byId.set(rawId, i);
        byId.set(`thread-${rawId}`, i);
      }
      console.log(`   Found ${updatedEmails.length} emails in database`);
      
      // Debug: Log all email IDs in database
      console.log(`   Sample email IDs in DB: ${updatedEmails.slice(0, 5).map(e => e.id).join(', ')}`);
      
      for (const cat of categorySuggestions.categories) {
        console.log(`\n   Processing category: ${cat.name}`);
        console.log(`   Selected emails: ${cat.selectedEmails || 'NONE'}`);
        
        if (cat.selectedEmails && cat.selectedEmails.length > 0) {
          for (const selected of cat.selectedEmails) {
            const emailId = selected && typeof selected === 'object'
              ? String(selected.id || '').trim()
              : String(selected || '').trim();
            if (!emailId) continue;

            console.log(`     Looking for email ID: ${emailId}`);

            const emailIndex = byId.has(emailId) ? byId.get(emailId) : -1;
            const originalEmailId = (emailIndex !== -1 && updatedEmails[emailIndex] && updatedEmails[emailIndex].id != null)
              ? String(updatedEmails[emailIndex].id)
              : emailId;

            if (emailIndex !== -1) {
              const oldCategory = updatedEmails[emailIndex].category;
              const emailSubject = updatedEmails[emailIndex].subject;
              
              // Move emails from any category to new categories (allow reorganization)
              updatedEmails[emailIndex] = {
                ...updatedEmails[emailIndex],
                category: cat.name,
                categories: [cat.name]
              };
              results.emailsMoved.push({
                emailId: originalEmailId,
                subject: emailSubject,
                from: oldCategory || 'Uncategorized',
                to: cat.name
              });
              console.log(`     ✅ Moved email "${emailSubject}" from "${oldCategory || 'Uncategorized'}" to "${cat.name}"`);
            } else {
              console.log(`     ❌ Email ${emailId} not found in database`);
              results.errors.push(`Email ${emailId} not found in database`);
            }
          }
        } else {
          console.log(`   No emails selected for category: ${cat.name}`);
        }
      }
      
      // Save updated emails if any were moved
      if (results.emailsMoved.length > 0) {
        await setUserDoc('response_emails', targetUser, { emails: updatedEmails });
        console.log(`   💾 Saved updated emails to database`);
      } else {
        console.log(`   No emails to save (none were moved)`);
      }
    } else {
      const errorMsg = 'No response emails found in database or invalid structure';
      console.log(`   ❌ ${errorMsg}`);
      results.errors.push(errorMsg);
    }
    
    console.log(`\n📊 CATEGORY SUGGESTION RESULTS:`);
    console.log(`   Categories created: ${results.categoriesCreated.length}`);
    console.log(`   Emails moved: ${results.emailsMoved.length}`);
    console.log(`   Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log(`   Error details:`, results.errors);
    }
    
    res.json({
      success: true,
      message: `Created ${results.categoriesCreated.length} categories and moved ${results.emailsMoved.length} emails`,
      results,
      summary: {
        categoriesCreated: results.categoriesCreated.length,
        emailsMoved: results.emailsMoved.length,
        errors: results.errors.length
      },
      debug: {
        inputCategories: categorySuggestions.categories.length,
        totalSelectedEmails: categorySuggestions.categories.reduce((sum, cat) => sum + (cat.selectedEmails?.length || 0), 0)
      }
    });
    
  } catch (error) {
    console.error('Error executing category suggestions:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute category suggestions',
      results
    });
  }
});

// Execute confirmed modifications
app.post('/api/email-chat-confirm', async (req, res) => {
  const { modifications } = req.body;
  
  if (!modifications || !Array.isArray(modifications) || modifications.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No modifications provided'
    });
  }
  
  try {
    await ensureMongoReady();
  } catch (_) {}

  if (!mongoInitialized) {
    return res.status(503).json({
      success: false,
      error: mongoInitError
        ? `Database unavailable: ${mongoInitError.message}`
        : 'Database connection not ready'
    });
  }
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  try {
    console.log(`\n🔧 EXECUTING CONFIRMED MODIFICATIONS: ${modifications.length} changes`);
    
    // Process each modification
    for (const modification of modifications) {
      // Validate modification before execution
      const validationErrors = await validateModification(modification);
      
      if (validationErrors.length > 0) {
        const result = {
          success: false,
          id: modification.id,
          type: modification.type,
          description: modification.description,
          error: `Validation failed: ${validationErrors.join(', ')}`,
          validationErrors
        };
        results.push(result);
        errorCount++;
        console.log(`❌ Validation failed for ${modification.id}: ${validationErrors.join(', ')}`);
      } else {
        // Execute the modification
        const result = await executeModification(modification);
        results.push(result);
        
        if (result.success) {
          successCount++;
          console.log(`✅ ${result.description}`);
        } else {
          errorCount++;
          console.log(`❌ ${result.description}: ${result.error}`);
        }
      }
    }
    
    console.log(`\n📊 MODIFICATION RESULTS: ${successCount} success, ${errorCount} errors`);
    
    // Log to audit trail (simple console logging for now)
    const auditEntry = {
      timestamp: new Date().toISOString(),
      totalModifications: modifications.length,
      successCount,
      errorCount,
      modifications: results.map(r => ({
        id: r.id,
        type: r.type,
        success: r.success,
        description: r.description
      }))
    };
    console.log(`📋 AUDIT LOG:`, JSON.stringify(auditEntry, null, 2));
    
    res.json({
      success: true,
      message: `Processed ${modifications.length} modifications: ${successCount} successful, ${errorCount} failed`,
      results,
      summary: {
        totalModifications: modifications.length,
        successCount,
        errorCount
      }
    });
    
  } catch (error) {
    console.error('Error executing modifications:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute modifications',
      results
    });
  }
});

// =====================================================
// CATEGORY MIGRATION SUGGESTIONS API
// =====================================================

// Get "Other" emails and suggest better category assignments
app.post('/api/category-suggestions', async (req, res) => {
  const { userEmail, requestedCategories } = req.body;
  
  // Initialize operations logger
  const logger = new OperationsLogger();
  
  try {
    await ensureMongoReady();
  } catch (_) {}

  if (!mongoInitialized) {
    return res.status(503).json({
      success: false,
      error: mongoInitError
        ? `Database unavailable: ${mongoInitError.message}`
        : 'Database connection not ready'
    });
  }
  
  // Validate user email
  const targetUser = userEmail && AVAILABLE_USERS.includes(userEmail) ? userEmail : AVAILABLE_USERS[0];
  
  try {
    console.log(`\n📂 GENERATING CATEGORY SUGGESTIONS for ${targetUser}`);
    
    // Load user's current categories and "Other" emails
    const userData = await loadUserEmailData(targetUser, logger);
    
    // Find emails currently in "Other" category
    const otherEmails = userData.responseEmails.filter(email => 
      email.category === 'Other' || email.category === 'Uncategorized' || !email.category
    );
    
    console.log(`   Found ${otherEmails.length} emails in "Other" category`);
    console.log(`   Sample "Other" emails:`, otherEmails.slice(0, 3).map(e => `${e.id} (${e.category || 'NO_CATEGORY'}) - ${e.subject}`));
    
    // Debug: Also show some emails from other categories to verify filtering
    const nonOtherEmails = userData.responseEmails.filter(email => 
      email.category !== 'Other' && email.category !== 'Uncategorized' && email.category
    ).slice(0, 3);
    console.log(`   Sample non-Other emails:`, nonOtherEmails.map(e => `${e.id} (${e.category}) - ${e.subject}`));
    
    if (otherEmails.length === 0) {
      return res.json({
        success: true,
        message: 'No emails in "Other" category to categorize',
        suggestions: { categories: [] },
        operationsLog: logger.getLog()
      });
    }
    
    // Use AI to analyze these emails and suggest category assignments
    const modelName = getGeminiModel();
    
    // Create prompt for AI category suggestion
    const analysisPrompt = `You are analyzing emails currently categorized as "Other" to suggest better category assignments.

EXISTING CATEGORIES: ${userData.categories.join(', ')}

EMAILS IN "OTHER" CATEGORY (${otherEmails.length} emails):
${otherEmails.slice(0, 20).map((email, i) => `
${i + 1}. ID: ${email.id}
   Subject: ${email.subject}
   From: ${email.from}
   Snippet: ${(email.snippet || '').substring(0, 200)}
`).join('')}

TASK: Analyze these "Other" emails and suggest 2-4 new category names that would better organize them. For each suggested category:

1. Choose a clear, descriptive name
2. Identify which emails from the "Other" list would fit
3. Explain why those emails belong together

${requestedCategories ? `USER REQUESTED THESE CATEGORIES: ${requestedCategories.join(', ')} - prioritize these if they make sense for the emails.` : ''}

Respond with ONLY this JSON format (no other text):

{
  "suggestions": {
    "categories": [
      {
        "name": "Category Name",
        "description": "What this category is for",
        "guideline": "How to classify emails into this category",
        "confidence": 0.8,
        "suggestedEmails": [
          {
            "id": "email_id_from_above",
            "subject": "Email Subject",
            "from": "sender@example.com", 
            "date": "date_from_email",
            "snippet": "Brief preview...",
            "reason": "Why this email fits this category"
          }
        ]
      }
    ]
  }
}

IMPORTANT:
- Only suggest emails that are actually in the "Other" list above
- Use the exact email IDs from the list
- Suggest 3-8 emails per category (the best examples)
- Make sure category names are professional and descriptive
- High confidence (0.7+) suggestions only`;

    // Call AI for category suggestions
    const apiStartTime = Date.now();
    let aiResponse;
    try {
      aiResponse = await invokeGemini({
        model: modelName,
        temperature: 0.3,
        maxOutputTokens: 3000,
        messages: [
          { role: 'user', content: analysisPrompt }
        ]
      });
      
      const apiDuration = Date.now() - apiStartTime;
      const inputTokens = Math.ceil(analysisPrompt.length / 4);
      const outputTokens = Math.ceil((aiResponse.content?.length || 0) / 4);
      
      logger.logApiCall(modelName, inputTokens, outputTokens, apiDuration, true, null, null, analysisPrompt, aiResponse.content);
    } catch (apiError) {
      const apiDuration = Date.now() - apiStartTime;
      logger.logApiCall(modelName, 0, 0, apiDuration, false, apiError, null, analysisPrompt, null);
      logger.logError('Category suggestions API call', apiError);
      throw apiError;
    }
    
    // Parse AI response
    let suggestions;
    try {
      suggestions = JSON.parse(aiResponse.content);
      console.log(`   AI suggested ${suggestions.suggestions.categories.length} categories`);
    } catch (parseError) {
      console.error('Failed to parse AI suggestions:', parseError);
      throw new Error('AI response was not valid JSON');
    }
    
    res.json({
      success: true,
      suggestions: suggestions.suggestions,
      otherEmailsCount: otherEmails.length,
      operationsLog: logger.getLog()
    });
    
  } catch (error) {
    console.error('Error generating category suggestions:', error);
    logger.logError('category-suggestions endpoint', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate category suggestions',
      operationsLog: logger.getLog()
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    activeSessions: sessions.size,
    mongoConnected: mongoInitialized,
    mongoInitError: mongoInitError ? mongoInitError.message : null,
    dbModuleLoaded: !dbModuleLoadError,
    dbModuleError: dbModuleLoadError ? dbModuleLoadError.message : null,
    timestamp: new Date().toISOString()
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   Feature Generator Agent                                     ║
║   ─────────────────────────────────────────                   ║
║                                                               ║
║   Server running at: http://localhost:${PORT}                   ║
║                                                               ║
║   • Generate Gmail Plugin features with AI                    ║
║   • Iterative refinement support                             ║
║   • Download as ready-to-use ZIP                             ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
