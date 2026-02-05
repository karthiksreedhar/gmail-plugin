# Vercel Deployment Checklist

Use this checklist to ensure a smooth deployment of the Gmail Plugin to Vercel.

## Pre-Deployment Checklist

### 1. MongoDB Atlas Setup
- [ ] Created MongoDB Atlas account
- [ ] Created a free cluster
- [ ] Created database user with read/write permissions
- [ ] Added IP whitelist: 0.0.0.0/0 (allow all IPs for Vercel)
- [ ] Copied connection string (format: `mongodb+srv://...`)
- [ ] Tested connection locally

### 2. Gmail API Setup (Per User)
- [ ] Created Google Cloud Platform project
- [ ] Enabled Gmail API
- [ ] Created OAuth 2.0 credentials (Web application)
- [ ] Added authorized redirect URIs:
  - [ ] `http://localhost:3000/oauth2callback` (local)
  - [ ] `https://<your-app>.vercel.app/oauth2callback` (production)
- [ ] Downloaded credentials JSON
- [ ] Placed credentials in `data/<user-email>/gcp-oauth.keys.json`
- [ ] Repeated for each user:
  - [ ] ks4190@columbia.edu
  - [ ] lc3251@columbia.edu

### 3. OpenAI API Setup
- [ ] Created OpenAI account
- [ ] Generated API key
- [ ] Verified API key has sufficient credits/quota
- [ ] Tested API key locally

### 4. Environment Configuration
- [ ] Copied `.env.example` to `.env`
- [ ] Set `OPENAI_API_KEY`
- [ ] Set `MONGODB_URI`
- [ ] Set `CURRENT_USER_EMAIL`
- [ ] Set `SENDING_EMAIL`
- [ ] Generated `CRON_SECRET` (use: `openssl rand -hex 32`)
- [ ] Set `NODE_ENV=production`
- [ ] **Did NOT commit** `.env` to git (verify in .gitignore)

### 5. Vercel Account Setup
- [ ] Created Vercel account
- [ ] Installed Vercel CLI: `npm install -g vercel`
- [ ] Logged in: `vercel login`
- [ ] Linked project: `vercel link` (or will link during first deploy)

### 6. Code Verification
- [ ] Verified `vercel.json` exists and has correct cron configuration
- [ ] Verified `server.js` has `/api/background-refresh` endpoint
- [ ] Verified all dependencies in `package.json`
- [ ] Ran `npm install` successfully
- [ ] Tested locally: `npm start` works

## Deployment Steps

### 7. Initial Deployment
- [ ] Run: `vercel --prod` (or use `./deploy.sh`)
- [ ] Note the deployment URL (e.g., `https://gmail-plugin.vercel.app`)
- [ ] Update `BASE_URL` in `.env` to match Vercel URL

### 8. Configure Vercel Environment Variables
Go to Vercel Dashboard → Your Project → Settings → Environment Variables

Add each variable (set scope to "Production"):
- [ ] `OPENAI_API_KEY` = `sk-...`
- [ ] `MONGODB_URI` = `mongodb+srv://...`
- [ ] `CURRENT_USER_EMAIL` = `ks4190@columbia.edu`
- [ ] `SENDING_EMAIL` = `ks4190@columbia.edu`
- [ ] `BASE_URL` = `https://<your-app>.vercel.app`
- [ ] `CRON_SECRET` = `<your-generated-secret>`
- [ ] `NODE_ENV` = `production`

### 9. Redeploy with Environment Variables
- [ ] Run: `vercel --prod` again to apply environment variables
- [ ] Wait for deployment to complete
- [ ] Note the final deployment URL

### 10. Update Google Cloud OAuth Redirect URI
- [ ] Go to Google Cloud Console
- [ ] Navigate to your OAuth credentials
- [ ] Add production redirect URI: `https://<your-app>.vercel.app/oauth2callback`
- [ ] Save changes

## Post-Deployment Verification

### 11. Test Deployment
- [ ] Visit your Vercel deployment URL
- [ ] Verify page loads without errors
- [ ] Open browser console and check for JavaScript errors
- [ ] Verify no missing resources (check Network tab)

### 12. Gmail Authentication (Per User)
For each user:
- [ ] Click "Choose User" → select user email
- [ ] If prompted, click "Authenticate with Gmail"
- [ ] Follow OAuth flow
- [ ] Grant requested permissions
- [ ] Verify redirect back to app succeeds
- [ ] Confirm "Gmail API ready" message in UI

Test for users:
- [ ] ks4190@columbia.edu
- [ ] lc3251@columbia.edu

### 13. Seed Initial Data (Per User)
For each user:
- [ ] Click "Seed Categories" button
- [ ] Wait for 50 important emails to load
- [ ] Verify categories are assigned
- [ ] Check emails appear in the UI
- [ ] Save categorizations

### 14. Verify Background Refresh

