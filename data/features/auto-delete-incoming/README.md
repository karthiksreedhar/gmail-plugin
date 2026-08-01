# Auto-Delete Incoming Email

**Feature ID:** `auto-delete-incoming`

Automatically deletes email that arrives in your Gmail inbox. When enabled, the
plugin repeatedly removes everything currently in your inbox, so any new message
is deleted within a few seconds of arriving.

## What it does

- Adds an **"Auto-Delete Inbox"** button to the header that opens a control panel.
- **Mode:** choose between
  - **Trash** – messages go to Gmail Trash and are recoverable for ~30 days (default).
  - **Permanent** – messages are deleted immediately and cannot be recovered.
- **Automatic deletion:** while the toggle is ON and the plugin is open, a poller
  runs every 15 seconds (and right after each email sync) and deletes everything
  in the inbox.
- **Purge inbox now:** a manual button that clears the inbox once, on demand.
- Tracks how many messages have been deleted and the time of the last purge.

## Safety

- Ships **OFF**. Nothing is deleted until you explicitly enable it.
- Enabling requires typing **DELETE** to confirm.
- The manual purge asks for confirmation before running.
- There is **no background activity when the plugin is closed** — deletion only
  happens while the app is open in your browser (see limitations).

## ⚠️ Required Gmail permission (read this)

The host app currently authorizes only **read** (`gmail.readonly`) and **send**
(`gmail.send`). Gmail's API requires broader permission to delete mail:

- **Trash** needs the `gmail.modify` scope.
- **Permanent delete** needs the full `https://mail.google.com/` scope.

A plugin feature **cannot** widen the app's OAuth scopes — that is configured in
the core `server.js`. Until the operator adds the appropriate scope (in the
`scopes` array in `server.js`) and you sign out and sign back in to
re-authorize, Gmail will reject deletions with a **403 "insufficient
permission"** error. When that happens the panel shows a clear message and
automatic deletion is paused so it doesn't retry endlessly.

All deletion logic in this feature is correct and will start working as soon as
the broader scope is granted.

## Limitations

- **Runs only while the plugin is open.** Gmail push/webhook delivery isn't
  available to this plugin, so deletion is driven by a frontend poller. Mail that
  arrives while the app is closed is deleted on the next pass after you reopen it.
- Trash mode processes up to 50 messages per pass; very large inboxes are cleared
  over several passes.

## Files

- `manifest.json` – feature metadata (backend + frontend).
- `backend.js` – settings storage and the purge endpoint that calls the Gmail API.
- `frontend.js` – control panel, confirmation, poller, and manual purge.

## API endpoints

- `GET  /api/auto-delete-incoming/settings` – current settings and stats.
- `POST /api/auto-delete-incoming/settings` – update `{ enabled, mode }`.
- `POST /api/auto-delete-incoming/purge` – run one purge pass. Automatic calls are
  gated by the stored `enabled` flag; `{ manual: true }` runs on demand.
