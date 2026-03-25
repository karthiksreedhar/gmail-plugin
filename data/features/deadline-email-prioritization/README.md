# Deadline Email Prioritization

## Overview

This feature prioritizes emails with deadlines within the next three days by moving them to the top of the inbox and highlighting them in yellow. This helps users quickly identify and address time-sensitive emails.

## Features

*   Automatically identifies emails with deadlines within the next three days.
*   Highlights these emails in yellow for easy visual identification.
*   Moves prioritized emails to the top of the inbox.
*   Provides an optional header button to manually trigger prioritization.
*   Refreshes prioritization periodically to account for new emails.

## Installation

1.  Copy the backend code to `data/features/deadline-email-prioritization/backend.js`.
2.  Copy the frontend code to `data/features/deadline-email-prioritization/frontend.js`.
3.  Restart the EmailAssistant server.

## Usage

After installation and server restart, the feature will automatically begin prioritizing emails. Emails with deadlines within the next three days, as detected by the backend logic, will be highlighted in yellow and moved to the top of the inbox.

An optional "Prioritize Deadlines" button is added to the header. Clicking this button manually triggers the prioritization process.

## API Endpoints

### `GET /api/deadline-email-prioritization/check-deadlines`

This endpoint checks for emails with deadlines within the next three days for the current user.

**Request:**

```
GET /api/deadline-email-prioritization/check-deadlines
```

**Response (Success):**

```json
{
  "success": true,
  "data": {
    "count": 2,
    "emails": ["email_id_1", "email_id_2"]
  }
}
```

**Response (Error):**

```json
{
  "success": false,
  "error": "Error message describing the failure"
}
```

**Note:** The backend code provides a placeholder implementation for extracting deadlines from email bodies. This needs to be replaced with actual logic that parses email content to identify deadlines. The example code uses a simple regex to find dates formatted as `YYYY-MM-DD` following the word "deadline:".

## UI Components

*   **Email Highlighting:** Emails with deadlines are highlighted with a yellow background.  A class `deadline-highlighted` is added to the email item.
*   **Header Button (Optional):** A "Prioritize Deadlines" button is added to the header. Clicking this button triggers the `highlightDeadlineEmails` function.

## Troubleshooting

*   **Emails are not being highlighted:**
    *   Verify that the backend and frontend code are correctly placed in the `data/features/deadline-email-prioritization/` directory.
    *   Ensure the EmailAssistant server has been restarted after installing the feature.
    *   Check the browser's developer console for any JavaScript errors.
    *   Verify that the API endpoint `/api/deadline-email-prioritization/check-deadlines` is accessible and returns a valid response.
    *   The deadline extraction logic in the backend might not be correctly identifying deadlines in your emails.  Adjust the regex or parsing logic as needed.
*   **"Prioritize Deadlines" button is not visible:**
    *   Ensure the frontend code is correctly loaded and executed.
    *   Check the browser's developer console for any JavaScript errors related to the button creation.
    *   Verify that the EmailAssistant API (`window.EmailAssistant`) is available.
*   **Emails are not being moved to the top of the inbox:**
    *   Check the browser's developer console for any JavaScript errors related to DOM manipulation.
    *   Ensure that the email item's parent node is correctly identified as the inbox.
*   **Feature is not working after an update:**
    *   Clear your browser's cache and cookies.
    *   Restart the EmailAssistant server.
*   **Error messages in the console:**
    *   Carefully read the error messages in the browser's developer console and address the underlying issues. These messages often provide valuable clues for debugging.