# Augment — UI Element Audit

> Subtraction-first audit. Every user-visible element is judged against two questions:
> **Q1** "Does someone who installed this to triage email actually need this?" (no → default CUT)
> **Q2** "Where would it make more sense to live?" (wrong place = defect).
> Burden of proof is on KEEPING. Verdicts: **KEEP** / **RELOCATE→** / **MERGE→** / **CUT**.

Audience: keyboard-first power user who triages fast and hates clutter.
Scope: UI/IA only. Backend, Gmail integration, Ollama pipeline, and rules *logic* are untouched — this only subtracts, relocates, and regroups what's on screen.

---

## 0. Headline IA moves (delete whole categories)

| # | Move | Verdict | Why |
|---|---|---|---|
| H1 | **Sidebar Activity log** (panel + rows + dots + timestamps + empty state) | **CUT** | A persistent 6-line audit trail is reassurance, not triage. Every action's effect is already visible (the thread leaves the list). Reclaims a third of the sidebar. Errors keep surfacing inline where they happen. |
| H2 | **Three manager nav destinations** — Rules, Templates, Quick Actions | **MERGE→ one "Setup" destination with tabs** | These are *configuration*, not places you live while triaging. Collapsing 3 sidebar entries → 1 deletes two destinations and groups all automation in one spot. Runtime is untouched (rules auto-run, quick actions fire by shortcut/⌘K/context-menu, templates are used from the composer). |
| H3 | **Reader action bar** (7 buttons) | **TRIM to 4 + overflow** | Most-used triage actions (Archive, Snooze, Watch, Reply) stay obvious; Forward + Open-in-Gmail + Reply-all move into an overflow `⋯` menu. The most-used action must be the most obvious. |
| H4 | **Sort keys** (6) | **CUT 3** | Date / Unread-first / Priority are triage signal. Sender / Subject / Label sorts are "find a specific thing" → that's what ⌘K search is for. Don't ship a sort axis for a job another control does better. |
| H5 | **"Run triage now" button** (assistant header) | **KEEP** (audit reversed this) | First cut as a duplicate of refresh+auto-triage — then caught during verify: it is the *only* on-demand triage trigger when `triageAuto` is off, so cutting it removes a power-user capability (criterion 4: triage flows must still work). Kept. |
| H6 | **Accent quick-pick swatches** (8) + reset, alongside a freeform color picker | **MERGE→ picker + reset** | Ten ways to set one value. The palette cards already give curated accents; the freeform picker covers everything else. Keep picker + "theme default", cut the 8 fixed chips. |

**Folders vs Tags vs Triage categories** were examined as the obvious "duplicate taxonomy" target. Verdict: **KEEP both folders and tags** — they are genuinely different verbs (folder = file-away/remove-from-inbox; tag = classify-in-place) and the triage **category chip already de-dupes** against applied tags in code. Cutting either would remove real triage capability, not clutter. No change.

---

## 1. App shell (`App.tsx`)

| Element | Verdict | Justification (Q1 / Q2) |
|---|---|---|
| Restoring spinner | **MERGE→ mono pulse** | Needed (boot feedback) but a generic spinner is off-system; reuse the existing `.dot-pulse`. Right place. |
| "Restoring your session…" label | **KEEP** | Needed once at boot; correctly placed. |
| Titlebar drag region | **KEEP** | Required for a frameless macOS window; not decorative. |

## 2. Sidebar (`Sidebar.tsx`)

| Element | Verdict | Justification |
|---|---|---|
| Brand (logo + "Augment") | **KEEP** | One small identity anchor; correct at top. |
| Nav: Inbox | **KEEP** | The core destination. |
| Nav: Snoozed | **KEEP** | Core triage queue. |
| Nav: Watching | **KEEP** | Core differentiator. |
| Nav: Rules | **MERGE→ Setup ▸ Rules** | Config, not a daily view (H2). |
| Nav: Templates | **MERGE→ Setup ▸ Templates** | Config; used from composer (H2). |
| Nav: Quick Actions | **MERGE→ Setup ▸ Quick Actions** | Macro config; run by shortcut, not by visiting (H2). |
| Nav-count badges (snoozed/watching/rules) | **KEEP (snoozed/watching)** / **CUT (rules)** | Queue sizes are signal; an enabled-rules count is trivia. |
| Nav-shortcut `⌘1…` chips | **KEEP** | Keyboard-first; teaches the shortcut in place. |
| Folders section head + add | **KEEP** | File-away targets; correct home. |
| Folder rows + remove-on-hover | **KEEP** | Core. |
| Folder empty ("No folders yet.") | **KEEP** | Real empty state. |
| Tags section head + add | **KEEP** | Classify targets; correct home. |
| Tag rows + auto (✨) marker | **KEEP** | The ✨ flags AI-made tags — real signal, not decoration. |
| Tag edit / delete (hover) | **KEEP** | Needed; hover-revealed = uncluttered. |
| Tag empty ("No tags yet.") | **KEEP** | Real empty state. |
| **Activity heading** | **CUT** | H1. |
| **Activity rows** | **CUT** | H1. |
| **Activity dot** | **CUT** | Decorative status. |
| **Activity text / time** | **CUT** | H1. |
| **Activity empty ("Nothing yet.")** | **CUT** | H1. |
| Nav: Settings (opens window) | **KEEP** | Single settings surface; correct as a window launcher. |
| Account email | **KEEP** | Who am I — needed, correct at bottom. |
| Sign out | **KEEP** | Needed; correctly tucked at bottom. |

