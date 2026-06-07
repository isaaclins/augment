# AUGMENT — FULL FRONTEND REDESIGN PROMPT
### Aesthetic codename: **"Warm Technical / Cozy Terminal"**

> Paste this whole file into Claude Code / Codex as the task. It is self-contained:
> every rule needed to execute the redesign is embedded below, and it also tells you
> which skills to run. Read it top to bottom before writing any code.

---

## 0. HOW TO USE THIS PROMPT

**Run these skills (invoke each; their directives are also concatenated inline in §6 so this prompt works even if a skill is missing):**

```
/redesign-existing-projects     ← the spine: audit first, never break functionality
/frontend-design                ← commit to one bold, distinctive direction
/design-taste-frontend          ← anti-slop engine + pre-flight gate
/better-animation               ← PRIMARY motion engine: easing, stagger, scroll, spring, GSAP/Motion, reduced-motion (installed)
/high-end-visual-design         ← haptic micro-detail (double-bezel, button-in-button) + motion choreography
/industrial-brutalist-ui        ← supplies the mono / grid / technical TYPE system (adapted, NOT its dark/red/no-radius rules)
/minimalist-ui                  ← supplies the warm editorial SURFACES, whitespace, hairlines, quiet motion
/deslop                         ← keep the diff clean, match existing code style
/full-output-enforcement        ← every screen finished, no placeholders, no TODOs
```

**Also load `@DESIGN.md`** — that file is the *right-side (Cafe) aesthetic* source of truth for color. The token table in §3 below extends it into a full app theme.

**The one-line design read (per /design-taste-frontend):**
*"Augment is a keyboard-first desktop email client. Redesign = full visual overhaul, content + IA + all functionality preserved. Direction: warm cafe palette married to a developer monospace type system — calm, tactile, technical, never sterile."*

---

## 1. MISSION & SCOPE

Redesign **literally the entire frontend** of Augment (a Tauri + React 19 desktop Gmail client). This is a **Redesign – Overhaul**: new visual language on top of existing content and information architecture. **Preserve 100% of functionality and IA. Change only the look, feel, motion, and component structure.**

**Every surface is in scope — none skipped:**

1. App shell + macOS titlebar drag region + session-restore screen (`App.tsx`, `main.tsx`)
2. Sign-in / OAuth screen (`SignIn.tsx`)
3. Sidebar — brand, nav, folders, tags, activity log, account row (`Sidebar.tsx`)
4. Inbox — list + reader split, rows, multi-select toolbar, sort/filter, pagination (`InboxView.tsx`)
5. Thread reader + message rail + sanitized email iframe (`ThreadReader.tsx`, `EmailView.tsx`)
6. ⌘K Search palette (`SearchPalette.tsx`)
7. AI Assistant drawer — Ask/Request/Agent modes, suggestion queue, chat, proposal cards (`AssistantPanel.tsx`)
8. Schedule panel — Snoozed + Watching lists (`SchedulePanel.tsx`)
9. Rules manager — list + condition/action editor (`RulesManager.tsx`)
10. Templates manager + rich-text editor (`TemplatesManager.tsx`, `RichTextEditor.tsx`)
11. Settings (in-window + detached settings window) — keybinds, Ollama triage, assistant model, label sync, **plus a NEW Appearance section: theme/palette picker + custom accent color + light/dark/system mode** (`SettingsView.tsx`, `SettingsWindow.tsx`) — see §3.5
12. Tag editor modal (`TagEditor.tsx`), context menu (`ContextMenu.tsx`), duration menu (`DurationMenu.tsx`)
13. Tag + triage chips (`tags.tsx`, `triage.tsx`), the custom icon set (`icons.tsx`)
14. The entire token + component stylesheet (`styles.css`, ~2,694 lines — rewrite it)

**Hard preservation rules (per /redesign-existing-projects §5.C — never modify silently):**
- Do not rename component props, the `useAugment()` API surface, Tauri command names, or localStorage keys.
- Do not change routing/view keys (`inbox`/`folder`/`tag`/`snoozed`/`watching`/`rules`/`templates`).
- Keep all keyboard shortcuts and the ⌘K behavior working.
- Keep email rendering **zero-remote-content** (DOMPurify sanitization + CSP) intact.
- Keep on-device Ollama triage, multi-select, pagination, snooze/watch scheduling, rules engine, tags, templates, search (FTS) all functional. Test after each screen.

---

## 2. THE AESTHETIC — "WARM TECHNICAL / COZY TERMINAL"

A deliberate fusion of two references:

| Source | What we take | What we drop |
|---|---|---|
| **Expressive** (`expressive-three.vercel.app`) — *left* | The **TYPE SYSTEM**: `IBM Plex Mono` everywhere in the chrome, uppercase bold display, tight tracking, the 40px graph-paper grid as a subtle texture, full-pill buttons | Its cool grey palette, its orange-on-white SaaS look |
| **Cafe** (`cafe-dusky-one.vercel.app` → `@DESIGN.md`) — *right* | The **AESTHETIC**: warm cream canvas, espresso-brown accent, soft rounded surfaces, friendly bento cards, cozy mood | Poppins (replaced by mono), emoji icons (replaced by clean SVG) |

