# Restore Summarize Button

## Overview

This feature restores the "Summarize" button functionality within the Gmail plugin. Users reported that the button was missing, and this feature aims to bring it back, allowing users to quickly summarize emails and email threads.

## Features

*   **Adds a "Summarize Emails" button to the email header:**  This button allows users to summarize all emails currently loaded in the view.
*   **Adds a "Summarize" action to individual emails:** This action appears when viewing a single email and allows users to summarize that specific email.
*   **Displays a loading indicator during summarization:** A modal with a spinner is shown while the summarization process is running.
*   **Provides success and error notifications:**  Users are notified whether the summarization was successful or if an error occurred.
*   **Displays the summary in a modal:** The summarized content is presented to the user in a modal window.

## Installation

To install this feature:

1.  Copy the frontend code (provided below) into a new file named `summarize-button-reappearance.js`.
2.  Place the `summarize-button-reappearance.js` file into the `data/features/` directory of your Gmail plugin.
3.  Restart the Gmail plugin server.

## Usage

Once installed, the "Summarize" button will reappear in the Gmail interface.

*   **Summarize All Emails:** Click the "Summarize Emails" button in the email header to summarize all currently loaded emails. A modal will appear with a loading indicator, followed by either a success message and summary or an error message.
*   **Summarize a Single Email:** When viewing a single email, a "Summarize" action will be available. Click this action to summarize the current email. A modal will appear with a loading indicator, followed by either a success message and summary or an error message.

## UI Components

This feature adds the following UI components to the Gmail interface:

*   **"Summarize Emails" Button:** A button labeled "Summarize Emails" is added to the email header.  It has a primary button style (`btn btn-primary`) and a right margin of 12px.
*   **"Summarize" Action:** An action labeled "Summarize" is added to the individual email actions.
*   **Loading Modal:** A modal window with a loading spinner is displayed while the summarization process is in progress.
*   **Summary Modal:** A modal window displays the summarized content.
*   **Success/Error Notifications:**  Small pop-up notifications are displayed to indicate the success or failure of the summarization process.

## Troubleshooting

*   **Button Not Appearing:**
    *   Ensure the `summarize-button-reappearance.js` file is correctly placed in the `data/features/` directory.
    *   Verify that the Gmail plugin server has been restarted after installing the feature.
    *   Check the browser's developer console for any JavaScript errors related to the feature.  Specifically, look for errors related to `EmailAssistant` not being defined. This indicates a problem with the plugin's core API.
*   **"EmailAssistant API not available" Error:**
    *   This error indicates that the core `EmailAssistant` API is not properly initialized or loaded. Ensure that the core plugin functionality is working correctly before installing this feature.
*   **Summarization Fails:**
    *   If summarization fails, check the browser's developer console for error messages. These messages may provide clues about the cause of the failure.
    *   Verify that the `/api/summarize-button-reappearance/summarize-all` and `/api/summarize-button-reappearance/summarize-email` API endpoints are correctly configured and accessible.  (Note: This feature description indicates that there is no backend, so these API calls will fail unless a backend is implemented.)
    *   Ensure that the plugin has the necessary permissions to access and process email content.
*   **Loading Spinner Persists:**
    *   If the loading spinner continues to display without a result, it likely indicates an issue with the API calls or the summarization process itself. Check the browser's developer console for error messages.