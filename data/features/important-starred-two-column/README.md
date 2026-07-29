# Important + Unread / Starred Two-Column Layout

**Feature ID:** `important-starred-two-column`
**Type:** Frontend only (pure layout — no backend, no data changes)

## What it does

Replaces the single stacked email list on the main page with a **two-column
layout**:

| Left column | Right column |
| --- | --- |
| **❗ Important & Unread** — emails that are *important* **or** *unread* | **⭐ Starred** — all *starred* emails |

Any remaining emails (read, not important, not starred) are shown in a
full-width **"Everything else"** section **below** the two columns, so nothing
is ever hidden.

## How an email is placed

Each email lands in exactly one place (no card is duplicated). The rules are
applied in this order:

1. If the email is **Starred** → right column (this honors "all the starred
   stuff" — starred emails always go here, even if they're also important or
   unread).
2. Else if the email is **Important** *or* **Unread** → left column.
3. Otherwise → "Everything else" (full-width, below).

Emails keep the app's normal newest-first ordering inside each group.

## Behavior notes

- **Pure layout.** The feature never fetches, edits, deletes or re-classifies
  any email. It reads each email's `isImportant` / `isStarred` / `isUnread`
  flags and physically **moves the row nodes the app already rendered** (it
  never clones them), so opening a thread, the delete button, notes previews
  and the "recently added" highlight all keep working exactly as before.
- **Respects filters & search.** Only the rows currently on screen are
  re-arranged, so the active category filter or search results are preserved.
- **Stays in sync.** The app re-renders the list on approvals, filter changes
  and refreshes (and does not emit an `emailsLoaded` event), so the feature
  wraps `displayEmails()` and runs a lightweight periodic check to re-flow the
  columns after every render.
- **Empty columns.** If one column has no emails it shows a small
  "No emails here" placeholder so the two-column shape stays stable. If *both*
  columns would be empty (only "everything else" emails exist), the feature
  leaves the app's native single list untouched.
- **Responsive.** On narrow screens (≤ 768px) the two columns stack vertically.

## Toggle

A **"2-Column: On/Off"** button is added to the header bar. Turning it off
restores the app's native stacked list; the choice is remembered in
`localStorage` (key `importantUnreadStarredTwoColEnabled`) across reloads.
The layout is **on** by default.

## Files

- `manifest.json` — feature metadata (frontend-only).
- `frontend.js` — the entire layout implementation (IIFE, no globals leaked
  besides a one-time init guard).