#### Check Cron Configuration
- [ ] Go to Vercel Dashboard → Your Project → Cron Jobs
- [ ] Verify cron job appears: `/api/background-refresh` (*/10 * * * *)
- [ ] Note next scheduled run time

#### Monitor First Run
- [ ] Wait 10 minutes for first cron execution
- [ ] Check Vercel logs: `vercel logs --follow`
- [ ] Look for log output:
  ```
  === Background Refresh Started ===
  Time: 2026-02-05T18:00:00.000Z
  --- Processing user: ks4190@columbia.edu ---
  Found X new emails
  Added X new emails for ks4190@columbia.edu
  === Background Refresh Complete ===
  ```

#### Manual Test (Optional)
- [ ] Trigger manually with cron secret:
  ```bash
  curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
       https://your-app.vercel.app/api/background-refresh
  ```
- [ ] Verify response includes success and results
- [ ] Check MongoDB for new emails added

### 15. Verify Auto-Categorization
- [ ] Send a test important email to one of the users
- [ ] Wait 10 minutes for next cron run
- [ ] Refresh the UI
- [ ] Verify new email appears with a category assigned
- [ ] Check classifier log for categorization details
- [ ] Verify category assignment is reasonable

### 16. Test UI Features
- [ ] View All emails
- [ ] Filter by category
- [ ] Open email thread
- [ ] Search emails
- [ ] Add/edit categories
- [ ] Generate AI response
- [ ] Add notes
- [ ] Switch users

### 17. Monitor Performance
- [ ] Check Vercel function invocations (Dashboard → Analytics)
- [ ] Verify within free tier limits (100 invocations/day)
- [ ] Check MongoDB storage usage
- [ ] Review response times in logs

## Production Monitoring Checklist

### Daily Checks (First Week)
- [ ] Check Vercel logs for errors
- [ ] Verify cron jobs are running (every 10 min)
- [ ] Check MongoDB for new emails
- [ ] Verify no authentication failures
- [ ] Monitor OpenAI API usage

### Weekly Checks
- [ ] Review classifier accuracy
- [ ] Check email categorization quality  
- [ ] Verify storage usage (MongoDB, Vercel)
- [ ] Review function invocation counts
- [ ] Update categories if needed

### Monthly Checks
- [ ] Rotate `CRON_SECRET`
- [ ] Review and cleanup old classifier logs
- [ ] Check for Gmail API quota issues
- [ ] Update dependencies: `npm update`
- [ ] Review OpenAI costs

## Rollback Plan

If deployment fails or issues arise:

### Immediate Rollback
- [ ] Vercel Dashboard → Deployments → Find previous working deployment
- [ ] Click "..." → "Promote to Production"
- [ ] Or redeploy previous commit: `vercel --prod`

### Disable Background Refresh Temporarily
- [ ] Vercel Dashboard → Settings → Cron Jobs
- [ ] Pause or delete the cron job
- [ ] Investigate issues
- [ ] Re-enable when fixed

### Revert to Local Development
- [ ] Update `.env` with `BASE_URL=http://localhost:3000`
- [ ] Run locally: `npm start`
- [ ] Users can continue using local instance while you debug

## Common Issues and Solutions

### Issue: Cron not executing
**Solution**: 
- Check cron is enabled in Vercel dashboard
- Verify endpoint returns 200 status
- Check environment variables are set

### Issue: Gmail auth fails
**Solution**:
- Verify redirect URI matches in Google Cloud Console
- Check OAuth credentials are uploaded correctly
- Re-authenticate users

### Issue: High function invocations
**Solution**:
- Reduce cron frequency (e.g., every 30 min instead of 10)
- Optimize background refresh to skip users with no new emails
- Consider upgrading Vercel plan if needed

### Issue: MongoDB connection errors
**Solution**:
- Verify IP whitelist includes 0.0.0.0/0
- Check connection string is correct
- Verify database user has permissions
- Check MongoDB Atlas status page

### Issue: OpenAI API errors
**Solution**:
- Check API key is valid
- Verify sufficient credits/quota
- Review rate limits
- Check billing status

## Success Criteria

✅ **Deployment is successful when:**

1. App loads at Vercel URL without errors
2. Users can authenticate with Gmail
3. Background refresh runs every 10 minutes
4. New emails are auto-categorized and appear in UI
5. All UI features work (search, categorize, notes)
6. No errors in Vercel logs for 24 hours
7. MongoDB is receiving new data
8. Users can switch between accounts

## Post-Deployment Tasks

- [ ] Share deployment URL with users
- [ ] Document any custom category configurations
- [ ] Set up monitoring alerts (Vercel notifications)
- [ ] Create backup of MongoDB data
- [ ] Schedule first weekly review
- [ ] Update project documentation with any deployment-specific notes

## Notes

**Deployment Date**: _______________  
**Vercel URL**: _______________  
**MongoDB Cluster**: _______________  
**Last Verified**: _______________  
**Issues Encountered**: 

_______________________________________________
_______________________________________________
_______________________________________________
