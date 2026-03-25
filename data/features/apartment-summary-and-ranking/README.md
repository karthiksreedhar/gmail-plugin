# Apartment Email Summary and Ranking

## Overview

This feature provides a summary of apartment listings found within the 'Apartments' folder in your Gmail. It analyzes the emails, ranks the apartments by price (lowest to highest), and summarizes neighborhood availability based on the email content. This allows users to quickly assess and compare apartment options without manually reviewing each email.

## Features

*   **Email Categorization:** Automatically identifies and processes emails categorized as "Apartments".
*   **Price Ranking:** Ranks apartment listings by price, from lowest to highest.
*   **Neighborhood Summary:** Provides a summary of apartment availability in different neighborhoods.
*   **AI-Powered Analysis:** Uses AI (Gemini) to extract relevant information from email content.
*   **User-Friendly Interface:** Presents the summary in a clear and concise modal window.
*   **Error Handling:** Gracefully handles errors, including token limits and API failures.
*   **Batch Processing:** Processes emails in batches to handle large volumes and avoid rate limits.

## Installation

To install this feature:

1.  Copy the backend code (provided in the `Backend Code` section) to a file named `apartment-summary-and-ranking.js` within the `data/features/` directory of your EmailAssistant installation.
2.  Copy the frontend code (provided in the `Frontend Code` section) to a file named `apartment-summary-and-ranking.js` within the `data/features/` directory of your EmailAssistant installation.
3.  Restart the EmailAssistant server.

## Usage

After installation and server restart, a button labeled "Apartment Summary" will appear in the header of the EmailAssistant interface.

1.  Ensure that your apartment listing emails are categorized under the "Apartments" category.
2.  Click the "Apartment Summary" button.
3.  A modal window will appear, displaying the apartment summary, including price ranking and neighborhood availability.

## API Endpoints

### `GET /api/apartment-summary-and-ranking/summary`

**Description:** Fetches the apartment summary and ranking data.

**Request:**

```
GET /api/apartment-summary-and-ranking/summary
```

**Response (Success):**

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalEmails": 55,
      "totalBatches": 2,
      "results": [
        {
          "batch": 1,
          "result": "{\n  \"rankedApartments\": [\n    {\n      \"neighborhood\": \"Downtown\",\n      \"price\": \"$1500\",\n      \"details\": \"1 bedroom, 1 bath\"\n    },\n    {\n      \"neighborhood\": \"Uptown\",\n      \"price\": \"$1800\",\n      \"details\": \"2 bedroom, 1 bath\"\n    }\n  ],\n  \"neighborhoodAvailability\": {\n    \"Downtown\": \"Several listings available\",\n    \"Uptown\": \"Limited availability\"\n  }\n}",
          "emailCount": 30
        },
        {
          "batch": 2,
          "result": "{\n  \"rankedApartments\": [\n    {\n      \"neighborhood\": \"Midtown\",\n      \"price\": \"$2000\",\n      \"details\": \"2 bedroom, 2 bath\"\n    }\n  ],\n  \"neighborhoodAvailability\": {\n    \"Midtown\": \"Few listings available\"\n  }\n}",
          "emailCount": 25
        }
      ],
      "successfulBatches": 2
    }
  }
}
```

**Response (No Apartment Emails):**

```json
{
  "success": true,
  "data": {
    "summary": "No apartment emails found in the Apartments category."
  }
}
```

**Response (Error):**

```json
{
  "success": false,
  "error": "An error occurred while processing the request."
}
```

## UI Components

*   **Header Button:** A button labeled "Apartment Summary" is added to the header of the EmailAssistant interface. Clicking this button triggers the display of the apartment summary modal.
*   **Modal Window:** A modal window displays the apartment summary, including price ranking and neighborhood availability.  The modal includes a close button.

## Troubleshooting

*   **No Apartment Summary Button:**
    *   Ensure that the feature files (`apartment-summary-and-ranking.js`) are correctly placed in the `data/features/` directory.
    *   Verify that the EmailAssistant server has been restarted after installing the feature.
    *   Check the browser's developer console for any JavaScript errors related to the feature.
*   **"Failed to fetch apartment summary" Error:**
    *   Check the EmailAssistant server logs for any errors related to the API endpoint.
    *   Verify that the Gemini API key is correctly configured and that the API is accessible.
    *   Ensure that the user has emails categorized under the "Apartments" category.
*   **Inaccurate or Incomplete Summary:**
    *   The accuracy of the summary depends on the quality and consistency of the email content.
    *   The AI model may not be able to extract information from all email formats.
    *   Consider refining the AI prompt in the backend code to improve accuracy.
*   **Token Limit Errors:**
    *   The Gemini API has token limits. The backend code includes logic to handle token limit errors by processing emails in smaller batches.
    *   If you continue to encounter token limit errors, consider reducing the number of emails processed or simplifying the AI prompt.
*   **Rate Limiting:**
    *   The backend code includes a delay between batches to avoid rate limits. If you encounter rate limiting errors, increase the delay.