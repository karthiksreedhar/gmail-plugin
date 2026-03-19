# Add Test Button

## Overview

This feature adds a "Test" button to the Gmail interface, positioned next to the existing "Open Feature Generator" button. Clicking this "Test" button displays a success message, "New Feature Added - demo!", providing a simple way to test the plugin's functionality and demonstrate the addition of a new feature.

## Features

*   Adds a "Test" button to the Gmail header.
*   Displays a success message when the "Test" button is clicked.
*   Provides a visual confirmation of the feature's functionality.
*   Simple demonstration of adding new UI elements and event handling.

## Installation

To install the "Add Test Button" feature:

1.  Copy the frontend code (provided below) into a new file named `add-test-button.js`.
2.  Place the `add-test-button.js` file into the `data/features/` directory of your EmailAssistant plugin installation.
3.  Restart the EmailAssistant server for the changes to take effect.

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
    API.showSuccess('New Feature Added - demo!');
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

## Usage

After installation and restarting the EmailAssistant server:

1.  Open Gmail in your browser.
2.  You should see a "Test" button next to the "Open Feature Generator" button in the Gmail header.
3.  Click the "Test" button.
4.  A success message "New Feature Added - demo!" will be displayed.

## UI Components

This feature adds the following UI component:

*   **Test Button:** A button labeled "Test" is added to the Gmail header, styled as a primary button with a margin to the right.  It is added using the `API.addHeaderButton` function.

## Troubleshooting

*   **"Test" button not appearing:**
    *   Ensure the `add-test-button.js` file is correctly placed in the `data/features/` directory.
    *   Verify that the EmailAssistant server has been restarted after adding the file.
    *   Check the browser's developer console for any errors related to the EmailAssistant API or the `add-test-button.js` file.  Specifically, look for the "Add Test Button: Frontend loading..." and "Add Test Button: Frontend loaded successfully" messages in the console. If the "EmailAssistant API not available" error is present, ensure the EmailAssistant plugin is properly installed and enabled.
*   **Clicking the "Test" button does nothing:**
    *   Check the browser's developer console for any JavaScript errors when clicking the button.
    *   Ensure the `showSuccess` function is correctly defined and accessible within the `add-test-button.js` file.
    *   Verify that the EmailAssistant API is functioning correctly.
*   **Success message not displaying:**
    *   Ensure the `API.showSuccess` function is correctly called within the `showTestMessage` function.
    *   Check for any conflicting CSS or JavaScript that might be preventing the success message from displaying.