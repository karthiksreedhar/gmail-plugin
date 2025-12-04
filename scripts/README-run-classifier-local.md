# Run Classifier Local Script

## Overview

This script classifies emails from `priority-emails-5000.json` using the V4 batched classifier and outputs results to a text file with format: `Category | Subject`

## Prerequisites

1. **Input File**: You must have run `load-priority-emails.js` first to create:
   - `data/{your-email}/priority-emails-5000.json`

2. **Training Data**: The script needs training data from MongoDB or local files:
   - Categories list (MongoDB or `categories.json`)
   - Response emails for examples (MongoDB or `response-emails.json`)
   - Category summaries (MongoDB or `categorysummaries.json`)
   - Category guidelines (optional, from `category-guidelines.json`)

3. **Environment Variables**: Ensure your `.env` file contains:
   ```
   CURRENT_USER_EMAIL=your-email@example.com
   OPENAI_API_KEY=sk-...
   MONGODB_URI=mongodb+srv://...
   ```

## Usage

### Basic Usage

Run the script from the project root:

```bash
node scripts/run-classifier-local.js
```

### Advanced Usage with Command-Line Arguments

**Classify a different user's emails:**
```bash
node scripts/run-classifier-local.js --email=lc3251@columbia.edu
```

**Force local-only mode (skip MongoDB, use only local JSON files):**
```bash
node scripts/run-classifier-local.js --local-only
```

**Combine both flags:**
```bash
node scripts/run-classifier-local.js --email=lc3251@columbia.edu --local-only
```

This is useful when you want to classify another user's emails on your computer using their local data files without needing MongoDB access.

### What It Does

1. **Connects to MongoDB** to load training data (categories, examples, summaries)
2. **Loads input emails** from `priority-emails-5000.json`
3. **Runs V4 classifier** in batches of 500 emails using OpenAI
4. **Applies V4 logic**:
   - Uses LLM contenders + sender affinity augmentation
   - Falls back to keyword matching if no confident suggestions
5. **Outputs results** to `classified-emails-5000.txt`

### Output Format

The output text file contains one line per email:

```
Teaching & Student Support | Homework Extension Request
Research & Lab Work | User Study Recruitment
University Administration | Registration Deadline Reminder
Financial & Reimbursements | Travel Reimbursement Request
Conferences | Paper Submission Deadline
Networking | Coffee Chat Request
Other | Newsletter Subscription
```

## Performance

- **Batch size**: 500 emails per batch (up to 10 batches for 5000 emails)
- **Processing speed**: ~30-60 seconds per batch (depends on OpenAI API)
- **Total time for 5000 emails**: Approximately 5-10 minutes

## How the V4 Classifier Works

The script uses pure LLM-based classification:

1. **OpenAI Batched Labeling**: 
   - Sends batches of emails to OpenAI with category examples, summaries, and guidelines
   - Receives `contenders` (possible categories) and `pick` (best category) for each email

2. **Sender Affinity Augmentation**:
   - Checks if sender has appeared in training data for specific categories
   - Adds sender-based category to contenders list

3. **Decision Logic**:
   - If LLM pick is in augmented contenders → use it
   - Else if sender category is in contenders → use it
   - Else use first contender
   - **If no contenders at all** → defaults to "Other" (no keyword fallback)

4. **No Keyword Fallback**:
   - The classifier **always uses LLM suggestions**
   - Trusts OpenAI's categorization completely
   - Assigns "Other" when LLM is uncertain rather than guessing with keyword matching

## Troubleshooting

### "Input file not found"

**Solution**: Run `load-priority-emails.js` first:
```bash
node scripts/load-priority-emails.js
```

### "OPENAI_API_KEY not found"

**Solution**: Add your OpenAI API key to `.env`:
```
OPENAI_API_KEY=sk-proj-...
```

### "Could not load categories from MongoDB"

**Solution**: The script will fall back to local JSON files. Ensure you have:
- `data/{your-email}/categories.json`
- `data/{your-email}/response-emails.json`
- `data/{your-email}/categorysummaries.json`

Or run the server once to populate MongoDB:
```bash
npm start
# Then visit http://localhost:3000 to ensure data is synced to MongoDB
```

### OpenAI Rate Limits

If you hit rate limits:
- The script will log the error and continue with remaining batches
- Wait a few minutes and re-run the script
- Emails that failed will get keyword-based fallback categories

## User-Specific Behavior

The script is fully user-specific based on `.env`:

- Reads `CURRENT_USER_EMAIL` to determine which user's data to use
- Loads categories and training data from that user's folder/MongoDB collection
- Saves output to that user's data folder

Example for advisor (lc3251@columbia.edu):
```
Input:  data/lc3251@columbia.edu/priority-emails-5000.json
Output: data/lc3251@columbia.edu/classified-emails-5000.txt
```

## Modifying the Script

### Change batch size

Edit the `BATCH_SIZE` constant:

```javascript
const BATCH_SIZE = 250; // Smaller batches for rate limit issues
```

### Change input/output files

Edit the file path constants:

```javascript
const INPUT_FILE = path.join(INPUT_DIR, 'my-custom-emails.json');
const OUTPUT_FILE = path.join(INPUT_DIR, 'my-custom-results.txt');
```

## Notes

- The script uses the exact same V4 classifier as the web interface
- MongoDB is preferred but local JSON files work as fallback
- Progress is shown for every 100 emails processed
- The script is read-only and does not modify any existing data
- Classification results are deterministic given the same input and training data
