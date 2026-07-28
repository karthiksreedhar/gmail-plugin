# Two-Column Email View

**Feature ID:** `two-column-view`
**Type:** Frontend-only (no backend, no LLM calls)

Re-arranges your approved email list into a two-column layout instead of one long
single column:

```
┌───────────────────────┬───────────────────────┐
│   ❗ Important (n)     │     ⭐ Starred (n)     │   <- two columns, side by side
│   [ email card ]      │     [ email card ]     │
│   [ email card ]      │     [ email card ]     │
├───────────────────────┴───────────────────────┤
│              📥 Everything else (n)            │   <- single full-width column
│              [ email card ]                    │
│              [ email card ]                    │
└────────────────────────────────────────────────┘
```

- **Left column** — emails whose category is **Important**
- **Right column** — emails whose category is **Starred**
- **Below (single full-width column)** — everything else

The feature only **re-positions** the existing email cards. It never changes,
deletes, or reorders your data — clicking a card still opens the email thread
exactly as before.

## How an email is placed

Placement is based on the category "pills" shown on each email card. Matching is
case-insensitive and uses a substring test:

- Card goes **left** if any category contains `important`
- Otherwise card goes **right** if any category contains `starred` (or `star`)
- Otherwise the card goes into **Everything else**

If a card is somehow tagged as both Important and Starred, Important (left) wins.

### Using different category names
If your categories are named differently, edit the keyword lists at the top of
`frontend.js`:

```js
const LEFT_KEYWORDS  = ['important'];         // -> left column
const RIGHT_KEYWORDS = ['starred', 'star'];   // -> right column
```

## Toggling the layout

A **"⚏ 2-Column: On / ☰ 2-Column: Off"** button is added to the header bar.
Click it to switch between the two-column layout and the normal single-column
list. Your choice is remembered (via `localStorage`) across page reloads.

## How it stays in sync

The email list is re-rendered by the app whenever you approve a new email,
change the category filter, refresh, or switch accounts. To keep the layout
correct, the feature re-applies itself:

1. On the `emailsLoaded`, `filterChanged`, `featureLoaded`, and `userChanged` events.
2. By wrapping the app's `displayEmails()` function (if present).
3. Through a lightweight background check (every ~0.8s) that only does work when
   newly rendered cards are detected — it is a no-op the rest of the time.

## Notes & caveats

- This feature relies on the standard email-card markup (`.email-item` cards with
  `.email-category` pills). It automatically targets the main **approved** email
  list and avoids the "new / pending approval" area.
- Responsive: on narrow screens (≤768px) the Important and Starred columns stack
  vertically so cards stay readable.
- No server-side code and no LLM usage, so there are no token/batching concerns.

## Files

| File           | Purpose                                             |
| -------------- | --------------------------------------------------- |
| `manifest.json`| Feature metadata (frontend-only).                   |
| `frontend.js`  | Layout logic, header toggle, and styling.           |
| `README.md`    | This document.                                      |
