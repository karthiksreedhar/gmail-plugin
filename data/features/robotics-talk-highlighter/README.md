# Robotics Talk Highlighter

## Overview

The Robotics Talk Highlighter is a Gmail plugin feature designed to help users quickly identify and categorize emails related to robotics talks. It automatically highlights emails based on a predefined set of keywords and allows users to customize these keywords to better suit their specific interests. This feature aims to reduce the time spent manually sifting through emails and ensure that important robotics-related announcements are not missed.

## Features

*   **Automatic Email Highlighting:** Automatically highlights emails containing keywords related to robotics talks.
*   **Customizable Keywords:** Allows users to define and modify the keywords used for highlighting.
*   **Header Button:** Adds a button to the Gmail header for easy access to settings.
*   **Email Action:** Adds an action to individual emails to manually highlight them as robotics talks.
*   **Backend API:** Provides API endpoints for managing keywords and retrieving highlighted emails.

## Installation

To install the Robotics Talk Highlighter feature:

1.  Copy the backend code to `data/features/robotics-talk-highlighter/backend.js`.
2.  Copy the frontend code to `data/features/robotics-talk-highlighter/frontend.js`.
3.  Restart the Gmail plugin server.

## Usage

1.  After installation and server restart, the "Robotics Talks" button will appear in the Gmail header.
2.  Clicking the "Robotics Talks" button will open a settings modal where you can view and modify the keywords used for highlighting.
3.  To add new keywords, enter them in the "New Keywords (comma-separated)" field and click "Save".
4.  Emails matching the defined keywords will be automatically highlighted with a yellow border.
5.  You can also manually highlight an email by selecting the "Highlight Robotics Talk" action from the email's context menu.

## API Endpoints

### 1. Highlight Emails

*   **Endpoint:** `POST /api/robotics-talk-highlighter/highlight-emails`
*   **Description:** Triggers the email highlighting process.  This will re-evaluate all emails in the 'priority_emails' collection and flag them as robotics talks if they match the keywords.
*   **Request Body:** None
*   **Response:**

    *   **Success:**
        ```json
        {
            "success": true,
            "message": "Emails highlighted successfully"
        }
        ```
    *   **Error:**
        ```json
        {
            "success": false,
            "error": "Failed to highlight emails"
        }
        ```

### 2. Get Highlighted Emails

*   **Endpoint:** `GET /api/robotics-talk-highlighter/get-highlighted-emails`
*   **Description:** Retrieves a list of emails that have been highlighted as robotics talks.
*   **Request Body:** None
*   **Response:**

    *   **Success:**
        ```json
        {
            "success": true,
            "data": [
                {
                    "senderName": "Robotics Conference",
                    "senderEmail": "info@roboticsconf.com",
                    "subject": "Call for Papers: Robotics Conference 2024",
                    "date": "Oct 26",
                    "categories": [],
                    "from": "Robotics Conference <info@roboticsconf.com>",
                    "isRoboticsTalk": true
                },
                {
                    "senderName": "AI Seminar",
                    "senderEmail": "seminars@ai.org",
                    "subject": "AI and Robotics Seminar",
                    "date": "Oct 27",
                    "categories": [],
                    "from": "AI Seminar <seminars@ai.org>",
                    "isRoboticsTalk": true
                }
            ]
        }
        ```
    *   **Error:**
        ```json
        {
            "success": false,
            "error": "Failed to fetch highlighted emails"
        }
        ```

### 3. Keywords (Example - Not in original code, but should be)

*   **Endpoint:** `GET /api/robotics-talk-highlighter/keywords`
*   **Description:** Retrieves the current list of keywords used for highlighting.
*   **Request Body:** None
*   **Response:**

    *   **Success:**
        ```json
        {
            "success": true,
            "keywords": ["robotics", "robot", "automation", "AI", "motion planning", "SLAM", "computer vision", "ROS", "sensors", "actuators"]
        }
        ```
    *   **Error:**
        ```json
        {
            "success": false,
            "error": "Failed to load keywords"
        }
        ```

*   **Endpoint:** `POST /api/robotics-talk-highlighter/keywords`
*   **Description:** Updates the list of keywords used for highlighting.
*   **Request Body:**
    ```json
    {
        "keywords": ["robotics", "robot", "automation", "AI", "new keyword"]
    }
    ```
*   **Response:**

    *   **Success:**
        ```json
        {
            "success": true,
            "message": "Keywords saved successfully!"
        }
        ```
    *   **Error:**
        ```json
        {
            "success": false,
            "error": "Failed to save keywords"
        }
        ```

## UI Components

*   **"Robotics Talks" Header Button:** A button added to the Gmail header that opens the settings modal.
*   **Settings Modal:** A modal window that displays the current keywords and allows users to add new ones.
*   **Email Highlighting:** Emails identified as robotics talks are highlighted with a yellow border.
*   **"Highlight Robotics Talk" Email Action:** An action added to individual emails that allows users to manually highlight them.

## Troubleshooting

*   **Emails are not being highlighted:**
    *   Ensure that the backend and frontend code are correctly installed in the `data/features/robotics-talk-highlighter/` directory.
    *   Verify that the server has been restarted after installation.
    *   Check the server logs for any errors related to the Robotics Talk Highlighter.
    *   Make sure the keywords are relevant to the emails you expect to be highlighted.
    *   Confirm that the `priority_emails` collection in MongoDB contains the emails you are expecting to be highlighted.
*   **Settings modal is not opening:**
    *   Check the browser's developer console for any JavaScript errors.
    *   Ensure that the `EmailAssistant` API is available and properly initialized.
*   **Keywords are not being saved:**
    *   Verify that the API endpoints are correctly configured and accessible.
    *   Check the server logs for any errors related to saving keywords.
    *   Ensure that the user has the necessary permissions to modify the keywords.
*   **Manual highlighting is not working:**
    *   Ensure that the email item is correctly identified by the frontend code.
    *   Check the browser's developer console for any JavaScript errors.