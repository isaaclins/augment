# Augment — AI Labeling & Assistant: Grill Session

Working doc capturing the shared understanding from the `/grill-me` session.
Goal: make AI categorization show up as real sidebar labels, and add a
conversational, confirm-first AI that acts on the user's selected mail.

## The user's three asks (verbatim intent)

1. **AI categories aren't visible.** "When the AI tags mails as XYZ, label XYZ
   actually gets created and works in the sidebar." Today the sidebar shows
   "No tags yet." even after triage labeled 14 emails.
2. **No feedback loop.** "It just *does* it without asking." Wants to *tell* the
   AI: "make a new label for these kinds of mails," have it read the **selected**
   mails, and create/apply a label — asking before acting.
3. **Natural-language sorting.** "Sort my mails by XYZ" should work.

## Current architecture (verified by reading the code)

There are **two separate labeling systems that are not connected**:

### A. Triage  (`src/lib/features/triage.ts`, `src/ui/triage.tsx`)
- Ollama classifies each email into ONE of 11 hard-coded `TriageCategory`
  values (`personal, work, finance, receipt, newsletter, promotion, update,
  security, travel, social, other`) + priority (`low|normal|high`) + 1-line summary.
- Stored in `localStorage` keyed by thread id (`saveTriage`/`loadTriage`).
- Renders as the colored chips on inbox rows (`TriageChips`).
- **Never creates a Gmail label. Never appears in the sidebar.**
- Runs automatically on every inbox load (`runTriage` effect in `augment.tsx`,
  gated by `settings.triageEnabled` + `settings.triageAuto`).
- Rust side: `ollama_triage` (single-shot, structured JSON via `format` schema,
  temperature 0). `ollama_health` probes reachability. No chat/tool-calling cmd.

### B. Tags  (`src/lib/tags.ts`, `src/ui/TagEditor.tsx`, `src/ui/tags.tsx`)
- User-created colored+icon labels, each backed 1:1 by a Gmail label
  `Augment/Tags/<name>`. Metadata in localStorage; association lives in Gmail.
- This is what the sidebar "TAGS" section renders (`Sidebar.tsx`).
- Created ONLY by hand via `TagEditor`. State methods exist:
  `createTag`, `updateTag`, `deleteTag`, `setThreadTag`, `addTagToThreads`,
  `openTag` (filters the list to `label:"Augment/Tags/<name>"`).
- **The AI never calls any of these.**

### Other relevant surfaces
- `SearchPalette.tsx` — ⌘K palette, searches mail (metadata always, FTS5 bodies
  once backfilled). Keyboard-first. Candidate surface to extend into a command bar.
- Inbox header has a ✨ sparkle button + refresh (sparkle = run triage now — to confirm).
- Selection state in `augment.tsx`: `selectedIds: Set<string>`, with the rows in `rows`.
- Sort: rows come straight from a Gmail query (`in:inbox`), date-ordered. No client sort yet.

## Open decisions (the tree)

- [x] **Q1 (root): data model** — RESOLVED: two tiers. See Decisions.
- [x] Q2: data model for auto tier — RESOLVED. See D2.
- [x] Q3: assistant surface — RESOLVED. See D3.
- [x] Q4: assistant capabilities — RESOLVED (all four buckets). See D4.
- [x] Q4b: define the three modes — RESOLVED (confirmation spectrum). See D4b.
- [x] Q4c: modes vs. triage/irreversible/default — RESOLVED. See D4c.
- [x] Q5: sort/filter semantics — RESOLVED (hybrid). See D5.
- [x] Q6: read depth — RESOLVED (metadata+snippet+summary; deep read on request). See D6.
- [x] Q7a: interaction — RESOLVED (plan-then-execute). See D7.
- [x] Q7b: assist model — RESOLVED (separate, defaults to triage model). See D7b.
- [x] Q8: confirm UX — RESOLVED (batched per intent). See D8.
- [x] Q9: chat persistence — RESOLVED (persist across restarts). See D9.
- [x] Q10: Agent reach — RESOLVED (loaded + page to ~200 cap). See D10.

All major branches resolved. Remaining = minor confirmations folded into synthesis.

## Decisions (resolved)

- **D1 — Two-tier model.** There is an *automatic* tier and a *confirm-first* tier.
  - AUTO: the built-in triage categories (Receipt, Security, Newsletter, …)
    become real, clickable sidebar labels on their own — no prompt. Fixes ask #1.
  - CONFIRM-FIRST: creating a brand-new *custom* label and bulk-applying it goes
    through the assistant, which proposes (label name + the affected mails) and
    waits for [Apply]/[Cancel]. Satisfies ask #2.

