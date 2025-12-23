# Gmail Plugin Feature System

This directory contains pluggable features for the Gmail Plugin. Features allow you to extend the application with custom functionality without modifying the core codebase.

## Architecture

The feature system provides a pluggable architecture that allows users to "program against their inbox" by:

1. **Backend Integration**: Features can register API routes, access database, and use AI models
2. **Frontend Integration**: Features can add UI components, buttons, modals, and event listeners
3. **Event System**: Features can react to application events (emails loaded, filter changed, etc.)
4. **Data Persistence**: Features can store user-specific data in MongoDB

## Creating a Feature

### Directory Structure

```
data/features/your-feature-name/
├── manifest.json      # Feature metadata and configuration
├── backend.js         # Server-side logic (optional)
├── frontend.js        # Client-side UI and logic (optional)
└── README.md          # Feature documentation (optional)
```

### manifest.json

Required file that describes your feature:

```json
{
  "id": "your-feature-name",
  "name": "Your Feature Name",
  "version": "1.0.0",
  "description": "What your feature does",
  "author": "Your Name",
  "backend": "backend.js",
  "frontend": "frontend.js",
  "permissions": [
    "emails:read",
    "emails:write",
    "api:custom"
  ]
}
```

### Backend API (backend.js)

Optional backend module that runs on the server:

```javascript
module.exports = {
  initialize(context) {
    const { 
      app,           // Express app instance
      getUserDoc,    // Get MongoDB document for current user
      setUserDoc,    // Save MongoDB document for current user
      openai,        // OpenAI client
      gmail,         // Gmail API client (lazy getter)
      getCurrentUser,// Get current user email
      loadEmailData, // Load email data helpers
      // ... and many more helpers
    } = context;
    
    // Register your API endpoints
    app.get('/api/your-feature/endpoint', async (req, res) => {
      // Your logic here
      res.json({ success: true, data: {} });
    });
    
    app.post('/api/your-feature/action', async (req, res) => {
      const user = getCurrentUser();
      const { param } = req.body;
      
      // Save data to MongoDB
      await setUserDoc('your_feature_collection', user, {
        data: param,
        timestamp: new Date().toISOString()
      });
      
      res.json({ success: true });
    });
  }
};
```

**Available Context:**
- `app` - Express application
- `express` - Express module
- `gmail()` - Gmail API client (function)
- `gmailAuth()` - Gmail auth client (function)
- `openai` - OpenAI client
- `fs` - File system module
- `path` - Path module
- `getUserDoc(collection, user)` - Get user document from MongoDB
- `setUserDoc(collection, user, data)` - Save user document to MongoDB
- `getCurrentUser()` - Get current user email
- `getCurrentUserPaths()` - Get file paths for current user
- Plus many more helper functions for email loading, categorization, etc.

### Frontend API (frontend.js)

Optional frontend script that runs in the browser:

```javascript
(function() {
  const API = window.EmailAssistant;
  
  // Add button to header
  API.addHeaderButton('My Feature', () => {
    // Your click handler
    API.showModal('<div>Your content</div>', 'Modal Title');
  });
  
  // Access email data
  const emails = API.getEmails();
  const currentFilter = API.getCurrentFilter();
  
  // Make API calls
  const response = await API.apiCall('/api/your-feature/endpoint', {
    method: 'POST',
    body: { data: 'value' }
  });
  
  // Show notifications
  API.showSuccess('Operation successful!');
  API.showError('Something went wrong');
  API.showConfirm('Are you sure?', () => {
    // User clicked confirm
  });
  
  // Listen to events
  API.on('featureLoaded', (feature) => {
    console.log('Feature loaded:', feature.name);
  });
  
  // Trigger custom events
  API.trigger('customEvent', { data: 'value' });
})();
```

**Available API Methods:**

Core Data Access:
- `getEmails()` - Get all emails
- `getCurrentFilter()` - Get current filter name
- `getCurrentUser()` - Get current user email

