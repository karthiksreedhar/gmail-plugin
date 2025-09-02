# Gmail Plugin Multi-User Setup Instructions

This guide will help you set up the Gmail plugin system for a new user with MCP integration.

## Prerequisites

Before starting, make sure you have:
1. Node.js installed (version 14 or higher)
2. Your Google Cloud Project OAuth credentials JSON file
3. Claude Desktop with MCP support

## Step 1: Clone and Install

```bash
git clone <repository-url>
cd gmail-plugin
npm install
```

## Step 2: Add Your OAuth Credentials

1. You should have received a `gcp-oauth.keys.json` file from your Google Cloud Project setup
2. Place this file in the `data/lc3251@columbia.edu/` directory:
   ```bash
   cp /path/to/your/gcp-oauth.keys.json data/lc3251@columbia.edu/gcp-oauth.keys.json
   ```

## Step 3: Set Up MCP Authentication

1. **Install the Gmail MCP server globally:**
   ```bash
   npm install -g @gongrzhe/server-gmail-autoauth-mcp
   ```

2. **Create MCP global directory and copy your OAuth keys:**
   ```bash
   mkdir -p ~/.gmail-mcp
   cp data/lc3251@columbia.edu/gcp-oauth.keys.json ~/.gmail-mcp/gcp-oauth.keys.json
   ```

3. **Run MCP authentication:**
   ```bash
   npx @gongrzhe/server-gmail-autoauth-mcp auth
   ```
   
   This will:
   - Start a local server on port 3000
   - Display an authentication URL
   - **IMPORTANT**: You must visit this URL in your browser and log in with **lc3251@columbia.edu** (not any other email)
   - Grant the necessary Gmail permissions
   - Complete the OAuth flow

4. **Wait for success message** indicating authentication is complete

## Step 4: Configure Claude Desktop MCP

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

3. **Restart Claude Desktop** for the changes to take effect

## Step 5: Test the System

1. **Start the local Gmail plugin server:**
   ```bash
   node server.js
   ```

2. **Open your browser and go to:**
   ```
   http://localhost:3000
   ```

3. **Switch to your user (lc3251@columbia.edu)** using the dropdown in the top-right

4. **Test MCP integration in Claude Desktop:**
   - Open Claude Desktop
   - Try a command like: "List my recent emails"
   - The Gmail MCP server should now be able to access your Gmail account

## Troubleshooting

### Port 3000 Already in Use
If you get a "port already in use" error during MCP authentication:
```bash
# Kill any processes using port 3000
lsof -ti:3000 | xargs kill -9
# Then retry the authentication
npx @gongrzhe/server-gmail-autoauth-mcp auth
```

### Authentication Issues
- Make sure you're logging in with **lc3251@columbia.edu** specifically
- Check that your `gcp-oauth.keys.json` file is valid and properly formatted
- Ensure your Google Cloud Project has the Gmail API enabled

### MCP Not Working in Claude
- Verify the config file path is correct for your operating system
- Make sure you restarted Claude Desktop after adding the MCP configuration
- Check that the Gmail MCP server is properly authenticated

## File Structure

After setup, your directory should look like this:
```
gmail-plugin/
├── data/
│   ├── ks4190@columbia.edu/          # Existing user data
│   └── lc3251@columbia.edu/          # Your user data
│       ├── gcp-oauth.keys.json       # Your OAuth credentials
│       ├── email-threads.json        # Will be populated
│       ├── response-emails.json      # Will be populated
│       ├── scenarios.json            # Will be populated
│       ├── test-emails.json          # Will be populated
│       └── unreplied-emails.json     # Will be populated
├── public/
├── server.js
├── package.json
└── README.md
```

## Security Notes

- Never commit `gcp-oauth.keys.json` files to version control
- The `.gitignore` file is configured to exclude sensitive files
- Your OAuth credentials are stored locally and not shared

## Support

If you encounter issues:
1. Check the console output for error messages
2. Verify all prerequisites are installed
3. Ensure you're using the correct email address for authentication
4. Make sure your Google Cloud Project is properly configured
