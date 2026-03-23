# Email Summarizer and ToDo Extractor

## Overview

The Email Summarizer and ToDo Extractor feature adds a "Summarize" button to each email thread in your Gmail interface. Clicking this button triggers a process that sends the email content to a backend service, which uses a language model (Gemini) to generate a concise one-sentence summary and extract any actionable ToDos from the email. The summary and ToDos are then displayed in a popup modal.

## Features

*   **Summarize Emails:** Generates a one-sentence summary of the email content.
*   **Extract ToDos:** Identifies and extracts actionable ToDos from the email body, presenting them as a bulleted list.
*   **User-Friendly Interface:** Adds a "Summarize" button directly within the email thread for easy access.
*   **Clear Presentation:** Displays the summary and ToDos in a clean and organized popup modal.
*   **Handles Emails Without ToDos:** Gracefully handles emails without ToDos by displaying "None" in the ToDos section.

## Installation

To install the Email Summarizer and ToDo Extractor feature:

1.  Copy the backend code to `data/features/email-summarizer-and-todo-extractor/backend.js`.
2.  Copy the frontend code to `data/features/email-summarizer-and-todo-extractor/frontend.js`.
3.  Restart your server.

## Usage

1.  Open your Gmail interface.
2.  Navigate to an email thread.
3.  Locate the "Summarize" button within the email thread actions. It should be next to the delete button.
4.  Click the "Summarize" button.
5.  A popup modal will appear, displaying a one-sentence summary of the email and a bulleted list of extracted ToDos. If no ToDos are found, the modal will display "None" in the ToDos section.

## API Endpoints

### `POST /api/email-summarizer-and-todo-extractor/summarize`

This endpoint is responsible for summarizing the email content and extracting ToDos.

**Request:**

```json
{
  "emailBody": "The email content to be summarized and analyzed."
}
```

**Example Request:**

```json
{
  "emailBody": "Hi John,\n\nPlease review the attached document and let me know your thoughts by Friday. Also, schedule a meeting with the team to discuss the project.\n\nThanks,\nJane"
}
```

**Response (Success):**

```json
{
  "success": true,
  "data": {
    "summary": "Jane asks John to review the attached document by Friday and schedule a meeting with the team to discuss the project.",
    "todos": [
      "Review the attached document",
      "Schedule a meeting with the team"
    ]
  }
}
```

**Response (No ToDos):**

```json
{
  "success": true,
  "data": {
    "summary": "This email confirms the meeting details for tomorrow.",
    "todos": []
  }
}
```

**Response (Error):**

```json
{
  "success": false,
  "error": "Email body is required"
}
```

```json
{
  "success": false,
  "error": "Failed to summarize email: Gemini API error"
}
```

## UI Components

*   **Summarize Button:** A button labeled "Summarize" is added to the actions section of each email thread. This button triggers the summarization and ToDo extraction process.  The button has the class name `summarize-email-btn`.
*   **Summary Modal:** A popup modal displays the one-sentence summary and the list of extracted ToDos. The modal title is "Email Summary".  The modal content includes a heading "Summary:" followed by the summary text, and a heading "ToDos:" followed by a bulleted list of ToDos.

## Troubleshooting

*   **"Summarize" button not appearing:**
    *   Ensure the frontend code is correctly placed in `data/features/email-summarizer-and-todo-extractor/frontend.js`.
    *   Verify that the server has been restarted after installing the feature.
    *   Check the browser's developer console for any JavaScript errors.  The frontend code logs messages to the console, check for errors there.
    *   The frontend code uses `window.EmailAssistant` to interact with the email client. Make sure this API is available.
*   **Popup modal displays "Loading summary..." and never completes:**
    *   Check the server logs for any errors related to the `/api/email-summarizer-and-todo-extractor/summarize` endpoint.
    *   Verify that the backend code is correctly placed in `data/features/email-summarizer-and-todo-extractor/backend.js`.
    *   Ensure that the Gemini API is properly configured and accessible from the backend.
    *   Check the network tab in the browser's developer console to see if the API request is being made and if the response is successful.
*   **Error messages in the popup modal:**
    *   The error message should provide some context as to what went wrong. Check the server logs for more detailed error information.
    *   If the error message indicates a problem with the Gemini API, ensure that your API key is valid and that you have sufficient quota.
*   **ToDos are not being extracted correctly:**
    *   The accuracy of ToDo extraction depends on the quality of the language model (Gemini).  The prompt used to invoke Gemini can be adjusted in the backend code to improve the extraction results.
    *   Ensure the email body is being correctly passed to the backend API.
*   **The summarize button appears multiple times:**
    *   The frontend code attempts to remove existing buttons before adding new ones. If the button is still appearing multiple times, there may be an issue with the logic that identifies and removes the existing buttons. Check the browser's developer console for errors. The frontend code uses `document.querySelectorAll('.summarize-email-btn')` to find existing buttons.