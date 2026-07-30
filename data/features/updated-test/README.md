# Updated Test

A minimal frontend-only Gmail Plugin feature that adds a header button used to verify plugin updates are loading correctly.

## What it does

- Adds a button labeled **"updated-test"** to the top header action bar of the UI.
- When the button is clicked, a popup (modal) appears with the message:

  > claude-test

## Files

- `manifest.json` — Feature metadata (id: `updated-test`, frontend-only, no permissions).
- `frontend.js` — Registers the header button and shows the popup on click.

## How it works

The feature runs entirely in the browser. On load it uses the `window.EmailAssistant`
API to:

1. `addHeaderButton('updated-test', ...)` — inserts the button into the header
   action bar (`#feature-header-actions`).
2. `showModal(content, 'Updated Test')` — displays the popup message when the
   button is clicked.

## Installation

Copy the `updated-test` folder into the plugin's `data/features/` directory:

```
data/features/updated-test/
  ├── manifest.json
  ├── frontend.js
  └── README.md
```

Then reload the app. The **"updated-test"** button will appear in the header.

## Permissions

None. This feature has no backend and does not read or modify any email data.
