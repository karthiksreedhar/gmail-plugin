# Newsletter Article Tracker

## Overview

The Newsletter Article Tracker is a Gmail plugin feature that allows users to easily track articles found within their newsletter subscriptions. It provides a convenient way to save and organize interesting articles for later reading or reference.

## Features

*   **Track Articles:** Save articles directly from your newsletters with a single click.
*   **Organize by Newsletter:** Articles are categorized by the newsletter they originated from.
*   **Add Notes:** Include personal notes or summaries for each tracked article.
*   **Centralized List:** View all your tracked articles in a dedicated modal.
*   **Edit Articles:** Modify the details of a tracked article, such as the title, link, or notes.
*   **Delete Articles:** Remove articles that are no longer relevant.

## Installation

1.  Copy the backend code to `data/features/newsletter-article-tracker/backend.js`.
2.  Copy the frontend code to `data/features/newsletter-article-tracker/frontend.js`.
3.  Restart the Gmail plugin server.

## Usage

1.  **Track an Article:** When viewing an email that contains an article you want to track, click the "Track Article" action in the email action menu.  You will be prompted to enter the newsletter name, article title, article link, and any notes you want to add.
2.  **View Tracked Articles:** Click the "Tracked Articles" button in the Gmail header to open a modal displaying a list of all your tracked articles.
3.  **Edit/Delete Articles:** Within the Tracked Articles modal, you can click on an article to view its details and have the option to edit or delete it.

## API Endpoints

All endpoints require authentication (user must be logged in).

### GET `/api/newsletter-article-tracker/articles`

*   **Description:** Retrieves all tracked articles for the current user.
*   **Request:** `GET /api/newsletter-article-tracker/articles`
*   **Response (Success - 200 OK):**

    ```json
    {
      "success": true,
      "data": [
        {
          "id": "1678886400000",
          "newsletter": "Towards Data Science",
          "articleTitle": "The Ultimate Guide to Data Visualization",
          "articleLink": "https://example.com/data-visualization",
          "notes": "Great overview of different visualization techniques.",
          "createdAt": "2023-03-15T10:00:00.000Z",
          "updatedAt": "2023-03-15T11:00:00.000Z"
        },
        {
          "id": "1678893600000",
          "newsletter": "Medium",
          "articleTitle": "Understanding Machine Learning Algorithms",
          "articleLink": "https://example.com/machine-learning",
          "notes": "Good explanation of common ML algorithms.",
          "createdAt": "2023-03-15T12:00:00.000Z"
        }
      ]
    }
    ```

*   **Response (Error - 500 Internal Server Error):**

    ```json
    {
      "success": false,
      "error": "Failed to load articles"
    }
    ```

### POST `/api/newsletter-article-tracker/articles`

*   **Description:** Adds a new tracked article for the current user.
*   **Request:** `POST /api/newsletter-article-tracker/articles`
*   **Request Body:**

    ```json
    {
      "newsletter": "Towards Data Science",
      "articleTitle": "The Future of AI",
      "articleLink": "https://example.com/future-of-ai",
      "notes": "Interesting predictions about AI development."
    }
    ```

*   **Response (Success - 200 OK):**

    ```json
    {
      "success": true,
      "message": "Article added",
      "data": {
        "id": "1678900800000",
        "newsletter": "Towards Data Science",
        "articleTitle": "The Future of AI",
        "articleLink": "https://example.com/future-of-ai",
        "notes": "Interesting predictions about AI development.",
        "createdAt": "2023-03-15T14:00:00.000Z"
      }
    }
    ```

*   **Response (Error - 400 Bad Request):**

    ```json
    {
      "success": false,
      "error": "Newsletter, article title, and article link are required"
    }
    ```

*   **Response (Error - 500 Internal Server Error):**

    ```json
    {
      "success": false,
      "error": "Failed to add article"
    }
    ```

### DELETE `/api/newsletter-article-tracker/articles/:articleId`

*   **Description:** Deletes a tracked article by its ID.
*   **Request:** `DELETE /api/newsletter-article-tracker/articles/1678886400000` (replace `1678886400000` with the actual article ID)
*   **Response (Success - 200 OK):**

    ```json
    {
      "success": true,
      "message": "Article deleted"
    }
    ```

*   **Response (Error - 500 Internal Server Error):**

    ```json
    {
      "success": false,
      "error": "Failed to delete article"
    }
    ```

### PUT `/api/newsletter-article-tracker/articles/:articleId`

*   **Description:** Updates a tracked article by its ID.
*   **Request:** `PUT /api/newsletter-article-tracker/articles/1678886400000` (replace `1678886400000` with the actual article ID)
*   **Request Body:**

    ```json
    {
      "newsletter": "Towards Data Science",
      "articleTitle": "Updated Title",
      "articleLink": "https://example.com/updated-link",
      "notes": "Updated notes."
    }
    ```

*   **Response (Success - 200 OK):**

    ```json
    {
      "success": true,
      "message": "Article updated",
      "data": {
        "id": "1678886400000",
        "newsletter": "Towards Data Science",
        "articleTitle": "Updated Title",
        "articleLink": "https://example.com/updated-link",
        "notes": "Updated notes.",
        "createdAt": "2023-03-15T10:00:00.000Z",
        "updatedAt": "2023-03-15T15:00:00.000Z"
      }
    }
    ```

*   **Response (Error - 404 Not Found):**

    ```json
    {
      "success": false,
      "error": "Article not found"
    }
    ```

*   **Response (Error - 500 Internal Server Error):**

    ```json
    {
      "success": false,
      "error": "Failed to update article"
    }
    ```

## UI Components

*   **Header Button:** A "Tracked Articles" button is added to the Gmail header. Clicking this button opens a modal displaying the list of tracked articles.
*   **Email Action:** A "Track Article" action is added to the email action menu. Clicking this action allows the user to track the article from the current email.
*   **Modal:** A modal window is used to display the list of tracked articles, as well as forms for adding/editing article details.

## Troubleshooting

*   **Feature Not Loading:**
    *   Ensure that both the backend and frontend code are correctly placed in the `data/features/newsletter-article-tracker/` directory.
    *   Verify that the Gmail plugin server has been restarted after installing the feature.
    *   Check the browser's developer console for any error messages related to the feature.
*   **API Calls Failing:**
    *   Confirm that the Gmail plugin server is running and accessible.
    *   Check the server logs for any errors related to the API endpoints.
    *   Ensure that the user is logged in when making API calls.
*   **Track Article Action Not Appearing:**
    *   Make sure the frontend script is correctly loaded and initialized.
    *   Check for any conflicts with other installed features.
*   **Modal Not Displaying Correctly:**
    *   Inspect the modal's HTML structure in the browser's developer tools to identify any styling issues.
    *   Ensure that the necessary CSS styles are being applied correctly.