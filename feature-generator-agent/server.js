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
function normalizeBaseUrl(rawUrl, fallback) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return fallback;
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, '');
  }
  return `https://${raw.replace(/\/+$/, '')}`;
}

const MAIN_SYSTEM_BASE_URL = normalizeBaseUrl(
  process.env.MAIN_SYSTEM_BASE_URL,
  'http://localhost:3000'
);
const FEATURE_PUBLISH_TOKEN = String(process.env.FEATURE_PUBLISH_TOKEN || '').trim();
const FEATURE_EXPORT_TOKEN = String(process.env.FEATURE_EXPORT_TOKEN || '').trim();
const GH_FINE_GRAINED_TOKEN = String(process.env.GH_FINE_GRAINED_TOKEN || '').trim();
const GITHUB_REPO_OWNER = String(process.env.GITHUB_REPO_OWNER || 'karthiksreedhar').trim();
const GITHUB_REPO_NAME = String(process.env.GITHUB_REPO_NAME || 'gmail-plugin').trim();
const GITHUB_BASE_BRANCH = String(process.env.GITHUB_BASE_BRANCH || 'main').trim();
const GITHUB_PR_WORKFLOW_FILE = String(
  process.env.GITHUB_PR_WORKFLOW_FILE || 'create-generated-feature-pr.yml'
).trim();
const GITHUB_APPROVAL_WORKFLOW_FILE = String(
  process.env.GITHUB_APPROVAL_WORKFLOW_FILE || 'approve-generated-feature-and-promote.yml'
).trim();
const GITHUB_PRODUCTION_BRANCH = String(process.env.GITHUB_PRODUCTION_BRANCH || 'main').trim();
const FEATURE_GENERATOR_CREATED_BY = String(
  process.env.FEATURE_GENERATOR_CREATED_BY || process.env.CURRENT_USER_EMAIL || ''
).trim().toLowerCase();

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

function parseManifestFromFiles(files) {
  try {
    const manifestRaw = files && typeof files === 'object' ? files['manifest.json'] : null;
    if (!manifestRaw || typeof manifestRaw !== 'string') return null;
    return JSON.parse(manifestRaw);
  } catch (_) {
    return null;
  }
}

async function saveDraftFeatureToMainSystem(featureId, files, requestPrompt = '') {
  if (!featureId || !files || typeof files !== 'object') {
    return { success: false, error: 'Missing featureId or files for draft save' };
  }

  const manifest = parseManifestFromFiles(files);
  const endpoint = `${MAIN_SYSTEM_BASE_URL}/api/internal/generated-features/save-draft`;
  const headers = { 'Content-Type': 'application/json' };
  if (FEATURE_PUBLISH_TOKEN) {
    headers['x-feature-publish-token'] = FEATURE_PUBLISH_TOKEN;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        featureId,
        files,
        manifest,
        requestPrompt,
        createdBy: FEATURE_GENERATOR_CREATED_BY || undefined,
        name: manifest?.name || featureId,
        description: manifest?.description || ''
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      return {
        success: false,
        status: response.status,
        error: data.error || `Draft save failed with status ${response.status}`
      };
    }
    return {
      success: true,
      message: data.message || 'Draft saved successfully',
      feature: data.feature || null
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Draft save request failed'
    };
  }
}

async function markPrRequestedInMainSystem(featureId) {
  if (!featureId) {
    return { success: false, error: 'Missing featureId for PR request update' };
  }

  const endpoint = `${MAIN_SYSTEM_BASE_URL}/api/internal/generated-features/${encodeURIComponent(featureId)}/pr-requested`;
  const headers = { 'Content-Type': 'application/json' };
  if (FEATURE_PUBLISH_TOKEN) {
    headers['x-feature-publish-token'] = FEATURE_PUBLISH_TOKEN;
  }

  const prWorkflowUrl = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/${GITHUB_PR_WORKFLOW_FILE}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prWorkflowUrl })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      return {
        success: false,
        status: response.status,
        error: data.error || `PR request update failed with status ${response.status}`
      };
    }
    return { success: true, feature: data.feature || null, prWorkflowUrl };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to update PR requested status'
    };
  }
}

