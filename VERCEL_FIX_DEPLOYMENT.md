# Vercel Deployment Fix Guide

## Root Cause Analysis

Your Vercel serverless function is crashing due to **missing critical environment variables**, specifically `OPENAI_API_KEY`. The server initialization fails when trying to create the OpenAI client without this required variable.

## Critical Issues Identified

1. **Missing OPENAI_API_KEY** - This is the primary cause of the crash
2. **MongoDB connection issues** - May be causing secondary failures
3. **File system access** - Some paths might not work in serverless environment
4. **Synchronous initialization** - Server tries to initialize everything at startup

## Immediate Fix Steps

### Step 1: Add Missing Environment Variables to Vercel

Go to your Vercel dashboard → Project Settings → Environment Variables and add:

```bash
# Required (Critical)
OPENAI_API_KEY=your_actual_openai_api_key_here
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=gmail_plugin

# Optional (Recommended)
CURRENT_USER_EMAIL=ks4190@columbia.edu
SENDING_EMAIL=ks4190@columbia.edu
NODE_ENV=production
```

### Step 2: Update vercel.json (Temporary Fix)

Create this updated configuration to use the fixed server:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server-fixed.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/public/(.*)",
      "dest": "/public/$1"
    },
    {
      "src": "/data/(.*)",
      "dest": "/data/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/server-fixed.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### Step 3: Deploy and Test

1. Deploy to Vercel: `vercel --prod`
2. Test the health endpoint: `https://your-app.vercel.app/api/health`
3. Check status: `https://your-app.vercel.app/api/status`

## Expected Behavior After Fix

✅ **Server will start successfully** even with missing variables  
✅ **Graceful error messages** instead of crashes  
✅ **Debug endpoints** to verify configuration  
✅ **Fallback UI** with configuration instructions  

## Testing Endpoints

Once deployed, test these URLs:

- `/api/health` - Basic health check
- `/api/status` - Detailed environment status  
- `/api/test` - Simple API test
- `/` - Main application (with fallback instructions)

## Long-term Solution

After confirming the fix works, you should:

1. **Restore original server.js** with the graceful error handling patterns
2. **Add proper environment validation** at startup
3. **Implement feature flags** for optional services
4. **Update vercel.json** to use `server.js` again

## Environment Variable Checklist

- [ ] OPENAI_API_KEY (Required - get from OpenAI dashboard)
- [ ] MONGODB_URI (Required - your Atlas connection string)
- [ ] MONGODB_DB (Optional - defaults to 'gmail_plugin')
- [ ] CURRENT_USER_EMAIL (Optional - defaults to ks4190@columbia.edu)
- [ ] SENDING_EMAIL (Optional - defaults to CURRENT_USER_EMAIL)

## Debug Commands

If you still have issues:

```bash
# Check deployment logs
vercel logs

# Redeploy with verbose output
vercel --prod --debug

# Test locally with the fixed server
node server-fixed.js
```

## Next Steps

1. Add the environment variables in Vercel
2. Deploy with the updated vercel.json
3. Verify the app loads without crashing
4. Once confirmed working, integrate the error handling into your main server.js