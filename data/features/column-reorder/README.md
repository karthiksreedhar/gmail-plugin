# Drag-and-Drop Column Reorder

**Feature ID:** `column-reorder`

Reorder the inbox layout columns by dragging them left-to-right. Grab any
column by its header and drop it before or after another column to change the
order. Your arrangement is remembered per user.

## What it does

When the multi-column inbox layout is active, the approved-email list is shown
as side-by-side columns (for example **Important & Unread**, **Starred**, and
**Drafts**). This feature turns each column's header into a drag handle so you
can rearrange the columns:

- A grip icon (`⠿`) and a "grab" cursor appear on each column header to show it
  is draggable.
- While dragging, a blue indicator shows whether the column will drop to the
  **left** or **right** of the column under the cursor.
- Drop to commit the new left-to-right order.
- The order is applied with CSS flex `order`, so it stays put even as the inbox
  re-renders (new emails, filter changes, drafts refresh, etc.).

## How ordering is remembered

Each column is identified by a stable key (its layout class, e.g.
`iust-col-primary`). The ordered list of keys is:

1. Saved to the backend per user (`GET`/`POST /api/column-reorder/order`,
   stored in the `column_reorder_data` collection keyed by user email).
2. Mirrored to `localStorage` so the saved order is applied instantly on the
   next load, before the backend responds.

Columns that appear but were never ordered are simply appended to the right;
columns that are temporarily absent (e.g. in a two-column mode) keep their saved
position for when they return.

## Files

- `manifest.json` — feature metadata and permissions.
- `backend.js` — two routes to load/save the per-user column order.
- `frontend.js` — drag-and-drop wiring, order application, and persistence.

## Notes & requirements

- This feature reorders whatever columns the inbox layout renders inside
  `#emailContainer` (the `.iust-top` flex row and its `.iust-col` children). It
  does not create columns itself — it relies on a multi-column inbox layout
  being active. With fewer than two columns present it stays dormant.
- It never reads or modifies your emails; it only changes column order and
  stores that order.
- Dragging is initiated from the column header only, so clicking email rows and
  buttons inside a column continues to work normally.
