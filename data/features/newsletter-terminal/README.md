# Newsletter Terminal

## Overview

The Newsletter Terminal feature provides a Bloomberg Terminal-like interface within your Gmail inbox, allowing you to quickly preview recent newsletters. It fetches and displays a list of newsletters, enabling you to view their content without opening each email individually.

## Features

*   **Newsletter Preview:** Displays a list of recent newsletters in a modal window.
*   **Bloomberg Terminal-like Interface:** Mimics the look and feel of a Bloomberg Terminal for a familiar user experience.
*   **Content Preview:** Allows you to view the content of each newsletter directly within the modal.
*   **Easy Access:** Adds a button to the Gmail header for quick access to the Newsletter Terminal.
*   **Customizable Search:** The backend can be configured to search for newsletters based on specific criteria (e.g., category, sender).

## Installation

1.  Copy the `newsletter-terminal` folder (containing the backend and frontend code) to the `data/features/` directory of your Gmail Plugin project.
2.  Restart the Gmail Plugin server. This ensures that the backend code is initialized and the frontend code is loaded.

## Usage

1.  After installation and server restart, a "Newsletter Terminal" button will appear in the Gmail header.
2.  Click the "Newsletter Terminal" button to open the modal window.
3.  The modal will display a list of recent newsletters, showing the subject, sender, and date.
4.  Click the "View" button next to a newsletter to see its content.
5.  A "Back to List" button is provided to return to the newsletter list.

## API Endpoints

### `GET /api/newsletter-terminal/recent-newsletters`

Fetches a list of recent newsletters from the user's inbox.

**Request:**

```
GET /api/newsletter-terminal/recent-newsletters
```

**Response (Success - 200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": "16asdf7890asdf7890",
      "threadId": "16asdf7890asdf7890",
      "subject": "Latest News from Example Corp",
      "from": "news@example.com",
      "date": "2024-10-27T10:00:00-07:00",
      "snippet": "Check out our latest product updates...",
      "body": "<html><body><h1>Latest News...</h1></body></html>"
    },
    {
      "id": "17bsdf7890bsdf7890",
      "threadId": "17bsdf7890bsdf7890",
      "subject": "Weekly Newsletter",
      "from": "newsletter@another.com",
      "date": "2024-10-26T18:00:00-07:00",
      "snippet": "This week's top stories...",
      "body": "<html><body><p>This week's top stories...</p></body></html>"
    }
  ]
}
```

**Response (No Newsletters Found - 200 OK):**

```json
{
  "success": true,
  "data": [],
  "message": "No newsletters found."
}
```

**Response (Error - 500 Internal Server Error):**

```json
{
  "success": false,
  "error": "Failed to fetch recent newsletters"
}
```

### `POST /api/newsletter-terminal/newsletter-content` (Note: This endpoint is not present in the provided backend code, but is referenced in the frontend.  A backend implementation is required for this to function.)

Fetches the content of a specific newsletter by its email ID.

**Request:**

```
POST /api/newsletter-terminal/newsletter-content
Content-Type: application/json

{
  "emailId": "16asdf7890asdf7890"
}
```

**Response (Success - 200 OK):**

```json
{
  "success": true,
  "data": {
    "body": "<html><body><h1>Latest News...</h1></body></html>"
  }
}
```

**Response (Error - 500 Internal Server Error):**

```json
{
  "success": false,
  "error": "Failed to load newsletter content"
}
```

## UI Components

*   **Header Button:** A "Newsletter Terminal" button is added to the Gmail header.  This button triggers the display of the newsletter list.
*   **Modal Window:** A modal window displays the list of newsletters and the content of individual newsletters. The modal includes:
    *   A title: "Newsletter Terminal"
    *   A list of newsletters with subject, sender, date, and a "View" button.
    *   The content of a selected newsletter.
    *   A "Back to List" button to return to the newsletter list.

## Troubleshooting

*   **Newsletter Terminal button not appearing:**
    *   Ensure that the `newsletter-terminal` folder is correctly placed in the `data/features/` directory.
    *   Verify that the Gmail Plugin server has been restarted after installation.
    *   Check the browser's developer console for any JavaScript errors that might be preventing the frontend from loading.
*   **No newsletters are displayed:**
    *   The default search query is `category:promotions`. Ensure that your newsletters are categorized as "promotions" or adjust the search query in the backend code (`searchQuery` variable in `app.get('/api/newsletter-terminal/recent-newsletters')`).
    *   Verify that your Gmail account has newsletters in the specified category.
*   **Error loading newsletters:**
    *   Check the server logs for any errors related to the API calls.
    *   Ensure that the Gmail API is properly configured and authorized for your Gmail Plugin.
*   **Newsletter content not loading:**
    *   The provided backend code does not include an endpoint for fetching newsletter content based on email ID. You will need to implement the `/api/newsletter-terminal/newsletter-content` endpoint to support this functionality.
    *   If the endpoint is implemented, verify that the `emailId` is being correctly passed to the backend and that the backend is correctly fetching and returning the email content.
*   **Styling issues:**
    *   The styling is basic.  You can customize the CSS within the frontend code to match your desired look and feel.