// Time formatting + the snooze/watch duration presets. Short "demo" presets are
// intentional: they let snooze and watch-for-reply be verified end-to-end in
// well under a minute, as the success criteria call for.

export interface DurationPreset {
  id: string;
  label: string;
  /** Milliseconds from "now" until the item is due. */
  offsetMs: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SNOOZE_PRESETS: DurationPreset[] = [
  { id: "demo-20s", label: "20 seconds (demo)", offsetMs: 20 * SECOND },
  { id: "1m", label: "1 minute", offsetMs: MINUTE },
  { id: "10m", label: "10 minutes", offsetMs: 10 * MINUTE },
  { id: "1h", label: "1 hour", offsetMs: HOUR },
  { id: "3h", label: "3 hours", offsetMs: 3 * HOUR },
  { id: "1d", label: "Tomorrow", offsetMs: DAY },
];

export const WATCH_PRESETS: DurationPreset[] = [
  { id: "demo-20s", label: "20 seconds (demo)", offsetMs: 20 * SECOND },
  { id: "1m", label: "1 minute", offsetMs: MINUTE },
  { id: "1h", label: "1 hour", offsetMs: HOUR },
  { id: "4h", label: "4 hours", offsetMs: 4 * HOUR },
  { id: "1d", label: "1 day", offsetMs: DAY },
  { id: "3d", label: "3 days", offsetMs: 3 * DAY },
];

/** Absolute due timestamp for a preset, relative to now. */
export function dueAtFromPreset(preset: DurationPreset, nowMs = Date.now()): number {
  return nowMs + preset.offsetMs;
}

/** "in 2h", "in 30s", "5m ago", "just now". */
export function formatRelative(targetMs: number, nowMs = Date.now()): string {
  const deltaMs = targetMs - nowMs;
  const abs = Math.abs(deltaMs);
  const future = deltaMs >= 0;

  const unit = (value: number, suffix: string): string =>
    future ? `in ${value}${suffix}` : `${value}${suffix} ago`;

  if (abs < 45 * SECOND) return future ? "in a few seconds" : "just now";
  if (abs < 90 * SECOND) return unit(1, "m");
  if (abs < HOUR) return unit(Math.round(abs / MINUTE), "m");
  if (abs < DAY) return unit(Math.round(abs / HOUR), "h");
  if (abs < 7 * DAY) return unit(Math.round(abs / DAY), "d");

  return new Date(targetMs).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Locale date/time for tooltips and detail rows. */
export function formatDateTime(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Short clock for the thread list (today → time, else date). */
export function formatListDate(ms: number, nowMs = Date.now()): string {
  if (!ms) return "";
  const date = new Date(ms);
  const sameDay = new Date(nowMs).toDateString() === date.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
