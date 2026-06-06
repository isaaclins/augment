// Lightweight persistence for purely-frontend state (rules + UI settings) using
// the webview's localStorage, which survives relaunch in the app's data
// container. Schedule items (snooze/watch) live in the Rust store instead,
// because the Rust scheduler must read them without the webview.

import type { Rule } from "./rules/types";
import { DEFAULT_KEYBINDS, type Keybinds } from "./keybinds";

const RULES_KEY = "augment.rules.v1";
const SETTINGS_KEY = "augment.settings.v1";
const FOLDERS_KEY = "augment.folders.v1";

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
}

export const DEFAULT_SETTINGS: Settings = {
  autoApplyRules: false,
  snoozeLabel: "Augment/Snoozed",
  keybinds: DEFAULT_KEYBINDS,
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
    return raw ? (JSON.parse(raw) as Rule[]) : [];
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

/** Stable unique id for new rules. */
export function newId(): string {
  return crypto.randomUUID();
}
