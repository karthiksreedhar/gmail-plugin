# Important + Unread / Starred Layout (Standard / Two Col / Three Col)

**Feature ID:** `important-starred-two-column`
**Type:** Frontend only (layout + a read-only drafts list fetch — no data changes)

## What it does

Adds a **"▤ Layout"** button to the header that opens a small menu with three
modes (the current one is check-marked):

- **Standard** — the app's native single stacked email list; the feature stays
  completely inert.
- **Two Col** — the original two-column layout:

  | Left column | Right column |
  | --- | --- |
  | **❗ Important & Unread** — emails that are *important* **or** *unread* | **⭐ Starred** — all *starred* emails |

  Any remaining emails (read, not important, not starred) are shown in a
  full-width **"Everything else"** section **below** the columns, so nothing is
  ever hidden.
- **Three Col** — same as Two Col plus a third **📝 Drafts** column listing
  your saved drafts (from `GET /api/drafts`, refreshed every 30s). Clicking a
  draft opens it in the compose window, prefilled, exactly like the native
  drafts view — saving updates the same draft.

## How an email is placed

Each email lands in exactly one place (no card is duplicated). The rules are
applied in this order:

1. If the email is **Starred** → Starred column (this honors "all the starred
   stuff" — starred emails always go here, even if they're also important or
   unread).
2. Else if the email is **Important** *or* **Unread** → Important & Unread
   column.
3. Otherwise → "Everything else" (full-width, below).

Emails keep the app's normal newest-first ordering inside each group.

## Behavior notes

- **Emails are never touched.** The feature never fetches, edits, deletes or
  re-classifies any email. It reads each email's `isImportant` / `isStarred` /
  `isUnread` flags and physically **moves the row nodes the app already
  rendered** (it never clones them), so opening a thread, the delete/archive
  buttons, notes previews and the "recently added" highlight all keep working
  exactly as before. The drafts column is the only part that fetches data, and
  that call is read-only.
- **Respects filters & search.** Only the rows currently on screen are
  re-arranged, so the active category filter or search results are preserved.
- **Stays in sync.** The app re-renders the list on approvals, filter changes
  and refreshes (and does not emit an `emailsLoaded` event), so the feature
  wraps `displayEmails()` and runs a lightweight periodic check to re-flow the
  columns after every render.
- **Empty columns.** If a column has no items it shows a small placeholder so
  the column shape stays stable. If *both* email columns would be empty (only
  "everything else" emails exist), the feature leaves the app's native single
  list untouched.
- **Responsive.** On narrow screens (≤ 768px) the columns stack vertically; in
  Three Col mode the columns start wrapping below 1000px.

## Mode selection & persistence

The selected mode is remembered in `localStorage` (key
`importantUnreadStarredLayoutMode`). The old on/off boolean from the
two-column version (`importantUnreadStarredTwoColEnabled`) is migrated
automatically: `true` → Two Col, `false` → Standard. The default is Two Col.

## Files

- `manifest.json` — feature metadata (frontend-only).
- `frontend.js` — the entire implementation (IIFE, no globals leaked besides a
  one-time init guard).
