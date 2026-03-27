# Automated Student Email Responses

## Overview

This feature automates responses to student emails in Gmail, specifically targeting emails related to Slack issues and late submissions/extensions for the UI Design 4170 class. It analyzes incoming emails and sends pre-defined, personalized replies, saving instructors time and ensuring students receive timely acknowledgements.

## Features

*   **Automated Slack Issue Responses:** Automatically detects emails about Slack problems and directs students to the Courseworks announcements page.
*   **Automated Late Submission/Extension Acknowledgements:** Recognizes emails concerning late submissions or extension requests and sends a confirmation reply.
*   **Personalized Responses:** Uses the student's name in the automated replies for a more personal touch.
*   **Gemini AI Integration:** Utilizes Gemini AI to analyze email content and determine the appropriate response type.
*   **Batch Processing:** Processes multiple emails in batches to improve efficiency.
*   **Error Handling:** Implements robust error handling, including token limit management and retry mechanisms.
*   **Gmail API Integration:** Directly interacts with the Gmail API to send replies.

## Installation

1.  Copy the backend code (provided above) to `data/features/auto-reply-student-emails/backend.js`.
2.  Copy the frontend code (provided above) to `data/features/auto-reply-student-emails/frontend.js`.
3.  Ensure the directory structure `data/features/auto-reply-student-emails/` exists.
4.  Restart the server.

## Usage

1.  After installation and server restart, a new button labeled "Auto-Reply Students" will appear in the Gmail header.
2.  Clicking this button will trigger the automated email processing for all emails in your inbox. A modal will display a loading animation while the emails are being processed.
3.  Additionally, an "Auto-Reply" action will be available for individual emails. Clicking this action will process only the selected email.
4.  Success or error messages will be displayed upon completion of the processing.
5.  The email list will be refreshed to reflect the sent replies.

## API Endpoints

### `POST /api/auto-reply-student-emails/process-emails`

**Description:** Processes all student emails and sends automated replies based on their content.

**Request Body:**

```json
{
  "emails": [
    {
      "id": "1234567890abcdef",
      "threadId": "abcdef1234567890",
      "subject": "Question about Slack",
      "from": "student@example.edu",
      "snippet": "I'm having trouble accessing the Slack channel...",
      "headers": {
        "references": "original-message-id",
        "in-reply-to": "previous-message-id"
      }
    },
    {
      "id": "0987654321fedcba",
      "threadId": "fedcba0987654321",
      "subject": "Late Submission - Assignment 1",
      "from": "anotherstudent@example.edu",
      "snippet": "I'm submitting Assignment 1 late...",
      "headers": {
        "references": "original-message-id",
        "in-reply-to": "previous-message-id"
      }
    }
  ]
}
```

**Response Body (Success):**

```json
{
  "success": true,
  "data": {
    "totalEmails": 2,
    "totalBatches": 1,
    "results": [
      {
        "batch": 1,
        "result": "Slack\nExtension",
        "emailCount": 2
      }
    ],
    "successfulBatches": 1
  }
}
```

**Response Body (Error):**

```json
{
  "success": false,
  "error": "Failed to fetch emails: Error message"
}
```

### `POST /api/auto-reply-student-emails/process-email` (Hypothetical - Not in original code, but implied by frontend)

**Description:** Processes a single student email and sends an automated reply based on its content.  This endpoint is not present in the provided backend code, but the frontend attempts to call it.  It would need to be implemented in the backend for the "Auto-Reply" email action to function.

**Request Body:**

```json
{
  "email": {
    "id": "1234567890abcdef",
    "threadId": "abcdef1234567890",
    "subject": "Question about Slack",
    "from": "student@example.edu",
    "snippet": "I'm having trouble accessing the Slack channel...",
    "headers": {
      "references": "original-message-id",
      "in-reply-to": "previous-message-id"
    }
  }
}
```

**Response Body (Success):**

```json
{
  "success": true,
  "message": "Successfully processed email."
}
```

**Response Body (Error):**

```json
{
  "success": false,
  "error": "Failed to process email: Error message"
}
```

## UI Components

*   **Header Button:** A button labeled "Auto-Reply Students" is added to the Gmail header. Clicking this button triggers the processing of all emails.
*   **Email Action:** An "Auto-Reply" action is added to each email in the inbox. Clicking this action processes only the selected email.
*   **Modal:** A modal window displays a loading animation while emails are being processed.
*   **Success/Error Messages:** Success and error messages are displayed to provide feedback on the processing status.

## Troubleshooting

*   **"EmailAssistant API not available" error:** This indicates that the EmailAssistant API is not properly initialized. Ensure that the plugin is correctly loaded and that the EmailAssistant API is accessible.
*   **"Failed to fetch emails" error:** This suggests an issue with retrieving emails from Gmail. Check your Gmail API credentials and ensure that the plugin has the necessary permissions.
*   **"Token limit exceeded" error:** This occurs when the Gemini AI model exceeds its token limit. The backend code includes a retry mechanism with smaller batches to mitigate this issue. If the error persists, try reducing the number of emails processed in each batch or shortening the email snippets.
*   **No emails are being processed:** Verify that the `getStudentEmails` function in the backend is correctly filtering for student emails.  The current implementation `context.searchGmailEmails('from:*.edu', 50);` might need adjustment based on your specific email domain.
*   **Automated replies are not being sent:** Check the Gmail API quota usage and ensure that the plugin is not exceeding the daily limit. Also, verify that the `sendReply` function is correctly sending emails using the Gmail API.
*   **"process-email" endpoint not found:** The frontend code attempts to call `/api/auto-reply-student-emails/process-email`, but this endpoint is not defined in the provided backend code. You will need to implement this endpoint in the backend to support the "Auto-Reply" email action. This endpoint should take a single email object in the request body, analyze it, and send the appropriate automated reply.