**The feeling:** a hand-built developer tool that feels like a warm cafe, not a cold terminal. Monospace gives it precision and a "made by engineers" honesty; the cream/brown palette and soft corners make it inviting. Think *"a terminal that serves you a flat white."*

**Resolved conflicts (these are decisions — do not re-litigate):**
- `industrial-brutalist-ui` wants pure dark + hazard red + 0px corners. **We override:** keep its mono/grid/technical *typography and layout discipline*, but use the **warm Cafe palette and soft 4–12px radii** instead.
- `minimalist-ui` bans pills for large containers. **We override:** buttons and chips are full-pill (from both references); cards/panels use 8–12px. One coherent shape system, documented in §3.
- `minimalist-ui`/`design-taste-frontend` discourage Inter and ban emoji. **We comply:** primary face is IBM Plex Mono; **zero emoji** anywhere (icons only).
- Single accent rule (`design-taste-frontend`): **each theme has exactly one accent**, locked across every screen. Espresso brown `#5D4432` is the *default (Cafe)* accent; the user can switch palettes or set a custom accent in Settings (§3.5), but only ever one accent is live at a time.

---

## 3. DESIGN TOKENS — SINGLE SOURCE OF TRUTH

Rewrite the `:root` block of `src/styles.css` to exactly this system. Every component reads from these variables — no hardcoded colors anywhere (per /redesign-existing-projects code-quality audit).

**Color is user-switchable (see §3.5).** Cafe below is the *default theme*, not the only one. Split the tokens into two groups: **structural tokens** (fonts, radius, spacing, motion, grid, titlebar) live in `:root` and never change; **color tokens** (surfaces, text, accent, semantic, shadows) are grouped so a chosen palette can override them at runtime via a `[data-theme]` attribute. The IBM Plex Mono type system (the "left-side font") is **locked** across all themes — only the color/aesthetic varies.

### 3.1 Color — Cafe, Light (default theme)

```css
:root {
  /* Surfaces — warm cream (from DESIGN.md Cafe) */
  --bg:            #F9F7F5;   /* canvas */
  --bg-sidebar:    #F1ECE5;   /* sidebar / secondary panels */
  --bg-elevated:   #FCFBF9;   /* cards, reader, popovers (never pure #fff) */
  --bg-hover:      #EFE8E0;
  --bg-active:     #E9E3DD;   /* Cafe secondary — selected rows */

  /* Hairlines — warm, never cool grey */
  --border:        #E6DDD2;
  --border-strong: #D8CCBC;

  /* Text — deep coffee, never #000 */
  --text:          #3E2B1E;   /* DESIGN.md text */
  --text-secondary:#6F5C4C;
  --text-tertiary: #9C8B7A;

  /* Accent — single, espresso brown (DESIGN.md primary) */
  --accent:        #5D4432;
  --accent-hover:  #4A3527;
  --accent-soft:   #EDE3D9;   /* tinted bg for active/selected accent states */
  --accent-ink:    #FBF7F2;   /* text on accent (warm white) */

  /* Optional energetic accent — OFF by default; max one CTA per view */
  --pop:           #FF5500;   /* Expressive orange; opt-in only */

  /* Semantic (DESIGN.md) */
  --success:       #16A34A;  --success-soft: #E3F1E6;
  --warning:       #D97706;  --warning-soft: #FAEEDC;
  --danger:        #DC2626;  --danger-soft:  #FBE3E1;

  /* Shadows — warm-tinted, very soft (never pure-black, per minimalist-ui <0.08) */
  --shadow-sm: 0 1px 2px rgba(62,43,30,.06), 0 1px 3px rgba(62,43,30,.05);
  --shadow-md: 0 8px 24px rgba(62,43,30,.10);

  /* Radius — one documented system */
  --radius-sm:   4px;    /* DESIGN.md sm — inputs, small chips */
  --radius:      8px;    /* DESIGN.md md — cards, rows, menus */
  --radius-lg:   12px;   /* panels, modals */
  --radius-pill: 9999px; /* buttons, tags, badges */

  /* Texture — subtle warm graph paper (from Expressive, tinted warm) */
  --grid-color:  rgba(93,68,50,.045);
  --grid-size:   40px;

  /* Type */
  --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;
  --font-ui:   var(--font-mono);   /* chrome is mono everywhere */
  --fs-body:   13px;
  --titlebar-h: 28px;

  /* Motion */
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.32, 0.72, 0, 1);
  --t-fast: 150ms;  --t-base: 240ms;  --t-slow: 480ms;
}
```

