# Document Thread History

## Overview

The Document Thread History feature provides a dedicated "Gmail Drive Space" within the Gmail interface for easy retrieval and version control of PDF documents found in email threads located in the "document" folder. It scans these threads, extracts the PDF attachments, and presents them in an organized manner, allowing users to quickly access and manage their documents.

## Features

*   **Document Extraction:** Automatically extracts PDF attachments from email threads within the "document" folder.
*   **Centralized Document View:** Presents a consolidated view of all extracted documents in a modal window.
*   **Thread Context:** Displays the subject, participants, and documents associated with each email thread.
*   **Direct Download:** Provides direct links to download the PDF documents.
*   **Gmail Drive Space Simulation:** Mimics a dedicated drive space for documents stored within Gmail.
*   **Version Control (Semi):** Facilitates a basic form of version control by displaying all PDF documents from the thread, allowing users to identify different versions.
*   **Easy Access:** Adds a button to the Gmail header for quick access to the document history.

## Installation

1.  Copy the backend code to `data/features/document-thread-history/backend.js`.
2.  Copy the frontend code to `data/features/document-thread-history/frontend.js`.
3.  Restart the EmailAssistant server.

## Usage

1.  After installation and server restart, a "Document History" button will appear in the Gmail header.
2.  Click the "Document History" button to open the document history modal.
3.  The modal will display a list of email threads containing PDF documents from the "document" folder.
4.  Each thread will show the subject, participants, and a list of associated PDF documents.
5.  Click on a document link to download the PDF file.

## API Endpoints

### 1. Get Document Threads

*   **Endpoint:** `/api/document-thread-history/documents`
*   **Method:** `GET`
*   **Description:** Retrieves a list of document threads and their associated PDF documents.
*   **Request:**
    ```
    GET /api/document-thread-history/documents
    ```
*   **Response (Success - 200 OK):**
    ```json
    {
      "success": true,
      "data": [
        {
          "messageId": "18abcdefg12345678",
          "threadId": "17zyxwvu98765432",
          "filename": "report_v1.pdf",
          "attachmentId": "abcdefg1234567890",
          "from": "sender@example.com",
          "date": "Tue, 23 Jan 2024 10:00:00 -0800",
          "subject": "Monthly Report"
        },
        {
          "messageId": "18hijklmno45678901",
          "threadId": "17tsrqpon34567890",
          "filename": "invoice_2023.pdf",
          "attachmentId": "hijklmno1234567890",
          "from": "billing@company.com",
          "date": "Mon, 22 Jan 2024 14:30:00 -0800",
          "subject": "Invoice for December 2023"
        }
      ]
    }
    ```
*   **Response (Error - 500 Internal Server Error):**
    ```json
    {
      "success": false,
      "error": "Failed to load document list"
    }
    ```

### 2. Download Document

*   **Endpoint:** `/api/document-thread-history/download/:messageId/:attachmentId`
*   **Method:** `GET`
*   **Description:** Downloads a specific PDF document.
*   **Parameters:**
    *   `messageId`: The ID of the email message containing the attachment.
    *   `attachmentId`: The ID of the attachment to download.
*   **Request:**
    ```
    GET /api/document-thread-history/download/18abcdefg12345678/abcdefg1234567890
    ```
*   **Response (Success - 200 OK):**
    *   Returns the PDF file as a downloadable attachment.  The `Content-Type` header will be `application/pdf`, and the `Content-Disposition` header will be set to `attachment; filename="document.pdf"`.
*   **Response (Error - 404 Not Found):**
    ```json
    {
      "success": false,
      "error": "Attachment not found"
    }
    ```
*   **Response (Error - 500 Internal Server Error):**
    ```json
    {
      "success": false,
      "error": "Failed to download document"
    }
    ```

## UI Components

*   **Header Button:** A "Document History" button is added to the Gmail header. Clicking this button opens the document history modal.
*   **Modal Window:** A modal window displays the document thread history.  It includes:
    *   A title: "Document Thread History"
    *   A description: "List of PDF documents from email threads in the 'document' folder."
    *   A list of email threads, each displaying:
        *   Thread Subject
        *   Participants (From field)
        *   A list of documents with download links.
    *   A "Close" button to close the modal.
*   **Loading Indicator:** A "Loading Document History..." message is displayed while the document threads are being loaded.

## Troubleshooting

*   **No documents are displayed:**
    *   Ensure that there are emails with PDF attachments in the "document" folder.
    *   Verify that the backend is correctly configured and running.
    *   Check the server logs for any errors related to fetching emails or attachments.
    *   Make sure the user has the necessary permissions to access the Gmail API.
*   **Failed to download document:**
    *   Verify that the `messageId` and `attachmentId` are correct.
    *   Check the server logs for any errors related to downloading the attachment.
    *   Ensure that the Gmail API is properly authenticated.
*   **"EmailAssistant API not available" error:**
    *   Make sure the EmailAssistant framework is properly loaded and initialized before the frontend code.
    *   Verify that the frontend code is correctly placed in the `data/features/document-thread-history/frontend.js` file.
*   **Modal displays "Failed to load document history.":**
    *   Check the browser's developer console for JavaScript errors.
    *   Verify that the API endpoints are accessible and returning the expected data.
    *   Ensure that the backend server is running and properly configured.
*   **Button does not appear:**
    *   Clear the browser cache and refresh Gmail.
    *   Ensure the frontend code is correctly placed in the `data/features/document-thread-history/frontend.js` file.
    *   Check the browser's developer console for JavaScript errors.