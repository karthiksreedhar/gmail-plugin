# Jira Card Interface

## Overview

The Jira Card Interface feature provides a dedicated interface within the Gmail plugin to view and manage Jira cards associated with the user's account. This allows users to quickly access and interact with their Jira tasks directly from their inbox, improving workflow and productivity.

## Features

*   **Dedicated Jira Card View:** Access a list of your Jira cards within the Gmail plugin.
*   **Card Details:** View key information about each card, including key, summary, and status.
*   **Direct Jira Link:**  Click a link to open the card directly in Jira.
*   **Email Action Integration:**  Link an email to a specific Jira card.
*   **Refresh Functionality:** Refresh the Jira card list to get the latest updates.

## Installation

1.  Copy the backend code to `data/features/jira-card-interface/backend.js`.
2.  Copy the frontend code to `data/features/jira-card-interface/frontend.js`.
3.  Restart the Gmail plugin server.

## Usage

1.  After installation and server restart, a "Jira Cards" button will appear in the Gmail plugin header.
2.  Clicking the "Jira Cards" button will open a modal displaying your Jira cards.
3.  Each card will show its key, summary, and status, along with a link to view it in Jira.
4.  You can refresh the card list by clicking the "Refresh" button in the modal.
5.  Right-clicking on an email will show an "Link to Jira Card" action. Clicking this will prompt you for a Jira card key to link the email to.

## API Endpoints

### GET `/api/jira-card-interface/cards`

*   **Description:** Fetches all Jira cards associated with the current user.
*   **Request:** `GET /api/jira-card-interface/cards`
*   **Response (Success - 200 OK):**

    ```json
    {
      "success": true,
      "data": [
        {
          "id": "1",
          "key": "AKIFY-123",
          "summary": "Implement new feature",
          "status": "In Progress",
          "url": "https://your-jira-instance.com/browse/AKIFY-123"
        },
        {
          "id": "2",
          "key": "AKIFY-456",
          "summary": "Fix bug in login",
          "status": "To Do",
          "url": "https://your-jira-instance.com/browse/AKIFY-456"
        }
      ]
    }
    ```

*   **Response (Error - 500 Internal Server Error):**

    ```json
    {
      "success": false,
      "error": "Failed to load Jira cards"
    }
    ```

### POST `/api/jira-card-interface/cards`

*   **Description:** Saves Jira cards for the current user.  This is intended for internal use or for syncing with an external Jira integration.
*   **Request:** `POST /api/jira-card-interface/cards`
    ```json
    {
      "cards": [
        {
          "id": "1",
          "key": "AKIFY-123",
          "summary": "Implement new feature",
          "status": "In Progress",
          "url": "https://your-jira-instance.com/browse/AKIFY-123"
        },
        {
          "id": "2",
          "key": "AKIFY-456",
          "summary": "Fix bug in login",
          "status": "To Do",
          "url": "https://your-jira-instance.com/browse/AKIFY-456"
        }
      ]
    }
    ```
*   **Response (Success - 200 OK):**

    ```json
    {
      "success": true,
      "message": "Jira cards saved"
    }
    ```

*   **Response (Error - 400 Bad Request):**

    ```json
    {
      "success": false,
      "error": "Jira cards are required"
    }
    ```

*   **Response (Error - 500 Internal Server Error):**

    ```json
    {
      "success": false,
      "error": "Failed to save Jira cards"
    }
    ```

### GET `/api/jira-card-interface/cards/:cardId`

*   **Description:** Fetches a specific Jira card by its ID.
*   **Request:** `GET /api/jira-card-interface/cards/1` (where `1` is the card ID)
*   **Response (Success - 200 OK):**

    ```json
    {
      "success": true,
      "data": {
        "id": "1",
        "key": "AKIFY-123",
        "summary": "Implement new feature",
        "status": "In Progress",
        "url": "https://your-jira-instance.com/browse/AKIFY-123"
      }
    }
    ```

*   **Response (Error - 404 Not Found):**

    ```json
    {
      "success": false,
      "error": "Jira card not found"
    }
    ```

*   **Response (Error - 500 Internal Server Error):**

    ```json
    {
      "success": false,
      "error": "Failed to load Jira card"
    }
    ```

### POST `/api/jira-card-interface/link-email` (Example - Not in provided backend code, but referenced in frontend)

*   **Description:** Links an email to a Jira card.  **Note:** This endpoint is referenced in the frontend code but is *not* implemented in the provided backend code.  You will need to implement this endpoint in `backend.js` to fully support the "Link to Jira Card" email action.
*   **Request:** `POST /api/jira-card-interface/link-email`
    ```json
    {
      "emailId": "email123",
      "cardKey": "AKIFY-123"
    }
    ```
*   **Response (Success - 200 OK):** (Example - Needs to be implemented)

    ```json
    {
      "success": true,
      "message": "Email linked to Jira card successfully!"
    }
    ```

*   **Response (Error - 500 Internal Server Error):** (Example - Needs to be implemented)

    ```json
    {
      "success": false,
      "error": "Failed to link email."
    }
    ```

## UI Components

*   **Header Button:** A "Jira Cards" button is added to the Gmail plugin header. Clicking this button opens the Jira cards modal.
*   **Jira Cards Modal:** A modal window displays the list of Jira cards, with details for each card and a link to view it in Jira.  It also includes a refresh button.
*   **Email Action:** An "Link to Jira Card" action is added to the email context menu (right-click menu). This action prompts the user for a Jira card key and attempts to link the email to that card.
*   **Loading Modal:** A modal window displays a loading message and spinner while Jira cards are being loaded or an action is in progress.

## Troubleshooting

*   **"Jira Cards" button not appearing:**
    *   Ensure the backend and frontend code are correctly placed in the `data/features/jira-card-interface/` directory.
    *   Verify that the Gmail plugin server has been restarted after installing the feature.
    *   Check the browser's developer console for any JavaScript errors.
*   **"Failed to load Jira cards" error:**
    *   Check the server logs for any errors related to the `/api/jira-card-interface/cards` endpoint.
    *   Ensure that the user has the necessary permissions to access the Jira API (if you implement a Jira API integration).
    *   Verify that the Jira API endpoint is accessible from the server.
*   **"Link to Jira Card" action not working:**
    *   Ensure that you have implemented the `/api/jira-card-interface/link-email` endpoint in the backend.
    *   Check the server logs for any errors related to the `/api/jira-card-interface/link-email` endpoint.
    *   Verify that the email ID and Jira card key are being correctly passed to the backend.
*   **Cards not displaying correctly:**
    *   Inspect the HTML generated in the Jira Cards Modal to ensure the data is being rendered as expected.
    *   Check the browser's developer console for any CSS or rendering issues.