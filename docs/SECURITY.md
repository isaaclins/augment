# Architecture & Security

## Architecture

```
┌─────────────────────────── Tauri window (WKWebView) ───────────────────────────┐
│  React + TypeScript (strict)                                                    │
│    • Gmail REST client  (threads, labels, drafts, send) ─ all mail data lives here │
│    • Sanitizer (DOMPurify + sandboxed iframe CSP)                                │
│    • Rules engine (pure, unit-tested)                                            │
│    • UI: sign-in · inbox · reader · rules · snoozed · watching                  │
│            │ invoke()                                   ▲ events                 │
└────────────┼───────────────────────────────────────────┼───────────────────────┘
             ▼                                            │ "schedule-due"
┌──────────── Rust backend (narrow on purpose) ───────────┴──────────────────────┐
│   • OAuth loopback + PKCE + Keychain refresh token storage                      │
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
- The **refresh token** lives in Rust process memory and is mirrored to the
  OS-native secure store (macOS Keychain / Windows Credential Manager) so the
  session survives relaunch. It is never written as plaintext app data.
- Signing out clears the in-memory refresh token and the stored Keychain entry.
- OAuth uses **PKCE (S256)** over a loopback redirect with a CSRF `state` check.

### Remote content blocked by default

Mail rendering is defense-in-depth:

1. **DOMPurify** removes scripts, event handlers, and dangerous tags, and hooks
   strip every remote-loading vector — `img/src`, `srcset`, `poster`,
   `background`, and `url(...)` in inline styles. Only `data:` images survive
   until the user explicitly allows remote images for one email or sender.
2. The sanitized body is rendered inside a **sandboxed `<iframe srcdoc>`** whose
   own `<meta>` CSP is `default-src 'none'; img-src data:; …` by default. When
   remote images are allowed, the iframe permits `http:`/`https:` images only;
   scripts, frames, forms, and connections stay blocked.
3. The **app-level CSP** (`tauri.conf.json`) still blocks scripts, frames, forms,
   objects, and arbitrary connections. It permits `http:`/`https:` images so the
   reader's explicit per-email/per-sender opt-in can work; the sanitizer and
   iframe CSP decide whether any email image reference survives to that point.

**Verifying it yourself:** open a marketing email with tracking pixels, then in
the Tauri webview devtools (right-click → Inspect) watch the **Network** tab —
opening the email issues no requests to image/tracker hosts until you click
"Allow these" or "Allow from sender." The reader also shows a blocked-items
badge.

### Explicit mail-changing actions

The OAuth scopes are `https://www.googleapis.com/auth/gmail.modify` and
`https://www.googleapis.com/auth/gmail.send`. Augment can read mail, add/remove
labels, archive, star, mark read/unread, move threads to Trash, save drafts, and
send mail through the composer or an explicit Quick Action configured by the
user.

Permanent deletion and spam-reporting are still out of scope by construction.
Trash is reversible in Gmail; permanent delete is not exposed.