## 3. Inbox list (`InboxView.tsx`)

| Element | Verdict | Justification |
|---|---|---|
| List title (h2) | **KEEP** | Orients which mailbox. |
| Filter-clear ("Clear filter") | **KEEP** | Only shows when a filter is active; correct. |
| New-message (pencil) | **KEEP** | Compose entry; correct in list header. |
| Sort dropdown | **KEEP (trimmed)** | Keep Date / Unread first / Priority; **CUT Sender, Subject, Label** (H4). |
| Sort-direction arrow | **KEEP** | Needed asc/desc; pairs with the dropdown. |
| Assistant toggle (sparkle) | **KEEP** | Opens the AI drawer; correct in header. |
| Assistant badge (count) | **KEEP** | Real pending-suggestion signal. |
| Refresh | **KEEP (absorbs triage)** | H5 — refresh is the single "fetch + triage" action. |
| Selection bar count "{n} selected" | **KEEP** | Needed in multi-select. |
| Selection: Move to (menu) | **KEEP** | Core bulk action. |
| Selection: Archive | **KEEP** | Core bulk action (most-used). |
| Selection: Clear | **KEEP** | Needed escape from multi-select. |
| Row: avatar | **KEEP** | Fast sender recognition; earns its place for scanning. |
| Row: from | **KEEP** | Primary scan field. |
| Row: date | **KEEP** | Primary scan field. |
| Row: unread dot | **KEEP** | Core signal. |
| Row: subject | **KEEP** | Core. |
| Row: message-count badge | **KEEP** | Thread size signal. |
| Row: snippet | **KEEP** | Triage-by-preview. |
| Row: AI summary line | **KEEP** | One-line "what is this" — high triage value, correctly on the row. |
| Row: category chip (proposed/applied) | **KEEP** | De-duped vs tags already; the AI signal that drives fast filing. |
| Row: priority pill (High) | **KEEP** | Shows only for High — already minimal. |
| Row: tag chips | **KEEP** | Classification at a glance. |
| Loading skeleton | **KEEP** | Real loading state (matches row shape). |
| Empty state (inbox/folder/tag) | **KEEP** | Real, composed empty states. |
| "Load more" / "Loading more…" | **KEEP** | Pagination; correct at list end. |

## 4. Reader (`ThreadReader.tsx`, `EmailView.tsx`)

| Element | Verdict | Justification |
|---|---|---|
| Empty ("No conversation open") | **KEEP** | Real empty state. |
| Loading pulse | **KEEP** | Real loading state. |
| Message rail (multi-message) | **KEEP** | Needed to move within a thread. |
| Subject | **KEEP** | Header anchor. |
| Close (×) | **KEEP** | Needed to clear the pane. |
| Action: Reply | **KEEP** | Primary response. |
| Action: Reply all | **RELOCATE→ overflow ⋯** | Conditional + rare in triage; keep reachable, not prominent (H3). |
| Action: Forward | **RELOCATE→ overflow ⋯** | Rare in triage (H3). |
| Action: Snooze (duration) | **KEEP** | Core. |
| Action: Watch (duration) | **KEEP** | Core. |
| Action: Archive | **KEEP** | Most-used — must stay the most obvious. |
| Action: Open in Gmail | **RELOCATE→ overflow ⋯** | Escape hatch, not a primary action (H3). |
| Meta: from name / email + avatar | **KEEP** | Sender identity. |
| Meta: to / date | **KEEP** | Context. |
| EmailView: remote-blocked shield | **KEEP** | Real privacy signal (count of blocked remote assets). |
| EmailView: render-mode label ("sanitized HTML"/"plaintext") | **CUT** | Internal rendering detail a triage user doesn't act on; the shield already says "protected." |
| EmailView: email iframe | **KEEP** | The message itself. |

