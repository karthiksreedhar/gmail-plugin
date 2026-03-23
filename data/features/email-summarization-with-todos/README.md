# Email Summarization with To-Do Extraction

## Overview

This feature adds a "Summarize" button to each email thread in your Gmail interface. Clicking this button triggers a process that uses the Gemini model to generate a concise, one-sentence summary of the email and extracts any to-do items present in the email body. The summary and to-do items are then displayed in a popup modal.

## Features

*   **Email Summarization:** Generates a one-sentence summary of the email content using Gemini.
*   **To-Do Extraction:** Identifies and extracts to-do items from the email body, presenting them as a bulleted list.
*   **User-Friendly Interface:** Adds a "Summarize" button directly within the email thread for easy access.
*   **Dynamic Content Handling:**  The "Summarize" button is added and refreshed periodically to handle dynamically loaded email content.
*   **Error Handling:** Provides informative error messages to the user in case of summarization failures.

## Installation

1.  Copy the backend code (provided above) to a file named `index.js` within a new directory named `email-summarization-with-todos` inside your `data/features/` directory.  The full path should be `data/features/email-summarization-with-todos/index.js`.
2.  Copy the frontend code (provided above) to a file named `frontend.js` within the same `email-summarization-with-todos` directory. The full path should be `data/features/email-summarization-with-todos/frontend.js`.
3.  Restart your server. This will load the new feature.

## Usage

1.  Navigate to your Gmail interface.
2.  Open any email thread.
3.  You will see a "Summarize" button next to the other action buttons (e.g., Reply, Delete).
4.  Click the "Summarize" button.
5.  A modal popup will appear, displaying the one-sentence summary of the email and a bulleted list of extracted to-do items. If no to-do items are found, the list will display "None".

## API Endpoints

### `POST /api/email-summarization-with-todos/summarize`

This endpoint is responsible for generating the email summary and extracting to-do items.

**Request:**

```json
{
  "emailBody": "The email content to be summarized and analyzed for to-do items."
}
```

**Example Request:**

```json
{
  "emailBody": "Hi John,\n\nPlease review the attached document and provide feedback by Friday. Also, schedule a meeting with the team to discuss the project progress.\n\nThanks,\nJane"
}
```

**Response (Success):**

```json
{
  "success": true,
  "data": {
    "summary": "Jane asks John to review the attached document and provide feedback by Friday, and to schedule a meeting with the team to discuss the project progress.",
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
  "error": "Gemini API error: ..."
}
```

## UI Components

*   **Summarize Button:** A button labeled "Summarize" is added to the email actions section of each email thread.  It has the class name `.summarize-email-btn`.  The button's style is defined inline in the frontend code.
*   **Modal Popup:** A modal popup displays the email summary and extracted to-do items. The modal is generated dynamically using the `API.showModal` function.  It includes a loading indicator while the summarization is in progress.

## Troubleshooting

*   **"Summarize" button not appearing:**
    *   Ensure the backend and frontend code are correctly placed in the `data/features/email-summarization-with-todos/` directory.
    *   Verify that the server has been restarted after installing the feature.
    *   Check the browser's developer console for any JavaScript errors related to the frontend code.
    *   The feature relies on the `emailsLoaded` event. If your email client doesn't reliably fire this event, the button might not appear consistently. The frontend code includes multiple strategies to add the button, including a timer and hooking into `displayEmails` if it exists.
*   **Error message: "EmailAssistant API not available":**
    *   This indicates that the `window.EmailAssistant` object is not defined. Ensure that the EmailAssistant API is properly loaded and available in your environment. This is a dependency for the plugin to function.
*   **Error message: "Failed to summarize email":**
    *   Check the server logs for any errors related to the Gemini API.
    *   Verify that the `emailBody` is being correctly passed to the `/api/email-summarization-with-todos/summarize` endpoint.
    *   Ensure that your Gemini API key is correctly configured and has sufficient quota.
*   **Summary is inaccurate or to-do items are not extracted correctly:**
    *   The accuracy of the summary and to-do extraction depends on the Gemini model's performance. You may need to adjust the prompt or temperature parameters in the backend code to improve the results.
*   **Loading indicator persists indefinitely:**
    *   This usually indicates an error in the API call or a problem with the Gemini API. Check the server logs for more details.
*   **Duplicate "Summarize" buttons:**
    * The frontend code attempts to remove existing buttons before adding new ones. If you still see duplicates, there might be an issue with the selector used to find the buttons. Inspect the HTML to ensure the selector `.summarize-email-btn` is correct.