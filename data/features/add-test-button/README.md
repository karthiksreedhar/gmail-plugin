# Add Test Button

## Overview

The "Add Test Button" feature adds a simple "Test" button to the Gmail interface, positioned next to the "Open Feature Generator" button. Clicking this "Test" button triggers a success message, "Feature added!", to be displayed to the user. This feature serves as a basic example of how to add interactive elements to the Gmail interface using the EmailAssistant API.

## Features

*   Adds a "Test" button to the Gmail header.
*   Displays a "Feature added!" success message when the "Test" button is clicked.
*   Provides a simple demonstration of adding interactive elements using the EmailAssistant API.
*   Frontend only implementation.

## Installation

To install the "Add Test Button" feature:

1.  Copy the frontend code (provided below) into a new file named `add-test-button.js`.
2.  Place the `add-test-button.js` file into the `data/features/` directory of your EmailAssistant plugin.
3.  Restart the EmailAssistant server.

```javascript
/**
 * Add Test Button Frontend
 * Adds a 'Test' button next to the 'Open Feature Generator' button that displays a 'Feature added!' message when clicked.
 */

(function() {
  console.log('Add Test Button: Frontend loading...');

  if (!window.EmailAssistant) {
    console.error('Add Test Button: EmailAssistant API not available');
    return;
  }

  const API = window.EmailAssistant;

  function showFeatureAddedMessage() {
    API.showSuccess('Feature added!');
  }

  function initialize() {
    API.addHeaderButton('Test', showFeatureAddedMessage, {
      className: 'btn btn-primary',
      style: { marginRight: '12px' }
    });
  }

  initialize();

  console.log('Add Test Button: Frontend loaded successfully');
})();
```

## Usage

After installing and restarting the EmailAssistant server, the "Test" button will appear in the Gmail header, next to the "Open Feature Generator" button.

1.  Open Gmail in your browser.
2.  Locate the "Test" button in the header.
3.  Click the "Test" button.
4.  A "Feature added!" success message will be displayed.

## UI Components

This feature adds the following UI component:

*   **Test Button:** A button labeled "Test" is added to the Gmail header. It is styled as a primary button with a small right margin.

## Troubleshooting

*   **"Test" button does not appear:**
    *   Ensure that the `add-test-button.js` file is correctly placed in the `data/features/` directory.
    *   Verify that the EmailAssistant server has been restarted after installing the feature.
    *   Check the browser's developer console for any error messages related to the feature.
    *   Confirm that the EmailAssistant plugin is enabled in your browser.

*   **"EmailAssistant API not available" error:**
    *   This error indicates that the EmailAssistant API is not properly initialized or accessible.
    *   Ensure that the EmailAssistant plugin is correctly installed and running.
    *   Verify that the `window.EmailAssistant` object is available in the browser's JavaScript environment.

*   **"Feature added!" message does not appear:**
    *   Check the browser's developer console for any JavaScript errors that might be preventing the `showSuccess` function from executing.
    *   Ensure that the EmailAssistant API is functioning correctly and that the `showSuccess` method is available.