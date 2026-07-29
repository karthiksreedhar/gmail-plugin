# Important / Starred Two-Column Layout

**Feature ID:** `important-starred-two-column`
**Type:** Frontend-only (no backend, no LLM calls)

Re-arranges your approved email list into a two-column layout instead of one long
stacked list:

```
┌───────────────────────┬───────────────────────┐
│   ❗ Important (n)     │     ⭐ Starred (n)     │   <- two columns, side by side
│   [ email card ]      │     [ email card ]     │
│   [ email card ]      │     [ email card ]     │
├───────────────────────┴───────────────────────┤
│              Everything else (n)               │   <- single full-width column
│              [ email card ]                    │
│              [ email card ]                    │
└────────────────────────────────────────────────┘
```

- **Left column** — the **Important** section
- **Right column** — the **Starred** section
- **Below (single full-width column)** — **Everything else**

## How it works

The app already groups the approved list into three native sections —
**Important**, **Starred** and **Everything else** — based on each email's Gmail
`isImportant` / `isStarred` flags, and renders them stacked vertically inside
`#emailContainer`. This feature does **not** re-fetch, re-classify, reorder or
change any data. It simply **moves the existing section nodes** into a
two-column wrapper:

- The `Important` section moves into the left column.
- The `Starred` section moves into the right column.
- The `Everything else` section stays full width, below the two columns.

Because the actual DOM nodes are moved (never cloned), everything keeps working
exactly as before: clicking a card still opens the thread, the delete buttons
still work, and each section's collapse/expand toggle still works.

If a section has no emails (e.g. you have no starred mail), that column shows a
small "No emails here" placeholder so the two-column shape stays stable. If
neither Important nor Starred has any emails, the app renders a single flat list
and the feature leaves it untouched.

## Toggling the layout

A **"▩ 2-Column: On / ☰ 2-Column: Off"** button is added to the header bar.
Click it to switch between the two-column layout and the normal stacked list.
Your choice is remembered (via `localStorage`) across page reloads.

## How it stays in sync

The list is re-rendered by the app whenever you approve a new email, change the
category filter, or refresh. This app does **not** emit an `emailsLoaded` event,
so the feature keeps itself in sync by:

1. Wrapping the app's `displayEmails()` function so it re-flows right after each render.
2. Reacting to the `featureLoaded` event.
3. Running a lightweight background check (~every 0.8s) that only does work when
   newly rendered sections are detected — it is a no-op the rest of the time.

## Notes & caveats

- Placement uses the app's own Important / Starred / Everything else sections
  (driven by Gmail's `isImportant` / `isStarred` flags), so it matches exactly
  what the app already considers important and starred.
- Responsive: on narrow screens (≤768px) the Important and Starred columns stack
  vertically so cards stay readable.
- No server-side code and no LLM usage, so there are no token/batching concerns.

## Files

| File            | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `manifest.json` | Feature metadata (frontend-only).                   |
| `frontend.js`   | Layout logic, header toggle, and styling.           |
| `README.md`     | This document.                                      |
