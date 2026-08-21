# Spend Dashboard

Turns the receipts sitting in your inbox into a spending dashboard. It scans your
approved inbox emails for receipts, order confirmations, invoices and
subscription charges, extracts the amount / merchant / date / category from each,
and shows the results as totals, a monthly trend chart, a category breakdown, top
merchants and a full transaction table.

## What it does

- **Finds receipts automatically.** A keyword + sender heuristic first narrows
  your inbox down to receipt-like emails, so no time (or tokens) are wasted on
  regular mail.
- **Extracts structured data with Claude.** Candidate emails are sent to
  Anthropic Claude (via `invokeAnthropic`) in batches to pull out the merchant,
  grand-total amount, currency, date and a spend category. Anything that isn't a
  genuine purchase (marketing, shipping-only notices, coupons, balance alerts) is
  filtered out.
- **Aggregates your spending** into:
  - Total spend, transaction count, merchant count, category count
  - Spend by month (bar chart, window adapts to the selected period)
  - Spend by category
  - Top 12 merchants
  - A complete, date-sorted transaction table
- **Filters by time period.** A **Period** dropdown lets you view Last 30 days,
  Last 90 days, Last 6 months, Last 12 months, Year to date, or All time. Every
  number, chart and table updates to the selected window. Changing the period is
  instant — it re-filters the already-extracted transactions and never re-runs
  the LLM.
- **Caches results** per user so the dashboard opens instantly after the first
  run. It only re-runs the extraction when your receipt set changes or you press
  **Rescan inbox**.

## How to use it

1. Click the **Spend** button in the header. The dashboard opens in a new tab.
2. On first load it analyzes your receipts (this can take a moment). Later loads
   are served from cache.
3. Use the **Period** dropdown to filter by time duration (defaults to Last 12
   months).
4. Use **Rescan inbox** to force a fresh extraction after new receipts arrive.

## Categories

Each transaction is classified into one of: Food & Dining, Groceries, Shopping,
Travel, Transportation, Subscriptions, Utilities, Entertainment, Health, Other.

## Files

- `manifest.json` — feature metadata (id: `spend-dashboard`).
- `backend.js` — receipt detection, batched Claude extraction, aggregation,
  caching, the `/api/spend-dashboard/summary` API and the `/spend-dashboard`
  page.
- `frontend.js` — adds the **Spend** header button that opens the dashboard.

## Endpoints

- `GET /api/spend-dashboard/summary` — returns aggregated spend data.
  - `?range=` filters by period: `30d`, `90d`, `6m`, `12m` (default), `ytd`, `all`.
  - `?refresh=1` forces re-extraction.
- `GET /spend-dashboard` — the dashboard page.

## Notes & limits

- Processing is batched at 30 emails per LLM call, up to 5 batches (150 receipts
  max) to stay within token limits.
- Extracted data lives in the `spend_dashboard_data` MongoDB collection, keyed by
  user.
- If receipts span multiple currencies, amounts are summed and shown in your most
  common currency with an on-screen warning; convert manually for exact figures.
- Accuracy depends on the receipt emails themselves — the amount shown is the
  grand total the model could identify.
