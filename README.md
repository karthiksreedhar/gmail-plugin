# Gmail Plugin - AI-Powered Email Assistant

An intelligent email management system that automatically categorizes emails and suggests responses using AI. Features automatic background refresh, multi-user support, and advanced categorization.

## 🚀 Quick Start

### Deploy to Vercel (Recommended)

```bash
# Clone and install
git clone <your-repo>
cd gmail-plugin
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Deploy to Vercel
npm install -g vercel
vercel login
vercel --prod
```

See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for detailed deployment instructions.

### Run Locally

```bash
npm install
npm start
# Visit http://localhost:3000
```

## ✨ Key Features

### Automatic Background Refresh
- **Auto-fetch**: New emails are fetched every 10 minutes (Vercel Cron)
- **Auto-categorize**: AI classifier assigns categories automatically
- **No manual intervention**: Emails appear in the UI automatically
- **Multi-user support**: Handles multiple users independently

### AI-Powered Categorization
- **V4 Classifier**: Multi-signal categorization using embeddings, keywords, and OpenAI
- **Category Summaries**: Auto-generated summaries for each category
- **Smart Suggestions**: Learns from your existing email patterns
- **Custom Categories**: Create and manage your own categories

### Email Management
- **Thread View**: See full conversation history
- **Search**: Semantic search across emails and notes
- **Notes**: Add per-email and per-category notes
- **Response Generation**: AI-suggested email responses

## 🏗️ Architecture

### Production (Vercel)
```
User Browser
    ↓
Vercel Edge (Express.js)
    ↓
├── Gmail API (fetch emails)
├── OpenAI API (categorize)
└── MongoDB Atlas (persist)
    
Vercel Cron (every 10 min)
    ↓
/api/background-refresh
    ↓
Auto-fetch + Auto-categorize → MongoDB
```

### Local Development
```
localhost:3000
    ↓
Express Server
    ↓
├── Gmail API
├── OpenAI API  
└── MongoDB or JSON files
```

## 📁 Project Structure

```
gmail-plugin/
├── server.js                 # Main Express server + API routes
├── db.js                     # MongoDB Atlas connection
├── vercel.json              # Vercel configuration + cron
├── package.json             # Dependencies
├── .env.example             # Environment variables template
│
├── public/                  # Frontend UI
│   ├── index.html          # Main email dashboard
│   ├── seed.html           # Seed categories from inbox
│   ├── load.html           # Load more emails
│   └── test-classifier.html # Classifier evaluation
│
├── data/                    # User-specific data
│   ├── ks4190@columbia.edu/
│   │   ├── gcp-oauth.keys.json     # Gmail OAuth credentials
│   │   ├── gmail-tokens.json       # Gmail tokens (auto-generated)
│   │   ├── response-emails.json    # Saved emails
│   │   ├── email-threads.json      # Email threads
│   │   ├── categories.json         # Category list
│   │   └── category-summaries.json # AI summaries
│   │
│   └── lc3251@columbia.edu/        # Second user
│       └── ... (same structure)
│
├── scripts/                 # Utility scripts
│   ├── load-priority-emails.js     # Load important emails
│   ├── precategorize-priority-emails.js # Pre-categorize cache
│   └── evaluate-classifier-*.js    # Classifier evaluation
│
└── docs/
    ├── VERCEL_DEPLOYMENT.md        # Deployment guide
    ├── SETUP_INSTRUCTIONS.md       # Setup guide
    └── RENDER_DEPLOYMENT.md        # Alternative: Render.com
```

## 🔧 Environment Variables

Required variables (add to Vercel dashboard):

```env
OPENAI_API_KEY=sk-...              # OpenAI API key
MONGODB_URI=mongodb+srv://...      # MongoDB connection string
CURRENT_USER_EMAIL=your@email.com  # Default user
BASE_URL=https://your-app.vercel.app # Deployment URL
CRON_SECRET=<random-secret>        # Cron security (optional)
NODE_ENV=production                # Environment
```

## 📊 Background Refresh Details

### What It Does

Every 10 minutes, the system:
1. Checks for new emails since the last refresh
2. Fetches up to 50 new emails per user
3. Auto-categorizes using V4 classifier
4. Saves to MongoDB
5. Logs results to classifier log

### Customization

Edit `vercel.json` to change frequency:

```json
{
  "crons": [
    {
      "path": "/api/background-refresh",
      "schedule": "*/10 * * * *"  // Every 10 minutes
    }
  ]
}
```

Cron syntax:
- `*/5 * * * *` - Every 5 minutes
- `0 * * * *` - Every hour
- `0 9 * * *` - Daily at 9am UTC

### Manual Trigger

