# Quick Start - Vercel Deployment

## 🎯 Goal
Deploy Gmail Plugin to Vercel with automatic background email refresh every 10 minutes.

## ⚡ 5-Minute Setup

### 1. Prerequisites (gather these first)
- Vercel account (free): https://vercel.com
- MongoDB Atlas cluster (free): https://mongodb.com/cloud/atlas  
- OpenAI API key: https://platform.openai.com
- Gmail OAuth credentials from Google Cloud Console

### 2. Configure Environment
```bash
# Copy template
cp .env.example .env

# Edit .env with your credentials:
# - OPENAI_API_KEY=sk-...
# - MONGODB_URI=mongodb+srv://...
# - CRON_SECRET=$(openssl rand -hex 32)
```

### 3. Create Vercel Project & Deploy

**Option A: Using Vercel CLI (Recommended)**
```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Link to a new Vercel project (first time only)
vercel link
# When prompted:
# - Set up and deploy? Yes
# - Which scope? Choose your account
# - Link to existing project? No (create new)
# - What's your project's name? gmail-plugin (or your choice)
# - In which directory is your code located? ./ (press Enter)

# Deploy to production
vercel --prod
```

**Option B: Using Vercel Dashboard**
1. Go to https://vercel.com/new
2. Import your Git repository (GitHub, GitLab, or Bitbucket)
3. Or use "Deploy with CLI" and run `vercel --prod`
4. Vercel will auto-detect Express.js and configure properly

**Note**: The `vercel.json` file is already configured for Express on Vercel.

### 4. Add Environment Variables to Vercel
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add all variables from your `.env` file
3. Redeploy: `vercel --prod`

### 5. Setup Users
1. Visit your Vercel URL
2. Click "Choose User" → Select user
3. Authenticate with Gmail
4. Click "Seed Categories" to load initial emails

## ✅ Verification

### Test Background Refresh
```bash
# Wait 10 minutes, then check logs
vercel logs --follow

# Look for:
# === Background Refresh Started ===
# Found X new emails
# === Background Refresh Complete ===
```

### Test Manually
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://your-app.vercel.app/api/background-refresh
```

## 🎉 Success!

Your app is now:
- ✅ Auto-fetching new emails every 10 minutes
- ✅ Auto-categorizing with AI
- ✅ Storing in MongoDB
- ✅ Accessible at your Vercel URL

## 📚 Next Steps

- **Full guide**: See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)
- **Checklist**: Use [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
- **Troubleshooting**: Check README.md

## 🆘 Need Help?

**Common Issues:**

1. **Cron not running**: Check Vercel Dashboard → Cron Jobs
2. **Gmail auth failed**: Verify OAuth redirect URI matches
3. **No emails loading**: Check MongoDB connection and Gmail tokens
4. **Classifier errors**: Verify OpenAI API key and quota

**Logs:**
```bash
vercel logs --follow
```

**Support:**
- Check VERCEL_DEPLOYMENT.md for detailed troubleshooting
- Review server logs for specific errors
- Verify all environment variables are set