## 5. Assistant drawer (`AssistantPanel.tsx`)

| Element | Verdict | Justification |
|---|---|---|
| Drawer + header | **KEEP** | The AI surface. |
| "Run triage now" button | **KEEP** | The on-demand triage path when auto-triage is off; not a true duplicate (see H5). |
| Close (×) | **KEEP** | Needed. |
| Mode selector (Ask/Request/Agent) | **DEFERRED → recommend MERGE Ask/Do** | Collapsing modes rewrites assistant action-flow *logic* (out of scope: UI/IA only) and the file is under concurrent edit. Logged, not built. |
| Suggested-labels section + rows | **KEEP** | Core triage assist (approve AI labels in bulk). |
| Approve / Skip per suggestion | **KEEP** | The action; correct inline. |
| Chat log + bubbles | **KEEP** | The conversation. |
| Thinking dots | **KEEP** | Real busy state. |
| Proposal card + Apply/Cancel/Undo | **KEEP** | The safety rail for AI changes. |
| "Acting on {n} selected" context line | **MERGE→ show once** | Currently rendered twice (empty state + input). Keep one, by the input. |
| Textarea + Send | **KEEP** | Input. |
| Clear conversation | **KEEP** | Needed; low-prominence link is right. |

## 6. Composer (`Composer.tsx`, `RichTextEditor.tsx`)

| Element | Verdict | Justification |
|---|---|---|
| Modal + title + close | **KEEP** | Replying clears mail — part of triage. |
| Send-access warning | **KEEP** | Real error/permission state. |
| To / Subject | **KEEP** | Required. |
| Cc / Bcc | **KEEP** | Needed for real replies; already quiet fields. |
| Body textarea | **KEEP** | The message. |
| Attachments list + remove | **KEEP** | Real capability. |
| Attach / Save draft / Send | **KEEP** | Core compose actions. |
| Template picker (NEW home for Templates) | **KEEP (gains templates)** | Templates relocate *into* compose where they're used (H2). |
| RTE: B / I / U | **KEEP** | Basic formatting. |
| RTE: bullet / numbered list | **KEEP** | Common. |
| RTE: Link | **KEEP** | Common. |
| RTE: Clear formatting | **CUT** | Rarely used; paste-as-plain covers the real need. |
| RTE: HTML source toggle `</>` | **SATISFIED (already templates-only)** | The RTE renders only in the template editor, which now lives in Setup — already exactly where templates are authored. No change needed. |

## 7. Setup destination — merged Rules / Templates / Quick Actions (H2)

Element-level verdicts for the three managers (all **KEEP**, now living under one `Setup` view with tabs instead of three sidebar entries). Within each, these specific trims apply:

| Element | Verdict | Justification |
|---|---|---|
| Rules: auto-apply toggle (in panel head) | **KEEP** | Correct next to the rule list it governs. |
| Rules: Run-now / New / list / editor (conditions, actions, match-mode) | **KEEP** | Core automation UI. |
| Rules: enable/disable per rule | **KEEP** | Needed. |
| Templates: list / editor / Use / RTE | **KEEP** | Authoring home; "Use" is the bridge to compose. |
| Templates: Refresh button | **CUT** | Templates load on open; a manual refresh is redundant. |
| Quick Actions: list / editor / steps / shortcut capture | **KEEP** | Macro authoring. |
| Quick Actions: per-row Run | **KEEP** | Test/run a macro. |
| Quick Actions: Duplicate / Move up / Move down | **MERGE→ drag-reorder + duplicate-in-editor** | Three icon-buttons per row × N rows is clutter; reorder by drag, duplicate from the editor. |
| Quick Actions: numbered-step label | **KEEP** | Steps are ordered; the number aids reference. |
| Setup: tab bar (Rules / Templates / Quick Actions) | **KEEP (new container)** | The MERGE's host, not a new feature — replaces 3 nav items with 1 + tabs. |

## 8. Settings window (`SettingsView.tsx`)

