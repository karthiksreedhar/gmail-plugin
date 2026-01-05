# Feature Generator Agent

An AI-powered agent system for generating Gmail Plugin features using LangChain and Anthropic Claude.

## Overview

This is a standalone system that runs on a separate localhost port (5000) from the main Gmail Plugin system. It provides a chat-based interface where you can:

1. **Describe a feature** you want to build
2. **Get generated files** (manifest.json, backend.js, frontend.js, README.md)
3. **Download as ZIP** and add to your Gmail Plugin's `data/features/` directory
4. **Request refinements** - describe issues after testing and get fixes

## Quick Start

```bash
# Navigate to the agent directory
cd feature-generator-agent

# Install dependencies
npm install

# Start the server
npm start
```

Then open http://localhost:5000 in your browser.

## Usage

### Generating a New Feature

1. Open http://localhost:5000
2. Describe your feature in the text area, for example:
   - "Create a feature that shows email statistics by category with a pie chart"
   - "Add a snooze button to emails that hides them for a specified time"
   - "Build a feature that tracks response times for emails"
3. Click "Generate" and wait for the files to be created
4. Preview the generated files in the tabs on the right
5. Click "Download ZIP" to get all files

### Installing Generated Features

1. Download the ZIP file from the agent
2. Extract to your Gmail Plugin's `data/features/` directory
3. Restart your Gmail Plugin server
4. The feature will be automatically loaded

### Requesting Refinements

If you encounter issues after testing:

1. Return to the agent (session is preserved)
2. Describe the issue, for example:
   - "The chart isn't rendering, I see 'Chart is not defined' in the console"
   - "The button isn't appearing in the header"
   - "I'm getting a 500 error when clicking save"
3. The agent will analyze the issue and regenerate the affected files
4. Download the updated files and replace them in your feature folder

## Architecture

```
feature-generator-agent/
├── server.js                 # Express server (port 5000)
├── agent/
│   ├── index.js              # LangChain agent with Anthropic Claude
│   └── prompts/
│       └── system.js         # Comprehensive architecture documentation
├── public/
│   ├── index.html            # Chat-based web UI
│   ├── styles.css            # Dark theme styling
│   └── app.js                # Frontend application
└── package.json
```

## How It Works

1. **System Prompts**: The agent has comprehensive documentation about the Gmail Plugin architecture embedded in its system prompts. This includes:
   - Backend context object (`featureContext`)
   - Frontend API (`window.EmailAssistant`)
   - File structure requirements
   - Implementation rules and patterns

2. **Multi-Step Generation**: When you request a feature, the agent:
   - Analyzes your request to determine what files are needed
   - Generates `manifest.json` first (establishes feature ID)
   - Generates `backend.js` if server-side logic is needed
   - Generates `frontend.js` if UI components are needed
   - Generates `README.md` documentation

3. **Refinement Mode**: After initial generation, subsequent messages are treated as refinement requests. The agent:
   - Receives your issue description
   - Analyzes the current files
   - Identifies and fixes the problems
   - Returns only the updated files

## Configuration

Environment variables (in `.env`):

```
ANTHROPIC_API_KEY=your-api-key
PORT=5000
```

## API Endpoints

- `POST /api/session/new` - Create new session
- `GET /api/session/:sessionId` - Get session status
- `POST /api/chat` - Send message (generates/refines features)
- `GET /api/files/:sessionId` - Get generated files
- `GET /api/download/:sessionId` - Download files as ZIP
- `GET /api/history/:sessionId` - Get chat history
- `DELETE /api/session/:sessionId` - Clear session
- `GET /api/health` - Health check

## Tips for Best Results

1. **Be specific**: "Add a button that shows email word count" is better than "add analytics"
2. **Mention UI placement**: "Add a button in the header" or "Add a button to each email card"
3. **Describe interactions**: "When clicked, show a modal with..." or "On hover, display..."
4. **Include data needs**: "Store the settings per user" or "Calculate from existing emails"

## Troubleshooting

### Agent not generating files
- Check that your Anthropic API key is valid
- Check the server console for errors

### Generated code has issues
- Describe the specific error message to the agent
- Paste console errors directly
- The agent will analyze and fix

### Session lost
- Sessions are stored in memory and expire after 2 hours of inactivity
- Download files before closing the browser for long periods

## License

Part of the Gmail Plugin system.
