// Theme engine: resolves the user's palette + mode + optional custom accent and
// applies them to <html> via data-attributes that styles.css keys on. "system"
// mode is resolved here to an explicit light|dark, so the CSS only needs two
// concrete mode states (no @media duplication per theme).

import type { Settings } from "./store";

export type ThemeId = "cafe" | "forest" | "graphite" | "paper" | "terminal";
export type ThemeMode = "system" | "light" | "dark";

export interface ThemePreset {
  id: ThemeId;
  label: string;
  /** A one-word feel for the picker subtitle. */
  blurb: string;
  /** Swatch colors for the picker card: surface / accent / text. */
  swatch: { bg: string; accent: string; text: string };
  /** terminal is dark-only by design; the picker shows its dark swatch. */
  darkOnly?: boolean;
}

export const THEMES: ThemePreset[] = [
  { id: "cafe", label: "Cafe", blurb: "cream + espresso", swatch: { bg: "#f9f7f5", accent: "#5d4432", text: "#3e2b1e" } },
  { id: "forest", label: "Forest", blurb: "bone + deep green", swatch: { bg: "#f4f6f1", accent: "#2f5d3a", text: "#22301f" } },
  { id: "graphite", label: "Graphite", blurb: "neutral + slate", swatch: { bg: "#f3f2f0", accent: "#3a4654", text: "#23262b" } },
  { id: "paper", label: "Paper", blurb: "high-contrast + orange", swatch: { bg: "#fbfaf7", accent: "#ff5500", text: "#1a1a1a" } },
  { id: "terminal", label: "Terminal", blurb: "amber phosphor", swatch: { bg: "#13110e", accent: "#e0a33c", text: "#ece4d6" }, darkOnly: true },
];

const DARK_QUERY = "(prefers-color-scheme: dark)";

function prefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches;
}

/** Effective light|dark from the user's mode + the OS preference. */
export function resolveMode(mode: ThemeMode | undefined): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  return prefersDark() ? "dark" : "light";
}

/** Pick black/white ink for an accent hex via relative luminance (WCAG-ish). */
export function inkFor(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#ffffff";
  const value = parseInt(match[1], 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum =
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255);
  return lum > 0.42 ? "#1a1a1a" : "#ffffff";
}

const CUSTOM_PROPS = ["--accent", "--accent-hover", "--accent-soft", "--accent-ink"] as const;

type ThemeSettings = Pick<Settings, "theme" | "mode" | "accent">;

/** Apply palette + mode + custom accent to <html>. Idempotent and cheap. */
export function applyTheme(settings: ThemeSettings): void {
  const root = document.documentElement;
  root.dataset.theme = settings.theme || "graphite";
  root.dataset.mode = resolveMode(settings.mode);

  const accent = settings.accent?.trim();
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-hover", `color-mix(in srgb, ${accent} 85%, #000)`);
    root.style.setProperty("--accent-soft", `color-mix(in srgb, ${accent} 16%, var(--bg))`);
    root.style.setProperty("--accent-ink", inkFor(accent));
  } else {
    for (const prop of CUSTOM_PROPS) root.style.removeProperty(prop);
  }
}

/** Re-apply on OS light/dark change while in "system" mode. Call once on boot. */
export function watchSystemMode(getSettings: () => ThemeSettings): void {
  if (typeof matchMedia !== "function") return;
  const mq = matchMedia(DARK_QUERY);
  const onChange = () => {
    if ((getSettings().mode ?? "system") === "system") applyTheme(getSettings());
  };
  if (mq.addEventListener) mq.addEventListener("change", onChange);
  else mq.addListener(onChange);
}
