// Lightweight persistence for purely-frontend state (rules + UI settings) using
// the webview's localStorage, which survives relaunch in the app's data
// container. Schedule items (snooze/watch) live in the Rust store instead,
// because the Rust scheduler must read them without the webview.

import type { QuickAction } from "./quickActions";
import type { Rule, StoredRule } from "./rules/types";
import { normalizeRule } from "./rules/types";
import type { Tag } from "./tags";
import { normalizeLabel, type TriageResult } from "./features/triage";
import type { AssistantMessage, AssistantMode } from "./features/assistant";
import { DEFAULT_KEYBINDS, type Keybinds } from "./keybinds";
import type { ThemeId, ThemeMode } from "./theme";

const RULES_KEY = "augment.rules.v1";
const SETTINGS_KEY = "augment.settings.v1";
const FOLDERS_KEY = "augment.folders.v1";
const TAGS_KEY = "augment.tags.v1";
const TRIAGE_KEY = "augment.triage.v1";
const SKIPPED_LABELS_KEY = "augment.skippedLabels.v1";
const ASSISTANT_KEY = "augment.assistant.v1";
const QUICK_ACTIONS_KEY = "augment.quickActions.v1";

/** Cap on cached triage results — oldest are pruned on save. */
const MAX_TRIAGE = 2000;

/** A user-created folder, backed 1:1 by a Gmail label of the same name. */
export interface Folder {
  id: string;
  /** Gmail label name; also the display name shown in the sidebar. */
  name: string;
}

export interface Settings {
  /** Apply enabled rules automatically whenever the inbox is refreshed. */
  autoApplyRules: boolean;
  /** Gmail label used to hold snoozed threads. */
  snoozeLabel: string;
  /** Keyboard shortcut (combo string) for each navigable view. */
  keybinds: Keybinds;
  /** Master switch for local Ollama email triage. */
  triageEnabled: boolean;
  /** Triage newly-loaded mail automatically on every inbox refresh. */
  triageAuto: boolean;
  /** Ollama model used for triage (e.g. "qwen2.5:1.5b"). */
  triageModel: string;
  /** Ollama endpoint (the local daemon). */
  triageEndpoint: string;
  /** Write category/tag labels into Gmail (synced) vs. local chips only. */
  syncLabelsToGmail: boolean;
  /** Extra label ideas the user wants triage to prefer (the "hints" list). */
  suggestedLabels: string[];
  /** Ollama model for the assistant; empty falls back to `triageModel`. */
  assistantModel: string;
  /** Color theme palette. */
  theme: ThemeId;
  /** Light/dark preference; "system" follows the OS. */
  mode: ThemeMode;
  /** Optional custom accent hex (overrides the theme's accent when set). */
  accent: string;
}

export const DEFAULT_SETTINGS: Settings = {
  autoApplyRules: false,
  snoozeLabel: "Augment/Snoozed",
  keybinds: DEFAULT_KEYBINDS,
  triageEnabled: false,
  triageAuto: true,
  triageModel: "qwen2.5:1.5b",
  triageEndpoint: "http://localhost:11434",
  syncLabelsToGmail: true,
  suggestedLabels: [],
  assistantModel: "",
  theme: "cafe",
  mode: "system",
  accent: "",
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as object) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage failures are non-fatal for a personal tool; state simply won't
    // persist across launches.
  }
}

export function loadRules(): Rule[] {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (!raw) return [];
    // Migrate legacy flat rules (matchMode + conditions[]) to the tree shape.
    return (JSON.parse(raw) as StoredRule[]).map(normalizeRule);
  } catch {
    return [];
  }
}

export function saveRules(rules: Rule[]): void {
  writeJson(RULES_KEY, rules);
}

export function loadSettings(): Settings {
  const settings = readJson<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
  // Backfill any missing shortcut so older/partial stored settings keep working.
  return { ...settings, keybinds: { ...DEFAULT_KEYBINDS, ...settings.keybinds } };
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}

export function loadFolders(): Folder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    return raw ? (JSON.parse(raw) as Folder[]) : [];
  } catch {
    return [];
  }
}

export function saveFolders(folders: Folder[]): void {
  writeJson(FOLDERS_KEY, folders);
}

