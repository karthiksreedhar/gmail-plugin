# Gmail Feed

A Gmail inbox feed application that automatically syncs emails every 10 minutes using Vercel cron jobs, with a frontend that refreshes every 5 minutes.

## Features

- **OAuth Authentication**: Sign in with your Google account
- **Automatic Sync**: Emails are fetched every 10 minutes via Vercel Cron Jobs (even when the app is closed)
- **Auto-refresh UI**: Frontend polls for updates every 5 minutes
- **MongoDB Storage**: Emails and tokens are cached in MongoDB Atlas
- **Dark Mode Support**: Automatic dark mode based on system preferences

## Prerequisites

1. **Vercel Pro Account** - Required for cron jobs running more frequently than daily
2. **MongoDB Atlas Account** - For storing OAuth tokens and cached emails
3. **Google Cloud Project** - With Gmail API enabled and OAuth 2.0 credentials

## Setup

### 1. Clone and Install

```bash
cd gmail-feed
npm install
```

### 2. Configure Environment Variables

Edit `.env.local` with your credentials:

```env
# MongoDB Configuration
MONGODB_URI=your-mongodb-connection-string
MONGODB_DB=gmail_feed

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Cron Job Secret (optional)
CRON_SECRET=your-random-secret
```

### 3. Update Google Cloud Console

Add these redirect URIs to your OAuth 2.0 credentials in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

- `http://localhost:3000/api/auth/callback` (for local development)
- `https://your-vercel-app.vercel.app/api/auth/callback` (for production)

### 4. Run Locally

```bash
npm run dev
```

Visit http://localhost:3000 and sign in with Google.

## Deploying to Vercel

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Deploy

```bash
vercel
```

Follow the prompts to:
- Link to your Vercel account
- Select or create a project

### 3. Set Environment Variables in Vercel

Go to your project settings in the Vercel dashboard and add:

- `MONGODB_URI`
- `MONGODB_DB`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (use your Vercel URL: `https://your-app.vercel.app/api/auth/callback`)
- `CRON_SECRET` (optional, for securing the cron endpoint)

### 4. Update Google OAuth Redirect URI

Add your Vercel production URL to Google Cloud Console:
`https://your-app.vercel.app/api/auth/callback`

### 5. Deploy to Production

```bash
vercel --prod
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Vercel (Next.js)                        │
│  ┌──────────────────┐    ┌─────────────────────────────┐   │
│  │   Frontend       │    │   API Routes                │   │
│  │   - Email Feed   │◄──►│   - /api/auth/* (OAuth)     │   │
│  │   - Auto-refresh │    │   - /api/emails (fetch)     │   │
│  │     every 5min   │    │   - /api/cron (every 10min) │   │
│  └──────────────────┘    └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼                               ▼
            ┌───────────────┐              ┌───────────────┐
            │  Gmail API    │              │  MongoDB      │
            │  (via OAuth)  │              │  - Tokens     │
            └───────────────┘              │  - Emails     │
                                           └───────────────┘
```

## API Routes

- `GET /api/auth/login` - Initiates Google OAuth flow
- `GET /api/auth/callback` - OAuth callback handler
- `GET /api/emails` - Returns cached emails from MongoDB
- `GET /api/cron` - Fetches new emails (called by Vercel Cron)

## Cron Job Configuration

The `vercel.json` configures a cron job to run every 10 minutes:

```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

**Note**: Vercel Pro is required for cron jobs more frequent than once per day.

## Troubleshooting

### OAuth Error
- Ensure redirect URIs match exactly in Google Cloud Console
- Check that Gmail API is enabled in your Google Cloud project

### Cron Not Running
- Verify you have Vercel Pro
- Check Vercel logs for cron execution
- Ensure you're authenticated (cron skips if no tokens stored)

### Emails Not Syncing
- Check MongoDB connection
- Verify OAuth tokens are stored correctly
- Check Vercel function logs

## License

MIT