### 3.2 Color — Cafe, Dark ("cozy terminal at night", warm not black)

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg:            #1A140F;   /* warm espresso near-black, never #000 */
    --bg-sidebar:    #211A13;
    --bg-elevated:   #261D16;
    --bg-hover:      #2D241B;
    --bg-active:     #352A1F;
    --border:        #3A2D22;
    --border-strong: #4B3A2C;
    --text:          #F0E7DD;   /* warm phosphor */
    --text-secondary:#BBA88F;
    --text-tertiary: #8A7868;
    --accent:        #CBA17A;   /* lifted latte tan — brown is unreadable on dark */
    --accent-hover:  #DAB28A;
    --accent-soft:   #2E2418;
    --accent-ink:    #1A140F;
    --pop:           #FF6A1F;
    --success:#34D27B; --success-soft:#16271C;
    --warning:#E8A24A; --warning-soft:#2A2113;
    --danger: #F26B5E; --danger-soft: #2C1715;
    --shadow-sm: 0 1px 2px rgba(0,0,0,.4);
    --shadow-md: 0 10px 30px rgba(0,0,0,.5);
    --grid-color: rgba(203,161,122,.05);
  }
}
```

### 3.3 Typography rules (fusing Expressive type + the skills)

- **One family for all chrome: `IBM Plex Mono`.** Self-host the woff2s (Tauri runs offline — do NOT `<link>` Google Fonts; add `@font-face` with `font-display: swap`, or use `@fontsource/ibm-plex-mono`). Weights: 400, 500, 600, 700, **900**.
- **Display / big headers** (empty-state titles, sign-in, settings section headers): weight **900**, `text-transform: uppercase`, `letter-spacing: 0` to `-0.01em`, `line-height: 1.0–1.05`, scale with `clamp()` (e.g. `clamp(1.5rem, 3vw, 2.5rem)`). Mono caps = the Expressive signature.
- **Micro-labels / eyebrows / nav section headers** (e.g. "FOLDERS", "TAGS", "ACTIVITY"): `0.6875rem`, uppercase, **wide tracking `0.06em–0.1em`**, `--text-tertiary`. (industrial-brutalist micro-type.)
- **Body / UI / rows / buttons:** weight 400–500, normal case, `--fs-body` (13px), `line-height: 1.5`. Mono is legible at this size; keep line length sane.
- **Numerals / dates / counts / sizes:** mono is naturally tabular — perfect for unread counts, timestamps, byte sizes. Right-align numeric columns.
- **No Inter. No Poppins. No serif. Zero emoji.** (Compliance with /minimalist-ui + /design-taste-frontend.)
- **The rendered email body** (inside the sanitized iframe) is *content*, not chrome — leave its own styles alone; only style the iframe frame.

### 3.4 The grid texture (optional, subtle)

Apply the warm graph-paper grid **only** to large empty canvases (the main content background, empty states, sign-in) — never on scrolling lists or behind text-dense rows:

```css
.canvas-grid {
  background-image:
    linear-gradient(to right,  var(--grid-color) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px);
  background-size: var(--grid-size) var(--grid-size);
}
```

### 3.5 Theming engine — user-switchable color (REQUIRED)

The user must be able to change the color theme in Settings. The mono type system, layout, radii, spacing, and motion stay constant; only the **color tokens** swap.

**Architecture:**
- Keep all **color tokens** behind a `[data-theme]` selector. `:root` (no attribute) = **Cafe** default. Each preset overrides the same variable names:
  ```css
  :root,
  :root[data-theme="cafe"]    { /* §3.1 light values */ }
  :root[data-theme="forest"]  { --bg:#F4F6F1; --accent:#2F5D3A; --accent-ink:#F6FAF4; --text:#22301F; /* …full set… */ }
  :root[data-theme="graphite"]{ --bg:#F3F2F0; --accent:#3A4654; --accent-ink:#F7F8FA; --text:#23262B; /* …full set… */ }
  :root[data-theme="paper"]   { --bg:#FBFAF7; --accent:#FF5500; --accent-ink:#FFFFFF; --text:#1A1A1A; /* high-contrast, Expressive-orange pop */ }
  :root[data-theme="terminal"]{ --bg:#13110E; --accent:#E0A33C; --accent-ink:#13110E; --text:#ECE4D6; /* dark-first amber phosphor */ }
  ```
- **Light/dark per theme:** each palette defines both. Default follows `prefers-color-scheme`; an explicit override is a `data-mode` attribute (`light` / `dark` / unset = system). Nest the dark values under `@media (prefers-color-scheme: dark)` AND under `:root[data-mode="dark"]` so the manual override works. Keep it DRY by sharing the dark block where palettes converge, but each palette must be legible in both modes (audit contrast).
- **Custom accent (let the user pick any color):** when a custom hex is set, apply it to `--accent` inline on `<html>` and **derive the rest with `color-mix()`** (WebKit/Tauri-supported) so no JS color math is needed:
  ```css
  :root[data-accent-custom] {
    --accent-hover: color-mix(in srgb, var(--accent) 85%, #000);
    --accent-soft:  color-mix(in srgb, var(--accent) 14%, var(--bg));
    --accent-ink:   /* pick #fff or var(--text) based on luminance — compute once in JS, store with the hex */;
  }
  ```
  Store the chosen `--accent-ink` (black or white) alongside the hex at pick-time via a quick relative-luminance check, so contrast stays AA.

**Wiring (reuse what exists — do not add a state lib):**
- Add `theme` (palette id), `mode` (`system`|`light`|`dark`), and `accent` (optional hex) to the settings object persisted through the existing `src/lib/store.ts` (`loadSettings`/`saveSettings`). Do not rename existing keys.
- On app boot and whenever settings change, an `applyTheme(settings)` helper sets `document.documentElement.dataset.theme` / `dataset.mode` and the inline custom accent. Call it in both the main window and the detached settings window.
- Broadcast changes across windows with the existing `src/lib/settingsSync.ts` (`broadcastSettings` / `onSettingsBroadcast`) so changing the theme in the settings window instantly re-skins the main window.
- Respect `prefers-color-scheme` as the default when `mode === "system"`.

**Starter palette set to ship (all share the warm-technical structure + IBM Plex Mono):**
`cafe` (cream + espresso, default) · `forest` (bone + deep green) · `graphite` (warm-cool neutral + slate ink) · `paper` (high-contrast paper + Expressive orange) · `terminal` (dark amber phosphor) · **+ Custom accent**. Provide full light+dark token sets for each; keep them all AA-legible. The agent may refine the exact hexes, but each must obey §12 bans (no pure #000/#fff, one accent, warm-tinted shadows, etc.).

---

## 4. TECH & ARCHITECTURE CONSTRAINTS

- **Keep the stack.** React 19 + TypeScript + Vite + Tauri 2. Keep **pure CSS with custom properties** in `src/styles.css`. Do **not** introduce Tailwind, CSS-in-JS, or a component library. (per /redesign-existing-projects: work with the existing stack; do not migrate.)
- **Icons:** keep the custom SVG set in `src/ui/icons.tsx`. Standardize every icon to **one stroke width (1.75px)** and have them inherit `currentColor`. Restyle/extend them to match the warm-technical feel; **no emoji**, no second icon library.
- **Animation:** CSS transitions + keyframes are the baseline (use the §3.1 easings). You **may** add the `motion` library (`motion/react`) **only** for the few places that genuinely need spring physics or choreographed list reveals (assistant messages, search results, modal/drawer enter-exit). Verify `package.json` before importing anything (per /design-taste-frontend §8.F). If you add it, lazy-load and keep it off the critical path.
- **Verify deps before importing.** Never assume a package exists.
- **No new global state lib.** Keep the React Context (`AugmentProvider`).

---

## 5. PROCESS — DO IT IN THIS ORDER

Apply /redesign-existing-projects' fix-priority and audit-first method:

1. **Audit (write it down first).** Read `styles.css` and every `src/ui/*.tsx`. List, per the §12 ban list, every generic pattern, missing state (loading/empty/error), hardcoded color, weak hierarchy, and inconsistency. Map current tokens → new tokens.
2. **Tokens.** Rewrite the `:root` + dark block to §3 exactly. Add `@font-face`/fontsource for IBM Plex Mono. This alone re-skins most of the app — verify nothing breaks.
3. **Primitives (§8).** Restyle the shared atoms: buttons, inputs, selects, textareas, toggle, chips, badges, `<kbd>`, menus/popovers, modals, scrollbars, focus rings. Everything else inherits from these.
4. **Shell + Sidebar + Inbox** (the screens users live in) — §7.
5. **Reader, Search, Assistant, Schedule, Rules, Templates, Settings, modals** — §7.
6. **States (§10).** Add loading skeletons, composed empty states, inline errors to every screen.
7. **Motion (§9).** Layer in entry/hover/active motion last, only where motivated.
8. **Polish + verify (§11, §13).** Run the merged pre-flight checklist. Test light + dark. Run the app and click through every screen. Run `/deslop` on the diff.

Work screen-by-screen and keep the app runnable at every step. **Finish every screen — no placeholders** (per /full-output-enforcement).

---

## 6. CONCATENATED SKILL DIRECTIVES (conflict-resolved)

### 6.1 `/redesign-existing-projects` — the spine
- Scan → diagnose → fix. Don't rewrite logic; re-skin and re-compose.
- Audit every screen for: browser-default/Inter fonts, weak headlines, oversaturated/clashing colors, >1 accent, pure-black/white, generic box-shadows, flat textureless sections, everything-centered symmetry, 3-equal-card rows, missing max-width, uniform radius, missing hover/active/focus, missing loading/empty/error states, dead links, div-soup, hardcoded px, arbitrary z-index, dead code, import hallucinations.
- Fix order: font swap → color cleanup → hover/active states → layout & spacing → replace generic components → loading/empty/error → typographic polish.
- **Never break functionality. Test after every change.**

### 6.2 `/design-taste-frontend` — anti-slop gate
- **ZERO em-dashes (`—`)** anywhere — UI strings, comments, copy. Use `-`.
- **One accent, locked** across the whole app (espresso brown). No surprise second color.
- **One shape system, locked** (pills for buttons/chips, 8–12px for cards/panels, 4px for inputs).
- **Button contrast WCAG AA** (4.5:1). No low-contrast ghost buttons. Audit every CTA.
- **Form contrast:** inputs, placeholders, focus rings, labels all pass AA on warm surfaces.
- **No duplicate CTA intent** in one view. **CTA labels ≤ 3 words, never wrap.**
- Full interactive cycles: loading (skeletons, not spinners), empty (composed), error (inline), tactile `:active`.
- Dark mode mandatory, tested in both. Honor `prefers-reduced-motion`. Animate only `transform`/`opacity`.

### 6.3 `/frontend-design` — commit to the direction
- Pick the bold direction and execute with precision — here it's "warm technical." Be intentional, cohesive, memorable. Refined minimalism, not maximalism. No generic AI aesthetics (no purple gradients, no Inter, no cookie-cutter cards).

### 6.4 `/industrial-brutalist-ui` — TYPE + GRID discipline (adapted)
- **Take:** monospace dominance for data/labels, uppercase micro-type with wide tracking, massive `clamp()` display type, the blueprint grid mindset, semantic tags (`<data>`, `<kbd>`, `<dl>`, `<output>`), tabular density for lists, visible hairline compartmentalization, ASCII-ish framing where tasteful (`>>`, `[ ]`) used *sparingly*.
- **Drop (overridden):** dark-only substrate, hazard-red accent, 0px corners, scanline/CRT grime. We are warm and softly rounded.

### 6.5 `/minimalist-ui` — warm editorial SURFACES
- Warm monochrome palette with spot semantic color only. Generous macro-whitespace. Hairline `1px solid var(--border)` dividers instead of boxes where possible. Ultra-soft shadows (<0.08 opacity). Crisp small radii on cards. `<kbd>` rendered as physical keys. Quiet, invisible motion (`translateY(8–12px)` + opacity, 400–600ms, `--ease-out`, staggered). No gradients, no neon, no heavy shadows.

### 6.6 `/better-animation` (primary motion engine) + `/high-end-visual-design`
- **Run `/better-animation` for every animated surface** — it governs tool choice (CSS vs Motion vs GSAP), easing, stagger orchestration, scroll-driven patterns, spring physics, reduced-motion, and cleanup. §9 below is its applied summary for this app.
- **Custom easings only** — never `linear`/`ease-in-out`. Use `--ease-out` / `--ease-spring`.
- **Tactile press:** `:active { transform: scale(.98) }` on buttons/rows.
- **Magnetic-ish hover** on primary actions: subtle lift + trailing-icon nudge.
- **Staggered entry** for lists/cards via `animation-delay: calc(var(--i) * 40ms)`.
- **Nested "double-bezel"** for the few hero containers (sign-in card, assistant proposal cards): an outer warm shell (`--bg-sidebar` + hairline + small padding + `--radius-lg`) wrapping an inner `--bg-elevated` core with a concentric smaller radius and a 1px inset highlight. Use sparingly — this is an app, not a landing page.
- **Performance:** `transform`/`opacity` only; `backdrop-blur` only on fixed overlays; `will-change` sparingly; clean up every effect.

### 6.7 `/deslop` — clean diff
- Match the existing code style. No defensive try/catch on trusted paths, no `any` casts to dodge types, no dead/commented code, no redundant comments. Minimal, focused edits. Keep the summary tight.

### 6.8 `/full-output-enforcement` — completeness
- Every screen, every state, fully implemented. **Banned:** `// ...`, `// rest unchanged`, `// TODO`, skeleton stubs, "the others follow the same pattern." If output is long, stop at a clean file boundary and continue — never compress or skip.

---

## 7. PER-SCREEN REDESIGN BRIEF

For each: **Preserve** = behavior/data that must keep working. **Redesign** = the visual direction.

### 7.1 App shell + titlebar + session restore (`App.tsx`, `main.tsx`)
- **Preserve:** titlebar drag region, context-menu suppression, the restoring/ready/sign-in branching, settings-window entry detection.
- **Redesign:** warm canvas (`--bg`) with optional `.canvas-grid`. The "Restoring your session…" state becomes a centered mono caps line + a slim warm progress bar or a 3-dot mono pulse (`. . .`), not a generic spinner. Titlebar height `--titlebar-h`, transparent, traffic-light safe.

### 7.2 Sign-in (`SignIn.tsx`)
- **Preserve:** OAuth trigger, feature list, error display, browser-auth indicator.
- **Redesign:** the page's one "hero." Centered double-bezel card on the grid canvas. Brand wordmark in IBM Plex Mono **900 uppercase**. Tagline in mono. Feature list as a clean hairline-separated list with SVG icons (Rules / Snooze / Watch / Private rendering) — no emoji. Primary "Sign in with Google" as a full-pill brown button (`--accent` / `--accent-ink`) with a trailing arrow icon in its own circular wrapper. Error as an inline `--danger-soft` panel with `--danger` text — direct copy ("Connection failed. Try again."), no "Oops!", no `!`.

### 7.3 Sidebar (`Sidebar.tsx`)
- **Preserve:** nav items + unread counts, folder create/delete, tag list with edit/delete + auto-tag marker, activity log, account row + sign-out, active-view highlighting.
- **Redesign:** `--bg-sidebar`, 232px, hairline right border. Brand at top in mono caps. Nav items: mono, normal case, icon + label + right-aligned **tabular** unread count; active item = `--accent-soft` bg + `--accent` text + a 2px left accent bar; hover = `--bg-hover`. Section headers ("FOLDERS", "TAGS", "ACTIVITY") = uppercase micro-labels, wide tracking, `--text-tertiary`. Folders/tags as compact rows; tag glyph keeps its color but desaturated to sit in the warm palette. Auto-tag marker = a small SVG sparkle, **not** emoji. Activity log: mono timestamps (relative), a tiny semantic status dot **only** for real state (success/warn/info) — used sparingly. Account row pinned bottom with hairline top divider.

### 7.4 Inbox — list + reader (`InboxView.tsx`)
- **Preserve:** thread rows (sender/subject/snippet/date/unread), multi-select (shift-range, cmd-toggle, select-all), bulk toolbar (archive/move/mark-read/delete), sort dropdown, active-filter chip + clear, "load more" pagination, tag chips + triage category/priority chips on rows.
- **Redesign:** CSS Grid `360px | 1fr`. List header: list title in mono caps + sort/filter controls as small pill buttons. **Rows are hairline-separated, no card boxes** (industrial density + minimalist hairlines): sender (500 weight), subject (400), snippet (`--text-secondary`, single line, ellipsis), right column = tabular date over chips. Unread = a small filled `--accent` dot + slightly bolder sender. Selected row = `--bg-active` + 2px inset left accent bar. Bulk toolbar slides in as a pill bar over the list header when `selectedIds` > 0, mono action labels with icons. Sort/filter as menus from §8. **Empty inbox** = composed state (§10), not blank.

### 7.5 Thread reader + email view (`ThreadReader.tsx`, `EmailView.tsx`)
- **Preserve:** subject/from/to/date header, multi-message rail (tap to switch), sanitized iframe (zero remote), archive/snooze/watch action buttons.
- **Redesign:** `--bg-elevated` pane. Header: subject in mono (larger, 600), from/to/date as a mono `<dl>` key/value block (labels uppercase micro, values tabular). Message rail = stacked compact cards or a vertical hairline list; active message highlighted with `--accent-soft`. Action buttons as a right-aligned pill cluster (archive = neutral, snooze/watch = outlined). The email iframe sits in a subtly inset frame (hairline + `--radius`) so sender HTML reads as a "document on the desk" without us restyling its internals.

### 7.6 ⌘K Search palette (`SearchPalette.tsx`)
- **Preserve:** live metadata search → FTS once ready, ↑/↓/↵/ESC nav, FTS status indicator, result count.
- **Redesign:** centered overlay on a dim warm scrim (`rgba(62,43,30,.35)` + `backdrop-blur` — overlay only). Search field in mono with a leading search icon and a trailing `<kbd>⌘K</kbd>`. Results = hairline rows: from + subject (mono) over snippet, tabular date right. Highlighted result = `--accent-soft`. FTS status as a tiny mono caption ("INDEXING…" / "READY") with a sparing status dot. Results stagger-reveal (40ms). Empty query = recent/empty state; no results = composed "nothing found" line.

### 7.7 AI Assistant drawer (`AssistantPanel.tsx`)
- **Preserve:** Ask/Request/Agent mode selector, label-suggestion queue (approve/skip), conversation log, Request-mode proposal cards (Apply/Cancel), textarea input, Ask hints.
- **Redesign:** right drawer, `--bg-elevated`, hairline left border, slides in with spring. Mode selector = a segmented pill (3 segments) in mono caps; active segment = `--accent`. Suggestion queue items = compact double-bezel cards with the proposed tag chip + approve (brown pill) / skip (ghost) buttons. Chat: user vs assistant messages distinguished by alignment + a subtle `--bg-sidebar` bubble for assistant (soft radius, NOT pills). Proposal cards = clear `--accent`-edged panels with Apply (filled) / Cancel (ghost). Messages stagger-reveal. Textarea = §8 style with a mono placeholder.

### 7.8 Schedule panel (`SchedulePanel.tsx`)
- **Preserve:** snooze + watch lists, schedule cards, due dates with color coding, action buttons, overdue highlighting.
- **Redesign:** list of hairline cards: subject (mono) + due time (tabular). Due-color via semantic tokens — overdue = `--danger` text + `--danger-soft` left edge; soon = `--warning`; later = `--text-secondary`. Snooze/watch duration via the §8 menu. Empty = composed "nothing snoozed" state.

### 7.9 Rules manager (`RulesManager.tsx`)
- **Preserve:** rule list + enable/disable toggle, inline editor, field/operator dropdowns, action builder, ALL/ANY match mode.
- **Redesign:** rules as hairline rows with the §8 toggle. Editor opens inline (slide-down, not modal): condition rows read like a mono sentence — `[FROM] [contains] [____]` using §8 selects + input, an ALL/ANY segmented pill, and action chips (add label / archive / mark read / star). "Add condition" / "Add action" as ghost pill buttons with a plus icon. Save = brown pill, delete = ghost danger.

### 7.10 Templates manager + rich-text editor (`TemplatesManager.tsx`, `RichTextEditor.tsx`)
- **Preserve:** list + preview, inline editor (name + rich-text body), save/delete, B/I/U formatting.
- **Redesign:** template list as hairline rows; editor with a mono name input and the rich-text area framed like the reader (inset hairline). Toolbar = a small pill cluster of icon buttons (B / I / U) with active-state fill. Preview toggle as a segmented pill.

### 7.11 Settings (`SettingsView.tsx`, `SettingsWindow.tsx`)
- **Preserve:** keybind editing (combo chips), Ollama triage (enable, model, endpoint, test connection), triage-on-refresh toggle, suggested-labels input, assistant model, label-sync toggle. The detached settings window must keep its separate entry.
- **Redesign:** sectioned layout, each section led by an uppercase mono micro-label + a one-line `--text-secondary` description (no clutter sentences). Settings rows = label left, control right, hairline between. Keybinds rendered as `<kbd>` physical keys (editable). Toggles = §8. "Test connection" = ghost pill that shows an inline mono status ("CONNECTED" `--success` / "UNREACHABLE" `--danger`). Constrain content to `max-width: 640px`. The settings window inherits the same tokens.
- **NEW — "APPEARANCE" section (first section, per §3.5):**
  - **Theme picker:** the starter palettes (`cafe`, `forest`, `graphite`, `paper`, `terminal`) as a row of selectable swatch cards — each shows its surface + accent + a mono "Aa" preview; selected card gets an `--accent` ring. Cafe is default.
  - **Custom accent:** a "Custom" swatch that opens a color input (the 8-tag palette as quick picks + a freeform hex field). On pick, compute `--accent-ink` (black/white) by luminance and persist hex + ink.
  - **Mode toggle:** a 3-segment pill — System / Light / Dark (`data-mode`).
  - **Live preview:** changing any control re-skins the whole app immediately via `applyTheme()` + `settingsSync` broadcast (the main window updates while the settings window is open).
  - Persist `theme` / `mode` / `accent` through the existing `store.ts` settings; never block on save.

### 7.12 Tag editor / context menu / duration menu (`TagEditor.tsx`, `ContextMenu.tsx`, `DurationMenu.tsx`)
- **Preserve:** tag create/edit (name + color + icon picker), nested right-click menu, snooze/watch presets.
- **Redesign:** Tag editor = small centered modal (§8) with a mono name input, a color swatch row (the 8 palette colors as rounded squares, selected = ring), an icon picker grid (SVG icons, selected = `--accent-soft`), live chip preview. Context menu + duration menu = the §8 popover style (mono items, hover `--bg-hover`, hairline separators, nested submenu with a chevron).

---

## 8. COMPONENT PRIMITIVES SPEC

Build these once; everything inherits. All mono, all token-driven.

- **Button (base):** `--font-mono`, 13px, weight 500, `padding: 8px 16px`, `border-radius: var(--radius-pill)`, `transition: var(--t-fast) var(--ease-out)`; `:hover` lift + bg shift; `:active { transform: scale(.98) }`; visible `:focus-visible` ring (`box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent)`).
  - **Primary:** `bg: var(--accent)`, `color: var(--accent-ink)`. Optional trailing-icon-in-circle for hero CTAs.
  - **Ghost:** transparent, `color: var(--text)`, hover `--bg-hover`.
  - **Danger ghost:** `--danger` text, hover `--danger-soft`.
- **Input / select / textarea:** `--bg-elevated`, `1px solid var(--border)`, `border-radius: var(--radius-sm)`, mono, 13px, `padding: 8px 10px`; `:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft) }`; mono placeholder `--text-tertiary`.
- **Toggle:** 34×20 pill track, sliding thumb; off `--border-strong`, on `--accent`; 200ms.
- **Tag chip:** full-pill, 11px, `padding: 2px 8px`, color-tinted bg + border from palette (desaturated for warmth), optional small SVG glyph.
- **Badge (status/triage):** small pill, uppercase mono micro, wide tracking; semantic soft bg + ink.
- **Priority pill:** high `--danger`, normal `--text-secondary`, low `--text-tertiary` — text + tiny bar, no loud fills.
- **`<kbd>`:** mono, `1px solid var(--border)`, `--bg-sidebar`, `border-radius: 4px`, `padding: 1px 5px`, subtle bottom border for a "key" feel.
- **Menu / popover:** `--bg-elevated`, hairline border, `--radius`, `--shadow-md`, min-width 180px, mono items `padding: 7px 10px`, hover `--bg-hover`, hairline separators, nested submenu via chevron.
- **Modal:** centered, `--bg-elevated`, `--radius-lg`, `--shadow-md`, ~420–480px, on a warm dim+blur scrim; spring enter, ESC + click-outside to close.
- **Card / panel:** `--bg-elevated`, hairline, `--radius`; shadow only when elevation conveys hierarchy (else just border/spacing).
- **Row (list item):** hairline-separated, no box; hover `--bg-hover`, selected `--bg-active` + 2px inset accent bar.
- **Scrollbars:** thin, warm (`--border-strong` thumb), rounded.
- **Focus ring:** consistent accent ring on every interactive element (a11y, non-negotiable).

---

## 9. MOTION SYSTEM

Driven by **/better-animation** (+ /high-end-visual-design + /minimalist-ui + /design-taste-frontend). **Every animation must be motivated** (hierarchy / feedback / state change) — if you can't justify it in one sentence, cut it.

- **Easings:** `--ease-out` for entrances/most transitions; `--ease-spring` for drawers/modals.
- **Page/screen entry:** key content fades up `translateY(8–12px)` + opacity over `--t-slow`.
- **Lists (inbox rows, search results, assistant messages, suggestions):** staggered reveal, `animation-delay: calc(var(--i) * 40ms)`, once.
- **Hover:** rows → `--bg-hover`; buttons → lift + optional trailing-icon nudge; cards → ultra-subtle shadow shift.
- **Press:** `scale(.98)` / `translateY(1px)` on `:active`.
- **Drawer/modal/palette:** spring enter (drawer slides X, modal/palette scale+fade) with matching exit.
- **Selection toolbar:** slides in when multi-select active.
- **Hard rules:** animate only `transform`/`opacity`; `backdrop-blur` only on fixed overlays; **never** `window.addEventListener('scroll')`; honor `prefers-reduced-motion` (collapse to instant); clean up every effect; no infinite loops except a single subtle "thinking" pulse (`. . .`) during triage/assistant work.

---

## 10. REQUIRED STATES (every screen)

- **Loading:** skeleton rows/cards shaped like the real content (mono shimmer in warm tones), never a bare spinner. Triage/assistant "working" = a mono `. . .` pulse.
- **Empty:** composed — a small SVG icon, a mono caps line, one `--text-secondary` sentence, and the relevant action. (Empty inbox, no snoozed, no rules, no templates, no search results, no tags, fresh assistant.)
- **Error:** inline `--danger-soft` panel, `--danger` text, direct active-voice copy, no `alert()`, no "Oops!", no `!`.
- **Disabled:** reduced opacity + `cursor: not-allowed`; never dead `#` links.

---

## 11. ACCESSIBILITY & PERFORMANCE

- WCAG AA contrast on all text, buttons, inputs, placeholders, focus rings — in **both** light and dark. Audit the brown-on-cream and tan-on-espresso pairs explicitly.
- Visible focus ring on every interactive element; full keyboard operability (preserve existing shortcuts + add focus traps to modal/palette/drawer).
- Semantic HTML: `<nav>`, `<main>`, `<aside>`, `<dl>`, `<kbd>`, `<output>`, real `<button>`s.
- `alt`/`aria-label` on icon-only buttons.
- `transform`/`opacity` animation only; lazy-load `motion` if added; keep bundle lean; clean effect teardown; no arbitrary z-index (define a small scale: base / sticky / overlay / modal / toast).

---

## 12. MERGED ANTI-SLOP BANS (hard fails)

- ❌ Inter, Poppins, system-sans, or any serif as a UI face — **IBM Plex Mono only.**
- ❌ Any emoji, anywhere (code, UI, copy, alt) — SVG icons only.
- ❌ Em-dash `—` anywhere — use `-`.
- ❌ Pure `#000`/`#fff`; cool greys; >1 accent; purple/blue "AI gradient"; neon/outer glows.
- ❌ Generic border+shadow+white card look as the default container.
- ❌ Three equal cards as a layout crutch; everything centered/symmetrical; missing max-width.
- ❌ Generic circular spinners; missing empty/error states; `window.alert()`; "Oops!"; trailing `!`.
- ❌ Lucide/Feather-as-default vibe, inconsistent stroke widths, second icon library.
- ❌ Hardcoded hex in components; arbitrary z-index; dead/commented code; `any`-casts; import hallucinations.
- ❌ AI copy clichés: "Elevate", "Seamless", "Unleash", "Next-Gen", "Game-changer", "Delve". Plain, specific, active voice; sentence case headers.
- ❌ `linear`/`ease-in-out`; animating `top/left/width/height`; `scroll` listeners.
- ❌ Breaking any existing feature, prop, command, or storage key.

---

## 13. FINAL PRE-FLIGHT CHECKLIST (run before declaring done)

- [ ] Audit was written before changes; tokens mapped old → new.
- [ ] `:root` Cafe light + dark match §3; **no hardcoded colors** remain in any component.
- [ ] IBM Plex Mono self-hosted (offline-safe) and used across all chrome; weights incl. 900.
- [ ] Theming engine (§3.5) works: ≥5 palettes + custom accent + light/dark/system, switchable in Settings, persisted, broadcast across both windows, applied on boot. Each palette is AA-legible in both modes. Type system stays constant across themes.
- [ ] Within any chosen theme: a single accent is locked across every screen; `--pop`/custom only as the one accent.
- [ ] One shape system: pills for buttons/chips, 8–12px panels, 4px inputs — consistent everywhere.
- [ ] Every button/input/row has hover + `:active` + visible focus-ring; AA contrast in both themes.
- [ ] Every screen has loading + empty + error states (§10).
- [ ] **Zero emoji. Zero em-dashes.** Grep to confirm.
- [ ] Motion is motivated, `transform`/`opacity` only, `prefers-reduced-motion` honored, effects cleaned up; no `scroll` listeners.
- [ ] All 14 surfaces in §1 redesigned and finished — none stubbed (per /full-output-enforcement).
- [ ] All features verified working: OAuth, inbox load + pagination, multi-select + bulk actions, reader + sanitized iframe (still zero-remote), ⌘K search (metadata + FTS), snooze/watch, rules, tags, templates, Ollama triage, assistant modes, settings (both windows).
- [ ] App runs; clicked through every screen in light **and** dark; no console errors.
- [ ] `/deslop` run on the diff; diff is clean, focused, matches existing style.
- [ ] `package.json` checked for any new import; nothing hallucinated.

**If a single box can't be honestly ticked, the redesign is not done. Fix it before delivering.**

---

*Direction: Warm Technical / Cozy Terminal — IBM Plex Mono on warm cream, espresso-brown accent, soft corners, quiet motion. Cafe warmth, engineer's honesty. Build it completely.*