```bash
# Test locally
curl http://localhost:3000/api/background-refresh

# Test on Vercel (with secret)
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://your-app.vercel.app/api/background-refresh
```

## 🎯 Classifier Performance

The V4 classifier achieves ~80% accuracy using:
- **Sender history** (prior category for this sender)
- **Keyword matching** (category names in subject/body)
- **OpenAI classification** (semantic understanding)
- **TF-IDF similarity** (document vectors)
- **Embeddings** (semantic similarity fallback)

Test the classifier:
1. Click "Test Classifier" in the UI
2. View 80/20 train/test split results
3. See detailed per-email predictions

## 👥 Multi-User Support

### Add a New User

1. **Create user directory**:
   ```bash
   mkdir -p data/newuser@example.com
   ```

2. **Upload Gmail OAuth credentials**:
   - Place `gcp-oauth.keys.json` in user directory
   - Or upload via UI: Choose User → Create New

3. **Authenticate**:
   - Select user in UI
   - Follow OAuth flow
   - Tokens saved to MongoDB

4. **Seed initial emails**:
   - Click "Seed Categories"
   - Loads first 50 important emails

### User Switching

Click "Choose User" in the header to switch between:
- ks4190@columbia.edu
- lc3251@columbia.edu
- Any other configured users

## 📝 Usage Tips

### Email Organization

1. **Seed Categories**: Load initial emails and assign categories
2. **Edit Categories**: Organize emails by dragging between columns
3. **Add Notes**: Add context to categories for better AI suggestions
4. **Generate Summaries**: Create AI summaries for each category

### Response Generation

1. **Load Email**: Click "Load Email From Inbox"
2. **Generate**: AI suggests response based on your patterns
3. **Refine**: Adjust response with feedback
4. **Save**: Store for future reference

### Category Management

- **Refresh Categories**: Re-organize using AI or rules
- **Keyword Search**: Find emails by keywords
- **Sort Unreplied**: Organize inbox emails
- **Clean Threads**: Remove quoted history from responses

## 🔍 API Endpoints

### Main Endpoints

- `GET /` - Main dashboard UI
- `GET /api/response-emails` - Get all categorized emails
- `POST /api/generate-response` - Generate AI response
- `GET /api/background-refresh` - Background email refresh (cron)

### Classifier Endpoints

- `POST /api/classifier-v4/suggest-batch` - Batch categorization
- `POST /api/test-classifier/run-v4` - Evaluate classifier
- `POST /api/ai-enhanced-categorize` - Enhanced categorization

### Data Management

- `GET /api/current-categories` - Get category list
- `POST /api/save-categories` - Update email categories
- `GET /api/category-summaries` - Get category summaries
- `POST /api/notes` - Add category notes

See `server.js` for complete API documentation.

## 🛠️ Development

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm start
# Server runs on http://localhost:3000
```

### Test Background Refresh Locally

```bash
# Manually trigger refresh
curl http://localhost:3000/api/background-refresh
```

### Run Classifier Evaluation

```bash
node scripts/evaluate-classifier-v4.js
```

## 📚 Documentation

- [Vercel Deployment](./VERCEL_DEPLOYMENT.md) - Production deployment guide
- [Setup Instructions](./SETUP_INSTRUCTIONS.md) - Initial setup and configuration
- [Render Deployment](./RENDER_DEPLOYMENT.md) - Alternative hosting on Render.com

## 🔐 Security

- OAuth tokens stored in MongoDB (encrypted at rest)
- Cron endpoint protected with `CRON_SECRET`
- Gmail API uses least-privilege scopes (read + send only)
- No email deletion capabilities

## 🐛 Troubleshooting

### Background Refresh Not Working

```bash
# Check Vercel logs
vercel logs --follow

# Verify cron is configured
vercel crons ls

# Test manually
curl -H "Authorization: Bearer $CRON_SECRET" \
     https://your-app.vercel.app/api/background-refresh
```

### Gmail Authentication Failed

1. Check OAuth credentials are in `data/<user>/gcp-oauth.keys.json`
2. Verify redirect URI matches in Google Cloud Console
3. Re-authenticate via UI

### Classifier Low Accuracy

1. Add more labeled emails to training set
2. Review category definitions and summaries
3. Check classifier logs: `GET /api/classifier-log`

## 📈 Performance

- **Email processing**: ~2-3 seconds per email (includes AI categorization)
- **Background refresh**: ~30-60 seconds for 50 emails
- **Memory usage**: ~200MB baseline, ~500MB during batch processing
- **Database size**: ~1KB per email (MongoDB)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Gmail API for email access
- OpenAI for AI categorization and response generation
- Vercel for serverless hosting and cron jobs
- MongoDB Atlas for database hosting
