# Vercel Deployment Guide

This guide walks you through deploying the Gmail Plugin to Vercel with automatic background email refresh.

## Overview

The application uses:
- **Express.js** running on Vercel serverless functions
- **MongoDB Atlas** for data persistence
- **Vercel Cron Jobs** for automatic email refresh every 10 minutes
- **Gmail API** for email access

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **MongoDB Atlas**: Create a free cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
3. **Gmail API Credentials**: Set up OAuth 2.0 credentials in Google Cloud Console
4. **OpenAI API Key**: Get one from [platform.openai.com](https://platform.openai.com)

## Step 1: Prepare MongoDB Atlas

1. Create a free MongoDB Atlas cluster
2. Create a database user with read/write permissions
3. Whitelist all IP addresses (0.0.0.0/0) for Vercel access
4. Get your connection string (looks like `mongodb+srv://<username>:<password>@cluster.mongodb.net/<dbname>?retryWrites=true&w=majority`)

## Step 2: Set Up Gmail API

For each user (ks4190@columbia.edu, lc3251@columbia.edu):

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: 
     - `https://your-app.vercel.app/oauth2callback`
     - `http://localhost:3000/oauth2callback` (for local testing)
5. Download credentials JSON file
6. Place in `data/<user-email>/gcp-oauth.keys.json`

## Step 3: Install Vercel CLI

```bash
npm install -g vercel
```

## Step 4: Configure Environment Variables

Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
OPENAI_API_KEY=sk-...
MONGODB_URI=mongodb+srv://...
CURRENT_USER_EMAIL=ks4190@columbia.edu
SENDING_EMAIL=ks4190@columbia.edu
BASE_URL=https://your-app.vercel.app
CRON_SECRET=$(openssl rand -hex 32)
NODE_ENV=production
```

## Step 5: Create Vercel Project

### Method 1: Using Vercel CLI (Recommended)

**First, install and login:**
```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to your Vercel account
vercel login
# This will open a browser window to authenticate
```

**Then, create and link a new project:**
```bash
# Run vercel link to create a new project
vercel link

# You'll be prompted with:
? Set up and deploy "~/gmail-plugin"? [Y/n] y
? Which scope do you want to deploy to? <Your Vercel Account>
? Link to existing project? [y/N] n
? What's your project's name? gmail-plugin
? In which directory is your code located? ./

# Vercel will create a new project and link it
```

**Finally, deploy to production:**
```bash
vercel --prod

# This will:
# 1. Build your project
# 2. Deploy to Vercel
# 3. Give you a production URL (e.g., https://gmail-plugin.vercel.app)
```

### Method 2: Using Vercel Dashboard

1. **Go to Vercel Dashboard**:
   - Visit https://vercel.com/new
   - Login if not already

2. **Import Repository** (if using Git):
   - Click "Import Git Repository"
   - Connect GitHub/GitLab/Bitbucket
   - Select your gmail-plugin repository
   - Click "Import"

3. **Or Deploy without Git**:
   - Use CLI method above (Method 1)
   - Vercel will deploy from your local directory

4. **Configure Build Settings** (usually auto-detected):
   - Framework Preset: Other
   - Build Command: (leave empty)
   - Output Directory: (leave empty)
   - Install Command: `npm install`

5. **Deploy**:
   - Click "Deploy"
   - Wait for deployment to complete
   - Note your production URL

### Verify Deployment

After deployment, you should see:
```
✅ Deployment Complete
🔗 Production: https://gmail-plugin-xyz.vercel.app
```

**Important**: Copy this URL - you'll need it for environment variables!

### Add Environment Variables in Vercel Dashboard

1. Go to your project in Vercel dashboard
2. Navigate to **Settings > Environment Variables**
3. Add all variables from your `.env` file:
   - `OPENAI_API_KEY`
   - `MONGODB_URI`
   - `CURRENT_USER_EMAIL`
   - `SENDING_EMAIL`
   - `BASE_URL` (set to your Vercel deployment URL)
   - `CRON_SECRET`
   - `NODE_ENV=production`

## Step 6: Configure Vercel Cron

The `vercel.json` file already includes cron configuration:

```json
{
  "crons": [
    {
      "path": "/api/background-refresh",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

This runs every 10 minutes. Vercel will automatically call `/api/background-refresh`.

## Step 7: First-Time User Setup

After deployment, each user needs to:

1. **Authenticate with Gmail**:
   - Visit `https://your-app.vercel.app`
   - Click "Choose User" and select your email
   - Follow Gmail OAuth flow
   - Tokens will be saved to MongoDB

2. **Seed Initial Emails** (optional):
   - Click "Seed Categories" button
   - This loads the first 50 important emails
   - Categories are auto-assigned

3. **Configure Categories**:
   - Click "Edit Categories & Notes"
   - Organize emails into meaningful categories
   - Add notes and summaries for better AI categorization

## Step 8: Verify Background Refresh

1. Check Vercel logs for cron execution:
   ```bash
   vercel logs --follow
   ```

2. Look for log entries every 10 minutes:
   ```
   === Background Refresh Started ===
   Time: 2026-02-05T18:00:00.000Z
   --- Processing user: ks4190@columbia.edu ---
   Found 3 new emails
   Added 3 new emails for ks4190@columbia.edu
   === Background Refresh Complete ===
   ```

3. You can also manually trigger the background refresh:
   ```bash
   curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
        https://your-app.vercel.app/api/background-refresh
   ```

## How Background Refresh Works

1. **Every 10 minutes**, Vercel Cron calls `/api/background-refresh`
2. For each user (ks4190@columbia.edu, lc3251@columbia.edu):
   - Finds the most recent email in the database
   - Fetches new emails since that date (max 50)
   - Auto-categorizes using the V4 classifier
   - Adds to database automatically
   - Logs classification results

3. **No user action needed** - emails appear automatically in the UI

## Monitoring and Maintenance

### View Logs

```bash
# Follow logs in real-time
vercel logs --follow

# View recent logs
vercel logs
```

### Check Database

Use MongoDB Compass or Atlas UI to view:
- `response_emails` collection
- `email_threads` collection  
- `classifier_log` collection

### Troubleshooting

**Issue**: Background refresh not running
- Check Vercel cron settings in dashboard
- Verify `CRON_SECRET` environment variable is set
- Check logs for authentication errors

**Issue**: Gmail authentication expired
- Users will see "Gmail authentication required" in UI
- Each user needs to re-authenticate via OAuth flow
- Tokens are saved to MongoDB for persistence

**Issue**: Classifier not working
- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI API quota/billing
- Review logs for API errors

## Security Notes

1. **Never commit** `.env` file or credentials to git
2. **Rotate `CRON_SECRET`** periodically
3. **Use MongoDB Atlas IP whitelist** (though 0.0.0.0/0 needed for Vercel)
4. **Review Gmail API scopes** - only uses read/send, not delete

## Scaling

- **Free Vercel Plan**: 100GB bandwidth, 100 serverless function invocations/day
- **Background Refresh**: ~144 invocations/day (every 10 min) × 2 users = fine for free tier
- **MongoDB Free Tier**: 512MB storage (sufficient for thousands of emails)

## Local Development

To run locally with the same configuration:

```bash
# Install dependencies
npm install

# Set up .env file (see Step 4 above)

# Run locally
npm start

# Test background refresh manually
curl http://localhost:3000/api/background-refresh
```

## Next Steps

1. **Add more users**: Upload OAuth keys to `data/<email>/gcp-oauth.keys.json`
2. **Customize categories**: Use "Edit Categories & Notes" in the UI
3. **Train classifier**: Add more labeled emails to improve accuracy
4. **Monitor usage**: Check Vercel dashboard for function invocations and bandwidth

## Support

- Report issues: `/reportbug` in the app
- View docs: Check README.md and SETUP_INSTRUCTIONS.md
- Logs: `vercel logs --follow`
