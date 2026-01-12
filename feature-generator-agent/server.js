/**
 * Feature Generator Agent Server
 * Express server for generating Gmail Plugin features using LangChain + Anthropic
 * Also supports Email Chat mode for querying email data
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const { FeatureGeneratorAgent } = require('./agent');
const { ChatAnthropic } = require('@langchain/anthropic');

// Import database module from parent directory
const { initMongo, getUserDoc, getDb } = require('../db');

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

// Initialize MongoDB connection
let mongoInitialized = false;
initMongo().then(() => {
  mongoInitialized = true;
  console.log('MongoDB connected for Email Chat');
}).catch(err => {
  console.error('MongoDB connection failed:', err.message);
});

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
    
    // Add assistant response to history
    session.chatHistory.push({
      role: 'assistant',
      content: result.response,
      timestamp: Date.now(),
      filesGenerated: Object.keys(result.files),
      filesUpdated: result.updatedFiles || []
    });

    res.json({
      success: true,
      sessionId: session.id,
      response: result.response,
      featureId: result.featureId,
      files: result.files,
      updatedFiles: result.updatedFiles || [],
      isRefinement
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

DATA FOR SELECTED USER(S):
{{DATA_CONTEXT}}

Remember: You're analyzing real email data. Be accurate and helpful!`;

// Helper to load user email data (with optional logging)
async function loadUserEmailData(userEmail, logger = null) {
  if (!mongoInitialized) {
    throw new Error('Database not connected');
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
  
  // Categories overview
  if (data.categories && data.categories.length > 0) {
    lines.push(`**Categories (${data.categories.length}):** ${data.categories.join(', ')}`);
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
  
  if (!mongoInitialized) {
    return res.status(503).json({
      success: false,
      error: 'Database connection not ready. Please try again in a moment.'
    });
  }
  
  // Validate userEmail if provided
  const selectedUser = userEmail && AVAILABLE_USERS.includes(userEmail) ? userEmail : null;
  const usersToQuery = selectedUser ? [selectedUser] : AVAILABLE_USERS;
  
  try {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`EMAIL CHAT - Loading data for: ${usersToQuery.join(', ')}`);
    console.log(`Message: ${message.substring(0, 100)}...`);
    console.log('='.repeat(50));
    
    // Load email data for selected user(s) (with logging)
    const dataContext = await loadUsersData(usersToQuery, logger);
    
    // Build system prompt with data for selected user(s)
    const systemPrompt = EMAIL_CHAT_SYSTEM_PROMPT
      .replace('{{AVAILABLE_USERS}}', usersToQuery.map(u => `- ${u}`).join('\n'))
      .replace('{{DATA_CONTEXT}}', dataContext);
    
    // Create chat model
    const modelName = 'claude-opus-4-20250514';
    const model = new ChatAnthropic({
      modelName,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      temperature: 0.7,
      maxTokens: 2000
    });
    
    // Call the model and track timing
    const apiStartTime = Date.now();
    let response;
    try {
      response = await model.invoke([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]);
      
      const apiDuration = Date.now() - apiStartTime;
      
      // Estimate token counts (rough approximation: ~4 chars per token)
      const inputTokens = Math.ceil((systemPrompt.length + message.length) / 4);
      const outputTokens = Math.ceil((response.content?.length || 0) / 4);
      
      logger.logApiCall(modelName, inputTokens, outputTokens, apiDuration, true, null, systemPrompt, message, response.content);
    } catch (apiError) {
      const apiDuration = Date.now() - apiStartTime;
      logger.logApiCall(modelName, 0, 0, apiDuration, false, apiError, systemPrompt, message, null);
      logger.logError('Anthropic API call', apiError);
      throw apiError;
    }
    
    const assistantResponse = response.content;
    
    console.log('Email Chat Response generated successfully');
    
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
      operationsLog
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    activeSessions: sessions.size,
    mongoConnected: mongoInitialized,
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