| Element | Verdict | Justification |
|---|---|---|
| Appearance: theme cards (5) | **KEEP** | Set-once, correctly in settings. |
| Appearance: **accent quick-picks (8)** | **CUT** | H6 — redundant with the freeform picker. |
| Appearance: custom color picker + "theme default" | **KEEP** | One way to set a custom accent. |
| Appearance: mode (System/Light/Dark) | **KEEP** | Standard, correct home. |
| Keyboard shortcuts section + rows + clear + reset | **KEEP** | Keyboard-first app; the right home. |
| Mail: auto-apply rules | **RELOCATE→ Setup ▸ Rules** | This toggle already exists in the Rules panel head; settings copy is the duplicate. Keep it with the rules. |
| Mail: snooze label | **KEEP** | Set-once config; correct in settings. |
| Triage: enable / on-refresh / sync-to-Gmail | **KEEP** | Config; correct home. |
| Triage: suggested labels | **KEEP** | Config. |
| Triage: model / assistant-model / endpoint | **KEEP** | Set-once expert config; settings is exactly where it belongs. |
| Triage: Test-connection button | **KEEP** | Useful at setup. |
| Triage: **connection status pill** ("● Connected/Offline") | **CUT** | Duplicates the hint sentence that already states the result. |

## 9. Search palette (`SearchPalette.tsx`)

| Element | Verdict | Justification |
|---|---|---|
| Backdrop / modal / input / esc hint | **KEEP** | ⌘K is core to a keyboard-first triage tool. |
| Action result rows (run quick actions / nav) | **KEEP** | The command side of ⌘K — high value. |
| Thread result rows (from/date/subject/snippet/unread) | **KEEP** | Search is where "find by sender/subject" now lives (H4). |
| Nav hints (↑↓ / ↵) | **KEEP** | Teaches keyboard nav; minimal. |
| FTS status / "Build index" / "Indexing… Stop" | **MERGE→ one quiet status line** | Three interaction modes in the footer is a lot; collapse to a single status + one affordance (build or stop). |
| Count | **KEEP** | Useful result count. |

## 10. Shared: menus, tag editor, chips, sign-in

| Element | Verdict | Justification |
|---|---|---|
| Context menu items/submenus/caret/separator | **KEEP** | Right-click is core to fast triage; submenus keep it shallow. |
| Duration menu (snooze/watch presets) | **KEEP** | Shared component; correct. |
| Tag editor: name / color grid / icon grid / preview / save / delete | **KEEP** | Tag CRUD; modal is correct. |
| TagGlyph / TagChip / CategoryChip / PriorityPill | **KEEP** | Already audited on the row (§3). |
| Sign-in: brand / logo / tagline | **KEEP** | One-time; identity. |
| Sign-in: feature list (4 items) | **MERGE→ 1 line** | Marketing copy on a personal tool's login; trim 4 feature rows to a single line of value + the button. |
| Sign-in: button / waiting hint / cancel / error | **KEEP** | Real auth flow + states. |
| Sign-in: footer (scope/keychain note) | **KEEP** | Trust/permission disclosure. |

---

## Counts (before → target)

Distinct user-visible elements/controls enumerated (excludes pure layout wrappers):

| Area | Before | After | Δ |
|---|---|---|---|
| Sidebar (incl. activity log) | 24 | 16 | −8 |
| Top-level nav destinations | 7 | 5 | −2 |
| Inbox list (sort keys etc.) | 28 | 25 | −3 |
| Reader action bar | 7 | 4 + overflow | −3 |
| Assistant | 16 | 14 | −2 |
| Composer / RTE | 19 | 17 | −2 |
| Settings | 22 | 19 | −3 |
| Search palette footer modes | 5 | 3 | −2 |
| Sign-in | 11 | 8 | −3 |
| EmailView | 4 | 3 | −1 |
| **Total (audited surface)** | **~150** | **~121** | **−29 (~19%)** |

Element count is measurably lower. The biggest structural wins are H1 (cut the activity log) and H2 (7 nav destinations → 5).

---

## Out of scope (logged, not built — per "no new features")

- Unifying folders + tags into one label model (would change Gmail label semantics — backend).
- Drag-to-reorder for Quick Actions (the MERGE in §7 needs a small drag handler; if it risks scope, fall back to keeping reorder buttons but as one hover-revealed group).
- A real toast system to replace the cut activity log (errors already surface inline; a toast layer would be a new feature).
- Per-action keybind reset in Settings.

## Execution order (rebuild)

1. Cut sidebar activity log (H1).
2. Trim sort keys (H4) + cut connection pill + accent quick-picks + render-mode label + RTE "Clear" (low-risk cuts).
3. Merge Rules/Templates/Quick Actions → `Setup` tabbed destination (H2); update Sidebar + Workspace + keybinds.
4. Reader overflow menu for Forward / Reply-all / Open-in-Gmail (H3).
5. Assistant: cut "Run triage now" (H5), collapse modes to Ask/Do, single context line.
6. Sign-in feature list → one line.
7. Build + test + screenshots, update counts.
