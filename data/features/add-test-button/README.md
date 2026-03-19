# Add Test Button

## Overview

The "Add Test Button" feature adds a simple "Test" button to the Gmail interface, positioned next to the "Open Feature Generator" button. Clicking this button displays a modal window with a predefined message, demonstrating a basic feature addition workflow. This feature is intended as a simple example for developers to understand how to add custom UI elements and functionality to the Gmail interface using the EmailAssistant API.

## Features

*   Adds a "Test" button to the Gmail header.
*   Displays a modal window with a predefined message when the "Test" button is clicked.
*   Provides a basic example of using the `EmailAssistant.addHeaderButton` and `EmailAssistant.showModal` APIs.
*   Frontend only - no backend component required.

## Installation

To install the "Add Test Button" feature:

1.  Copy the frontend code (provided below) into a new file named `add-test-button.js`.
2.  Place the `add-test-button.js` file into the `data/features/` directory of your EmailAssistant plugin.
3.  Restart the EmailAssistant server.

```javascript
/**
 * Add Test Button Frontend
 * Adds a 'Test' button next to the 'Open Feature Generator' button that displays a message on click.
 */

(function() {
  console.log('Add Test Button: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Add Test Button: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function showTestMessage() {
    API.showModal('<div style="padding: 20px;">Demonstration of Feature Addition Workflow</div>', 'Test Message');
  }

  function initialize() {
    API.addHeaderButton('Test', showTestMessage, {
      className: 'btn btn-primary',
      style: { marginRight: '12px' }
    });

    console.log('Add Test Button: Frontend initialized successfully');
  }

  initialize();

  console.log('Add Test Button: Frontend loaded successfully');
})();
```

## Usage

After installation and server restart, the "Test" button will appear in the Gmail header, next to the "Open Feature Generator" button.

1.  Open Gmail in your browser.
2.  Locate the "Test" button in the header.
3.  Click the "Test" button.
4.  A modal window will appear with the message "Demonstration of Feature Addition Workflow".
5.  Click outside the modal or on the close button to dismiss it.

## UI Components

This feature adds the following UI component:

*   **Test Button:** A button labeled "Test" is added to the Gmail header.  It is styled with the `btn btn-primary` CSS classes for visual consistency with other buttons in the interface and has a right margin of 12px.

## Troubleshooting

*   **"Test" button does not appear:**
    *   Ensure that the `add-test-button.js` file is correctly placed in the `data/features/` directory.
    *   Verify that the EmailAssistant server has been restarted after adding the file.
    *   Check the browser's developer console for any error messages related to the feature.  Specifically, look for errors indicating that the `EmailAssistant` API is not available.
*   **Clicking the "Test" button does nothing:**
    *   Check the browser's developer console for any JavaScript errors when clicking the button.
    *   Ensure that the `EmailAssistant.showModal` function is available and working correctly.
*   **Error: `EmailAssistant` API not available:**
    *   This indicates that the EmailAssistant plugin is not properly loaded or initialized. Ensure that the plugin is installed and enabled correctly.
    *   Verify that the `EmailAssistant` global object is accessible in the browser's JavaScript context.