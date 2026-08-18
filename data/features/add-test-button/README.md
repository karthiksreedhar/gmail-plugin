# Add Test Button

## Overview

The "Add Test Button" feature adds a simple "TEST" button to the Gmail interface, positioned next to the "Open Feature Generator" button. Clicking this button displays a success message, "NEW FEATURE ADDED!", providing a quick way to test the plugin's functionality or showcase new additions. This feature is purely frontend-based and does not require any backend components.

## Features

*   Adds a "TEST" button to the Gmail interface.
*   Displays a success message ("NEW FEATURE ADDED!") when the button is clicked.
*   Provides a simple mechanism for testing or demonstrating plugin functionality.
*   Frontend-only implementation, simplifying deployment and maintenance.

## Installation

To install the "Add Test Button" feature:

1.  Copy the frontend code (provided below) into a new file named `add-test-button.js`.
2.  Place the `add-test-button.js` file into the `data/features/` directory of your Gmail Plugin project.
3.  Restart your Gmail Plugin server to load the new feature.

## Usage

After installation and server restart, the "TEST" button will automatically appear in the Gmail interface, next to the "Open Feature Generator" button. To use the feature:

1.  Open Gmail in your browser.
2.  Locate the "TEST" button in the Gmail header.
3.  Click the "TEST" button.
4.  A success message, "NEW FEATURE ADDED!", will be displayed.

## UI Components

This feature adds the following UI component:

*   **TEST Button:** A button labeled "TEST" is added to the Gmail header, styled with a primary button appearance and a right margin for spacing.  It's added using the `API.addHeaderButton` function.

## Troubleshooting

*   **Button Not Appearing:**
    *   Ensure the `add-test-button.js` file is correctly placed in the `data/features/` directory.
    *   Verify that the Gmail Plugin server has been restarted after adding the file.
    *   Check the browser's developer console for any JavaScript errors that might be preventing the feature from loading.  Specifically, look for errors related to `EmailAssistant` not being defined.
*   **"EmailAssistant API not available" Error:**
    *   This error indicates that the `EmailAssistant` API is not properly initialized or available in the current context.  Ensure that the core Gmail Plugin framework is correctly loaded and initialized before this feature's script runs.
*   **Button Appears but No Message is Displayed:**
    *   Check the browser's developer console for any JavaScript errors that occur when clicking the button. This could indicate an issue with the `showTestMessage` function or the `API.showSuccess` method.
*   **Button is Misaligned or Incorrectly Styled:**
    *   Inspect the button's CSS styles in the browser's developer tools.  The provided `className` and `style` properties should apply basic styling, but conflicts with other CSS rules might occur. Adjust the styling as needed.