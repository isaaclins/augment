// Keyboard shortcuts for switching the main view. A keybind is stored as a
// normalized combo string ("mod+1", "mod+shift+i") where "mod" is Cmd on macOS
// and Ctrl elsewhere — the rest of the app already treats those interchangeably.
// The same `eventToCombo` is used both to record a binding and to match a live
// keypress, so capture and matching can never drift apart.

/** Views reachable by a configurable shortcut. */
export type NavAction = "inbox" | "snoozed" | "watching" | "sent" | "drafts" | "rules";

export const NAV_ACTIONS: { id: NavAction; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "snoozed", label: "Snoozed" },
  { id: "watching", label: "Watching" },
  { id: "sent", label: "Sent" },
  { id: "drafts", label: "Drafts" },
  // The id stays "rules" (view key + stored keybind), but it opens the merged
  // Setup view, so the shortcut is labelled "Setup" to match the sidebar.
  { id: "rules", label: "Setup" },
];

export type Keybinds = Record<NavAction, string>;

export const DEFAULT_KEYBINDS: Keybinds = {
  inbox: "mod+1",
  snoozed: "mod+2",
  watching: "mod+3",
  rules: "mod+4",
  sent: "mod+5",
  drafts: "mod+6",
};

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

/** The subset of a KeyboardEvent we read — works for both DOM and React events. */
export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function normalizeKey(key: string): string | null {
  // Pure modifiers don't make a combo on their own — keep waiting for a real key.
  if (key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") return null;
  if (key === " " || key === "Spacebar") return "space";
  return key.toLowerCase();
}

/**
 * Convert a keypress to its normalized combo string, or null if only modifiers
 * are held. Cmd and Ctrl both collapse to "mod".
 */
export function eventToCombo(event: KeyLike): string | null {
  const key = normalizeKey(event.key);
  if (key === null) return null;
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("mod");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

/** True when `event` matches the bound `combo` (an empty combo never matches). */
export function matchCombo(event: KeyLike, combo: string): boolean {
  if (!combo) return false;
  return eventToCombo(event) === combo;
}

const KEY_LABELS: Record<string, string> = {
  escape: "Esc",
  enter: "↵",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  space: "Space",
  tab: "Tab",
  backspace: "⌫",
  delete: "Del",
};

function formatKey(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  if (key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Render a combo for display, e.g. "mod+1" → "⌘1" (mac) or "Ctrl+1". */
export function formatCombo(combo: string): string {
  if (!combo) return "";
  const out = combo.split("+").map((part) => {
    switch (part) {
      case "mod":
        return isMac ? "⌘" : "Ctrl";
      case "alt":
        return isMac ? "⌥" : "Alt";
      case "shift":
        return isMac ? "⇧" : "Shift";
      default:
        return formatKey(part);
    }
  });
  return isMac ? out.join("") : out.join("+");
}
