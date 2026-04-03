# Auto-Update Demo Button

## Overview

The Auto-Update Demo Button feature adds a button to the Gmail interface that, when clicked, displays a modal window with a message demonstrating the auto-update functionality of the Gmail plugin. This feature is designed to provide a visual confirmation that updates to the plugin are being applied correctly.

## Features

*   Adds a "Test" button next to the "Open Feature Generator" button in the Gmail header.
*   Clicking the "Test" button displays a modal window.
*   The modal window displays the message "Demonstration of auto-updates!".
*   Provides a visual confirmation of plugin auto-update functionality.

## Installation

To install the Auto-Update Demo Button feature:

1.  Copy the frontend code (provided below) into a new file named `auto-update-demo-button.js`.
2.  Place the `auto-update-demo-button.js` file into the `data/features/` directory of your Gmail plugin.
3.  Restart the Gmail plugin server.

## Usage

After installation and server restart, the "Test" button will appear in the Gmail header, next to the "Open Feature Generator" button.

1.  Click the "Test" button.
2.  A modal window will appear with the message "Demonstration of auto-updates!".
3.  Click outside the modal or on a close button (if available in your modal implementation) to dismiss the window.

## UI Components

This feature adds the following UI component:

*   **Test Button:** A button labeled "Test" is added to the Gmail header. This button is styled with `btn btn-secondary` classes and has a right margin of 12px.

## Troubleshooting

*   **Button Not Appearing:**
    *   Ensure the `auto-update-demo-button.js` file is correctly placed in the `data/features/` directory.
    *   Verify that the Gmail plugin server has been restarted after adding the file.
    *   Check the browser's developer console for any JavaScript errors that might be preventing the feature from loading.
    *   Confirm that the `EmailAssistant` API is available and properly initialized.

*   **Modal Window Not Displaying:**
    *   Check the browser's developer console for any JavaScript errors that occur when clicking the "Test" button.
    *   Ensure that the `API.showModal` function is correctly implemented and functioning within your Gmail plugin environment.
    *   Verify that the modal window's CSS is not conflicting with other styles in the Gmail interface.

*   **EmailAssistant API Not Available:**
    *   The error message "Auto-Update Demo Button: EmailAssistant API not available" in the console indicates that the `EmailAssistant` API is not properly initialized or accessible. Ensure that the core plugin functionality that provides the `EmailAssistant` API is running correctly and loaded before this feature.