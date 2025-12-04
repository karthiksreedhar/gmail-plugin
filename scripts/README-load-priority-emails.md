# Load Priority Emails Script

## Overview

This script loads the last 5000 priority (important) emails from your Gmail inbox and saves them to a JSON file for analysis or backup purposes.

## Prerequisites

1. **Gmail API Authentication**: You must have already authenticated with Gmail through the web interface at least once. The script requires:
   - OAuth credentials file: `data/{your-email}/gcp-oauth.keys.json` (or root `gcp-oauth.keys.json`)
   - Gmail tokens file: `data/{your-email}/gmail-tokens.json`

2. **Environment Variables**: Ensure your `.env` file contains:
   ```
   CURRENT_USER_EMAIL=your-email@example.com
   SENDING_EMAIL=your-email@example.com
   ```

## Usage

### Basic Usage

Run the script from the project root:

```bash
node scripts/load-priority-emails.js
```

### What It Does

1. **Connects to Gmail API** using your existing authentication
2. **Searches for priority emails** using the query `in:inbox is:important`
3. **Fetches up to 5000 emails** with full content (subject, from, to, date, body, snippet)
4. **Saves to JSON file** at `data/{your-email}/priority-emails-5000.json`

### Output Format

The output JSON file contains:

```json
{
  "metadata": {
    "user": "your-email@example.com",
    "sendingEmail": "your-email@example.com",
    "totalEmails": 5000,
    "query": "in:inbox is:important",
    "maxRequested": 5000,
    "timestamp": "2025-12-03T16:10:00.000Z",
    "generatedBy": "scripts/load-priority-emails.js"
  },
  "emails": [
    {
      "id": "message-id-123",
      "threadId": "thread-id-456",
      "subject": "Important Email Subject",
      "from": "sender@example.com",
      "to": "you@example.com",
      "date": "Mon, 02 Dec 2025 10:30:00 -0800",
      "body": "Full email body content...",
      "snippet": "Preview of email content...",
      "webUrl": "https://mail.google.com/mail/u/0/#search/..."
    }
  ]
}
```

## Performance

- Fetches approximately **5-10 emails per second**
- For 5000 emails, expect the script to run for **10-15 minutes**
- Progress is displayed every 100 emails

## Troubleshooting

### "Gmail tokens not found"

**Solution**: Start the server and authenticate via the web interface first:
```bash
npm start
# Then visit http://localhost:3000 and complete Gmail authentication
```

### "OAuth keys file not found"

**Solution**: Ensure you have the OAuth credentials file:
- User-specific: `data/{your-email}/gcp-oauth.keys.json`
- Or root: `gcp-oauth.keys.json`

### Rate Limiting

If you encounter rate limiting errors, the script will fail. Wait a few minutes and try again. Gmail API has the following limits:
- 250 quota units per user per second
- 1,000,000,000 quota units per day

## Modifying the Script

### Change the number of emails

Edit the `MAX_EMAILS` constant in the script:

```javascript
const MAX_EMAILS = 10000; // Change from 5000 to 10000
```

### Change the search query

Edit the `query` variable in the `loadPriorityEmails()` function:

```javascript
// Load all inbox emails (not just priority)
const query = 'in:inbox';

// Load emails from last 7 days
const query = 'in:inbox newer_than:7d';

// Load emails from specific sender
const query = 'in:inbox from:sender@example.com';
```

## Notes

- The script only **reads** emails, it does not modify or delete anything
- All emails are saved as-is from Gmail
- The script deduplicates messages automatically (one entry per message ID)
- Failed email fetches are logged but don't stop the script