export function loadQuickActions(): QuickAction[] {
  try {
    const raw = localStorage.getItem(QUICK_ACTIONS_KEY);
    return raw ? (JSON.parse(raw) as QuickAction[]) : [];
  } catch {
    return [];
  }
}

export function saveQuickActions(actions: QuickAction[]): void {
  writeJson(QUICK_ACTIONS_KEY, actions);
}

export function loadTags(): Tag[] {
  try {
    const raw = localStorage.getItem(TAGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Tag[];
    // Backfill `source` for tags stored before it existed — those were all
    // hand-made, so default them to "user".
    return parsed.map((tag) => ({ ...tag, source: tag.source ?? "user" }));
  } catch {
    return [];
  }
}

export function saveTags(tags: Tag[]): void {
  writeJson(TAGS_KEY, tags);
}

/** Label names the user dismissed from the suggestion list (so triage stops
 *  re-proposing them). Stored lower-cased for case-insensitive matching. */
export function loadSkippedLabels(): string[] {
  try {
    const raw = localStorage.getItem(SKIPPED_LABELS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveSkippedLabels(names: string[]): void {
  writeJson(SKIPPED_LABELS_KEY, names);
}

/** A separate conversation per assistant mode. */
export type AssistantThreads = Record<AssistantMode, AssistantMessage[]>;

/** Persisted assistant conversations + selected mode (D9: survives restart).
 *  Each mode (ask/request/agent) keeps its own thread. */
export interface AssistantChat {
  mode: AssistantMode;
  threads: AssistantThreads;
}

function emptyThreads(): AssistantThreads {
  return { ask: [], request: [], agent: [] };
}

export function loadAssistantChat(): AssistantChat {
  try {
    const raw = localStorage.getItem(ASSISTANT_KEY);
    if (!raw) return { mode: "request", threads: emptyThreads() };
    const parsed = JSON.parse(raw) as {
      mode?: AssistantMode;
      threads?: Partial<AssistantThreads>;
      messages?: AssistantMessage[];
    };
    const mode: AssistantMode = parsed.mode ?? "request";
    const threads = emptyThreads();
    if (parsed.threads) {
      threads.ask = parsed.threads.ask ?? [];
      threads.request = parsed.threads.request ?? [];
      threads.agent = parsed.threads.agent ?? [];
    } else if (Array.isArray(parsed.messages)) {
      // Migrate the old single-thread format into the saved mode's thread.
      threads[mode] = parsed.messages;
    }
    return { mode, threads };
  } catch {
    return { mode: "request", threads: emptyThreads() };
  }
}

export function saveAssistantChat(chat: AssistantChat): void {
  // Keep the last 100 turns per thread so the log can't grow without bound.
  writeJson(ASSISTANT_KEY, {
    mode: chat.mode,
    threads: {
      ask: chat.threads.ask.slice(-100),
      request: chat.threads.request.slice(-100),
      agent: chat.threads.agent.slice(-100),
    },
  });
}

export function clearAssistantChat(): void {
  try {
    localStorage.removeItem(ASSISTANT_KEY);
  } catch {
    // best-effort
  }
}

/** Cached triage results, keyed by thread id. Categories are normalized on load
 *  so results cached under the old lower-case taxonomy ("receipt") display and
 *  group with freshly-triaged Title-Case labels ("Receipt"). */
export function loadTriage(): Record<string, TriageResult> {
  try {
    const raw = localStorage.getItem(TRIAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TriageResult>;
    for (const result of Object.values(parsed)) {
      if (result?.category) result.category = normalizeLabel(result.category);
    }
    return parsed;
  } catch {
    return {};
  }
}

export function saveTriage(triage: Record<string, TriageResult>): void {
  const entries = Object.entries(triage);
  // Keep the most-recent results under the cap so the cache can't grow forever.
  const pruned =
    entries.length <= MAX_TRIAGE
      ? triage
      : Object.fromEntries(
          entries.sort((a, b) => b[1].ts - a[1].ts).slice(0, MAX_TRIAGE),
        );
  writeJson(TRIAGE_KEY, pruned);
}

/** Stable unique id for new rules. */
export function newId(): string {
  return crypto.randomUUID();
}
