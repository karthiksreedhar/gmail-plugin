# Gmail Plugin Setup Instructions

This guide provides complete setup instructions for new users to get the Gmail plugin system running on their own computer.

## Prerequisites

Before starting, ensure you have:
1. **Node.js** (version 16 or higher) - [Download here](https://nodejs.org/)
2. **Git** - [Download here](https://git-scm.com/)
3. **Google Cloud Project** with Gmail API enabled (see Google Cloud Setup section below)
4. **Your Gmail account** that you want to use with the system

## Step 1: Google Cloud Project Setup

### 1.1 Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Gmail API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click "Enable"

### 1.2 Create OAuth 2.0 Credentials
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Configure the OAuth consent screen if prompted:
   - Choose "External" user type
   - Fill in required fields (App name, User support email, Developer contact)
   - Add your Gmail address to test users
4. For Application type, select "Desktop application"
5. Name it something like "Gmail Plugin"
6. Click "Create"
7. **Download the JSON file** - this is your `gcp-oauth.keys.json` file

## Step 2: Repository Setup

### 2.1 Clone the Repository
```bash
git clone https://github.com/karthiksreedhar/gmail-plugin.git
cd gmail-plugin
```

### 2.2 Install Dependencies
```bash
npm install
```

### 2.3 Add Your OAuth Credentials
1. Locate your downloaded OAuth credentials JSON file
2. Copy it to your user-specific data directory:
   ```bash
   # Replace 'your-email@domain.com' with your actual email address
   mkdir -p data/your-email@domain.com
   cp /path/to/your/downloaded/credentials.json data/your-email@domain.com/gcp-oauth.keys.json
   ```

   **Example for lc3251@columbia.edu:**
   ```bash
   mkdir -p data/lc3251@columbia.edu
   cp ~/Downloads/client_secret_*.json data/lc3251@columbia.edu/gcp-oauth.keys.json
   ```

## Step 3: Start the Server and Authenticate

### 3.1 Start the Server
```bash
node server.js
```

You should see output like:
```
Server running on http://localhost:3000
Current user: ks4190@columbia.edu
Data directory: /Users/username/gmail-plugin/data/ks4190@columbia.edu
Loaded 0 scenarios, 0 refinements, 0 saved generations
Gmail API requires authentication - visit /api/auth to authenticate
```

### 3.2 Switch to Your User
1. Open your browser and go to: http://localhost:3000
2. **Note**: The server starts with the default user (ks4190@columbia.edu), but you can switch to your own user account through the web interface
3. In the top-left corner, click the user dropdown
4. Select "Switch User"
5. Enter your email address (e.g., `lc3251@columbia.edu`)
6. Click "Switch"
7. **Important**: You do NOT need to edit any code files - the user switching happens automatically through the web interface

### 3.3 Authenticate with Gmail
1. After switching users, you should see an "Authenticate Gmail" button or link
2. Click it to get your authentication URL
3. Visit the authentication URL in your browser
4. **Important**: Log in with the SAME email address you used for the user switch
5. Grant the requested Gmail permissions:
   - Read your email messages and settings
   - Send email on your behalf
6. Complete the OAuth flow
7. You should see a success message

## Step 4: Verify Setup

### 4.1 Test Basic Functionality
1. Go back to http://localhost:3000
2. Try the "Load Email Threads" feature:
   - Select a number of threads (1-10)
   - Click "Load Email Threads"
   - You should see your actual Gmail threads loaded
3. Try the "Load More Emails Inbox" feature:
   - Select a number of emails (1-10)
   - Click "Load More Emails Inbox"
   - You should see your actual Gmail inbox emails

### 4.2 Test Email Response Generation
1. Click on any email in the "Unreplied Emails" section
2. Click "Generate Response"
3. You should see an AI-generated response based on your email history

## Step 5: Optional MCP Integration (for Claude Desktop)

If you want to use this system with Claude Desktop and MCP:

### 5.1 Install Gmail MCP Server
```bash
npm install -g @gongrzhe/server-gmail-autoauth-mcp
```

### 5.2 Configure Claude Desktop
1. **Locate your Claude Desktop config file:**
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. **Add the Gmail MCP server to your config:**
   ```json
   {
     "mcpServers": {
       "gmail": {
         "command": "npx",
         "args": ["@gongrzhe/server-gmail-autoauth-mcp"]
       }
     }
   }
   ```

3. **Restart Claude Desktop**

## File Structure After Setup

Your directory should look like this:
```
gmail-plugin/
├── data/
│   ├── ks4190@columbia.edu/          # Original user data
│   └── your-email@domain.com/        # Your user data
│       ├── gcp-oauth.keys.json       # Your OAuth credentials
│       ├── gmail-tokens.json         # Generated after authentication
│       ├── email-threads.json        # Populated as you use the system
│       ├── response-emails.json      # Populated as you use the system
│       ├── scenarios.json            # Populated as you use the system
│       ├── test-emails.json          # Populated as you use the system
│       └── unreplied-emails.json     # Populated as you use the system
├── public/
│   ├── index.html
│   └── kaws.jpg
├── server.js
├── package.json
├── package-lock.json
└── README.md
```

## Troubleshooting

### Common Issues

**1. "Gmail API not initialized" error**
- Make sure your `gcp-oauth.keys.json` file is in the correct directory
- Verify the file is valid JSON and contains the correct OAuth credentials
- Try restarting the server after adding the file

**2. "Authentication required" message**
- Follow Step 3.3 to authenticate with Gmail
- Make sure you're logging in with the same email address as your user directory

**3. "Port 3000 already in use" error**
```bash
# Kill any processes using port 3000
lsof -ti:3000 | xargs kill -9
# Then restart the server
node server.js
```

**4. "User not found" when switching users**
- Make sure you created the directory: `data/your-email@domain.com/`
- Make sure your `gcp-oauth.keys.json` file is in that directory

**5. Gmail API quota exceeded**
- The system uses Gmail API calls efficiently, but if you hit limits, wait a few minutes
- Consider creating your own Google Cloud Project for higher quotas

### Verification Steps

1. **Check server startup messages** - should show your user and "Gmail API ready for use"
2. **Check browser console** - should not show authentication errors
3. **Test email loading** - should load real emails from your Gmail account
4. **Check data files** - JSON files should be created and populated in your user directory

## Security Notes

- **Never commit** `gcp-oauth.keys.json` or `gmail-tokens.json` files to version control
- The `.gitignore` file is configured to exclude sensitive files
- Your OAuth credentials and tokens are stored locally only
- Each user has their own isolated data directory

## Features Available

Once set up, you can:
- **Load Email Threads**: Import your actual Gmail conversation threads (1-10 at a time)
- **Load Inbox Emails**: Import emails from your Gmail inbox (1-10 at a time)
- **Generate Responses**: AI-powered email response generation based on your writing style
- **Manage Scenarios**: Save and load different email response scenarios
- **Refine Responses**: Improve generated responses with feedback
- **Multi-User Support**: Switch between different user accounts

## Support

If you encounter issues:
1. Check the server console output for detailed error messages
2. Verify all prerequisites are installed and up to date
3. Ensure your Google Cloud Project is properly configured
4. Make sure you're using the correct email address consistently
5. Check that your Gmail account has the necessary permissions

## Advanced Configuration

### Custom OpenAI API Key
The system uses OpenAI for response generation. Currently, the API key is hardcoded in `server.js`. For security and to use your own API key:

**Option 1: Edit server.js directly (current method)**
1. Open `server.js` in a text editor
2. Find lines 8-10 where the OpenAI client is initialized
3. Replace the existing API key with your own:
   ```javascript
   const openai = new OpenAI({
     apiKey: 'your-openai-api-key-here'
   });
   ```
4. Save the file and restart the server

**Option 2: Use environment variables (recommended for security)**
1. Create a `.env` file in the project root:
   ```bash
   echo "OPENAI_API_KEY=your-openai-api-key-here" > .env
   ```
2. Install the dotenv package:
   ```bash
   npm install dotenv
   ```
3. Edit `server.js` to use environment variables:
   - Add at the top: `require('dotenv').config();`
   - Change the OpenAI initialization to:
     ```javascript
     const openai = new OpenAI({
       apiKey: process.env.OPENAI_API_KEY
     });
     ```
4. Restart the server

**Note**: The `.env` file is already included in `.gitignore` so your API key won't be committed to version control.

### Custom Port
To run on a different port:
```bash
PORT=8080 node server.js
```

### Multiple Users on Same Machine
The system supports multiple users. Each user needs:
1. Their own directory in `data/`
2. Their own `gcp-oauth.keys.json` file
3. To authenticate separately with their Gmail account