- **D2 — One unified, Gmail-backed Tag system.**
  - Categories are NOT a separate concept. A category becomes a normal `Tag`
    backed by a real Gmail label `Augment/Tags/<Name>`, applied to the thread
    (synced to Gmail web/phone, survives reinstall). Same for custom labels.
  - One sidebar "Tags" list. Auto-origin tags get a ✨ marker; user can recolor /
    rename / delete them like any tag.
  - Impl notes: add a `source: "auto" | "user"` (or similar) field to `Tag`.
    Seed a new auto tag's color/icon from a small mapping (reuse `CATEGORY_META`
    hexes for the old names; pick a deterministic color/icon for invented names).

- **D2′ — REVISES the taxonomy: open / AI-invented, seeded with ideas.**
  - The 11 hard-coded categories are NO LONGER a closed set. The model invents the
    label that best fits each email, but is handed an "ideas" list and told to
    PREFER reusing one of those when it fits (avoids near-duplicate sprawl like
    Receipt vs Receipts).
  - Rust's `ollama_triage` schema must change: `category` stops being a fixed
    `enum`. Instead pass the ideas list as *suggestions* in the prompt and let the
    model return a free-form (but normalized: trimmed, title-cased, delimiter-free)
    label string. Add light client-side normalization + fuzzy de-dup against
    existing tag names before creating anything.
  - Old 11 (`CATEGORY_META`) survive only as part of the starter "ideas" list, not
    as a hard constraint.
  - See D2a / D2b for the auto-vs-confirm line and the ideas list.

- **D2a — Reuse is automatic, invention is confirm-first** (redraws the D1 line for
  the open taxonomy).
  - Email fits a label that already exists in the sidebar → apply automatically,
    no prompt.
  - AI wants a label NOT yet in the sidebar → queue it as a proposal; user
    [Approve]/[Skip]. Nothing new appears unapproved.
  - Once approved, the label is "known" and auto-applies on future mail.
  - Batching: collect + de-dup invented names across a triage batch, then propose
    once per new label ("Create 'Invoices' for 4 emails"), not per-thread.
  - This makes the cold-start nice: first runs propose a starter taxonomy the user
    approves once, then it goes quiet. Directly serves asks #1 + #2 together.

- **D2b — Ideas list = your labels + starters + editable hints.**
  - Prompt shows the model: (1) existing tag names (reuse these FIRST), (2) a
    built-in starter set (old 11 names) as ideas, (3) a user-editable "suggested
    labels" list in Settings. Model prefers these but may invent beyond them.
  - "Only-used vs all-11" question is now MOOT — labels appear as created/approved.

