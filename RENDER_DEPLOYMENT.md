# Render Deployment Instructions

## Problem Fixed
The application was making internal HTTP requests using `http://localhost:${PORT}`, which fails in deployed environments. This has been fixed by introducing a dynamic `BASE_URL` environment variable.

## Required Environment Variables on Render

Set these in your Render dashboard under "Environment" settings:

```
OPENAI_API_KEY=your-openai-api-key
MONGODB_URI=mongodb+srv://ks4190_db_user:pulY33BbK3UQRjKW@please-god.erkorn3.mongodb.net/?appName=please-god
CURRENT_USER_EMAIL=lc3251@columbia.edu
SENDING_EMAIL=chilton@cs.columbia.edu
BASE_URL=https://your-app-name.onrender.com
```

**Important:** Replace `your-app-name.onrender.com` with your actual Render app URL.

## Steps to Deploy

1. **Set Environment Variables**
   - Go to your Render dashboard
   - Select your web service
   - Navigate to "Environment" tab
   - Add all the environment variables listed above

2. **Verify MongoDB Connection**
   - Ensure your MongoDB Atlas cluster allows connections from Render's IP addresses
   - In MongoDB Atlas: Network Access → Add IP Address → "Allow Access from Anywhere" (or add Render's IPs)

3. **Deploy**
   - Push your code to GitHub (the fix is in `server.js`)
   - Render will automatically detect the changes and redeploy
   - Or manually trigger a deploy from the Render dashboard

4. **Verify Deployment**
   - Visit your deployed URL
   - Check the logs for the startup message showing priority emails were loaded
   - Look for: `Loaded X priority emails from MongoDB`
   - The app should classify the 50 emails using the classifier-v4 endpoint

## Troubleshooting

### If priority emails still don't load:

1. **Check Render logs** for errors:
   ```
   - MongoDB connection errors
   - OpenAI API rate limits or authentication errors
   - BASE_URL misconfiguration
   ```

2. **Verify MongoDB has data**:
   - The `priority_emails` collection should have a document with `userEmail: "lc3251@columbia.edu"`
   - Contains an array of ~2490 emails

3. **Test the endpoint manually**:
   ```bash
   curl https://your-app-name.onrender.com/api/priority-today
   ```

4. **Check internal fetch calls aren't timing out**:
   - Render free tier has request timeouts (30 seconds for free, 60s for paid)
   - The classifier batch processing might need optimization if you have many categories

## What Was Changed

1. **Added BASE_URL variable** (line ~23 in server.js):
   ```javascript
   const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
   ```

2. **Replaced all localhost fetch calls** with `BASE_URL`:
   - `/api/switch-user` → `/api/priority-today`
   - `/api/seed-categories/add-all` → `/api/generate-category-summaries`
   - `/api/classifier-v3/suggest-batch` → `/api/explain-category-assignment` (3 instances)
   - `/api/classifier-v4/suggest-batch` → `/api/explain-category-assignment` (3 instances)
   - `/api/priority-today` → `/api/classifier-v4/suggest-batch` (2 instances)

## Next Steps (Optional)

For better architecture in the future, consider refactoring internal API calls into shared functions instead of HTTP requests. See `DEPLOYMENT_FIX.md` for details.

## Support

If you continue to have issues after setting these environment variables:
1. Check Render deployment logs for specific errors
2. Ensure all environment variables are set correctly
3. Verify MongoDB connection string is accessible from Render
4. Check if OpenAI API key has sufficient quota
