# Email Reclassification Suggestions Feature

This feature automatically suggests reclassification of recently added emails when new categories are created, using AI to identify emails that might belong to the new category.

## How It Works

1. **New Category Detection**: When a user creates a new category, the system automatically analyzes recently added emails
2. **AI Re-evaluation**: Uses the existing categorization AI to re-evaluate emails against all categories (including the new one)
3. **Smart Suggestions**: Only suggests reclassification when AI confidence exceeds the configured threshold
4. **User Review**: Presents suggestions in a clean interface for bulk approval/rejection

## Features

### Automatic Suggestions
- Analyzes emails from a configurable lookback period (default: 30 days)
- Uses AI confidence scores to avoid false positives
- Only suggests when confidence exceeds threshold (default: 80%)

### User Interface
- **Header Button**: Shows "Review Suggestions (N)" when pending suggestions exist
- **Review Modal**: Clean interface to review and approve/reject suggestions
- **Bulk Operations**: Select all/none, approve/reject multiple emails at once
- **Settings Panel**: Configure lookback period, confidence threshold, and auto-suggestions

### Configuration Options
- **Lookback Days**: How far back to analyze emails (1-90 days)
- **Confidence Threshold**: Minimum AI confidence to suggest reclassification (10%-100%)
- **Auto-Suggest**: Enable/disable automatic suggestion generation

## API Endpoints

### Get Pending Suggestions
```
GET /api/reclassification-suggestions/pending
```
Returns array of pending suggestions with email details and confidence scores.

### Process Suggestions
```
POST /api/reclassification-suggestions/process
{
  "emailIds": ["id1", "id2"],
  "newCategory": "Category Name",
  "action": "approve" | "reject"
}
```
Approves or rejects selected suggestions, updating email categories if approved.

### Generate Suggestions
```
POST /api/reclassification-suggestions/generate
{
  "newCategory": "New Category Name"
}
```
Manually generates suggestions for a specific new category.

### Settings Management
```
GET /api/reclassification-suggestions/settings
POST /api/reclassification-suggestions/settings
{
  "lookbackDays": 30,
  "confidenceThreshold": 0.8,
  "autoSuggestEnabled": true
}
```

## Usage Examples

### Automatic Workflow
1. User creates new category "Medical"
2. System automatically analyzes last 30 days of emails
3. Finds 5 emails that AI thinks belong to "Medical" with >80% confidence
4. Shows notification: "Review Suggestions (5)"
5. User clicks button to review suggestions
6. User approves 3 emails, rejects 2
7. Approved emails are moved to "Medical" category

### Manual Generation
```javascript
// Generate suggestions for existing category
await ReclassificationSuggestions.generateForCategory('Work');

// Show suggestions modal
ReclassificationSuggestions.showModal();

// Configure settings
ReclassificationSuggestions.showSettings();
```

## Data Storage

### Settings Collection: `reclassification_settings`
```json
{
  "lookbackDays": 30,
  "confidenceThreshold": 0.8,
  "autoSuggestEnabled": true
}
```

### Suggestions Collection: `reclassification_suggestions`
```json
[
  {
    "emailId": "email123",
    "currentCategory": "Other",
    "suggestedCategory": "Medical",
    "confidence": 0.92,
    "subject": "Doctor appointment confirmation",
    "snippet": "Your appointment with Dr. Smith...",
    "date": "2025-12-15T10:00:00Z",
    "createdAt": "2025-12-30T12:00:00Z",
    "reason": "AI analysis suggests this email belongs to \"Medical\" with 92% confidence"
  }
]
```

## Integration Notes

- Leverages existing `suggestCategories` function for AI categorization
- Uses feature system's MongoDB integration for data persistence
- Integrates with existing email loading and category management
- Respects user permissions and data isolation

## Events

The feature listens for and can trigger these events:

- `categoryCreated`: Triggers automatic suggestion generation
- `emailsLoaded`: Refreshes pending suggestions count
- `featureLoaded`: Exposes utility functions

## Error Handling

- Gracefully handles categorization failures for individual emails
- Filters out expired suggestions (older than 7 days)
- Validates input parameters and provides meaningful error messages
- Continues processing other emails if one fails

## Performance Considerations

- Processes emails asynchronously to avoid blocking
- Limits suggestions to configurable time period
- Automatically expires old suggestions
- Uses efficient filtering to avoid duplicate suggestions
