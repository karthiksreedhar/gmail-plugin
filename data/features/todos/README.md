# TODOs Feature

Adds a lightweight `TODOs:` line beneath each email's category pills automatically (no button click required).

## Behavior

- Scans visible emails in the main list.
- Resolves each email by ID.
- Extracts actionable TODO items from email content.
- Renders: `TODOs: <item 1> | <item 2> ...` directly under category pills.
- If none are found: `TODOs: None`.

## API

`POST /api/todos/extract-batch`

Request:

```json
{
  "emailIds": ["id1", "id2", "id3"]
}
```

Response:

```json
{
  "success": true,
  "todosByEmailId": {
    "id1": ["Review draft", "Send feedback by Friday"],
    "id2": []
  }
}
```

## Notes

- Uses per-user cache in Mongo collection `feature_todos_cache` to avoid repeated extraction.
- Falls back to heuristic extraction if model output is unavailable.
