# Response Suggestions Feature

## Overview

The Response Suggestions feature analyzes existing email threads in the database to identify emails that require urgent responses. It uses AI analysis to scan through old email threads, evaluate their urgency, and suggests the top 5 emails that most need a response.

## Features

- **AI-Powered Analysis**: Uses OpenAI to analyze email content, sender importance, and timing
- **Batch Processing**: Processes emails in 5 batches for optimal performance
- **Smart Prioritization**: Ranks emails by urgency score and suggests top 5
- **Visual Integration**: Displays suggestions as light orange cards above Priority Today emails
- **Seamless Workflow**: Reply buttons integrate with existing email reply system
- **Auto-Analysis**: Automatically analyzes emails on page load
- **Manual Refresh**: Users can trigger new analysis via header button

## Installation

The feature is automatically loaded by the Gmail Plugin system. No additional installation steps required.

## Usage

### Automatic Analysis
- The feature automatically analyzes email threads when the page loads
- Analysis runs in the background and displays results as light orange cards
- Only shows suggestions when urgent emails are found

### Manual Analysis
- Click the "Analyze Responses" button in the header to trigger a new analysis
- Analysis processes email threads in batches and shows progress

### Responding to Suggestions
- Click the blue reply button (↩️) on any suggestion card to open the reply interface
- Click anywhere else on the card to view the full email thread
- Use the "Dismiss" button to remove suggestions you don't want to respond to

## API Endpoints

### POST /api/response-suggestions/analyze
Analyzes email threads and generates response suggestions.

**Request:**
```http
POST /api/response-suggestions/analyze
Content-Type: application/json
```

**Response:**
```json
{
  "success": true,
  "suggestions": [
    {
      "id": "thread-abc123",
      "subject": "Research collaboration follow-up",
      "from": "professor@university.edu",
      "date": "2025-11-15T10:30:00Z",
      "urgencyScore": 8,
      "justification": "Time-sensitive research proposal needs response",
      "lastAnalyzed": "2025-12-30T23:45:00Z"
    }
  ],
  "totalAnalyzed": 45,
  "batchesProcessed": 5
}
```

### GET /api/response-suggestions/get
Retrieves current response suggestions.

**Request:**
```http
GET /api/response-suggestions/get
```

**Response:**
```json
{
  "success": true,
  "suggestions": [...],
  "lastAnalyzed": "2025-12-30T23:45:00Z",
  "totalAnalyzed": 45
}
```

### POST /api/response-suggestions/dismiss/:id
Dismisses a specific response suggestion.

**Request:**
```http
POST /api/response-suggestions/dismiss/thread-abc123
```

**Response:**
```json
{
  "success": true,
  "message": "Suggestion dismissed successfully",
  "remainingSuggestions": 4
}
```

## UI Components

