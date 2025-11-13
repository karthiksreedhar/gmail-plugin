# Switch the Gmail Plugin to Lydia (lc3251@columbia.edu) — TERMINAL ONLY (QUICK PASTE ONLY)

Follow these steps on Lydia’s Mac using only the Terminal. Copy/paste exactly as shown.

Service URL: https://gmail-plugin.onrender.com

What you will do:
1) Download the Google “OAuth client” JSON and set required URLs (if needed).
2) Upload that JSON to the server with a single curl “quick paste” (no temp files).
3) Tell the server to switch to Lydia.
4) Open a link to sign in with Lydia’s Google account (one time).
5) Set Lydia’s “From” address (if different from lc3251@columbia.edu).
6) Verify.

Important:
- You will NOT paste any personal passwords here. The Google sign‑in happens on Google’s website.
- Keep quotes exactly as shown. Do not use “smart quotes”.

---

## 0) Get the Google OAuth Client JSON (and set the required redirect/origin)

A) Download the OAuth client JSON
1) Open Chrome: https://console.cloud.google.com/apis/credentials  
2) Pick the correct project (example: “email-twin”).  
3) In the left menu, click “Credentials”.  
4) Under “OAuth 2.0 Client IDs”, click your Web Client (type = Web application).  
5) Click “DOWNLOAD JSON” (top/right). The file saves to your Downloads folder:  
   ~/Downloads/client_secret_XXXXXXXXXXXX-abcdefgh123456.apps.googleusercontent.com.json

B) Ensure the OAuth client has the required URLs (exactly)
- Authorized redirect URIs:
  - https://gmail-plugin.onrender.com/oauth2callback
- Authorized JavaScript origins:
  - https://gmail-plugin.onrender.com

If you changed anything, click Save, then re‑download the JSON (Step A).

---

## 1) Upload Lydia’s OAuth keys to the server (POST) — QUICK PASTE ONLY

This sends the request body to curl using a “here‑document” (no temp files to create).

1) Run this in Terminal (it will wait for you to paste):
```
curl -sS -X POST 'https://gmail-plugin.onrender.com/api/upload-oauth-keys' \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "userEmail": "lc3251@columbia.edu",
  "oauthKeys": PASTE_THE_ENTIRE_GOOGLE_JSON_HERE
}
JSON
```

2) After you run the command above, do this exactly:
- Open the downloaded Google file to view it:
  ```
  open -e ~/Downloads/client_secret_*.json
  ```
- Copy EVERYTHING from that file, from the very first “{” to the very last “}”.
- Click back into Terminal, place your cursor over the text:
  ```
  PASTE_THE_ENTIRE_GOOGLE_JSON_HERE
  ```
  and paste what you copied (this should REPLACE the placeholder completely).
- Press Enter to go to a new blank line, then press Control+D (Ctrl+D) to finish the paste and send the request.
  - If Ctrl+D doesn’t work, make sure your cursor is on a new blank line after the closing brace, then press Ctrl+D.

Expected success:
```
{"success":true,"message":"OAuth keys uploaded successfully for lc3251@columbia.edu", ...}
```

If you see “Cannot GET /api/upload-oauth-keys”, you tried to open the URL in a browser. This must be a POST via curl.

---

## 2) Tell the server to switch to Lydia (POST)

Run:
```
curl -sS -X POST 'https://gmail-plugin.onrender.com/api/switch-user' \
  -H 'Content-Type: application/json' \
  -d '{ "userEmail": "lc3251@columbia.edu" }'
```

Expected:
- JSON with `"currentUser": "lc3251@columbia.edu"`

---

## 3) Authorize Gmail for Lydia (one time)

Run this to open the consent screen in your default browser:
```
open 'https://gmail-plugin.onrender.com/api/auth/start'
```

In the browser that opens:
- Sign in with Lydia’s Google account.
- Click “Allow” for Gmail access.
- You will be redirected back to the site automatically (this saves tokens in the database).

---

## 4) Set Lydia’s “From” address (REQUIRED if different from lc3251@columbia.edu)

If Lydia sends mail from a different address (for example, an alias like lydia.chilton@columbia.edu), set it now.  
Important:
- This address must exist in Lydia’s Gmail “Send mail as” settings and be verified there (Gmail Settings → Accounts → “Send mail as”).  
- If it isn’t verified in Gmail, Google may reject or silently rewrite the From.

A) Set the sending email (replace with Lydia’s actual From address):
```
curl -sS -X POST 'https://gmail-plugin.onrender.com/api/set-sending-email' \
  -H 'Content-Type: application/json' \
  -d '{ "sendingEmail": "chilton@cs.columbia.edu" }'
```

B) Confirm it was applied:
```
curl -sS 'https://gmail-plugin.onrender.com/api/current-user'
```
You should see a field like:
```
"sendingEmail": "lydia_alias@columbia.edu"
```

Note: This setting is in-memory for the running service. If you want it to persist across service restarts, also set SENDING_EMAIL in Render’s Environment Variables (dashboard), but that is not required for day‑to‑day use.

---

## 5) Verify everything works

A) Check the active user:
```
curl -sS 'https://gmail-plugin.onrender.com/api/current-user'
```
You should see:
```
{
  "currentUser": "lc3251@columbia.edu",
  "sendingEmail": "lydia_alias@columbia.edu"   # or lc3251@columbia.edu if unchanged
  ...
}
```

B) Confirm Gmail access (requires the tokens you just saved):
```
curl -sS 'https://gmail-plugin.onrender.com/api/priority-today'
```
- If you see data (or a friendly JSON result), Gmail is connected.
- If you see a message indicating “needsAuth”, repeat Step 3 and finish the Google sign‑in.

---

## 6) Switch back to Karthik later (if needed)

Run:
```
curl -sS -X POST 'https://gmail-plugin.onrender.com/api/switch-user' \
  -H 'Content-Type: application/json' \
  -d '{ "userEmail": "ks4190@columbia.edu" }'
```

You can switch between users any time. Tokens are remembered in the database.

---

## Troubleshooting (Terminal only)

1) “redirect_uri_mismatch” on Google screen
- In Google Cloud → Credentials → your Web Client, ensure:
  - Authorized redirect URIs includes:
    ```
    https://gmail-plugin.onrender.com/oauth2callback
    ```
  - Authorized JavaScript origins includes:
    ```
    https://gmail-plugin.onrender.com
    ```
- Click Save. Re‑download the JSON, then repeat the upload step.

2) “Cannot GET /api/upload-oauth-keys”
- You tried to use a browser URL. That endpoint is POST‑only.
- Use the exact curl command in Step 1.

3) JSON errors during upload
- You must replace `PASTE_THE_ENTIRE_GOOGLE_JSON_HERE` with the entire Google JSON (including the outer `{ "web": { ... } }`), then press Enter, then Ctrl+D on a new blank line to finish.
- Confirm the downloaded file exists:
  ```
  ls ~/Downloads/client_secret_*.json
  ```

4) Sending email rejected or wrong From address
- Make sure Lydia’s desired From address is configured & verified in Gmail: Settings → Accounts → “Send mail as”.
- Re-run the Set Sending Email command with the exact address you want to use (Step 4A), then verify via /api/current-user (Step 4B).

5) Still stuck?
- Check who is active:
  ```
  curl -sS 'https://gmail-plugin.onrender.com/api/current-user'
  ```
- Try the auth link again:
  ```
  open 'https://gmail-plugin.onrender.com/api/auth/start'
  ```
- Send any error message to Karthik.
