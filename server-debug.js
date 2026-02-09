// Debug version of server.js to identify startup issues
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

console.log('=== SERVER STARTUP DEBUG ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);

// Check critical environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'MONGODB_URI', 
  'MONGODB_DB',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET'
];

console.log('=== ENVIRONMENT VARIABLES CHECK ===');
const missingVars = [];
requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (!value) {
    missingVars.push(varName);
    console.log(`❌ MISSING: ${varName}`);
  } else {
    console.log(`✅ FOUND: ${varName} = ${varName === 'OPENAI_API_KEY' ? '[REDACTED]' : (value.length > 50 ? value.substring(0, 50) + '...' : value)}`);
  }
});

if (missingVars.length > 0) {
  console.error('=== CRITICAL ERROR ===');
  console.error('Missing required environment variables:', missingVars);
  process.exit(1);
}

// Try to load dotenv (should be no-op in production)
try {
  require('dotenv').config();
  console.log('✅ dotenv loaded');
} catch (error) {
  console.log('⚠️  dotenv not available (normal in production)');
}

// Test OpenAI initialization
try {
  console.log('=== TESTING OPENAI INITIALIZATION ===');
  const OpenAI = require('openai');
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('✅ OpenAI initialized successfully');
} catch (error) {
  console.error('❌ OpenAI initialization failed:', error.message);
  process.exit(1);
}

// Test MongoDB initialization  
try {
  console.log('=== TESTING MONGODB INITIALIZATION ===');
  const { initMongo } = require('./db');
  initMongo().then(() => {
    console.log('✅ MongoDB initialized successfully');
  }).catch(error => {
    console.error('❌ MongoDB initialization failed:', error.message);
  });
} catch (error) {
  console.error('❌ MongoDB module load failed:', error.message);
  process.exit(1);
}

// Test file system access
console.log('=== TESTING FILE SYSTEM ACCESS ===');
try {
  const currentDir = __dirname;
  console.log('Current directory:', currentDir);
  
  const publicDir = path.join(currentDir, 'public');
  console.log('Public directory exists:', fs.existsSync(publicDir));
  
  const dataDir = path.join(currentDir, 'data');
  console.log('Data directory exists:', fs.existsSync(dataDir));
  
  const indexFile = path.join(currentDir, 'public', 'index.html');
  console.log('index.html exists:', fs.existsSync(indexFile));
} catch (error) {
  console.error('❌ File system test failed:', error.message);
}

// Initialize Express app
const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Simple test endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV 
  });
});

// Serve main page
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('<h1>Gmail Plugin Debug Server</h1><p>index.html not found</p>');
  }
});

app.listen(PORT, () => {
  console.log(`✅ Debug server running on port ${PORT}`);
  console.log('=== DEBUG SERVER STARTED SUCCESSFULLY ===');
});