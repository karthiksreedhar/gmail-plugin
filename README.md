# Gmail Plugin - Real Email Integration

This Gmail plugin has been updated to fetch your actual Gmail emails instead of using mock data. Follow the setup instructions below to get it working with your Gmail account.

## Setup Instructions

### 1. Google Cloud Console Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click on it and press "Enable"

### 2. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. If prompted, configure the OAuth consent screen:
   - Choose "External" user type
   - Fill in the required fields (App name, User support email, Developer contact)
   - Add your email to test users
4. For Application type, select "Web application"
5. Add authorized redirect URIs:
   - `http://localhost:3000`
6. Click "Create"
7. Download the JSON file

### 3. Configure Credentials

1. Rename the downloaded JSON file to `credentials.json`
2. Place it in the root directory of this project (`/Users/karthiksreedhar/gmail-plugin/`)
3. Make sure the redirect URI in the file includes `http://localhost:3000`

### 4. Install Dependencies and Run

```bash
cd /Users/karthiksreedhar/gmail-plugin
npm install
npm start
```

### 5. Authenticate with Gmail

1. Open your browser and go to `http://localhost:3000`
2. Click "Connect to Gmail" when prompted
3. Complete the Google OAuth flow in the popup window
4. Copy the authorization code from the final page
5. Paste it into the input field and click "Complete Authentication"

## Features

- **Real Gmail Integration**: Fetches your actual emails from Gmail
- **Automatic Categorization**: Emails are categorized as Meeting Response, Academic, Financial, or General
- **Thread View**: Click on any email to see the full conversation thread
- **Responsive Design**: Gmail-like interface that works on desktop and mobile

## Permissions Required

The app requests the following Gmail permissions:
- `https://www.googleapis.com/auth/gmail.readonly` - Read access to your Gmail messages

## Security Notes

- Your credentials are stored locally in `token.json` after first authentication
- The app only requests read-only access to your Gmail
- No emails are stored on external servers - everything runs locally

## Troubleshooting

### "Error loading credentials"
- Make sure `credentials.json` exists in the project root
- Verify the JSON format is correct

### "Authentication failed"
- Check that your OAuth consent screen is properly configured
- Ensure your email is added as a test user
- Verify the redirect URI is set to `http://localhost:3000`

### "No emails found"
- The app fetches the last 50 emails from your inbox and sent folder
- Make sure you have emails in your Gmail account
- Check the browser console for any error messages

## File Structure

```
gmail-plugin/
├── server.js              # Main server with Gmail API integration
├── package.json           # Dependencies
├── credentials.json       # OAuth credentials (you need to create this)
├── token.json            # Stored after authentication (auto-generated)
├── public/
│   └── index.html        # Frontend with authentication flow
└── README.md            # This file
```

## API Endpoints

- `GET /api/response-emails` - Fetch emails from Gmail
- `GET /api/email-thread/:id` - Get email thread details
- `GET /api/auth` - Get OAuth authorization URL
- `POST /api/auth/callback` - Complete OAuth flow
- `GET /api/auth/status` - Check authentication status

## Next Steps

Once you have the basic integration working, you can:
1. Customize the email categorization logic
2. Add more advanced filtering options
3. Integrate with OpenAI for better email categorization
4. Add email composition features
