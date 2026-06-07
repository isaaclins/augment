// Client-side list view state: how the loaded inbox rows are ordered. Sorting is
// a pure transform over the rows already in memory (date/sender/subject are read
// straight off the row; priority/category come from the triage cache). Filtering
// that maps to a Gmail concept is handled separately by re-querying Gmail.

import type { ThreadRow } from "../gmail/inbox";
import { addressLabel } from "../gmail/parse";
import type { TriageResult } from "./triage";

export type SortKey = "date" | "sender" | "subject" | "priority" | "category" | "unread";
export type SortDir = "asc" | "desc";

export interface SortOption {
  key: SortKey;
  label: string;
}

// Sort axes a fast triage user actually reaches for. Finding a specific sender
// or subject is the job of ⌘K search, not a sort axis (UI-AUDIT H4). sortRows
// below still supports the other keys for the assistant; they're just not in
// the manual dropdown.
export const SORT_OPTIONS: SortOption[] = [
  { key: "date", label: "Date" },
  { key: "priority", label: "Priority" },
  { key: "unread", label: "Unread first" },
];

/** The natural direction when a key is first chosen (newest/high/unread first;
 *  A–Z for text). The user/assistant can still flip it. */
export function defaultSortDir(key: SortKey): SortDir {
  return key === "sender" || key === "subject" || key === "category" ? "asc" : "desc";
}

const PRIORITY_RANK: Record<string, number> = { high: 3, normal: 2, low: 1 };

/** Return a new, sorted copy of `rows`. Ties fall back to newest-first so the
 *  order stays stable and sensible. */
export function sortRows(
  rows: ThreadRow[],
  triage: Record<string, TriageResult>,
  key: SortKey,
  dir: SortDir,
): ThreadRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const collate = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: "base" });
  const copy = [...rows];
  copy.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "date":
        cmp = a.date - b.date;
        break;
      case "sender":
        cmp = collate(addressLabel(a.from), addressLabel(b.from));
        break;
      case "subject":
        cmp = collate(a.subject || "", b.subject || "");
        break;
      case "priority":
        cmp =
          (PRIORITY_RANK[triage[a.id]?.priority ?? "normal"] ?? 2) -
          (PRIORITY_RANK[triage[b.id]?.priority ?? "normal"] ?? 2);
        break;
      case "category":
        cmp = collate(triage[a.id]?.category ?? "", triage[b.id]?.category ?? "");
        break;
      case "unread":
        cmp = Number(a.unread) - Number(b.unread);
        break;
    }
    const primary = cmp * sign;
    return primary !== 0 ? primary : b.date - a.date;
  });
  return copy;
}
