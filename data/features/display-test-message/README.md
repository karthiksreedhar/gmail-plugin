# Display Test Message

## Overview

The "Display Test Message" feature adds a button to the Gmail plugin's header that, when clicked, displays a success message. This feature is designed to provide a simple way to test the plugin's functionality and ensure that the EmailAssistant API is working correctly. It's a frontend-only feature, meaning it doesn't require any backend components.

## Features

*   Adds a "Test" button to the Gmail plugin header.
*   Displays a success message ("New Feature added!") when the "Test" button is clicked.
*   Utilizes the `EmailAssistant` API to display the success message.
*   Provides a simple way to verify the plugin's frontend functionality.

## Installation

To install the "Display Test Message" feature, follow these steps:

1.  Copy the frontend code (provided below) into a new file named `display-test-message.js`.
2.  Place the `display-test-message.js` file into the `data/features/` directory of your Gmail plugin project.
3.  Restart the Gmail plugin server to load the new feature.

```javascript
/**
 * Display Test Message Frontend
 * Adds a button that displays a test message when clicked.
 */

(function() {
  console.log('Display Test Message: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Display Test Message: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function displayTestMessage() {
    API.showSuccess('New Feature added!');
  }

  function initialize() {
    API.addHeaderButton('Test', displayTestMessage, {
      className: 'btn btn-primary',
      style: { marginRight: '12px' }
    });
  }

  initialize();

  console.log('Display Test Message: Frontend loaded successfully');
})();
```

## Usage

After installing the feature and restarting the server, the "Test" button will appear in the Gmail plugin header, to the right of the "Open Feature Generator" button.

To use the feature:

1.  Click the "Test" button.
2.  A success message ("New Feature added!") will be displayed, confirming that the feature is working correctly.

## UI Components

This feature adds the following UI component:

*   **Test Button:** A button labeled "Test" is added to the Gmail plugin header. It has a `btn btn-primary` class for styling and a `marginRight` style of `12px` to provide spacing.  This button is added using the `EmailAssistant.addHeaderButton` API.

## Troubleshooting

*   **"Test" button not appearing:**
    *   Ensure that the `display-test-message.js` file is correctly placed in the `data/features/` directory.
    *   Verify that the Gmail plugin server has been restarted after installing the feature.
    *   Check the browser's developer console for any errors related to loading the feature.
*   **"EmailAssistant API not available" error:**
    *   This error indicates that the `EmailAssistant` API is not properly initialized or accessible. Ensure that the core Gmail plugin functionality is running correctly.
    *   Verify that the `EmailAssistant` API is correctly exposed to the frontend.
*   **Success message not displaying:**
    *   Check the browser's developer console for any errors related to the `API.showSuccess` function.
    *   Ensure that the `EmailAssistant` API is correctly configured to display success messages.
    *   Verify that there are no conflicting styles or scripts that might be preventing the message from being displayed.