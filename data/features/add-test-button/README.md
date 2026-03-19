# Add Test Button

## Overview

The "Add Test Button" feature adds a "Test" button to the Gmail plugin interface, positioned next to the "Open Feature Generator" button. Clicking this button triggers a popup modal that displays the message "Flow works appropriately," confirming the basic functionality of the plugin. This feature is designed for quick and easy testing during development and debugging.

## Features

*   Adds a "Test" button to the Gmail plugin header.
*   Displays a popup modal when the "Test" button is clicked.
*   The modal confirms basic plugin functionality with the message "Flow works appropriately".
*   Provides a "Close" button within the modal to dismiss it.

## Installation

To install the "Add Test Button" feature:

1.  Copy the frontend code (provided below) into a new file named `add-test-button.js`.
2.  Place the `add-test-button.js` file into the `data/features/` directory of your Gmail plugin project.
3.  Restart the Gmail plugin server to load the new feature.

## Usage

After installation and server restart, the "Test" button will appear in the Gmail plugin header, next to the "Open Feature Generator" button.

1.  Click the "Test" button.
2.  A popup modal will appear, displaying the message "Flow works appropriately."
3.  Click the "Close" button within the modal to dismiss it.

## UI Components

This feature adds the following UI components:

*   **Test Button:** A button labeled "Test" added to the Gmail plugin header. It is styled with `btn btn-primary` and has a right margin of 12px.
*   **Test Result Modal:** A popup modal that appears when the "Test" button is clicked.  It contains a title "Test Button", the message "Flow works appropriately", and a "Close" button. The "Close" button is styled with `btn btn-secondary`.

## Troubleshooting

*   **Button Not Appearing:**
    *   Ensure the `add-test-button.js` file is correctly placed in the `data/features/` directory.
    *   Verify that the Gmail plugin server has been restarted after adding the file.
    *   Check the browser's developer console for any errors related to loading the feature.  Specifically, look for "Add Test Button" in the console logs.
    *   Confirm that the `EmailAssistant` API is available. An error message will be logged to the console if it is not.

*   **Modal Not Appearing:**
    *   Check the browser's developer console for any JavaScript errors when clicking the "Test" button.
    *   Ensure that the `API.showModal` function is correctly called within the `showTestModal` function.
    *   Verify that the HTML content for the modal is correctly formatted.

*   **EmailAssistant API not available:**
    *   This indicates that the core EmailAssistant API is not properly initialized or loaded. Ensure that the core plugin functionality is working correctly before enabling this feature.  This is a dependency for this feature to work.