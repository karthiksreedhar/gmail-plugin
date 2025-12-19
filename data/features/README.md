# Gmail Plugin Feature System

This folder contains custom features that extend the email management system. Each feature is a standalone JavaScript file that hooks into the main application lifecycle.

## Available Hooks

Features can register for these hooks via the `triggers` array:

| Hook Name | When Called | Context Provided |
|-----------|-------------|------------------|
| `onPriorityEmailsLoaded` | After `/load-priority-today` loads 50 emails from MongoDB | `{ emails, user }` |
| `onEmailsCategorized` | After emails are categorized | `{ emails, categories, user }` |
| `onEmailThreadsLoaded` | After `/load-email-threads` loads approved emails | `{ threads, user }` |
| `onEmailOpened` | When user opens/views an email | `{ email, user }` |
| `onBeforeSend` | Just before an email is sent | `{ draft, user }` |

## Creating a New Feature

Create a new `.js` file in this folder (not starting with `_`). Here's the template:

```javascript
/**
 * Feature: [Feature Name]
 * Description: [What this feature does]
 */

module.exports = {
  // REQUIRED: Unique identifier for this feature
  name: 'my-feature-name',
  
  // OPTIONAL: Human-readable description
  description: 'What this feature does',
  
  // REQUIRED: Which hooks to listen for
  // Use ['*'] to listen to all hooks
  triggers: ['onPriorityEmailsLoaded', 'onEmailThreadsLoaded'],
  
  // OPTIONAL: Feature configuration (can be updated at runtime)
  config: {
    someOption: true,
    threshold: 0.8
  },
  
  // REQUIRED: Main execution function
  async execute(context) {
    const { hook, emails, threads, user, featureConfig } = context;
    
    // Your feature logic here
    // Return data to be included in the response, or null to skip
    
    if (hook === 'onPriorityEmailsLoaded') {
      // Process emails...
      const matches = emails.filter(e => /* your logic */);
      return { matches, action: 'suggest-template' };
    }
    
    return null;
  }
};
```

## Example Features

### 1. Template Auto-Suggest (template-suggest.js)

```javascript
module.exports = {
  name: 'template-suggest',
  description: 'Suggests email templates based on incoming email patterns',
  triggers: ['onPriorityEmailsLoaded'],
  
  config: {
    templates: [
      {
        name: 'High School Student Response',
        pattern: 'high school|prospective student|interested in',
        template: 'Hi {{name}},\n\nThank you for reaching out...'
      }
    ]
  },
  
  async execute({ emails, featureConfig }) {
    const suggestions = [];
    
    for (const email of emails) {
      for (const tpl of featureConfig.templates) {
        const regex = new RegExp(tpl.pattern, 'i');
        if (regex.test(email.subject) || regex.test(email.body)) {
          suggestions.push({
            emailId: email.id,
            templateName: tpl.name,
            template: tpl.template.replace('{{name}}', email.from_name || 'there')
          });
        }
      }
    }
    
    return suggestions.length ? { suggestions } : null;
  }
};
```

### 2. Similar Email Finder (similar-finder.js)

```javascript
module.exports = {
  name: 'similar-finder',
  description: 'Finds emails similar to a reference email',
  triggers: ['onEmailThreadsLoaded'],
  
  config: {
    referenceEmails: [] // IDs of reference emails to match against
  },
  
  async execute({ threads, featureConfig }) {
    // Compare against reference emails and return matches
    return { matches: [] };
  }
};
```

### 3. Auto-Label (auto-label.js)

```javascript
module.exports = {
  name: 'auto-label',
  description: 'Automatically applies labels to matching emails',
  triggers: ['onPriorityEmailsLoaded'],
  
  config: {
    rules: [
      { pattern: 'anthropic.*receipt', label: 'Anthropic Receipt' }
    ]
  },
  
  async execute({ emails, featureConfig }) {
    const labelActions = [];
    
    for (const email of emails) {
      for (const rule of featureConfig.rules) {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(email.subject) || regex.test(email.body)) {
          labelActions.push({ emailId: email.id, label: rule.label });
        }
      }
    }
    
    return labelActions.length ? { labelActions } : null;
  }
};
```

## API Endpoints

The feature system exposes these endpoints via server.js:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/features` | GET | List all loaded features |
| `/api/features/:name` | GET | Get details of a specific feature |
| `/api/features/:name/enable` | POST | Enable a feature |
| `/api/features/:name/disable` | POST | Disable a feature |
| `/api/features/:name/config` | PUT | Update feature configuration |
| `/api/features/reload` | POST | Reload all features from disk |

## How Features Integrate

1. **On Startup**: The server calls `features.init()` to load all feature files
2. **On API Calls**: Key endpoints call `features.executeHook()` with relevant data
3. **Response Enhancement**: Feature results are added to API responses under `featureResults`

## Tips

- Features run in order of file name (alphabetical)
- Return `null` from `execute()` to produce no output
- Use `config` for user-adjustable settings
- Disabled features skip execution but stay loaded
- Use `triggers: ['*']` to run on every hook (for logging/debugging)