UI Manipulation:
- `addHeaderButton(label, handler, options)` - Add button to header
- `addEmailAction(name, handler)` - Add action to email items
- `showModal(content, title)` - Show a modal dialog
- `showSuccess(message)` - Show success notification
- `showError(message)` - Show error notification  
- `showConfirm(message, onConfirm)` - Show confirmation dialog

API Helpers:
- `apiCall(endpoint, options)` - Make API request

Event System:
- `on(event, handler)` - Listen to event
- `trigger(event, data)` - Trigger event

Core Functions:
- `loadEmails()` - Reload email list
- `displayEmails(emails)` - Display emails
- `filterByCategory(category)` - Filter by category
- `openEmailThread(id, subject)` - Open email thread

## Feature Examples

### Simple Stats Feature

Track email statistics:

```javascript
// frontend.js
(function() {
  const API = window.EmailAssistant;
  
  API.addHeaderButton('Stats', () => {
    const emails = API.getEmails();
    const stats = {
      total: emails.length,
      categories: new Set(emails.map(e => e.category)).size,
      thisWeek: emails.filter(e => {
        const date = new Date(e.date);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return date > weekAgo;
      }).length
    };
    
    const content = `
      <div style="padding: 20px;">
        <h3>Email Statistics</h3>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Total Emails:</strong> ${stats.total}</li>
          <li><strong>Categories:</strong> ${stats.categories}</li>
          <li><strong>This Week:</strong> ${stats.thisWeek}</li>
        </ul>
      </div>
    `;
    
    API.showModal(content, 'Email Stats');
  });
})();
```

### Auto-Responder Feature

Automatically suggest responses for certain emails:

```javascript
// backend.js
module.exports = {
  initialize(context) {
    const { app, openai, getCurrentUser } = context;
    
    app.post('/api/auto-responder/suggest', async (req, res) => {
      try {
        const { emailBody, category } = req.body;
        
        const prompt = `Generate a brief response for this ${category} email: ${emailBody}`;
        
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200
        });
        
        res.json({
          success: true,
          response: completion.choices[0].message.content
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }
};
```

## Best Practices

1. **Namespace your endpoints**: Use `/api/your-feature-name/...` for all routes
2. **Handle errors gracefully**: Always wrap async operations in try-catch
3. **Use user-specific storage**: Store data per user using `getUserDoc`/`setUserDoc`
4. **Clean up resources**: Remove event listeners when your feature unloads
5. **Document your feature**: Include a README.md explaining what it does
6. **Version your data**: Include version numbers in stored data for migrations

## Events

Available events you can listen to:

- `featureLoaded` - A feature was loaded (data: `{ id, name, version }`)
- `emailsLoaded` - Emails were loaded
- `filterChanged` - Filter was changed
- Custom events triggered by other features

## Deployment

1. Create your feature directory in `data/features/`
2. Add `manifest.json`, `backend.js`, and/or `frontend.js`
3. Restart the server to load backend features
4. Refresh the browser to load frontend features

The server will automatically discover and load all features in this directory.

## Troubleshooting

- **Feature not loading**: Check the console for error messages
- **API not available**: Ensure `window.EmailAssistant` exists before using it
- **Backend errors**: Check server logs for initialization errors
- **Missing permissions**: Add required permissions to `manifest.json`

## Example Use Cases

- **Custom email filters**: Create specialized filters based on content analysis
- **Email templates**: Quick-insert templates for common responses
- **Analytics dashboard**: Visualize email patterns and trends
- **Integration plugins**: Connect to external services (Slack, calendar, etc.)
- **Automation rules**: Trigger actions based on email content
- **Custom categorization**: Add specialized category logic
- **Workflow triggers**: Automate tasks based on email events

## See Also

- `/data/features/example-feature/` - Complete working example
- `/server.js` - Feature loading implementation
- `/public/index.html` - Frontend API implementation