- **D2c — Invented-label proposals surface in the Assistant panel.**
  - Pending suggestions render as cards in the assistant panel ("Suggested labels
    (N)" with [Approve]/[Skip]). A count badge on the ✨ shows pending review when
    the panel is closed. Batched review.
  - This is the same proposal-card surface used by Request-mode assistant actions —
    one home for everything the AI wants to do.

- **D11 — Settings toggle "Sync labels to Gmail" (default ON).** On = approved
  labels write to Gmail + sync (per D2). Off = chips/tags live in Augment only,
  nothing written to Gmail's label list.

- **D12 — ✨ repurposed to open the Assistant** (carries the suggestions badge).
  "Run triage now" moves inside the panel header. Mode selector lives there too.

- **D-sort-keys — Supported sort keys:** date, sender, subject (A–Z), priority,
  category, unread-first, has-attachment. (All four groups from Q5 confirmed.)

- **D3 — Assistant lives in a right-side chat panel.**
  - Toggled by the ✨ sparkle in the inbox header (sparkle becomes "open
    Assistant"; the old "run triage now" action moves inside the panel / a menu).
  - Multi-turn chat. Shows the current selection as live context ("Acting on: N
    selected"). Renders proposal cards with [Apply]/[Cancel].
  - Sits beside/over the ThreadReader in the `main` area (placement to confirm:
    right drawer). Keyboard-focusable.

- **D4 — Assistant capabilities (v1): all four buckets.**
  1. Label actions — create custom label + apply; apply/remove existing tag.
     Target = selection OR an AI-chosen set read from the mail.
  2. Sort & filter the visible list (date/sender/priority/category/unread;
     subset filters). Read-only to Gmail.
  3. Mailbox actions on selection — archive / snooze / mark-read / move-to-folder
     by instruction. Confirm-first.
  4. Read-only Q&A / summarize the selected/target mail.
  - PLUS three interaction modes (see D4b).

- **D4b — Assistant modes = a confirmation spectrum** (a selector in the chat panel,
  Cursor-style). Governs assistant-initiated actions:
  - **Ask**: read-only. Answers/summaries only. No Gmail writes ever.
  - **Request**: proposes and waits before EVERY change ([Apply]/[Cancel] per action).
    This is the confirm-first behavior from D1, expressed as a mode.
  - **Agent**: acts without prompting; logs each action to the Activity feed; user
    undoes if wrong.
  - NOTE: this reframes D1 — "confirm-first for custom labels" = Request mode.

- **D4c — Modes scope the assistant only.**
  - Background triage stays always-on (governed by its own settings, per Q1/D1),
    auto-labeling built-in categories regardless of the assistant's mode.
  - The mode controls ONLY assistant-initiated actions in chat.
  - Safety carve-out: even in Agent mode, irreversible actions (send email,
    permanent delete) always confirm. Reversible actions (label, archive, snooze,
    move, sort) obey the mode.
  - **Default mode = Request.**

- **D5 — Sort/filter = hybrid.**
  - SORT: client-side reorder of currently-loaded `rows`; persists as load-more
    appends. Proposed keys: date, sender, subject A–Z, priority (triage),
    category (triage), unread-first, has-attachment. (Confirm key set at synthesis.)
  - FILTER: when it maps to a Gmail concept (a tag/category label, from:sender,
    is:unread, date range) → re-query Gmail (set `listQueryRef`, reload) for the
    full set. Otherwise filter loaded rows locally.
  - Implies a transient view-state for sort (a header control the assistant can set).

- **D6 — Read depth: metadata + snippet + summary.**
  - Per targeted email the model sees: sender, subject, Gmail snippet, and the
    existing triage summary + category — all already in `rows`/`triage`, no fetch.
  - Full body fetched (via `getThread`/`parseMessage`) only for a small selection
    when the user explicitly asks to read deeply.

- **D7 — Interaction: plan-then-execute structured output.**
  - One model call returns `{ reply: string, actions: Action[] }` constrained by a
    JSON schema (extends the `format`-schema pattern already in `ollama.rs`).
  - `Action` is a discriminated union: createLabel, applyLabel, removeLabel,
    archive, snooze, markRead, moveToFolder, setSort, setFilter, (answer = none).
  - App executes actions per mode: Ask → ignore/none; Request → render as proposal
    cards, await Apply; Agent → execute + log (irreversible still confirm).
  - New Rust command (e.g. `ollama_assist`) carries system prompt + context +
    action schema. Keep Rust policy-free; taxonomy/tools described from the frontend.

- **D7b — Separate assistant model, defaults to triage model.** New setting
  `assistantModel` (defaults to `triageModel`); shares `triageEndpoint`. Lets a tiny
  fast model do triage while a stronger instruct model runs the agent.

- **D8 — Confirm cards are batched per intent.** A whole intent = one card with a
  checklist (create label + apply to 5 + sort) and a single [Apply all]/[Cancel],
  expandable to inspect affected emails.

- **D9 — Chat persists across restarts** (localStorage). Mail-derived text is stored
  locally. (Consider a "clear chat" control + clearing on sign-out, like search index.)

- **D10 — Agent reach: loaded + page to a cap (~200).** Visible progress
  ("working through N") + a Stop button. Bounded so a misread can't sweep the whole
  account. Actions still logged to Activity.

## Implementation sketch (how it maps onto existing code)

- **Fix ask #1 (auto categories → sidebar):** in `runTriage` (augment.tsx), after a
  thread is classified, map category → a `Tag` (ensure it exists via existing
  `createTag` path / `ensureLabelId(tagLabelName(cat))`), then apply its label
  (reuse `addTagToThreads`/`modifyThread`). Auto tags carry `source:"auto"` + ✨ in
  `Sidebar.tsx`. Add a settings toggle `applyCategoryLabels` (default on) so users
  can keep chip-only behavior if they don't want Gmail writes.
- **Assistant panel:** new `src/ui/AssistantPanel.tsx` rendered in `main` (Workspace),
  toggled by the header ✨ (sparkle becomes "Assistant"; "run triage now" moves into
  the panel header / a menu). Mode selector (Ask/Request/Agent), chat log, input,
  proposal cards, "Acting on: N selected" from `selectedIds`.
- **Assistant engine:** new `src/lib/features/assistant.ts` — builds context from
  `rows`/`triage`/`selectedIds`, calls new Rust `ollama_assist` (structured
  `{reply, actions[]}`), and an executor that maps each `Action` to EXISTING state
  methods: createTag, addTagToThreads, setThreadTag, archiveSelected/archiveThread,
  snooze, markRead, moveThreadsToFolder, + new setSort/setFilter view state.
- **Sort/filter view state:** add `sortKey`/`sortDir` + a derived sorted view in
  augment.tsx; filters that map to Gmail set `listQueryRef` + `refreshInbox`.

## Phase 1 — SHIPPED (open taxonomy + invent→approve + sidebar labels)

Status: implemented, `tsc --noEmit` clean, `cargo check` clean, 71 FE tests pass.

What landed:
- `Tag` gained `source: "user" | "auto"` (loadTags backfills old tags to "user").
  `defaultTagStyle(name)` in tags.ts (starter overrides + deterministic hash colour).
- Open taxonomy: `ollama_triage` dropped the enum, takes `suggestions`, prompt tells
  the model to reuse a suggested label or invent a short one. `triage.ts`:
  `TriageResult.category` is now a free-form string; `normalizeLabel()`; `STARTER_LABELS`.
- `runTriage` (augment.tsx): builds the ideas list (tags + starters + settings hints,
  deduped), and when an assigned label matches an existing tag it applies that Gmail
  label to the thread — gated by `settings.syncLabelsToGmail`.
- Invent→approve: `suggestions` is DERIVED (useMemo) from triage + tags + skippedLabels
  (no separate store; "Other" excluded). `approveSuggestion` creates an auto tag +
  applies to all its threads (always writes Gmail — approval is explicit). `skipSuggestion`
  persists a dismissal (`augment.skippedLabels.v1`).
- Assistant panel: `src/ui/AssistantPanel.tsx` — fixed right drawer, "Suggested labels"
  with Approve/Skip + a moved "Run triage now". Header ✨ now toggles it (`assistantOpen`
  in context) with a suggestion-count badge. Chat/modes are a footer placeholder (Phase 3+).
- Rows: `triage.tsx` now exports `CategoryChip` (solid when known, dashed ✨ "proposed"
  when not) + `PriorityPill`. InboxView shows the category chip unless applied-as-tag or "Other".
- Sidebar: auto tags get a ✨ marker.
- Settings: `syncLabelsToGmail` (default on), `suggestedLabels` (hints), `assistantModel`
  (blank = reuse triage model) — all wired into the Triage section of SettingsView.

Deviations from the sketch: suggestions are derived rather than stored; the
`syncLabelsToGmail` toggle gates *automatic* triage writes only (explicit approvals
always sync); chat UI deferred to its own phase as planned.

## Phase 2 + 3 — SHIPPED (sort/filter + full assistant)

Status: implemented, `tsc` clean, `cargo check` clean, `vite build` clean, 71 FE tests pass.

Phase 2 (sort/filter):
- `lib/features/view.ts`: `SortKey` (date/sender/subject/priority/category/unread),
  `SortDir`, `SORT_OPTIONS`, `defaultSortDir`, pure `sortRows(rows, triage, key, dir)`.
- augment.tsx: `sortKey`/`sortDir` state + `orderedRows` memo (exposed AS `rows`, so
  render + range-selection stay consistent). `setSort`. Filtering: `applyListQuery`
  (sets the Gmail query + `filterActive`) and `clearFilter`. `filterActive` reset on nav.
- InboxView header: a sort `<select>` + asc/desc toggle, and a "Clear filter" chip.

Phase 3 (assistant):
- Rust `ollama_assist`: mode-aware system prompt + flat action JSON schema (one
  structured call), returns `{reply, actions}`. Registered in lib.rs.
- `lib/features/assistant.ts`: `AssistantMode`, `ASSISTANT_MODES`, flat `AssistantAction`,
  `AssistantMessage`, `runAssist`, `describeAction`. store.ts: chat persistence
  (`augment.assistant.v1`, load/save/clear), cleared on sign-out.
- augment.tsx: `buildAssistantContext` (≤40 rows: id+sender+subject+snippet+summary,
  selection marked, labels/folders/sort/snooze presets), `runAction` executor mapping
  every action to existing methods (ensureTag/ensureFolder + addTagToThreads/setThreadTag/
  archiveThread/markRead/snooze/moveThreadsToFolder/setSort/applyListQuery), `executeActions`,
  `sendAssistantMessage` (mode logic: ask→ignore, request→propose, agent→execute+log;
  selection baked into id-less actions), `applyProposal`/`cancelProposal`, `clearAssistantChat`.
- AssistantPanel.tsx: mode segmented control, chat log (bubbles), proposal cards
  (Apply all/Cancel), thinking state, input (Enter=send), suggestions section retained,
  "Acting on N selected" context, clear-conversation. CSS added.

Assistant quality fixes (after live testing showed hallucinations):
- Ask mode gets a dedicated READ-ONLY prompt (no action catalog) — it stopped
  role-playing "I've moved it…". It may still use navigation actions (see below).
- Context now does a DEEP READ: full body text of the open thread + up to 5 selected
  threads (≤1500 chars each), so "how much did I pay?" is answerable. `buildAssistantContext`
  is async; uses the reader in memory or fetches via `getThread`.
- New `openThread` action: the assistant can open an email in the main reader view.
  Navigation actions (openThread/setSort/setFilter) are non-destructive and run
  IMMEDIATELY in every mode (incl. Ask); only mail-mutating actions obey the mode.
- "Summarize + open, don't deflect": prompt now forbids telling the user to open an
  email — the assistant gives a TL;DR AND opens it. To make this work on a referenced
  email that isn't open/selected, `matchRelevantRows` keyword-matches the message
  against the loaded rows; the top matches are deep-read (so it can summarize) and the
  top match is auto-opened if the model didn't emit an openThread itself.
- "this mail" → 0 emails bug: id resolution for actions now falls back
  selection → OPEN email (reader) → top keyword match (was selection-only, which
  is empty when you've just single-clicked a row to read it). Prompt also tells the
  model that "this email/this mail" = the open (>) or selected (*) email.
- Biggest remaining quality lever is the MODEL: assistant defaults to the tiny triage
  model — set a stronger `assistantModel` (e.g. qwen2.5:7b) in Settings.

KNOWN DEVIATION (no silent cap): Agent "organize my whole inbox" operates on the
context we send — capped at **40 loaded rows**, NOT the ~200 paging target from D10.
Rationale: plan-then-execute is a single batch and a local model can't reliably hold
200 emails in-context. Revisit with a chunked agent loop + progress/Stop if needed.

## Suggested build phases

1. ✅ DONE — Ask #1: auto/approved categories become real sidebar tags + invent→approve.
2. ✅ DONE — Sort/filter view state + header control.
3. ✅ DONE — Assistant panel + Ask mode (read-only Q&A) end-to-end.
4. ✅ DONE — Request mode: label actions + proposal cards.
5. ✅ DONE — Agent mode + mailbox actions + safety (no send/delete actions exist).
   ⚠ paging cap not implemented (operates on ≤40 loaded rows — see deviation above).
6. ✅ DONE — assistant model setting, chat persistence, ✨ repurpose, clear-chat.

All designed phases implemented. Not yet verified live against Ollama + Gmail.

---

# Quick Actions — Grill Session (goal: a <4k-char /mega-goal-prompt)

Feature: user-defined, keyboard-triggered MACROS. A Quick Action = a name + a
shortcut + an ordered list of steps (Tag, Mark read, Move to folder, Notify when
replied, …) applied to the current email(s). Reference: Raycast Quick Actions
(screenshots: a manager list with name+shortcut, and a detail editor with a
step list of action-type + action-value).

## Existing infra it touches (verified)
- Rules (`src/lib/rules/types.ts`): ordered `RuleAction[]` (addLabel/archive/
  markRead/star), localStorage-persisted, condition-based + AUTO. Quick Actions
  are MANUAL + unconditional — separate concept, can reuse action primitives.
- Keybinds (`src/lib/keybinds.ts`): combo strings ("mod+s"), `eventToCombo`/
  `matchCombo`/`formatCombo`, `KeybindCapture` recorder (in SettingsView). Taken:
  mod+1..4 (nav), ⌘K (search), ⌘, (settings).
- Window pattern: Settings is a separate webview (`?view=settings`) WITHOUT
  AugmentProvider (localStorage only, no Gmail client/selection). menu.rs builds
  the native menu + `open_settings`.
- Action primitives in `augment.tsx`: addTagToThreads, setThreadTag, markRead,
  moveThreadsToFolder, archiveThread, snooze(id,subj,dueAt), watch(id,subj,dueAt).
  Target resolution already used by the assistant: selection → open email.
- Folders/tags lists persisted in localStorage (loadFolders/loadTags).

## Open decisions (the tree)
- [x] Q1: manager surface — RESOLVED: in-app sidebar view (like Rules) + inline
      detail editor (modal/panel). Reuses live folders/tags + apply methods.
- [x] Q2: step types — RESOLVED: ALL buckets — Tag, Move-to-folder, Archive,
      Mark read/unread, Star, Snooze, Notify-when-replied (watch), Remove tag,
      Delete (Trash). (User: "all of these".)
- [x] Q3: target — RESOLVED: selection if any, else the open email; multi-select
      applies to all. No-op + notice when neither. (Mirrors assistant "this mail".)
- [x] Q3b: catalog reach — RESOLVED: BUILD IN-APP COMPOSE. Quick Actions can
      Reply/Forward/Send inside Augment, not just mailbox actions. Big scope-up.
- [x] Q4: composer — RESOLVED: New/Reply/Reply-all/Forward + To/Cc/Bcc/Subject/Body
      + Send + Save-draft + ATTACHMENTS (multipart MIME). Replies thread via
      In-Reply-To/References + quote original. Light HTML ok.
- [x] Q5: compose-in-macro — RESOLVED: a compose step opens the composer PREFILLED;
      if it uses a template AND is flagged "send without review", it auto-sends with
      no UI (auto-reply macros). Otherwise waits for manual Send.
- [x] Q6: RESOLVED — triggers = per-action keyboard shortcut + row right-click
      "Quick Actions ▸" submenu + ⌘K palette entries. Under multi-select: mailbox
      steps apply to ALL targets; compose runs once on the PRIMARY (open/first) email.

All branches resolved → mega-goal-prompt written + EXECUTED.

## Quick Actions + Composer — SHIPPED (branch feat/quick-actions)
Status: implemented across 5 milestones, all four checks green (tsc, cargo check,
vite build, 77 vitest tests incl. new compose MIME tests). 3 commits on the branch.
NOT live-verified against Gmail (send needs the new scope + re-consent).
- M1: oauth.rs SCOPE += gmail.send (re-consent needed); GmailClient.sendMessage +
  trashThread; Session.canSend(); parser `cc`.
- M2: shared `gmail/mime.ts` (templates refactored onto it); `features/compose.ts`
  (ComposeDraft, multipart MIME + attachments + threading, reply/forward prefill,
  send/saveDraft); `quickActions.ts` model + STEP_META/STEP_GROUPS; store persistence.
- M3: composer state in augment.tsx (compose/canSend/send/saveDraft, 403→reconnect);
  `Composer.tsx` modal (To/Cc/Bcc/subject/body/attachments); Reply/Forward in reader,
  New in inbox header; rendered in Workspace.
- M4: quickActions state + persist + runQuickAction executor (mailbox steps→all
  targets, compose once on primary, template auto-send); `QuickActionsManager.tsx`
  sidebar view + inline editor (KeybindCapture, step list, value pickers, conflict
  warnings); sidebar nav + Workspace view.
- M5: global shortcut listener (Workspace), "Quick Actions ▸" row context submenu,
  ⌘K palette entries; runQuickAction explicit-ids; compose MIME unit tests.

## Hard constraint found (scope/re-consent)
- Current OAuth scope = `gmail.modify` (oauth.rs:26). Its comment states it does
  NOT permit sending. In-app SEND therefore requires broadening scope (add
  `gmail.send` or `gmail.compose`) → a ONE-TIME re-consent for every user on next
  launch. `messages.send` (raw MIME, base64url) + threading headers (In-Reply-To/
  References) for replies. Drafts already work (`createDraft`, drafts.create).
- [ ] Q4: trigger surfaces (shortcut only / + row context-menu / + ⌘K palette).
- [ ] Q5: execution semantics (order, all-to-Gmail, stop-on-error, feedback).
- [ ] Q6: value pickers (existing tags/folders + create-new?) + watch/snooze durations.

## Decisions (resolved)
_(none yet)_

## Status: all branches resolved (D1–D12). Ready to implement.

Build order unchanged (see "Suggested build phases"), with one tweak: the open
taxonomy (D2′) means Phase 1 also needs the invent→propose→approve flow and the
suggestions surface (D2a/D2c), not just auto-labeling.