### Response Suggestion Cards
- **Background**: Light orange (#FFE5CC)
- **Location**: Above Priority Today cards
- **Layout**: Similar to Priority Today with reply button and dismiss option
- **Hover Effects**: Darker orange background on hover

### Header Button
- **Label**: "Analyze Responses"
- **Color**: Orange theme (#ff9800)
- **Function**: Triggers manual analysis

### Card Elements
- **Subject Line**: Email subject with overflow handling
- **Sender**: Original email sender information
- **Date**: Formatted date with "X days ago" indicator
- **Justification**: AI-generated reason for why response is needed
- **Reply Button**: Blue circular button with reply emoji
- **Dismiss Button**: Gray button to remove suggestion

## Analysis Logic

### Thread Filtering
1. **Age Filter**: Only considers threads older than 7 days
2. **Response Check**: Excludes threads with recent responses
3. **Content Validation**: Ensures threads have sufficient content for analysis

### AI Analysis Criteria
The LLM evaluates each thread based on:
- **Time Sensitivity**: How long since last message
- **Content Urgency**: Deadlines, requests, questions in content
- **Sender Importance**: Relationship and role of sender
- **Action Required**: Context clues suggesting response needed

### Urgency Scoring
- **Scale**: 1-10 (10 most urgent)
- **Threshold**: Only threads scoring 6+ are considered
- **Top 5**: Final selection shows 5 highest scoring emails

## Data Storage

### MongoDB Collection
- **Collection**: `response_suggestions`
- **User-Specific**: Stored per user email
- **Schema**:
```json
{
  "suggestions": [
    {
      "id": "thread-id",
      "subject": "Email subject",
      "from": "sender@email.com",
      "date": "ISO date string",
      "urgencyScore": 8,
      "justification": "AI reasoning",
      "lastAnalyzed": "ISO date string"
    }
  ],
  "lastAnalyzed": "ISO date string",
  "totalAnalyzed": 45
}
```

## Integration Points

### Backend Integration
- **Server Context**: Full access to email loading functions
- **MongoDB**: User-specific data storage
- **OpenAI**: LLM analysis capabilities
- **Existing Routes**: No conflicts with core system

### Frontend Integration
- **EmailAssistant API**: Uses standard plugin API
- **Priority Container**: Inserts above existing priority emails
- **Thread Opening**: Leverages existing `openEmailThread()` function
- **Styling**: Matches existing card design patterns

## Performance Considerations

### Batch Processing
- **Size**: Divides threads into 5 batches for processing
- **Error Handling**: Continues processing if individual batches fail
- **Timeout Protection**: Each LLM call has reasonable timeout limits

### Caching
- **MongoDB Storage**: Results cached to avoid re-analysis
- **Manual Refresh**: Users can trigger new analysis when needed
- **7-Day Filter**: Reduces analysis load by filtering recent threads

## Error Handling

### Backend Errors
- **LLM Failures**: Graceful fallback when OpenAI calls fail
- **Batch Errors**: Individual batch failures don't stop entire analysis
- **Database Errors**: Proper error responses for storage issues

### Frontend Errors
- **API Failures**: User-friendly error messages
- **Missing Elements**: Defensive programming for DOM elements
- **Network Issues**: Retry mechanisms and user feedback

## Troubleshooting

### No Suggestions Appearing
1. Check if email threads exist in database
2. Verify threads are older than 7 days
3. Check browser console for error messages
4. Try manual "Analyze Responses" button

### Analysis Taking Too Long
1. Check server logs for batch processing progress
2. Verify OpenAI API key is configured
3. Monitor network connectivity
4. Consider reducing batch size if needed

### Reply Button Not Working
1. Ensure `openEmailThread` function exists globally
2. Check for JavaScript errors in console
3. Verify thread ID exists in database
4. Test with different suggestion cards

### Dismiss Button Not Working
1. Check network connectivity to API endpoint
2. Verify suggestion ID is valid
3. Monitor server logs for dismiss operation
4. Refresh page if state becomes inconsistent

## Development Notes

### Code Structure
- **IIFE Wrapper**: Frontend code wrapped to avoid global pollution
- **Event Driven**: Uses EmailAssistant event system
- **Modular**: Clean separation between analysis and display logic

### Testing Approach
1. **Unit Testing**: Test individual analysis functions
2. **Integration Testing**: Verify API endpoint responses
3. **UI Testing**: Check card rendering and interactions
4. **User Testing**: Validate suggestion quality and relevance

### Future Enhancements
- **Configurable Urgency Threshold**: Allow users to adjust sensitivity
- **Category-Specific Analysis**: Prioritize certain email categories
- **Learning System**: Improve suggestions based on user actions
- **Scheduling**: Automatic periodic re-analysis
- **Email Templates**: Quick response templates for common scenarios

## Dependencies

### Required
- **OpenAI API**: For LLM analysis
- **MongoDB**: For data persistence
- **EmailAssistant API**: For UI integration

### Optional
- **Gmail API**: For enhanced thread analysis
- **User Categories**: For category-aware prioritization

## Version History

### 1.0.0 (Initial Release)
- Basic thread analysis functionality
- Top 5 suggestion display
- Reply and dismiss capabilities
- MongoDB storage integration
- Auto-analysis on page load
