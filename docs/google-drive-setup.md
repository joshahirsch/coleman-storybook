# Google Drive storage — one-time setup

This is the setup that makes `STORAGE_DRIVER="drive"` work (see
`src/lib/storage/google-drive-adapter.ts` for what it does and why). It's a
one-time, ~10 minute process in Google Cloud Console using your own
`josh.hirsch@gmail.com` account — nothing here can be done on your behalf
without your login, so this is written as a checklist for you to run
through yourself. When you're done you'll have 4 values to add as Vercel
environment variables (same pattern as the Supabase setup).

**Why this exists**: cheaper storage at your existing Google One tier
instead of paying for Supabase Storage separately, and it puts recordings
somewhere a future backend transcription script can read directly. The app
only ever gets access to files it creates itself (the `drive.file` scope,
the most restrictive Drive scope there is) — never your personal Drive,
Photos, or anything else in your account.

## 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/), signed in as `josh.hirsch@gmail.com`.
2. Top bar → project dropdown → **New Project**.
3. Name it something like `Coleman Storybook`. Create.
4. Make sure the new project is selected in the top bar before continuing.

## 2. Enable the Google Drive API

1. Left menu (or search bar) → **APIs & Services** → **Library**.
2. Search "Google Drive API" → open it → **Enable**.

## 3. Configure the OAuth consent screen

1. **APIs & Services** → **OAuth consent screen**.
2. User Type: **External** → Create.
3. App name: `Coleman Storybook`. User support email: `josh.hirsch@gmail.com`. Developer contact email: `josh.hirsch@gmail.com`. Save and continue.
4. **Scopes** step → **Add or Remove Scopes** → manually paste this scope and add it:
   ```
   https://www.googleapis.com/auth/drive.file
   ```
   Save and continue.
5. **Test users** step → add `josh.hirsch@gmail.com` → Save and continue.
6. Back on the OAuth consent screen's summary page, click **Publish App** to move it from "Testing" to **"In production."**

   **This step matters — don't skip it.** `drive.file` is a "non-sensitive"
   scope, so publishing does NOT trigger Google's manual verification
   review (no waiting, no app review process) — it just requires this one
   click. But if you leave the app in "Testing" status, the refresh token
   you mint in step 5 below will silently stop working after 7 days,
   which would look like the integration randomly breaking a week from now
   with no obvious cause. You may see a one-time "unverified app" warning
   screen when you authorize in step 5 — that's expected for an app that
   hasn't gone through Google's optional branding verification, and is
   fine to click through for your own app.

## 4. Create an OAuth Client ID

1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. Name: `Coleman Storybook Drive`.
4. Under **Authorized redirect URIs**, add exactly:
   ```
   https://developers.google.com/oauthplayground
   ```
5. Create. A dialog shows your **Client ID** and **Client Secret** — copy both somewhere safe for now (step 6 needs them, and step 7 needs them again for Vercel).

## 5. Mint a refresh token (via Google's OAuth Playground)

This is the one-time consent grant that lets the app act on your Drive going forward without asking again.

1. Go to [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground/).
2. Click the gear icon (top right) → check **"Use your own OAuth credentials"** → paste the Client ID and Client Secret from step 4 → close the settings panel.
3. In the left panel's input box (labeled "Input your own scopes"), paste:
   ```
   https://www.googleapis.com/auth/drive.file
   ```
   → **Authorize APIs**.
4. Sign in as `josh.hirsch@gmail.com`. If you see an "unverified app" screen, click **Advanced** → **Go to Coleman Storybook (unsafe)** — this is expected, see the note in step 3 above. Click **Allow**.
5. You're redirected back to the Playground with an authorization code already filled in. Click **Exchange authorization code for tokens**.
6. Copy the **Refresh token** value shown — this is `GOOGLE_DRIVE_REFRESH_TOKEN`.

## 6. Create the root Drive folder

1. In [drive.google.com](https://drive.google.com/), create a new folder — e.g. `Coleman Storybook Media`. This is where every uploaded recording will live.
2. Open the folder. Its URL looks like `https://drive.google.com/drive/folders/<FOLDER_ID>` — copy the `<FOLDER_ID>` part. That's `GOOGLE_DRIVE_ROOT_FOLDER_ID`.

## 7. What you'll have at the end

Four values, ready to add to Vercel exactly like the Supabase ones were:

| Vercel env var | Where it came from |
|---|---|
| `GOOGLE_DRIVE_CLIENT_ID` | Step 4 |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Step 4 |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Step 5 |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Step 6 |

Tell me when you have these and I'll walk through adding them to Vercel, running the one-time migration of your existing 6 videos from Supabase to Drive, and flipping `STORAGE_DRIVER` to `"drive"` for the cutover.
