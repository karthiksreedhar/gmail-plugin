# Drafts Column

**Feature ID:** `drafts-column`
**Type:** Frontend only (pure UI layout — no backend added, no data changed on load)

## What it does

Adds a persistent **third column** to the inbox, on the right-hand side, that
lists **all of your drafts**.

The app's main area is a flex row:

| Column 1 | Column 2 | **Column 3 (this feature)** |
| --- | --- | --- |
| Left sidebar (categories / people) | Email list + thread / reply / response pane | **📝 Drafts** — every saved draft |

Because the column is a sibling of the email content area (not inside it), it
**stays visible** while you browse the inbox, open a thread, or work on the
Reply / Response pages.

## Where the drafts come from

It reads the app's existing drafts API — **no new backend is added**:

- `GET /api/drafts` — list drafts (both app-saved and Gmail-imported)
- `DELETE /api/drafts/:id` — delete a single draft

Each draft card shows a red **Draft** marker, the recipient (`To: …`), the
subject, a one-line body snippet, the last-updated date, and a **Gmail** badge
for drafts imported via **Load from Gmail**.

## Interactions

- **Click a draft card** → opens it in the app's composer, prefilled (To / Cc /
  Bcc / Subject / Body). The composer is linked back to that draft, so
  **Save as Draft** updates the same draft and **Send** clears it — matching the
  behavior of the app's own Drafts view.
- **Trash icon** on a card → deletes that draft (after a confirmation), then the
  column refreshes. For Gmail-imported drafts this only removes it from the app,
  not from Gmail.
- **Refresh icon** in the column header → re-fetches the drafts on demand.
- **Header toggle button** ("📝 Drafts Column: On/Off") → shows / hides the
  whole column.

## Behavior notes

- **Stays in sync.** The app doesn't emit an event when a draft is saved or
  sent, so the column polls every few seconds and **only re-renders when the
  draft list actually changes**, so it never interrupts a click, hover or
  scroll. Scroll position is preserved across refreshes.
- **Non-destructive on load.** The feature never creates or edits drafts on its
  own — it only lists them, opens them in the existing composer, or deletes the
  one you explicitly choose.
- **Self-contained.** All rendering, HTML-escaping and date formatting live in
  the feature; it doesn't rely on the app's internal helpers except the global
  `openComposeEmail()` used to open a draft for editing.
- **Responsive.** The column is 330px wide and narrows on smaller screens
  (270px ≤ 1200px, 220px ≤ 900px).

## Toggle & persistence

The **"📝 Drafts Column: On/Off"** button is added to the header bar. The choice
is remembered in `localStorage` (key `draftsColumnEnabled`) across reloads. The
column is **on** by default.

## Files

- `manifest.json` — feature metadata (frontend-only).
- `frontend.js` — the entire implementation (IIFE, guarded against double-load,
  no globals leaked besides a one-time init guard).
