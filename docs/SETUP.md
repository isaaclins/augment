# Setup

Augment talks to Gmail with **your own** Google OAuth Desktop client. This is free
and takes ~5 minutes.

## 1. Google Cloud OAuth client

1. **Create or pick a project** — <https://console.cloud.google.com/projectcreate>.
2. **Enable the Gmail API** — APIs & Services → Library → search **"Gmail API"** →
   **Enable**. Direct link: <https://console.cloud.google.com/apis/library/gmail.googleapis.com>.
3. **Configure the OAuth consent screen** — APIs & Services → OAuth consent screen:
   - User type: **External**.
   - App name (e.g. *Augment*), your email as support + developer contact.
   - **Scopes:** leave empty — Augment requests `gmail.modify` at runtime.
   - **Test users:** add **your own Gmail address**. While the app is in *Testing*,
     only listed test users can sign in. You do not need to publish/verify the app
     for personal use.
4. **Create the OAuth client** — APIs & Services → Credentials → **Create credentials**
   → **OAuth client ID** → Application type: **Desktop app** → name it → **Create**.
   - A Desktop client automatically allows the loopback redirect
     (`http://127.0.0.1:<any-port>`), so there is nothing else to configure.
5. **Copy the Client ID and Client secret** into your `.env` (next step).

> **Testing-mode note.** Tokens issued to a *Testing* app expire quickly, but that is
> irrelevant here: Augment re-authenticates on every launch and never persists a
> refresh token, so there is no long-lived token to rot.

## 2. Environment variables

```bash
cp .env.example .env
```

```dotenv
# .env  (gitignored — never commit this)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

These are read by the Rust backend at runtime (via `dotenvy`) only to perform the
OAuth token exchange. They are never bundled into the app and never written
elsewhere. In `npm run tauri dev` the `.env` at the project root is picked up
automatically. For a **packaged build**, either launch from a shell that has these
vars exported, or place a `.env` next to the executable.

## 3. macOS notification permission

Notifications require a real `.app` bundle (a code-signed bundle identity). They
fire reliably from `Augment.app` (the build output). Under `npm run tauri dev` the
raw debug binary may not post Notification-Center banners — use the built app to
see them.
