# Detailed Summarization Error Handling

## Overview

This feature enhances the email summarization functionality within the Gmail plugin by providing more detailed and specific error messages. This allows users and developers to quickly identify the root cause of summarization failures, such as invalid email formats, missing content, or API-related issues. This feature improves the user experience by providing actionable feedback when summarization fails.

## Features

*   **Granular Error Reporting:** Provides specific error messages for various failure scenarios, including:
    *   Missing email ID
    *   Email not found in Gmail
    *   Invalid email format (missing payload or parts)
    *   Empty email body after cleaning
    *   Gemini API errors
    *   Unexpected errors during processing
*   **Improved Debugging:** Facilitates easier debugging and troubleshooting for developers.
*   **Enhanced User Experience:** Offers users clearer explanations of why summarization failed, enabling them to take corrective actions.

## Installation

To install this feature:

1.  Copy the backend code to `data/features/detailed-error-handling-summarize/backend.js`.
2.  Copy the frontend code to `data/features/detailed-error-handling-summarize/frontend.js`.
3.  Restart the Gmail plugin server.

## Usage

After installation, a "Summarize (Detailed Error Handling)" button will appear in the email action menu within Gmail.

1.  Open an email in Gmail.
2.  Click the "Summarize (Detailed Error Handling)" button.
3.  The plugin will attempt to summarize the email.
4.  If successful, a modal will display the email summary.
5.  If summarization fails, an error message will be displayed, providing details about the cause of the failure.

## API Endpoints

### `POST /api/detailed-error-handling-summarize/summarize-email`

This endpoint is responsible for summarizing the email content.

**Request:**

```json
{
  "emailId": "1234567890abcdef"
}
```

**Successful Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "summary": "This email discusses the upcoming project deadline and requests a status update from the team."
  }
}
```

**Error Responses:**

*   **400 Bad Request:**

    ```json
    {
      "success": false,
      "error": "Email ID is required"
    }
    ```

    ```json
    {
      "success": false,
      "error": "Invalid email format: Missing payload or parts"
    }
    ```

    ```json
    {
      "success": false,
      "error": "Email body is empty after cleaning"
    }
    ```

    ```json
    {
      "success": false,
      "error": "Email body is missing"
    }
    ```
*   **404 Not Found:**

    ```json
    {
      "success": false,
      "error": "Email not found"
    }
    ```
*   **500 Internal Server Error:**

    ```json
    {
      "success": false,
      "error": "Failed to fetch email from Gmail: [Error Message]"
    }
    ```

    ```json
    {
      "success": false,
      "error": "Failed to clean email body: [Error Message]"
    }
    ```

    ```json
    {
      "success": false,
      "error": "Gemini API error: [Error Message]"
    }
    ```

    ```json
    {
      "success": false,
      "error": "Gemini failed to generate a summary"
    }
    ```

    ```json
    {
      "success": false,
      "error": "Unexpected error: [Error Message]"
    }
    ```

## UI Components

*   **"Summarize (Detailed Error Handling)" Button:** Added to the email action menu.  Clicking this button triggers the summarization process.
*   **Loading Modal:**  A modal window displaying "Summarizing email..." with a spinner while the summarization is in progress.
*   **Summary Modal:**  A modal window displaying the generated email summary.
*   **Error Modal:** A modal window displaying specific error messages if the summarization fails.

## Troubleshooting

*   **"EmailAssistant API not available" error in the console:**
    *   Ensure that the `EmailAssistant` API is properly initialized and available in the global scope. This usually indicates a problem with the plugin's core initialization.
*   **"Summarize (Detailed Error Handling)" button not appearing:**
    *   Verify that the backend and frontend code files are correctly placed in the `data/features/detailed-error-handling-summarize/` directory.
    *   Confirm that the Gmail plugin server has been restarted after installing the feature.
    *   Check for any errors in the server logs during startup that might indicate a problem loading the feature.
*   **"Email not found" error:**
    *   Ensure that the `emailId` being passed to the API endpoint is valid and corresponds to an existing email in the user's Gmail account.
*   **"Gemini API error" or "Gemini failed to generate a summary" error:**
    *   Verify that the Gemini API key is correctly configured and that the plugin has the necessary permissions to access the Gemini API.
    *   Check the Gemini API usage limits to ensure that the plugin is not exceeding the allowed quota.
    *   Examine the Gemini API error message for more specific details about the failure.
*   **Generic "Unexpected error" message:**
    *   Check the server logs for more detailed error information. This can help identify the specific line of code that is causing the error.
*   **Email summary is empty or incomplete:**
    *   The Gemini model may not be able to summarize the email effectively due to its content or format. Try different emails or adjust the Gemini model parameters (e.g., temperature, maxOutputTokens) in the backend code.