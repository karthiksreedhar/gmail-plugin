# Test Button

**Feature ID:** `test-button`

## Overview
Adds a button labeled **test** to the top (header) action bar of the Gmail Plugin UI. When the button is clicked, a popup (modal) appears displaying the message **"Feature test"**.

## Files
- `manifest.json` — Feature metadata and registration.
- `frontend.js` — Adds the header button and shows the popup on click.

There is no backend component; this is a frontend-only feature.

## How It Works
1. On load, the frontend script verifies that the `window.EmailAssistant` API is available.
2. It registers a header button via `API.addHeaderButton('test', ...)`, which inserts the button into the `feature-header-actions` container at the top of the UI.
3. When the button is clicked, `API.showModal()` displays a modal titled "Test" containing the message "Feature test".

## Installation
Place the feature folder (containing `manifest.json` and `frontend.js`) inside the `data/features/` directory of the Gmail Plugin. The system automatically scans this directory, reads the manifest, and serves the frontend script.

## Usage
- Open the Gmail Plugin UI.
- Click the **test** button in the header.
- A popup appears with the message **"Feature test"**. Close it via the `×` button or by clicking outside the modal.
