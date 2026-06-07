// The conversational assistant. It reads a compact view of the user's mail
// (sender/subject/snippet + the triage summary — no extra fetches) plus their
// labels, folders and selection, and returns a short reply with a list of
// structured actions to carry out (plan-then-execute, one structured call in
// Rust). The three modes are a confirmation spectrum applied frontend-side:
//   • ask     — read-only; actions are ignored.
//   • request — actions are proposed and wait for the user to Apply.
//   • agent   — actions run immediately and are logged for undo.

import { invoke } from "@tauri-apps/api/core";
import type { SortDir, SortKey } from "./view";

export type AssistantMode = "ask" | "request" | "agent";

export const ASSISTANT_MODES: { id: AssistantMode; label: string; hint: string }[] = [
  { id: "ask", label: "Ask", hint: "Read-only — answers and summaries, no changes." },
  { id: "request", label: "Request", hint: "Proposes every change for you to approve." },
  { id: "agent", label: "Agent", hint: "Acts on its own and logs what it did." },
];

export type AssistantActionType =
  | "createLabel"
  | "applyLabel"
  | "removeLabel"
  | "archive"
  | "snooze"
  | "markRead"
  | "moveToFolder"
  | "openThread"
  | "setSort"
  | "setFilter"
  | "answer";

/** Non-destructive view/navigation actions. These don't change mail, so they run
 *  immediately in every mode (including Ask) rather than waiting for approval. */
export const NAVIGATION_ACTIONS = new Set<AssistantActionType>([
  "openThread",
  "setSort",
  "setFilter",
]);

/** A flat action object (kept loose so small local models fill it reliably). */
export interface AssistantAction {
  type: AssistantActionType;
  label?: string;
  ids?: string[];
  folder?: string;
  sortKey?: SortKey;
  sortDir?: SortDir;
  query?: string;
  from?: string;
  unread?: boolean;
  snoozePreset?: string;
  filterTitle?: string;
}

export type ProposalStatus = "proposed" | "applied" | "cancelled";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  /** Actions proposed (request) or carried out (agent) by an assistant turn. */
  actions?: AssistantAction[];
  status?: ProposalStatus;
}

interface AssistInput {
  model: string;
  endpoint: string;
  mode: AssistantMode;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  context: string;
}

export interface AssistOutput {
  reply: string;
  actions: AssistantAction[];
}

/** Run one assistant turn through the local model (via Rust). */
export async function runAssist(input: AssistInput): Promise<AssistOutput> {
  return invoke<AssistOutput>("ollama_assist", { input });
}

/** A human-readable one-liner describing an action, for proposal cards + logs. */
export function describeAction(action: AssistantAction, targetCount: number): string {
  const n = action.ids?.length ?? targetCount;
  const mails = `${n} ${n === 1 ? "email" : "emails"}`;
  switch (action.type) {
    case "createLabel":
      return `Create label “${action.label ?? "?"}” and apply to ${mails}`;
    case "applyLabel":
      return `Apply “${action.label ?? "?"}” to ${mails}`;
    case "removeLabel":
      return `Remove “${action.label ?? "?"}” from ${mails}`;
    case "archive":
      return `Archive ${mails}`;
    case "markRead":
      return `Mark ${mails} as read`;
    case "snooze":
      return `Snooze ${mails}${action.snoozePreset ? ` (${action.snoozePreset})` : ""}`;
    case "moveToFolder":
      return `Move ${mails} to “${action.folder ?? "?"}”`;
    case "openThread":
      return "Open the email";
    case "setSort":
      return `Sort by ${action.sortKey ?? "date"} (${action.sortDir ?? "desc"})`;
    case "setFilter":
      return `Filter: ${action.filterTitle ?? action.label ?? action.query ?? action.from ?? "subset"}`;
    case "answer":
    default:
      return "Answer";
  }
}
