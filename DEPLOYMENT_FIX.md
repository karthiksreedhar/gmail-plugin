# Deployment Issue: Internal Localhost Fetch Calls

## Problem
The server makes internal HTTP requests to itself using `http://localhost:${PORT}`, which fails on Render because:
1. The hostname should be dynamic based on environment
2. Circular dependencies can cause initialization issues
3. Network stack may not be ready during startup

## Affected Endpoints
1. `/api/priority-today` → calls `/api/classifier-v4/suggest-batch`
2. `/api/switch-user` → calls `/api/priority-today`
3. `/api/seed-categories/add-all` → calls `/api/generate-category-summaries`
4. Multiple places call `/api/explain-category-assignment`

## Solution Options

### Option 1: Use Environment Variable (Quick Fix)
Replace all `http://localhost:${PORT}` with a dynamic base URL:

```javascript
// At top of server.js
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Then replace all fetch calls:
const resp = await fetch(`${BASE_URL}/api/classifier-v4/suggest-batch`, {
```

Add to Render environment variables:
```
BASE_URL=https://your-app-name.onrender.com
```

### Option 2: Extract Shared Logic (Better)
Refactor the classifier logic into a shared function that can be called directly without HTTP:

```javascript
// Extract the classifier logic
async function classifyEmailsBatch(emails, maxPerCat) {
  // ... existing logic from /api/classifier-v4/suggest-batch
  return results;
}

// Use in /api/priority-today
const results = await classifyEmailsBatch(pick, undefined);

// Also expose as endpoint
app.post('/api/classifier-v4/suggest-batch', async (req, res) => {
  const results = await classifyEmailsBatch(req.body.emails, req.body.maxPerCat);
  return res.json({ success: true, results });
});
```

### Option 3: Use Relative URLs with Hostname Detection
```javascript
const HOSTNAME = process.env.RENDER ? 
  `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : 
  `http://localhost:${PORT}`;
```

## Recommended Fix
Use Option 1 (environment variable) for immediate deployment, then refactor to Option 2 for better architecture.

## Environment Variables Needed on Render
```
OPENAI_API_KEY=your-key
MONGODB_URI=your-mongo-connection-string
CURRENT_USER_EMAIL=lc3251@columbia.edu
SENDING_EMAIL=chilton@cs.columbia.edu
BASE_URL=https://your-app-name.onrender.com
```
