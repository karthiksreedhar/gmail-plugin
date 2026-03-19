# Video Demo Button

## Overview

The Video Demo Button feature adds a "Test" button to the Gmail interface, positioned next to the "Open Feature Generator" button. Clicking this "Test" button displays a success message, "New Feature added - demo", providing a simple demonstration of a new feature integration. This feature is purely frontend-based and does not require any backend components.

## Features

*   Adds a "Test" button to the Gmail header.
*   Displays a success message when the "Test" button is clicked.
*   Provides a quick and easy way to demonstrate new feature functionality.
*   Frontend-only implementation, simplifying deployment and maintenance.

## Installation

To install the Video Demo Button feature:

1.  Copy the frontend code (provided below) into a new file named `video-demo.js`.
2.  Place the `video-demo.js` file into the `data/features/` directory of your EmailAssistant plugin.
3.  Restart the EmailAssistant server to load the new feature.

## Usage

After installation and server restart, the "Test" button will automatically appear in the Gmail header, next to the "Open Feature Generator" button. To use the feature:

1.  Navigate to your Gmail inbox.
2.  Locate the "Test" button in the header.
3.  Click the "Test" button.
4.  A success message, "New Feature added - demo", will be displayed.

## UI Components

This feature adds the following UI component:

*   **"Test" Button:** A button labeled "Test" is added to the Gmail header, positioned to the right of the "Open Feature Generator" button. The button has a `btn btn-primary` class for styling and a right margin of 12px for spacing.

## Troubleshooting

**Issue:** The "Test" button does not appear after installation.

**Possible Solutions:**

*   **Verify File Placement:** Ensure that the `video-demo.js` file is correctly placed in the `data/features/` directory.
*   **Server Restart:** Confirm that the EmailAssistant server has been restarted after adding the file.
*   **EmailAssistant API Availability:** Check the browser console for errors related to the `EmailAssistant` API. If the API is not available, ensure that the EmailAssistant plugin is properly installed and enabled.
*   **Browser Cache:** Clear your browser cache and refresh Gmail to ensure that the latest version of the plugin is loaded.

**Issue:** Clicking the "Test" button does not display the success message.

**Possible Solutions:**

*   **Browser Console Errors:** Check the browser console for any JavaScript errors that might be preventing the `showDemoMessage` function from executing.
*   **API Functionality:** Verify that the `API.showSuccess` function is working correctly within the EmailAssistant plugin.