# Skills Rundown

A reference of the skills available in this Claude Code session, grouped by purpose.
Invoke any of them by typing `/<skill-name>` (e.g. `/code-review`, `/run`).

## 🎨 Design & Frontend (build/style UIs)

| Skill | What it does |
|---|---|
| **frontend-design** | Build distinctive, production-grade web components/pages that avoid generic AI aesthetics |
| **design-taste-frontend** | Anti-slop frontend for landing pages/portfolios/redesigns; infers design direction, audit-first |
| **design-taste-frontend-v1** | The original v1 of the above, kept for backward compatibility |
| **gpt-taste** | UX/UI + advanced GSAP motion; randomized layouts, editorial typography, scroll animations |
| **high-end-visual-design** | Makes sites feel "expensive" — exact fonts, spacing, shadows, cards; blocks cheap defaults |
| **redesign-existing-projects** | Upgrades existing sites/apps to premium quality without breaking functionality |
| **minimalist-ui** | Clean editorial interfaces — warm monochrome, bento grids, no gradients/heavy shadows |
| **industrial-brutalist-ui** | Raw mechanical/"declassified blueprint" aesthetic; data-heavy dashboards & editorial sites |
| **stitch-design-taste** | Generates `DESIGN.md` design-system files for Google Stitch |
| **image-to-code** | Generates design images first, analyzes them, then builds the site to match |
| **better-animation** | Motion engine — picks CSS vs Motion vs GSAP, custom easing, stagger, scroll/spring choreography, reduced-motion, cleanup |

## 🖼️ Image / Visual Generation

| Skill | What it does |
|---|---|
| **brandkit** | Premium brand-guideline boards, logo systems, identity decks |
| **canvas-design** | Original visual art as `.png`/`.pdf` — posters, designs, art pieces |
| **imagegen-frontend-web** | One reference image *per section* of a website design |
| **imagegen-frontend-mobile** | Premium mobile app screen concepts in phone mockups (images only, no code) |

## 📄 Documents & Files

| Skill | What it does |
|---|---|
| **docx** | Create/read/edit Word documents |
| **pptx** | Anything involving PowerPoint `.pptx` decks |
| **xlsx** | Spreadsheets — `.xlsx`/`.csv`/`.tsv` read, edit, create, convert |
| **pdf** | All PDF work — extract, merge, split, fill forms, OCR, etc. |

## ✍️ Writing & Outreach

| Skill | What it does |
|---|---|
| **cold-outreach** | Cold email / LinkedIn / first-touch outreach sequences |
| **seo-writing** | Search-optimized content balancing keywords with messaging |

## 🤖 Browser & Automation

| Skill | What it does |
|---|---|
| **agent-browser** | Browser automation CLI (preferred) — navigate, fill forms, scrape, test, also Electron apps & Slack |
| **browser-use** | Browser interactions for testing, forms, screenshots, data extraction |

## 🛠️ Dev Workflow & Code Quality

| Skill | What it does |
|---|---|
| **code-review** | Review current diff for bugs + cleanups (low→ultra effort; `--comment`/`--fix`) |
| **review** | Review a pull request |
| **security-review** | Security review of pending changes on the branch |
| **simplify** | Apply reuse/simplification/efficiency cleanups (quality only, no bug hunting) |
| **deslop** | Remove AI-generated code "slop" and clean up style |
| **verify** | Run the app and observe behavior to confirm a change actually works |
| **run** | Launch and drive this project's app to see a change working |
| **tdd** | Test-driven development with red-green-refactor loop |
| **tackle-issue** | Resolve a GitHub/GitLab issue end-to-end |
| **full-output-enforcement** | Forces complete code generation, bans placeholders/truncation |

## 📐 Planning & Multi-Agent

| Skill | What it does |
|---|---|
| **roadmap** | Plan & autonomously execute whole app builds, phase by phase |
| **mega-goal-prompt** | Interviews you to write a `/goal` mega-prompt for autonomous runs |
| **grill-me** | Interrogates you to stress-test a plan/design |
| **grill-with-docs** | Same, but challenges your plan against your domain model & updates docs |
| **dispatching-parallel-agents** | For 2+ independent tasks with no shared state |
| **subagent-driven-development** | Execute plans with independent tasks in the current session |
| **deep-research** | Multi-source, fact-checked, cited research reports |
| **handoff** | Write compact session handoffs |

## ⚙️ Claude Code Config & Meta

| Skill | What it does |
|---|---|
| **update-config** | Configure the harness via `settings.json` (hooks, permissions, env vars) |
| **keybindings-help** | Customize keyboard shortcuts (`~/.claude/keybindings.json`) |
| **fewer-permission-prompts** | Scan transcripts and add an allowlist to reduce permission prompts |
| **loop** | Run a prompt/command on a recurring interval |
| **schedule** | Create/manage scheduled remote agents (cron routines) |
| **claude-api** | Build/debug/optimize Claude API & Anthropic SDK apps; model migrations |
| **init** | Initialize a `CLAUDE.md` for the codebase |
| **find-skills** | Helper to discover skills |
| **goodnight** | Ends the session (lets your Mac sleep) when you sign off |
