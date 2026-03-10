# Email Thread Summarizer

## Overview

The Email Thread Summarizer is a Gmail plugin feature that adds a "Summarize" button to each email thread. Clicking this button generates a concise summary (up to three sentences) of the entire email thread and identifies any actionable TODOs mentioned within the emails. This feature helps users quickly understand the context of a conversation and prioritize their tasks.

## Features

*   **Summarizes Email Threads:** Generates a short, informative summary of the entire email thread.
*   **Identifies TODOs:** Extracts and lists any TODOs mentioned within the email thread.
*   **Easy to Use:** Adds a prominent "Summarize" button next to each email thread.
*   **Modal Display:** Presents the summary and TODOs in a clean, user-friendly modal window.

## Installation

To install the Email Thread Summarizer feature:

1.  Copy the backend code (provided below) to a file named `email-thread-summarizer.js` within the `data/features/` directory of your Gmail plugin.
2.  Copy the frontend code (provided below) to a file named `email-thread-summarizer.js` within the `data/features/` directory of your Gmail plugin.
3.  Restart your Gmail plugin server.

## Usage

1.  After installation and server restart, navigate to your Gmail inbox.
2.  You will see a "Summarize" button next to each email thread in your inbox.
3.  Click the "Summarize" button for the email thread you want to summarize.
4.  A modal window will appear, displaying a summary of the email thread and a list of any identified TODOs.
5.  Click the "Close" button in the modal to dismiss it.

## API Endpoints

The Email Thread Summarizer feature exposes the following API endpoint:

*   **`POST /api/email-thread-summarizer/summarize`**

    *   **Description:** Summarizes an email thread.
    *   **Request Body:**

        ```json
        {
          "threadId": "YOUR_EMAIL_THREAD_ID"
        }
        ```

        *   `threadId`: (String, Required) The ID of the email thread to summarize.

    *   **Response Body (Success):**

        ```json
        {
          "success": true,
          "data": {
            "summary": "A brief summary of the email thread, up to three sentences.",
            "todos": ["Task 1", "Task 2", "Task 3"] // Optional: Only present if TODOs are found
          }
        }
        ```

        *   `success`: (Boolean) Indicates whether the request was successful.
        *   `data`: (Object) Contains the summary and TODOs.
            *   `summary`: (String) The generated summary of the email thread.
            *   `todos`: (Array, Optional) An array of TODOs identified in the email thread.

    *   **Response Body (Error):**

        ```json
        {
          "success": false,
          "error": "Error message describing the failure."
        }
        ```

        *   `success`: (Boolean) Indicates whether the request was successful.
        *   `error`: (String) An error message describing the reason for the failure.

    *   **Example Request:**

        ```
        POST /api/email-thread-summarizer/summarize
        Content-Type: application/json

        {
          "threadId": "17a4b8c9d0e1f234"
        }
        ```

    *   **Example Response (Success):**

        ```json
        {
          "success": true,
          "data": {
            "summary": "The email thread discusses a project deadline and upcoming meeting. John needs to send the report by Friday. The team will discuss the findings next week.",
            "todos": ["Send the report by Friday"]
          }
        }
        ```

## UI Components

The Email Thread Summarizer feature adds the following UI components:

*   **"Summarize" Button:** A button labeled "Summarize" is added to each email thread in the inbox, next to the "Open in Inbox" button.  The button has the class `summarize-thread-btn`.
*   **Modal Window:** When the "Summarize" button is clicked, a modal window appears, displaying the summary and TODOs. The modal includes a "Close" button to dismiss it.

## Troubleshooting

*   **"Summarize" button not appearing:**
    *   Ensure that the backend and frontend code are correctly placed in the `data/features/` directory.
    *   Verify that the server has been restarted after installing the feature.
    *   Check the browser's developer console for any JavaScript errors.
    *   Ensure the `EmailAssistant` API is available.
*   **Error summarizing email thread:**
    *   Check the server logs for any errors related to the API endpoint.
    *   Verify that the `threadId` is being correctly passed to the API endpoint.
    *   Ensure that the OpenAI API key is correctly configured and that the API is accessible.
*   **Summary is not accurate or TODOs are missing:**
    *   The accuracy of the summary and TODO identification depends on the quality of the OpenAI model. Consider refining the prompt in the backend code to improve the results.
*   **Duplicate "Summarize" buttons:**
    * The frontend code attempts to remove existing buttons before adding new ones. If duplicates still appear, there might be an issue with the timing or event handling. Review the frontend code's initialization and event listeners.