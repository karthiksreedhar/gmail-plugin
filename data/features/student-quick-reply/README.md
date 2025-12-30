# Student Quick Reply Feature

## Overview

The Student Quick Reply feature adds a convenient "Quick Reply" button to all emails categorized as "Student Interest". When clicked, it opens a popup allowing you to quickly respond with either "Yes" or "No", along with displaying the sender's name. All responses are tracked and stored for future reference.

## Features

- ✅ **Automatic Button Injection**: Adds "Quick Reply" buttons to all "Student Interest" emails
- ✅ **Clean UI**: Button appears on hover (similar to delete button behavior)
- ✅ **Simple Yes/No Selection**: Easy-to-use popup with two clear options
- ✅ **Response Tracking**: All responses are logged with timestamps
- ✅ **Works Everywhere**: Functions on newly loaded emails and existing database entries
- ✅ **Non-Intrusive**: No modification to core files required

## User Interface

### Quick Reply Button

The "Quick Reply" button appears on email cards when you hover over them. It is positioned next to the delete button in the actions area.

**Button Style:**
- Blue background (#4285f4)
- Appears on hover with smooth fade-in animation
- Positioned before the delete (trash) button

### Quick Reply Modal

When you click the "Quick Reply" button, a modal popup appears with:

```
Quick Reply to: [Sender Name]

[✓ Yes]    [✗ No]
```

- **Sender Name**: Extracted from the email's "from" field
- **Yes Button**: Green (#28a745) with checkmark
- **No Button**: Red (#dc3545) with X mark
- **Hover Effects**: Buttons scale up slightly on hover

## API Endpoints

### Record a Quick Reply Response

**Endpoint**: `POST /api/student-quick-reply/record`

**Request Body**:
```json
{
  "emailId": "string",
  "senderName": "string",
  "response": "yes" | "no",
  "timestamp": "ISO 8601 date string"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Response recorded successfully",
  "response": {
    "id": "unique-response-id",
    "emailId": "email-id",
    "senderName": "Sender Name",
    "response": "yes",
    "timestamp": "2025-12-23T14:55:00.000Z"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Error message"
}
```

### Get Response History

**Endpoint**: `GET /api/student-quick-reply/history`

**Query Parameters**:
- `emailId` (optional): Filter by specific email ID
- `limit` (optional): Limit number of results

**Example**:
```
GET /api/student-quick-reply/history?limit=10
GET /api/student-quick-reply/history?emailId=abc123
```

**Response**:
```json
{
  "success": true,
  "responses": [
    {
      "id": "unique-response-id",
      "emailId": "email-id",
      "senderName": "Sender Name",
      "response": "yes",
      "timestamp": "2025-12-23T14:55:00.000Z"
    }
  ],
  "count": 1
}
```

### Delete a Response

**Endpoint**: `DELETE /api/student-quick-reply/response/:responseId`

**Response**:
```json
{
  "success": true,
  "message": "Response deleted successfully"
}
```

## Database Schema

Responses are stored in MongoDB Atlas under the collection: `student_quick_reply_data`

**Document Structure**:
```json
{
  "responses": [
    {
      "id": "email-id-timestamp",
      "emailId": "original-email-id",
      "senderName": "Extracted Sender Name",
      "response": "yes" | "no",
      "timestamp": "ISO 8601 date string"
    }
  ],
  "lastUpdated": "ISO 8601 date string"
}
```

**Notes**:
- Data is user-specific (scoped by email address)
- Responses are appended to the array
- Each response gets a unique ID combining emailId and timestamp

## Usage Examples

### Basic Usage

1. Navigate to emails and filter by "Student Interest" category
2. Hover over any email card to reveal the "Quick Reply" button
3. Click "Quick Reply" to open the popup
4. Select "Yes" or "No"
5. A success message confirms your response was recorded

### Programmatic Access

You can access response history programmatically:

```javascript
// Get all responses
const result = await fetch('/api/student-quick-reply/history');
const data = await result.json();
console.log('All responses:', data.responses);

// Get responses for specific email
const result = await fetch('/api/student-quick-reply/history?emailId=abc123');
const data = await result.json();
console.log('Responses for this email:', data.responses);

// Get last 5 responses
const result = await fetch('/api/student-quick-reply/history?limit=5');
const data = await result.json();
console.log('Recent responses:', data.responses);
```

## How It Works

### Frontend Flow

1. **Initialization**: Feature loads when page loads
2. **Event Listeners**: Listens for `emailsLoaded` and `filterChanged` events
3. **MutationObserver**: Watches for dynamically added email items
4. **Category Detection**: Checks each email for "Student Interest" category
5. **Button Injection**: Adds Quick Reply button to matching emails
6. **Modal Display**: Shows popup when button is clicked
7. **Response Handling**: Records selection via backend API

### Backend Flow

1. **API Request**: Receives POST request with response data
2. **Validation**: Checks required fields and response value
3. **Data Retrieval**: Gets user's existing response history from MongoDB
4. **Data Update**: Appends new response to history
5. **Persistence**: Saves updated history back to MongoDB
6. **Response**: Returns success confirmation

## Category Detection

The feature detects "Student Interest" emails by checking:

1. **Single Category** (`email.category`): Direct string comparison
2. **Multiple Categories** (`email.categories`): Array includes check

**Case-Insensitive Matching**: "Student Interest", "student interest", and "STUDENT INTEREST" all match

## Troubleshooting

### Quick Reply button not appearing

**Possible Causes:**
1. Email is not categorized as "Student Interest"
2. DOM not fully loaded when buttons are injected
3. Feature not loaded properly

**Solutions:**
- Verify email category is exactly "Student Interest"
- Check browser console for error messages
- Refresh the page to reload features
- Ensure server.js is running and features are initialized

### Response not being recorded

**Possible Causes:**
1. Network error
2. MongoDB connection issue
3. Invalid request data

**Solutions:**
- Check network tab in browser DevTools
- Verify server logs for error messages
- Ensure MongoDB Atlas connection is active
- Check request payload format

### Button appears but modal doesn't show

**Possible Causes:**
1. EmailAssistant API not available
2. JavaScript error in modal rendering
3. Modal container missing

**Solutions:**
- Check browser console for errors
- Verify `window.EmailAssistant.showModal()` function exists
- Ensure `#feature-modals` container is present in DOM

## Development Notes

### File Structure
```
data/features/student-quick-reply/
├── manifest.json      # Feature metadata
├── backend.js         # API endpoints
├── frontend.js        # UI injection and event handling
└── README.md          # This file
```

### Dependencies
- **Frontend**: Requires `window.EmailAssistant` API
- **Backend**: Requires MongoDB Atlas connection
- **System**: No external npm packages needed

### Performance Considerations

- **DOM Updates**: MutationObserver is throttled with setTimeout delays
- **Event Delegation**: Uses efficient event listeners on parent containers
- **Database**: Responses are batched per user document (not one doc per response)

## Future Enhancements

Potential features to add in future versions:

- [ ] **Email Drafting**: Automatically draft email based on Yes/No response
- [ ] **Custom Messages**: Add text field for additional context
- [ ] **Analytics Dashboard**: View response statistics and trends
- [ ] **Bulk Actions**: Quick reply to multiple emails at once
- [ ] **Keyboard Shortcuts**: Press Y/N keys for quick responses
- [ ] **Response Templates**: Pre-defined response messages
- [ ] **Integration with Gmail**: Send actual email replies via Gmail API
- [ ] **Response History UI**: Show previous responses on email cards
- [ ] **Export Data**: Download response history as CSV/JSON

## Version History

### v1.0.0 (2025-12-23)
- Initial release
- Basic Yes/No quick reply functionality
- Response tracking and storage
- MongoDB persistence
- Event-driven button injection

## Support

For issues or feature requests, please check:
1. Browser console logs (prefix: "Student Quick Reply:")
2. Server logs for backend errors
3. MongoDB Atlas dashboard for data verification

## License

Part of the Gmail Plugin system. Same license as parent project.
