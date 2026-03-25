# Job Application Tracker

## Overview

The Job Application Tracker is a Gmail plugin feature that helps you organize and track your job applications directly within your inbox. It automatically extracts key information from emails categorized as "job applications," such as the company name, role applied for, and application status, and presents them in a structured list. This allows you to quickly see the status of all your applications without having to manually search through your emails.

## Features

*   **Automatic Extraction:** Extracts company, role, and application status from emails in the 'job applications' category.
*   **Structured List:** Displays extracted information in a clear and organized table.
*   **Easy Access:** Provides a button in the Gmail header for quick access to the application list.
*   **Real-time Updates:** Refreshes the application list whenever new emails are loaded.
*   **Gemini AI Powered:** Uses Gemini AI to intelligently extract information from email content.
*   **Error Handling:** Gracefully handles errors, including Gemini token limit issues.
*   **Batch Processing:** Processes emails in batches to optimize performance and avoid rate limits.

## Installation

To install the Job Application Tracker feature:

1.  Copy the backend code to `data/features/job-application-tracker/backend.js`.
2.  Copy the frontend code to `data/features/job-application-tracker/frontend.js`.
3.  Restart the EmailAssistant server.

## Usage

1.  Ensure that you have a category labeled "job applications" in your Gmail account and that relevant job application emails are categorized accordingly.
2.  After installation and server restart, a "Job Applications" button will appear in the Gmail header.
3.  Clicking the "Job Applications" button will open a modal window displaying a table with the extracted information for each job application email found in the "job applications" category.
4.  The application list is automatically refreshed when new emails are loaded.
5.  To manually refresh the data, you can trigger the refresh endpoint (see API Endpoints section). Note that this process uses AI and may take some time.

## API Endpoints

### 1. Get Job Applications

*   **Endpoint:** `/api/job-application-tracker/applications`
*   **Method:** `GET`
*   **Description:** Fetches the current list of job applications from the database.
*   **Request:** (None)
*   **Response:**

    ```json
    {
      "success": true,
      "data": [
        {
          "company": "Google",
          "role": "Software Engineer",
          "status": "Interview Scheduled"
        },
        {
          "company": "Microsoft",
          "role": "Data Scientist",
          "status": "Applied"
        }
      ]
    }
    ```

    In case of failure:

    ```json
    {
      "success": false,
      "error": "Failed to load applications"
    }
    ```

### 2. Refresh Job Applications

*   **Endpoint:** `/api/job-application-tracker/refresh`
*   **Method:** `POST`
*   **Description:** Refreshes the job application data by analyzing emails in the "job applications" category using Gemini AI.
*   **Request:** (None)
*   **Response:**

    ```json
    {
      "success": true,
      "data": [
        {
          "company": "Google",
          "role": "Software Engineer",
          "status": "Interview Scheduled"
        },
        {
          "company": "Microsoft",
          "role": "Data Scientist",
          "status": "Applied"
        }
      ],
      "message": "Applications refreshed"
    }
    ```

    In case of failure:

    ```json
    {
      "success": false,
      "error": "Failed to refresh applications"
    }
    ```

    If no job application emails are found:

    ```json
    {
      "success": true,
      "data": [],
      "message": "No job application emails found."
    }
    ```

## UI Components

*   **Header Button:** A "Job Applications" button is added to the Gmail header. Clicking this button opens the application list modal.
*   **Modal Window:** A modal window displays the job application data in a table format. The table includes columns for "Company," "Role," and "Status."
*   **Close Button:** A "Close" button is included in the modal window to close the application list.

## Troubleshooting

*   **No Job Applications Found:**
    *   Ensure that you have a category labeled "job applications" in your Gmail account.
    *   Verify that relevant job application emails are correctly categorized.
    *   If the category or emails were recently added, try refreshing the application list using the `/api/job-application-tracker/refresh` endpoint.
*   **Failed to Load Applications:**
    *   Check the server logs for any errors related to the Job Application Tracker.
    *   Ensure that the backend code is correctly placed in the `data/features/job-application-tracker/` directory.
    *   Verify that the EmailAssistant server is running and accessible.
*   **Inaccurate Information Extraction:**
    *   The accuracy of the extracted information depends on the format and content of the emails.
    *   The Gemini AI model may not always be able to accurately extract information from all emails.
    *   Consider manually verifying and correcting the extracted information if necessary.
*   **Token Limit Errors:**
    *   If you encounter errors related to token limits, the feature automatically tries to process emails in smaller batches.
    *   To further mitigate token limit issues, ensure that email snippets are truncated and only essential information is included in the Gemini prompt.
*   **Rate Limits:**
    *   The feature includes a delay between batches to avoid rate limits when calling the Gemini API.
    *   If you still encounter rate limit errors, consider reducing the number of emails processed in each batch or increasing the delay between batches.