async function dispatchCreatePrWorkflow(featureId) {
  if (!featureId) {
    return { success: false, error: 'Missing featureId' };
  }
  if (!GH_FINE_GRAINED_TOKEN) {
    return { success: false, error: 'GH_FINE_GRAINED_TOKEN is not configured' };
  }

  const endpoint = `https://api.github.com/repos/${encodeURIComponent(GITHUB_REPO_OWNER)}/${encodeURIComponent(GITHUB_REPO_NAME)}/actions/workflows/${encodeURIComponent(GITHUB_PR_WORKFLOW_FILE)}/dispatches`;
  const workflowUrl = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/${GITHUB_PR_WORKFLOW_FILE}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${GH_FINE_GRAINED_TOKEN}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        ref: GITHUB_BASE_BRANCH,
        inputs: { feature_id: featureId }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      return {
        success: false,
        status: response.status,
        error: errorBody || `GitHub workflow dispatch failed with status ${response.status}`
      };
    }

    const statusResult = await markPrRequestedInMainSystem(featureId);
    if (!statusResult.success) {
      return {
        success: false,
        error: statusResult.error || 'Workflow dispatched, but failed to mark PR requested'
      };
    }

    return {
      success: true,
      workflowUrl,
      baseBranch: GITHUB_BASE_BRANCH
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to dispatch GitHub workflow'
    };
  }
}

async function dispatchApproveAndDeployWorkflow(featureId) {
  if (!featureId) {
    return { success: false, error: 'Missing featureId' };
  }
  if (!GH_FINE_GRAINED_TOKEN) {
    return { success: false, error: 'GH_FINE_GRAINED_TOKEN is not configured' };
  }

  const endpoint = `https://api.github.com/repos/${encodeURIComponent(GITHUB_REPO_OWNER)}/${encodeURIComponent(GITHUB_REPO_NAME)}/actions/workflows/${encodeURIComponent(GITHUB_APPROVAL_WORKFLOW_FILE)}/dispatches`;
  const workflowUrl = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/${GITHUB_APPROVAL_WORKFLOW_FILE}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${GH_FINE_GRAINED_TOKEN}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        ref: GITHUB_PRODUCTION_BRANCH,
        inputs: { feature_id: featureId }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      return {
        success: false,
        status: response.status,
        error: errorBody || `GitHub workflow dispatch failed with status ${response.status}`
      };
    }

    return {
      success: true,
      workflowUrl,
      productionBranch: GITHUB_PRODUCTION_BRANCH
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to dispatch approval workflow'
    };
  }
}

