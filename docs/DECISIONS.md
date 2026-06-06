# Design decisions & patterns log

This is the running record of non-obvious choices made building Augment v0.1.0, with
the reasoning behind each. It complements the README (which is the how-to).

## Architecture

### D1 — Mail lives in TypeScript; Rust is narrow glue
All Gmail access (threads, labels, modify, profile) is a single typed client in
TypeScript (`src/lib/gmail/client.ts`). Rust does only OAuth loopback, the background
scheduler, and native notifications. **Why:** the spec wants one source of truth for
mail logic, no IMAP and no Node sidecar; a webview can't bind a loopback port, hold a
precise timer, or post OS notifications, so those — and only those — go to Rust.

### D2 — Snooze/watch handling is event-driven across the boundary
The Rust scheduler owns timing + a JSON store; when an item is due it emits a
`schedule-due` event. The **frontend** performs the Gmail work (resurface a thread,
check for a reply) and then calls the Rust `notify` command. **Why:** keeps every Gmail
call in TS (D1) while the notification is still a real native banner fired by Rust.

### D3 — Rust re-emits due items every tick; the frontend dedups
`drain_due` returns *all* currently-due items each 15s tick (no Rust-side "already
emitted" set). The frontend keeps an in-flight `Set<id>` and removes the item from the
store (`schedule_remove`) once handled. **Why:** the very first tick fires at startup,
*before* sign-in, so a Rust-side "emit once" set would swallow overdue items from a
previous session and they'd never fire. Re-emitting + frontend-dedup makes overdue
items reliably fire once the webview is ready, with no double-notify (handler removes
the item within one tick). *This replaced an earlier emit-once design — see the
`drain_due` tests.*

## Security

### D4 — No remote content: three independent layers
1. **DOMPurify** with `afterSanitizeAttributes` hooks strips `src`/`srcset`/`poster`/
   `background` (unless `data:`) and `url(...)` from inline styles; forbids
   `<style>/<link>/<script>/<svg>/…`.
2. The clean body renders in a **sandboxed `<iframe srcdoc>`** (no `allow-scripts`, no
   `allow-same-origin`) whose embedded `<meta>` CSP is `default-src 'none'; img-src
   data:`. The opaque origin makes that CSP authoritative.
3. The **app CSP** in `tauri.conf.json` (`img-src 'self' data:`, scoped `connect-src`)
   is the outermost net.
**Why:** any single layer failing (e.g. a DOMPurify CVE) still cannot produce a network
request or script execution. Defense in depth is the whole point of the "never fetch
remote content" requirement.

### D5 — Tokens in memory only; re-auth each launch
The access token sits in webview memory; the refresh token sits in a Rust `Mutex` for
the session and is **never written to disk**. **Why:** the spec mandates it, and it
neatly sidesteps refresh-token rot — including Google's 7-day testing-mode refresh
expiry, which never matters because we always start fresh.

### D6 — OAuth: loopback + PKCE (S256), Desktop client
A `TcpListener` on `127.0.0.1:0` (ephemeral port) catches the redirect; PKCE S256 +
a CSRF `state` check protect the exchange. Google "Desktop app" clients allow loopback
on any port automatically, so no redirect URI registration is needed. The client secret
is included in the exchange when present but PKCE makes it non-critical. OOB is
deprecated; loopback is the supported path.

### D7 — Only non-destructive Gmail actions
Scope is `gmail.modify` (read + label + archive). Send / permanent-delete / mark-spam
are impossible with this scope — the safety requirement is enforced by the grant itself,
not just by UI discipline. Archive = remove the `INBOX` label; snooze = archive + add
`Augment/Snoozed`.

## Implementation choices

### D8 — Persistence split: Rust store for schedule, localStorage for rules/settings
Schedule items live in `schedule.json` in the OS app-data dir because the **Rust**
scheduler must read them without the webview. Rules and UI settings are
frontend-only, so they use `localStorage` (persists in the app's data container).
**Why:** each store sits next to its only writer; no extra Rust commands for data Rust
never reads.

### D9 — Inbox rows via `format=metadata`, reader via `format=full`
List rows fetch only headers (lighter, concurrent `Promise.all`); opening a thread
fetches the full payload. Running rules fetches full messages so body conditions work.
**Why:** snappy list, correct rule matching, minimal data transfer.

### D10 — Short "demo" duration presets
Snooze and watch both expose a **20-seconds** preset alongside real ones (1m, 1h, …).
**Why:** the success criteria require demonstrating snooze/watch "with a short interval";
a built-in 20s option makes that a one-click demo instead of editing code.

### D11 — Base64url decoding honours part charset
`decodeBase64Url` converts url-safe base64 → bytes → `TextDecoder(charset)` using the
`Content-Type; charset=` of the MIME part, falling back to UTF-8. **Why:** Gmail bodies
are base64url and not always UTF-8; naive `atob` corrupts multi-byte text.

### D12 — Pure rules engine, separate apply layer
`rules/engine.ts` is pure and fully unit-tested; `rules/apply.ts` carries the Gmail
side effects. **Why:** the matching logic — the part most likely to have edge-case bugs
— is testable without any network or mocks.

## Notable debugging notes

- **Fish vs. bash:** `${PIPESTATUS[0]}` is bash-only; under fish it silently yields the
  wrong exit code, which masked an early Rust compile error. Switched to writing logs +
  `$status` directly.
- **Rust borrow (E0500):** the first `drain_due` used `filter`+`map` closures that both
  captured `emitted` (immutable + mutable borrow). Rewrote as a plain loop — later moot
  once D3 removed the `emitted` set entirely.
- **React 19 JSX types:** `JSX.Element` isn't always in scope under the automatic JSX
  runtime; used `ReactElement` instead.

## Deferred to v2

- Always-on background daemon so snooze/watch fire while the app is closed.
- Opt-in "load remote images" toggle (kept fully blocked in v1 by design).
- Multiple accounts; full-text search; compose/reply (would need broader scopes +
  in-app confirmation per the destructive-action rule).
