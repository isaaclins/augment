# Architecture & Security

## Architecture

```
┌─────────────────────────── Tauri window (WKWebView) ───────────────────────────┐
│  React + TypeScript (strict)                                                    │
│    • Gmail REST client  (threads, labels, modify)  ── all mail data lives here  │
│    • Sanitizer (DOMPurify + sandboxed iframe CSP)                                │
│    • Rules engine (pure, unit-tested)                                            │
│    • UI: sign-in · inbox · reader · rules · snoozed · watching                  │
│            │ invoke()                                   ▲ events                 │
└────────────┼───────────────────────────────────────────┼───────────────────────┘
             ▼                                            │ "schedule-due"
┌──────────── Rust backend (narrow on purpose) ───────────┴──────────────────────┐
│   • OAuth loopback + PKCE  (start_oauth / refresh_access_token)                 │
│   • Scheduler tick (tokio) + JSON store in app-data  (schedule_add/list/remove) │
│   • Native notifications  (notify)                                              │
└────────────────────────────────────────────────────────────────────────────────┘
                 │ HTTPS (token exchange only)        │ HTTPS (all mail)
                 ▼                                     ▼
         oauth2.googleapis.com                 gmail.googleapis.com
```

**Why this split.** Mail logic is single-sourced in TypeScript (no IMAP, no Node
sidecar). Rust does only what a webview can't do well: bind a loopback port for
the OAuth redirect, hold a precise background timer, and post OS notifications.
When a snooze/watch comes due, Rust emits an event; the frontend performs the
Gmail work and asks Rust to fire the notification — so all Gmail logic stays in
one place and the notification is always a real macOS banner.

## Security model

### Tokens

- The **access token** lives in webview memory.
- The **refresh token** lives in Rust process memory for the session and is
  **never written to disk**.
- Augment re-authenticates on each launch (intentional — sidesteps token rot).
- OAuth uses **PKCE (S256)** over a loopback redirect with a CSRF `state` check.

### No remote content, ever

Mail rendering is defense-in-depth:

1. **DOMPurify** removes scripts, event handlers, and dangerous tags, and hooks
   strip every remote-loading vector — `img/src`, `srcset`, `poster`,
   `background`, and `url(...)` in inline styles. Only `data:` images survive.
2. The sanitized body is rendered inside a **sandboxed `<iframe srcdoc>`** whose
   own `<meta>` CSP is `default-src 'none'; img-src data:; …` — so even a
   sanitizer bypass cannot reach the network or run a script.
3. The **app-level CSP** (`tauri.conf.json`) is the outermost backstop: `img-src
   'self' data:`, `connect-src` limited to the Gmail API hosts.

**Verifying it yourself:** open a marketing email with tracking pixels, then in
the Tauri webview devtools (right-click → Inspect) watch the **Network** tab —
opening the email issues no requests to image/tracker hosts. The reader also
shows a "🛡️ N remote items blocked" badge.

### No destructive actions

The OAuth scope is `https://www.googleapis.com/auth/gmail.modify` — only label,
archive, mark-read, and star are ever performed. Send, permanent delete, and
mark-spam are out of scope by construction.

> Quick Actions / in-app compose would require broadening to `gmail.send` or
> `gmail.compose`. That is intentionally not enabled in the shipped scope.