async function listFeaturesFromMainSystem() {
  const endpoint = `${MAIN_SYSTEM_BASE_URL}/api/feature-registry`;
  const headers = { 'Content-Type': 'application/json' };
  if (FEATURE_PUBLISH_TOKEN) {
    headers['x-feature-publish-token'] = FEATURE_PUBLISH_TOKEN;
  }

  const response = await fetch(endpoint, { method: 'GET', headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Failed to list features (status ${response.status})`);
  }

  const features = Array.isArray(data.features) ? data.features : [];
  return features.map((feature) => ({
    featureId: feature.featureId || feature.id,
    id: feature.id || feature.featureId,
    name: feature.name || feature.featureId || feature.id,
    status: feature.status || 'draft',
    deploymentStatus: feature.deploymentStatus || 'pending',
    source: feature.source || null,
    createdBy: feature.createdBy || null
  })).filter(feature => !!feature.featureId);
}

async function exportFeatureFromMainSystem(featureId) {
  if (!FEATURE_EXPORT_TOKEN) {
    throw new Error('FEATURE_EXPORT_TOKEN is not configured on the feature-generator app');
  }

  const endpoint = `${MAIN_SYSTEM_BASE_URL}/api/internal/generated-features/${encodeURIComponent(featureId)}/export`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-feature-export-token': FEATURE_EXPORT_TOKEN
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.feature) {
    throw new Error(data.error || `Failed to export feature ${featureId} (status ${response.status})`);
  }

  return data.feature;
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

app.get('/api/features/list', async (req, res) => {
  try {
    const features = await listFeaturesFromMainSystem();
    res.json({
      success: true,
      count: features.length,
      features
    });
  } catch (error) {
    console.error('Failed to load features list from main system:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load features list'
    });
  }
});

app.post('/api/session/:sessionId/load-feature', async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    const featureId = String(req.body?.featureId || '').trim();

    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }
    if (!featureId) {
      return res.status(400).json({ success: false, error: 'featureId is required' });
    }
    if (!sessions.has(sessionId)) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const exportedFeature = await exportFeatureFromMainSystem(featureId);
    const files = exportedFeature.files;
    if (!files || typeof files !== 'object' || Array.isArray(files) || Object.keys(files).length === 0) {
      return res.status(400).json({ success: false, error: 'Feature has no files to load' });
    }

    const session = sessions.get(sessionId);
    session.lastAccess = Date.now();
    session.featureId = featureId;
    session.generatedFiles = files;
    session.chatHistory.push({
      role: 'assistant',
      content: `Loaded existing feature ${featureId} for refinement.`,
      timestamp: Date.now(),
      loadedFeature: true
    });

    return res.json({
      success: true,
      sessionId: session.id,
      featureId,
      featureName: exportedFeature.name || featureId,
      status: exportedFeature.status || 'draft',
      files
    });
  } catch (error) {
    console.error('Failed to load existing feature into session:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to load feature'
    });
  }
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
    
    const draftSaveResult = await saveDraftFeatureToMainSystem(session.featureId, session.generatedFiles, message);

    // Add assistant response to history
    session.chatHistory.push({
      role: 'assistant',
      content: result.response,
      timestamp: Date.now(),
      filesGenerated: Object.keys(result.files),
      filesUpdated: result.updatedFiles || [],
      draftSave: draftSaveResult
    });

    res.json({
      success: true,
      sessionId: session.id,
      response: result.response,
      featureId: result.featureId,
      files: result.files,
      updatedFiles: result.updatedFiles || [],
      isRefinement,
      draftSave: draftSaveResult
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

app.post('/api/features/:featureId/create-pr', async (req, res) => {
  try {
    const featureId = String(req.params.featureId || '').trim();
    if (!featureId) {
      return res.status(400).json({ success: false, error: 'featureId is required' });
    }

    const result = await dispatchCreatePrWorkflow(featureId);
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Failed to dispatch PR workflow' });
    }

    return res.json({
      success: true,
      featureId,
      workflowUrl: result.workflowUrl,
      baseBranch: result.baseBranch
    });
  } catch (error) {
    console.error('Create PR request failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create PR request'
    });
  }
});

app.post('/api/features/:featureId/approve-and-deploy', async (req, res) => {
  try {
    const featureId = String(req.params.featureId || '').trim();
    if (!featureId) {
      return res.status(400).json({ success: false, error: 'featureId is required' });
    }

    const result = await dispatchApproveAndDeployWorkflow(featureId);
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Failed to dispatch approval workflow' });
    }

    return res.json({
      success: true,
      featureId,
      workflowUrl: result.workflowUrl,
      productionBranch: result.productionBranch
    });
  } catch (error) {
    console.error('Approve and deploy request failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to approve and deploy feature'
    });
  }
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

// List chat users dynamically so newly-authenticated users appear in UI.
app.get('/api/users', async (req, res) => {
  try {
    const users = await getAvailableUsers(true);
    res.json({ success: true, users });
  } catch (error) {
    console.error('Failed to list available users:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load users',
      users: DEFAULT_AVAILABLE_USERS.slice()
    });
  }
});

// =====================================================
// EMAIL CHAT MODE - Query email data using AI
// =====================================================

// Available user emails in the system (dynamic from Mongo, with fallback)
const DEFAULT_AVAILABLE_USERS = ['ks4190@columbia.edu', 'lc3251@columbia.edu'];
let availableUsersCache = {
  users: DEFAULT_AVAILABLE_USERS.slice(),
  fetchedAt: 0
};
const AVAILABLE_USERS_CACHE_TTL_MS = 30 * 1000;

async function getAvailableUsers(force = false) {
  const now = Date.now();
  if (!force && availableUsersCache.users.length && (now - availableUsersCache.fetchedAt) < AVAILABLE_USERS_CACHE_TTL_MS) {
    return availableUsersCache.users.slice();
  }

  const users = new Set(DEFAULT_AVAILABLE_USERS.map(u => String(u || '').trim().toLowerCase()).filter(Boolean));
  try {
    await ensureMongoReady();
    if (mongoInitialized) {
      const db = getDb();
      const rows = await db.collection('oauth_tokens').find({}).project({ userEmail: 1 }).toArray();
      for (const row of rows) {
        const email = String(row?.userEmail || '').trim().toLowerCase();
        if (email) users.add(email);
      }
    }
  } catch (error) {
    console.warn('Failed to refresh available users from Mongo:', error?.message || error);
  }

  const resolved = Array.from(users).sort();
  availableUsersCache = {
    users: resolved.length ? resolved : DEFAULT_AVAILABLE_USERS.slice(),
    fetchedAt: now
  };
  return availableUsersCache.users.slice();
}

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
  const users = await getAvailableUsers();
  return loadUsersData(users, logger);
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
  const availableUsers = await getAvailableUsers();
  if (modification.userEmail && !availableUsers.includes(String(modification.userEmail).trim().toLowerCase())) {
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
    const text = String(responseContent || '').trim();
    if (!text) return null;

    const candidates = [];
    candidates.push(text);

    const jsonRegex = /```json\s*(\{[\s\S]*?\})\s*```/g;
    let match;
    while ((match = jsonRegex.exec(text)) !== null) {
      if (match[1]) candidates.push(match[1].trim());
    }

    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      candidates.push(text.slice(first, last + 1));
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed.categorySuggestions && Array.isArray(parsed.categorySuggestions.categories)) {
          return parsed.categorySuggestions;
        }
      } catch (_) {
        // Keep trying other candidate slices.
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

function isOtherCategorySuggestionPrompt(message) {
  const normalized = normalizeLooseText(message);
  if (!normalized) return false;

  const mentionsOther = /\b(other|uncategorized)\b/.test(normalized);
  const mentionsCategoryIntent =
    /\b(categor(?:y|ies)|bucket|group|label|folder)\b/.test(normalized) &&
    /\b(suggest|create|new|potential|propose|recommend|identify|find)\b/.test(normalized);
  const mentionsEmails = /\b(email|emails|message|messages|inbox)\b/.test(normalized);
  const asksForFitOrMove = /\b(based on|fit|fits|move|belong|currently in)\b/.test(normalized);

  return mentionsOther && mentionsCategoryIntent && (mentionsEmails || asksForFitOrMove);
}

function isDatabaseModificationIntent(message) {
  const normalized = normalizeLooseText(message);
  if (!normalized) return false;

  if (isOtherCategorySuggestionPrompt(message)) return false;
  if (isEmailListQuery(message)) return false;

  const actionWords = /\b(add|create|make|update|change|move|remove|delete|rename|set|edit|modify|put|assign|recategorize|categorize)\b/;
  const targetWords = /\b(category|categories|guideline|summary|note|notes|email|emails|message|messages|database|db|inbox)\b/;

  return actionWords.test(normalized) && targetWords.test(normalized);
}

function parseJsonCandidates(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];

  const candidates = [trimmed];
  const jsonRegex = /```json\s*(\{[\s\S]*?\})\s*```/g;
  let match;
  while ((match = jsonRegex.exec(trimmed)) !== null) {
    if (match[1]) candidates.push(match[1].trim());
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    candidates.push(trimmed.slice(first, last + 1));
  }

  return candidates;
}

function parseSuggestionEnvelope(responseText) {
  for (const candidate of parseJsonCandidates(responseText)) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed?.suggestions && Array.isArray(parsed.suggestions.categories)) return parsed.suggestions;
      if (parsed?.categorySuggestions && Array.isArray(parsed.categorySuggestions.categories)) return parsed.categorySuggestions;
      if (Array.isArray(parsed?.categories)) return parsed;
    } catch (_) {
      // Keep trying alternate slices.
    }
  }
  return null;
}

function parseModificationEnvelope(responseText) {
  for (const candidate of parseJsonCandidates(responseText)) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed?.modifications)) return parsed;
      if (parsed?.plan && Array.isArray(parsed.plan.modifications)) return parsed.plan;
    } catch (_) {
      // Keep trying alternate slices.
    }
  }
  return null;
}

function normalizeModificationPlan(input, defaultUserEmail) {
  const rawMods = Array.isArray(input?.modifications) ? input.modifications : [];
  const modifications = [];

  for (const raw of rawMods) {
    const type = String(raw?.type || '').trim();
    const collection = String(raw?.collection || '').trim();
    const description = String(raw?.description || '').trim();
    const data = raw && typeof raw.data === 'object' && raw.data ? raw.data : {};
    if (!type || !collection || !description) continue;

    modifications.push({
      type,
      collection,
      description,
      data,
      userEmail: raw?.userEmail || defaultUserEmail,
      id: uuidv4(),
      timestamp: new Date().toISOString()
    });
  }

  return {
    summary: String(input?.summary || '').trim(),
    modifications
  };
}

async function generateModificationPlanForUsers(message, usersToQuery, logger) {
  const dataContext = await loadUsersData(usersToQuery, logger);
  const availableUsers = await getAvailableUsers();
  const targetUser = usersToQuery[0] || availableUsers[0] || DEFAULT_AVAILABLE_USERS[0];
  const modelName = getGeminiModel();
  const modificationSchema = {
    type: 'OBJECT',
    properties: {
      summary: { type: 'STRING' },
      modifications: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            type: { type: 'STRING' },
            collection: { type: 'STRING' },
            userEmail: { type: 'STRING' },
            description: { type: 'STRING' },
            data: { type: 'OBJECT' }
          },
          required: ['type', 'collection', 'description', 'data']
        }
      }
    },
    required: ['modifications']
  };

  const plannerPrompt = `You are planning database changes for an email assistant.

User request:
${message}

Target user:
${targetUser}

Available users:
${usersToQuery.join(', ')}

Allowed modification types:
- addCategory -> collection "categories" -> data: { "category": "Name" }
- removeCategory -> collection "categories" -> data: { "category": "Name" }
- updateGuideline -> collection "category_guidelines" -> data: { "category": "Name", "guideline": "Text" }
- updateSummary -> collection "category_summaries" -> data: { "category": "Name", "summary": "Text" }
- addNote -> collection "notes" -> data: { "note": "Text" }
- updateEmailCategory -> collection "response_emails" -> data: { "emailId": "Exact email id", "newCategory": "Category Name" }

Return ONLY JSON:
{
  "summary": "One sentence summary of the intended changes",
  "modifications": [
    {
      "type": "updateEmailCategory",
      "collection": "response_emails",
      "userEmail": "${targetUser}",
      "description": "Move email abc123 to Research",
      "data": {
        "emailId": "abc123",
        "newCategory": "Research"
      }
    }
  ]
}

Rules:
- If the request does not require any database change, return {"summary":"", "modifications":[]}
- Use exact email IDs from the data context when changing email categories
- Do not invent categories that already exist if the request only asks to move emails
- Keep descriptions concise and user-facing
- Return JSON only

DATA CONTEXT:
${dataContext}`;

  const started = Date.now();
  let response;
  try {
    response = await invokeGemini({
      model: modelName,
      temperature: 0.1,
      maxOutputTokens: 1800,
      responseMimeType: 'application/json',
      responseSchema: modificationSchema,
      messages: [
        { role: 'user', content: plannerPrompt }
      ]
    });
    const duration = Date.now() - started;
    logger?.logApiCall(
      modelName,
      Math.ceil(plannerPrompt.length / 4),
      Math.ceil((response.content?.length || 0) / 4),
      duration,
      true,
      null,
      null,
      plannerPrompt,
      response.content
    );
  } catch (error) {
    const duration = Date.now() - started;
    logger?.logApiCall(modelName, 0, 0, duration, false, error, null, plannerPrompt, null);
    logger?.logError('Modification planner API call', error);
    throw error;
  }

  const parsed = parseModificationEnvelope(response.content);
  const normalized = normalizeModificationPlan(parsed, targetUser);
  return normalized;
}

function normalizeCategorySuggestions(input, validEmailIds = new Set()) {
  const canonicalIdMap = new Map();
  const canonicalizeId = (value) => String(value || '').trim().replace(/^thread-/i, '');
  for (const id of validEmailIds) {
    const key = canonicalizeId(id);
    if (key && !canonicalIdMap.has(key)) canonicalIdMap.set(key, id);
  }
  const sourceCategories = Array.isArray(input?.categories) ? input.categories : [];
  const categories = [];

  for (const rawCategory of sourceCategories) {
    const name = String(rawCategory?.name || '').trim();
    if (!name) continue;

    const description = String(rawCategory?.description || '').trim();
    const guideline = String(rawCategory?.guideline || '').trim();
    const rawEmails = Array.isArray(rawCategory?.suggestedEmails)
      ? rawCategory.suggestedEmails
      : Array.isArray(rawCategory?.emails)
        ? rawCategory.emails
        : [];

    const suggestedEmails = [];
    const seenIds = new Set();
    for (const item of rawEmails) {
      const emailObj = item && typeof item === 'object' ? item : { id: item };
      const rawId = String(emailObj?.id || '').trim();
      const id = canonicalIdMap.get(canonicalizeId(rawId)) || rawId;
      if (!id || seenIds.has(id)) continue;
      if (validEmailIds.size && !validEmailIds.has(id)) continue;

      seenIds.add(id);
      suggestedEmails.push({
        id,
        subject: String(emailObj?.subject || 'No Subject'),
        from: String(emailObj?.from || 'Unknown Sender'),
        date: String(emailObj?.date || ''),
        snippet: String(emailObj?.snippet || '').trim(),
        reason: String(emailObj?.reason || 'This email appears to fit this category.').trim()
      });
    }

    if (!suggestedEmails.length) continue;
    categories.push({
      name,
      description,
      guideline,
      confidence: Number(rawCategory?.confidence || 0) || undefined,
      suggestedEmails
    });
  }

  return {
    action: String(input?.action || 'createCategories'),
    categories
  };
}

function hasSufficientCategorySuggestions(suggestions) {
  const categories = Array.isArray(suggestions?.categories) ? suggestions.categories : [];
  if (categories.length < 2) return false;
  const totalEmails = categories.reduce((sum, cat) => sum + ((cat?.suggestedEmails || []).length), 0);
  if (totalEmails < 4) return false;
  return categories.every(cat => (cat?.suggestedEmails || []).length >= 2);
}

async function generateCategorySuggestionsForUser(userData, logger, options = {}) {
  const requestedCategories = Array.isArray(options.requestedCategories)
    ? options.requestedCategories.filter(Boolean)
    : [];
  const modelName = getGeminiModel();
  const otherEmails = (userData?.responseEmails || []).filter(email =>
    email.category === 'Other' || email.category === 'Uncategorized' || !email.category
  );
  const validEmailIds = new Set(otherEmails.map(email => String(email?.id || '').trim()).filter(Boolean));
  const categorySuggestionSchema = {
    type: 'OBJECT',
    properties: {
      suggestions: {
        type: 'OBJECT',
        properties: {
          action: { type: 'STRING' },
          categories: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                description: { type: 'STRING' },
                guideline: { type: 'STRING' },
                confidence: { type: 'NUMBER' },
                suggestedEmails: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      id: { type: 'STRING' },
                      subject: { type: 'STRING' },
                      from: { type: 'STRING' },
                      date: { type: 'STRING' },
                      snippet: { type: 'STRING' },
                      reason: { type: 'STRING' }
                    },
                    required: ['id']
                  }
                }
              },
              required: ['name', 'suggestedEmails']
            }
          }
        },
        required: ['categories']
      }
    },
    required: ['suggestions']
  };

  if (otherEmails.length === 0) {
    return {
      suggestions: { action: 'createCategories', categories: [] },
      otherEmailsCount: 0
    };
  }

  const analysisPrompt = `You are analyzing emails currently categorized as "Other" to suggest better category assignments.

EXISTING CATEGORIES: ${userData.categories.join(', ')}

EMAILS IN "OTHER" CATEGORY (${otherEmails.length} emails):
${otherEmails.slice(0, 20).map((email, i) => `
${i + 1}. ID: ${email.id}
   Subject: ${email.subject}
   From: ${email.from}
   Date: ${email.date || ''}
   Snippet: ${(email.snippet || '').substring(0, 200)}
`).join('')}

TASK: Analyze these "Other" emails and suggest 2-4 new category names that would better organize them. For each suggested category:

1. Choose a clear, descriptive name
2. Identify which emails from the "Other" list would fit
3. Explain why those emails belong together

${requestedCategories.length ? `USER REQUESTED THESE CATEGORIES: ${requestedCategories.join(', ')} - prioritize these if they make sense for the emails.` : ''}

Respond with ONLY this JSON format (no other text):

{
  "suggestions": {
    "action": "createCategories",
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
- Suggest 3-8 emails per category
- Keep category names professional and descriptive
- High confidence (0.7+) suggestions only
- Return valid JSON only`;

  const apiStartTime = Date.now();
  let aiResponse;
  try {
    aiResponse = await invokeGemini({
      model: modelName,
      temperature: 0.3,
      maxOutputTokens: 2200,
      responseMimeType: 'application/json',
      responseSchema: categorySuggestionSchema,
      messages: [
        { role: 'user', content: analysisPrompt }
      ]
    });

    const apiDuration = Date.now() - apiStartTime;
    const inputTokens = Math.ceil(analysisPrompt.length / 4);
    const outputTokens = Math.ceil((aiResponse.content?.length || 0) / 4);
    logger?.logApiCall(modelName, inputTokens, outputTokens, apiDuration, true, null, null, analysisPrompt, aiResponse.content);
  } catch (apiError) {
    const apiDuration = Date.now() - apiStartTime;
    logger?.logApiCall(modelName, 0, 0, apiDuration, false, apiError, null, analysisPrompt, null);
    logger?.logError('Category suggestions API call', apiError);
    throw apiError;
  }

  let suggestions = parseSuggestionEnvelope(aiResponse.content);
  if (!suggestions) {
    const repairPrompt = `Fix this into valid JSON for category suggestions.

Return JSON only with this shape:
{
  "suggestions": {
    "action": "createCategories",
    "categories": [
      {
        "name": "Category Name",
        "description": "Description",
        "guideline": "Guideline",
        "confidence": 0.8,
        "suggestedEmails": [
          {
            "id": "email_id",
            "subject": "Subject",
            "from": "sender@example.com",
            "date": "2024-01-01",
            "snippet": "Preview",
            "reason": "Why it fits"
          }
        ]
      }
    ]
  }
}

Original response:
${String(aiResponse.content || '').slice(0, 12000)}`;

    const repairStart = Date.now();
    try {
      const repaired = await invokeGemini({
        model: modelName,
        temperature: 0,
        maxOutputTokens: 2200,
        responseMimeType: 'application/json',
        messages: [
          { role: 'user', content: repairPrompt }
        ]
      });
      const repairDuration = Date.now() - repairStart;
      logger?.logApiCall(
        modelName,
        Math.ceil(repairPrompt.length / 4),
        Math.ceil((repaired.content?.length || 0) / 4),
        repairDuration,
        true,
        null,
        null,
        repairPrompt,
        repaired.content
      );
      suggestions = parseSuggestionEnvelope(repaired.content);
    } catch (repairError) {
      const repairDuration = Date.now() - repairStart;
      logger?.logApiCall(modelName, 0, 0, repairDuration, false, repairError, null, repairPrompt, null);
      logger?.logError('Category suggestions repair API call', repairError);
    }
  }

  const normalized = normalizeCategorySuggestions(suggestions, validEmailIds);
  if (hasSufficientCategorySuggestions(normalized)) {
    return {
      suggestions: normalized,
      otherEmailsCount: otherEmails.length,
      rawResponse: aiResponse.content
    };
  }

  const compactEmails = otherEmails.slice(0, 20).map(email => ({
    id: String(email?.id || ''),
    subject: String(email?.subject || ''),
    from: String(email?.from || ''),
    date: String(email?.date || ''),
    snippet: String(email?.snippet || '').slice(0, 160)
  }));
  const simplerPrompt = `Return valid JSON only.

Group these emails currently in Other into 2-4 potential new categories.
Use ONLY the exact ids provided below. Do not invent or modify ids.
Try to produce at least 2 categories with at least 2 emails per category when the data supports it.

Output shape:
{
  "categories": [
    {
      "name": "Category Name",
      "description": "Short description",
      "guideline": "Short guideline",
      "emails": ["exact_id_1", "exact_id_2"],
      "confidence": 0.8
    }
  ]
}

Emails:
${JSON.stringify(compactEmails, null, 2)}`;

  const simpleStart = Date.now();
  try {
    const simpler = await invokeGemini({
      model: modelName,
      temperature: 0.2,
      maxOutputTokens: 1800,
      responseMimeType: 'application/json',
      messages: [
        { role: 'user', content: simplerPrompt }
      ]
    });
    const simpleDuration = Date.now() - simpleStart;
    logger?.logApiCall(
      modelName,
      Math.ceil(simplerPrompt.length / 4),
      Math.ceil((simpler.content?.length || 0) / 4),
      simpleDuration,
      true,
      null,
      null,
      simplerPrompt,
      simpler.content
    );
    const simplerParsed = parseSuggestionEnvelope(simpler.content);
    const simplerNormalized = normalizeCategorySuggestions(simplerParsed, validEmailIds);
    if (hasSufficientCategorySuggestions(simplerNormalized)) {
      return {
        suggestions: simplerNormalized,
        otherEmailsCount: otherEmails.length,
        rawResponse: simpler.content
      };
    }
  } catch (simpleError) {
    const simpleDuration = Date.now() - simpleStart;
    logger?.logApiCall(modelName, 0, 0, simpleDuration, false, simpleError, null, simplerPrompt, null);
    logger?.logError('Category suggestions simplified API call', simpleError);
  }

  const retryPrompt = `Return valid JSON only.

The previous result was too sparse. Re-cluster these emails from Other into 2-4 meaningful new categories.
Requirements:
- Produce at least 2 categories
- Put at least 2 exact email IDs in each category
- Use ONLY exact IDs from the list below
- Prefer covering 4-8 total emails

Output shape:
{
  "categories": [
    {
      "name": "Category Name",
      "description": "Short description",
      "guideline": "Short guideline",
      "emails": ["exact_id_1", "exact_id_2"],
      "confidence": 0.8
    }
  ]
}

Emails:
${JSON.stringify(compactEmails, null, 2)}`;

  const retryStart = Date.now();
  try {
    const retried = await invokeGemini({
      model: modelName,
      temperature: 0.1,
      maxOutputTokens: 1800,
      responseMimeType: 'application/json',
      messages: [
        { role: 'user', content: retryPrompt }
      ]
    });
    const retryDuration = Date.now() - retryStart;
    logger?.logApiCall(
      modelName,
      Math.ceil(retryPrompt.length / 4),
      Math.ceil((retried.content?.length || 0) / 4),
      retryDuration,
      true,
      null,
      null,
      retryPrompt,
      retried.content
    );
    const retriedParsed = parseSuggestionEnvelope(retried.content);
    const retriedNormalized = normalizeCategorySuggestions(retriedParsed, validEmailIds);
    if (hasSufficientCategorySuggestions(retriedNormalized)) {
      return {
        suggestions: retriedNormalized,
        otherEmailsCount: otherEmails.length,
        rawResponse: retried.content
      };
    }
  } catch (retryError) {
    const retryDuration = Date.now() - retryStart;
    logger?.logApiCall(modelName, 0, 0, retryDuration, false, retryError, null, retryPrompt, null);
    logger?.logError('Category suggestions retry API call', retryError);
  }

  throw new Error('AI response was not valid category-suggestion JSON');
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
  
  const availableUsers = await getAvailableUsers();
  // Validate userEmail if provided
  const normalizedRequested = String(userEmail || '').trim().toLowerCase();
  const selectedUser = normalizedRequested && availableUsers.includes(normalizedRequested) ? normalizedRequested : null;
  const usersToQuery = selectedUser ? [selectedUser] : availableUsers;
  
  // Detect if this is an email list query
  const isEmailQuery = isEmailListQuery(message);
  console.log(`📧 Email list query detected: ${isEmailQuery}`);
  
  try {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`EMAIL CHAT - Loading data for: ${usersToQuery.join(', ')}`);
    console.log(`Message: ${message.substring(0, 100)}...`);
    console.log('='.repeat(50));
    
    // Route category-suggestion chat requests through the dedicated structured
    // AI path so the UI can reliably render approval controls.
    if (isOtherCategorySuggestionPrompt(message)) {
      const targetUser = usersToQuery[0] || availableUsers[0] || DEFAULT_AVAILABLE_USERS[0];
      const targetData = await loadUserEmailData(targetUser, logger);
      const { suggestions: categorySuggestions } = await generateCategorySuggestionsForUser(targetData, logger);
      const categoryCount = Array.isArray(categorySuggestions?.categories) ? categorySuggestions.categories.length : 0;
      const emailCount = (categorySuggestions?.categories || []).reduce((sum, c) => sum + ((c?.suggestedEmails || []).length), 0);
      const assistantResponse = categoryCount
        ? `I analyzed emails currently in "Other" and prepared ${categoryCount} suggested categories. Review them in the preview panel and click Approve or Cancel.`
        : 'I checked emails currently in "Other", but I could not find enough candidates to suggest new categories right now.';

      return res.json({
        success: true,
        response: assistantResponse,
        availableUsers,
        operationsLog: logger.getLog(),
        categorySuggestions,
        isEmailQuery: false,
        summary: {
          categories: categoryCount,
          suggestedEmails: emailCount,
          source: 'dedicated-ai-category-suggestions'
        }
      });
    }

    if (isDatabaseModificationIntent(message)) {
      const plan = await generateModificationPlanForUsers(message, usersToQuery, logger);
      const modifications = [];
      for (const mod of plan.modifications) {
        const errors = await validateModification(mod);
        if (errors.length === 0) modifications.push(mod);
      }

      const operationsLog = logger.getLog();
      if (modifications.length > 0) {
        const assistantResponse = plan.summary
          ? plan.summary
          : `I identified ${modifications.length} database change${modifications.length !== 1 ? 's' : ''} that require your approval.`;
        return res.json({
          success: true,
          response: assistantResponse,
          availableUsers,
          operationsLog,
          modifications,
          requiresConfirmation: true,
          isEmailQuery: false,
          summary: {
            modifications: modifications.length,
            source: 'dedicated-ai-modification-planner'
          }
        });
      }
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
      availableUsers,
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
  
  const availableUsers = await getAvailableUsers();
  const normalizedRequested = String(userEmail || '').trim().toLowerCase();
  const targetUser = (normalizedRequested && availableUsers.includes(normalizedRequested))
    ? normalizedRequested
    : (availableUsers[0] || DEFAULT_AVAILABLE_USERS[0]);
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
  
  const availableUsers = await getAvailableUsers();
  // Validate user email
  const normalizedRequested = String(userEmail || '').trim().toLowerCase();
  const targetUser = normalizedRequested && availableUsers.includes(normalizedRequested)
    ? normalizedRequested
    : (availableUsers[0] || DEFAULT_AVAILABLE_USERS[0]);
  
  try {
    console.log(`\n📂 GENERATING CATEGORY SUGGESTIONS for ${targetUser}`);
    
    // Load user's current categories and "Other" emails
    const userData = await loadUserEmailData(targetUser, logger);

    const otherEmails = (userData.responseEmails || []).filter(email =>
      email.category === 'Other' || email.category === 'Uncategorized' || !email.category
    );
    console.log(`   Found ${otherEmails.length} emails in "Other" category`);
    console.log(`   Sample "Other" emails:`, otherEmails.slice(0, 3).map(e => `${e.id} (${e.category || 'NO_CATEGORY'}) - ${e.subject}`));

    if (otherEmails.length === 0) {
      return res.json({
        success: true,
        message: 'No emails in "Other" category to categorize',
        suggestions: { categories: [] },
        operationsLog: logger.getLog()
      });
    }

    const { suggestions, otherEmailsCount } = await generateCategorySuggestionsForUser(userData, logger, {
      requestedCategories
    });
    console.log(`   AI suggested ${suggestions.categories.length} categories`);
    
    res.json({
      success: true,
      suggestions,
      otherEmailsCount,
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
