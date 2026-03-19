# Test-2

## Overview

The Test-2 feature adds a button to the Gmail interface that, when clicked, displays a popup modal with a predefined message. This feature is designed for testing and demonstrating the functionality of adding UI elements and displaying modals within the Gmail plugin environment.

## Features

*   Adds a "Test" button to the Gmail header.
*   Displays a popup modal when the "Test" button is clicked.
*   The popup modal displays the message "Flow works appropriately".
*   The popup modal includes a "Close" button to dismiss the modal.

## Installation

To install the Test-2 feature:

1.  Copy the frontend code provided below into a new file named `test-2.js`.
2.  Place the `test-2.js` file into the `data/features/` directory of your Gmail plugin.
3.  Restart the Gmail plugin server to load the new feature.

## Usage

After installation and server restart, the "Test" button will appear in the Gmail header, next to the "Open Feature Generator" button.

1.  Click the "Test" button.
2.  A popup modal will appear with the message "Flow works appropriately".
3.  Click the "Close" button within the modal to dismiss it.

## UI Components

The Test-2 feature adds the following UI components to the Gmail interface:

*   **"Test" Button:** A button labeled "Test" is added to the Gmail header. This button is styled with a primary button class and has a right margin for spacing.
*   **Popup Modal:** When the "Test" button is clicked, a modal window appears. This modal contains:
    *   A title: "Test"
    *   A message: "Flow works appropriately"
    *   A "Close" button: This button dismisses the modal when clicked.

## Troubleshooting

*   **Button Not Appearing:**
    *   Ensure the `test-2.js` file is correctly placed in the `data/features/` directory.
    *   Verify that the Gmail plugin server has been restarted after adding the file.
    *   Check the browser's developer console for any error messages related to the feature.  Specifically, look for "Test-2" in the console logs.
    *   Confirm that the `EmailAssistant` API is available by checking for the message "EmailAssistant API not available" in the console. If it is, ensure the EmailAssistant API is properly initialized in your plugin.

*   **Popup Not Appearing:**
    *   Check the browser's developer console for any JavaScript errors that occur when clicking the "Test" button.
    *   Ensure that the `API.showModal` function is being called correctly.
    *   Verify that the modal content is being rendered correctly.

*   **EmailAssistant API Not Available:**
    *   This error indicates that the core EmailAssistant API is not properly initialized or loaded before the Test-2 feature. Ensure that the EmailAssistant API is correctly initialized in your plugin's main script before the Test-2 feature is loaded.  This usually involves ensuring the core plugin script is loaded before any feature scripts.