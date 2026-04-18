# Add Test Button

## Overview

The "Add Test Button" feature adds a simple "Test" button to the Gmail interface, positioned next to the "Open Feature Generator" button. Clicking this button displays a success message, "New Feature added!", providing a quick way to verify the plugin's functionality. This feature is purely frontend-based and does not require any backend components.

## Features

*   Adds a "Test" button to the Gmail header.
*   Displays a success message ("New Feature added!") when the button is clicked.
*   Provides a visual confirmation that the plugin is loaded and functioning correctly.

## Installation

To install the "Add Test Button" feature, follow these steps:

1.  Copy the frontend code (provided below) into a new file named `add-test-button.js`.
2.  Place the `add-test-button.js` file into the `data/features/` directory of your EmailAssistant plugin.
3.  Restart the EmailAssistant server.

## Usage

After installation and server restart, the "Test" button will automatically appear in the Gmail header, next to the "Open Feature Generator" button. To use the feature:

1.  Open Gmail in your browser.
2.  Locate the "Test" button in the header.
3.  Click the "Test" button.
4.  A success message, "New Feature added!", will be displayed.

## UI Components

This feature adds the following UI component:

*   **Test Button:** A button labeled "Test" is added to the Gmail header.  It is styled with `btn btn-primary` classes and has a right margin of 12px.

## Troubleshooting

**Issue:** The "Test" button does not appear after installation.

*   **Solution:**
    *   Verify that the `add-test-button.js` file is correctly placed in the `data/features/` directory.
    *   Ensure that the EmailAssistant server has been restarted after adding the file.
    *   Check the browser's developer console for any error messages related to the plugin.  Specifically, look for errors indicating that the `EmailAssistant` API is not available.

**Issue:** Clicking the "Test" button does not display the success message.

*   **Solution:**
    *   Check the browser's developer console for any JavaScript errors.
    *   Verify that the `EmailAssistant.showSuccess()` function is available and working correctly.

**Issue:** The button is not styled correctly.

*   **Solution:**
    *   Ensure that the `btn btn-primary` CSS classes are available in your Gmail environment.  These are standard Bootstrap classes, so if they are missing, there may be a conflict with other styles.
    *   Inspect the button element in the browser's developer tools to see if any other CSS rules are overriding the intended styles.

```javascript
/**
 * Add Test Button Frontend
 * Adds a 'Test' button next to the 'Open Feature Generator' button that displays a message when clicked.
 */

(function() {
  console.log('Add Test Button: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Add Test Button: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function showTestMessage() {
    API.showSuccess('New Feature added!');
  }

  function initialize() {
    API.addHeaderButton('Test', showTestMessage, {
      className: 'btn btn-primary',
      style: { marginRight: '12px' }
    });
  }

  initialize();

  console.log('Add Test Button: Frontend loaded successfully');
})();
```