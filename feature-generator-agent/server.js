/**
 * Feature Generator Agent Server
 * Express server for generating Gmail Plugin features using LangChain + Anthropic
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const { FeatureGeneratorAgent } = require('./agent');

const app = express();
const PORT = process.env.PORT || 5000;

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    activeSessions: sessions.size,
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
