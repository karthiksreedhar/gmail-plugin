# Column Controls: Reorder & Minimize

**Feature ID:** `column-reorder`

Adds two controls to the multi-column inbox layout columns: **reorder** them by
dragging, and **minimize/expand** each one individually. Your arrangement and
which columns are collapsed are remembered per user.

## What it does

When the multi-column inbox layout is active, the approved-email list is shown
as side-by-side columns (for example **Important & Unread**, **Starred**, and
**Drafts**).

### Reorder (drag and drop)
- A grip icon (`⠿`) and a "grab" cursor appear on each column header.
- Grab a column by its header and drag it over another column; a blue indicator
  shows whether it will drop to the **left** or **right**.
- Drop to commit the new left-to-right order.

### Minimize / expand
- Each column header has a small toggle button in its top-right corner
  (**–** to minimize, **+** to expand).
- Minimizing collapses the column to a thin vertical strip: its body is hidden
  and its label rotates so you can still tell which column it is. The remaining
  columns expand to use the freed space.
- Click the **+** button — or anywhere on a minimized column's strip — to expand
  it again.

The order is applied with CSS flex `order` and the minimized state with a CSS
class, so both survive the inbox's frequent re-renders (new emails, filter
changes, drafts refresh, etc.).

## How preferences are remembered

Each column is identified by a stable key (its layout class, e.g.
`iust-col-primary`). The layout state is:

1. Saved to the backend per user (`GET`/`POST /api/column-reorder/state`,
   stored in the `column_reorder_data` collection keyed by user email) as
   `{ order: [...], minimized: [...] }`.
2. Mirrored to `localStorage` so the saved state is applied instantly on the
   next load, before the backend responds.

Columns that appear but were never arranged are appended to the right and shown
expanded; columns that are temporarily absent keep their saved position and
minimized state for when they return.

## Files

- `manifest.json` — feature metadata and permissions.
- `backend.js` — two routes to load/save the per-user column state.
- `frontend.js` — drag-and-drop reordering, minimize/expand toggles, layout
  application, and persistence.

## Notes & requirements

- This feature operates on whatever columns the inbox layout renders inside
  `#emailContainer` (the `.iust-top` flex row and its `.iust-col` children). It
  does not create columns itself — it relies on a multi-column inbox layout
  being active.
- It never reads or modifies your emails; it only changes column order/visibility
  and stores those preferences.
- Dragging is initiated from the column header only, and the minimize toggle
  stops click/drag propagation, so clicking email rows and buttons inside a
  column continues to work normally.
