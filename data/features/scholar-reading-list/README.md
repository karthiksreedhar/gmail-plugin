# Scholar Reading List

## Overview

The Scholar Reading List feature for Gmail allows users to create a curated reading list from Google Scholar articles found in their emails. It provides a convenient way to save articles for later reading and offers a summarization feature to quickly grasp the key takeaways of each paper, enabling efficient skimming before diving into the full content.

## Features

*   **Add Articles to Reading List:** Save Google Scholar articles directly from your emails to a dedicated reading list.
*   **Summarize Articles:** Generate concise summaries of article abstracts using a large language model (Gemini), highlighting the main contributions and key findings.
*   **View Reading List:** Access a dedicated modal displaying your saved articles with their summaries.
*   **Remove Articles:** Easily remove articles from your reading list.
*   **Email Integration:** Seamlessly integrates with Gmail through header buttons and email actions.

## Installation

To install the Scholar Reading List feature:

1.  Copy the backend code (provided in the `Backend Code` section) to a file named `scholar-reading-list.js` within your server's features directory (e.g., `data/features/`).
2.  Copy the frontend code (provided in the `Frontend Code` section) to a file named `scholar-reading-list.js` within your client's features directory.
3.  Restart your Gmail plugin server to activate the feature.

## Usage

1.  **Adding Articles:** When viewing an email containing a Google Scholar article, click the "Add to Reading List" action button. A modal will appear briefly, confirming the addition.
2.  **Viewing the Reading List:** Click the "Scholar Reading List" button in the Gmail header. A modal will display your saved articles, including their titles, authors, and summaries.
3.  **Removing Articles:** In the reading list modal, click the "Remove" button next to the article you want to remove.
4.  **Summarizing Articles:** The summarization is automatically triggered when adding an article to the reading list (if the article has an abstract available). The summary will be displayed in the reading list modal.

## API Endpoints

### GET `/api/scholar-reading-list/reading-list`

*   **Description:** Fetches the user's reading list.
*   **Request:** `GET /api/scholar-reading-list/reading-list`
*   **Response (Success):**

    ```json
    {
      "success": true,
      "data": [
        {
          "emailId": "12345",
          "subject": "Attention is All You Need",
          "from": "google-scholar@example.com",
          "summary": "- Introduced the Transformer model.\n- Relies entirely on attention mechanisms.\n- Achieves state-of-the-art results in machine translation."
        },
        {
          "emailId": "67890",
          "subject": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
          "from": "google-scholar@example.com",
          "summary": "- Presents BERT, a new language representation model.\n- Uses bidirectional Transformers for pre-training.\n- Achieves new state-of-the-art results on a wide range of NLP tasks."
        }
      ]
    }
    ```

*   **Response (Error):**

    ```json
    {
      "success": false,
      "error": "Failed to load reading list"
    }
    ```

### POST `/api/scholar-reading-list/add-article`

*   **Description:** Adds an article to the user's reading list.
*   **Request:** `POST /api/scholar-reading-list/add-article`

    ```json
    {
      "article": {
        "emailId": "12345",
        "subject": "Attention is All You Need",
        "from": "google-scholar@example.com",
        "abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing of these models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms. The Transformer allows for significantly more parallelization and can reach a new state of the art in translation quality after being trained for as little as twelve hours on eight P100 GPUs."
      }
    }
    ```

*   **Response (Success):**

    ```json
    {
      "success": true,
      "message": "Article added to reading list"
    }
    ```

*   **Response (Error - Article Required):**

    ```json
    {
      "success": false,
      "error": "Article is required"
    }
    ```

*   **Response (Error - Article Already Exists):**

    ```json
    {
      "success": false,
      "error": "Article already exists in reading list"
    }
    ```

*   **Response (Error - General Failure):**

    ```json
    {
      "success": false,
      "error": "Failed to add article to reading list"
    }
    ```

### POST `/api/scholar-reading-list/remove-article`

*   **Description:** Removes an article from the user's reading list.
*   **Request:** `POST /api/scholar-reading-list/remove-article`

    ```json
    {
      "article": {
        "emailId": "12345",
        "subject": "Attention is All You Need",
        "from": "google-scholar@example.com"
      }
    }
    ```

*   **Response (Success):**

    ```json
    {
      "success": true,
      "message": "Article removed from reading list"
    }
    ```

*   **Response (Error - Article Required):**

    ```json
    {
      "success": false,
      "error": "Article is required"
    }
    ```

*   **Response (Error - General Failure):**

    ```json
    {
      "success": false,
      "error": "Failed to remove article from reading list"
    }
    ```

### POST `/api/scholar-reading-list/summarize-article`

*   **Description:** Summarizes the abstract of a given article.
*   **Request:** `POST /api/scholar-reading-list/summarize-article`

    ```json
    {
      "article": {
        "abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing of these models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms. The Transformer allows for significantly more parallelization and can reach a new state of the art in translation quality after being trained for as little as twelve hours on eight P100 GPUs."
      }
    }
    ```

*   **Response (Success):**

    ```json
    {
      "success": true,
      "data": {
        "summary": "- Introduced the Transformer model.\n- Relies entirely on attention mechanisms.\n- Achieves state-of-the-art results in machine translation."
      }
    }
    ```

*   **Response (Error - Article and Abstract Required):**

    ```json
    {
      "success": false,
      "error": "Article and abstract are required"
    }
    ```

*   **Response (Error - General Failure):**

    ```json
    {
      "success": false,
      "error": "Failed to summarize article"
    }
    ```

## UI Components

*   **Header Button:** A button labeled "Scholar Reading List" is added to the Gmail header. Clicking this button opens the reading list modal.
*   **Email Action:** An action button labeled "Add to Reading List" is added to each email. Clicking this button adds the article (if it's a Google Scholar article) to the reading list.
*   **Reading List Modal:** A modal window displays the user's reading list, including the title, author, and summary of each article, along with a "Remove" button for each entry.

## Troubleshooting

*   **Feature Not Loading:**
    *   Ensure that both the backend and frontend code are correctly placed in their respective `features` directories.
    *   Verify that the server has been restarted after installing the feature.
    *   Check the server logs for any error messages related to the Scholar Reading List feature.
*   **"Add to Reading List" Button Not Appearing:**
    *   Make sure the frontend code is correctly loaded and initialized.
    *   Verify that the `EmailAssistant` API is available.
*   **Reading List Modal Empty:**
    *   Ensure that you have added articles to your reading list.
    *   Check the server logs for any errors when fetching the reading list.
*   **Article Summary Not Available:**
    *   The article may not have an abstract available. The summarization feature relies on the article's abstract.
    *   There may be an issue with the Gemini API. Check the server logs for any errors related to the summarization process.
*   **Errors in Console:**
    *   Open the browser's developer console to check for any JavaScript errors related to the Scholar Reading List feature. These errors can provide valuable clues for troubleshooting.