// Local AI triage. Each email is assigned a short topical label, a priority, and
// a one-sentence summary by a local Ollama model. The model call itself lives in
// Rust (the webview CSP blocks localhost:11434, and Rust runs it off the UI
// thread); this module owns the prompt-side helpers, the invoke wrapper, and
// result normalization. Nothing leaves the machine — it's a localhost call to
// the user's own model.
//
// The taxonomy is OPEN: the model invents the label that best fits each email,
// but is handed an "ideas" list (the user's existing tags + these starters + any
// hints from settings) and told to reuse one of those when it fits, so it
// doesn't sprawl into near-duplicates ("Receipt" vs "Receipts").

import { invoke } from "@tauri-apps/api/core";
import type { ThreadRow } from "../gmail/inbox";
import { addressLabel } from "../gmail/parse";

export type TriagePriority = "low" | "normal" | "high";

export interface TriageResult {
  /** The assigned topical label (display-cased, normalized). May match an
   *  existing tag (auto-applied) or be a brand-new one (proposed for approval). */
  category: string;
  priority: TriagePriority;
  summary: string;
  /** Model that produced this result. */
  model: string;
  /** When it was triaged (epoch ms). */
  ts: number;
}

/** Built-in seed labels (the former fixed taxonomy). Now just part of the ideas
 *  list handed to the model — never a hard constraint. Display-cased. */
export const STARTER_LABELS: string[] = [
  "Personal",
  "Work",
  "Finance",
  "Receipt",
  "Newsletter",
  "Promotion",
  "Update",
  "Security",
  "Travel",
  "Social",
];

interface OllamaTriageOutput {
  category: string;
  priority: string;
  summary: string;
}

/** Tidy a model-returned label into a stable display name: strip any echoed
 *  label prefix, drop path separators/quotes, collapse whitespace, cap the
 *  length, and Title-Case an all-lowercase result so "receipt" reads "Receipt". */
export function normalizeLabel(raw: string): string {
  let value = (raw ?? "").trim();
  value = value.replace(/^Augment\/Tags\//i, "");
  value = value.replace(/["'`]/g, "");
  value = value.replace(/[\\/]+/g, " ");
  value = value.replace(/\s+/g, " ").trim();
  if (value.length > 32) value = value.slice(0, 32).trim();
  if (value && value === value.toLowerCase()) {
    value = value.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return value;
}

function normalizePriority(value: string): TriagePriority {
  const lower = value.toLowerCase().trim();
  return lower === "low" || lower === "high" ? lower : "normal";
}

/** Build the sender string passed to the model ("Name <email>"). */
function senderLine(row: ThreadRow): string {
  const name = addressLabel(row.from);
  return row.from.email && row.from.email !== name ? `${name} <${row.from.email}>` : name;
}

/** Triage a single thread row via the local model. `suggestions` is the ideas
 *  list the model should prefer reusing. Rejects if Ollama is down. */
export async function triageThread(
  row: ThreadRow,
  model: string,
  endpoint: string,
  suggestions: string[],
): Promise<TriageResult> {
  const output = await invoke<OllamaTriageOutput>("ollama_triage", {
    input: {
      from: senderLine(row),
      subject: row.subject,
      snippet: row.snippet,
      model,
      endpoint,
      suggestions,
    },
  });
  const category = normalizeLabel(output.category) || "Other";
  return {
    category,
    priority: normalizePriority(output.priority),
    summary: output.summary.trim(),
    model,
    ts: Date.now(),
  };
}

/** True when the Ollama daemon answers at `endpoint`. */
export function checkOllama(endpoint: string): Promise<boolean> {
  return invoke<boolean>("ollama_health", { endpoint });
}
