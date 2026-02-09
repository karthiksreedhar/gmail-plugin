const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Load environment variables - critical for serverless
try {
  require('dotenv').config();
} catch (error) {
  // dotenv might not be available in production, which is fine
  console.log('dotenv not available (normal in serverless environments)');
}

console.log('=== GMAIL PLUGIN SERVER STARTING ===');

// Graceful environment variable checking
function checkEnvironmentVariables() {
  const critical = ['OPENAI_API_KEY', 'MONGODB_URI'];
  const optional = ['MONGODB_DB', 'CURRENT_USER_EMAIL', 'SENDING_EMAIL'];
  
  const missing = critical.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ CRITICAL: Missing required environment variables:', missing);
    console.error('The server will start but some features will be disabled.');
    console.error('Please add these variables to your Vercel environment settings.');
    return false;
  }
  
  console.log('✅ All critical environment variables found');
  return true;
}

const hasRequiredEnv = checkEnvironmentVariables();

// Initialize OpenAI only if API key is available
let openai = null;
if (process.env.OPENAI_API_KEY && hasRequiredEnv) {
  try {
    const OpenAI = require('openai');
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    console.log('✅ OpenAI initialized successfully');
  } catch (error) {
    console.error('❌ OpenAI initialization failed:', error.message);
  }
} else {
  console.warn('⚠️  OpenAI not initialized - OPENAI_API_KEY missing');
}

// Initialize MongoDB with error handling
let mongoInitialized = false;
async function initializeDatabase() {
  if (!hasRequiredEnv) return false;
  
  try {
    const { initMongo, warmCacheForUser } = require('./db');
    await initMongo();
    
    // Warm cache for default user
    const currentUser = process.env.CURRENT_USER_EMAIL || 'ks4190@columbia.edu';
    await warmCacheForUser(currentUser);
    
    mongoInitialized = true;
    console.log('✅ MongoDB initialized and cache warmed');
    return true;
  } catch (error) {
    console.error('❌ MongoDB initialization failed:', error.message);
    return false;
  }
}

// Initialize Express app
const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files with fallback
app.use(express.static(path.join(__dirname, 'public'), {
  fallthrough: true,
  maxAge: '1d'
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    services: {
      openai: !!openai,
      mongodb: mongoInitialized,
      hasRequiredEnv
    }
  });
});

// Status endpoint for debugging
app.get('/api/status', (req, res) => {
  const envCheck = {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    MONGODB_URI: !!process.env.MONGODB_URI,
    MONGODB_DB: !!process.env.MONGODB_DB,
    CURRENT_USER_EMAIL: !!process.env.CURRENT_USER_EMAIL,
    NODE_ENV: process.env.NODE_ENV || 'not set'
  };
  
  res.json({
    environment: envCheck,
    services: {
      openai_initialized: !!openai,
      mongodb_initialized: mongoInitialized,
      server_time: new Date().toISOString()
    }
  });
});

// Mock API endpoint to test basic functionality
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Gmail Plugin API is working',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Graceful endpoint for when OpenAI is not available
app.post('/api/generate-response', (req, res) => {
  if (!openai) {
    return res.status(503).json({
      success: false,
      error: 'OpenAI service not available. Please check OPENAI_API_KEY environment variable.',
      code: 'OPENAI_NOT_CONFIGURED'
    });
  }
  
  // If OpenAI is available, we could add the actual logic here
  // For now, return a placeholder
  res.json({
    success: true,
    response: 'OpenAI is configured but response generation logic needs to be implemented',
    justification: 'This is a placeholder response'
  });
});

// Serve the main application
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Fallback HTML if index.html is missing
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Gmail Plugin</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
          .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
          .ok { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
          .warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
        </style>
      </head>
      <body>
        <h1>Gmail Plugin Server</h1>
        <p>The server is running but the main UI is not available.</p>
        
        <div class="status ${hasRequiredEnv ? 'ok' : 'error'}">
          <strong>Environment:</strong> ${hasRequiredEnv ? 'Configured' : 'Missing required variables'}
        </div>
        
        <div class="status ${openai ? 'ok' : 'error'}">
          <strong>OpenAI:</strong> ${openai ? 'Connected' : 'Not configured - missing OPENAI_API_KEY'}
        </div>
        
        <div class="status ${mongoInitialized ? 'ok' : 'warning'}">
          <strong>MongoDB:</strong> ${mongoInitialized ? 'Connected' : 'Not connected'}
        </div>
        
        <p><a href="/api/health">Health Check</a> | <a href="/api/status">Detailed Status</a></p>
        
        <h3>Configuration Instructions:</h3>
        <ol>
          <li>Add <code>OPENAI_API_KEY</code> to your Vercel environment variables</li>
          <li>Ensure <code>MONGODB_URI</code> is correctly set</li>
          <li>Add <code>MONGODB_DB</code> if using a custom database name</li>
          <li>Redeploy your application</li>
        </ol>
      </body>
      </html>
    `);
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Initialize database when server starts
initializeDatabase().then((success) => {
  if (success) {
    console.log('✅ Database initialization completed');
  } else {
    console.warn('⚠️  Database initialization failed - some features may not work');
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`✅ Gmail Plugin server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`OpenAI: ${openai ? 'Ready' : 'Not configured'}`);
  console.log(`MongoDB: ${mongoInitialized ? 'Connected' : 'Connecting...'}`);
  console.log('=== SERVER STARTUP COMPLETE ===');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});

module.exports = app;