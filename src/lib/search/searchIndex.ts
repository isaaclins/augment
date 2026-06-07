// Local-first search index (Phase 0/1).
//
// As the app loads thread rows from Gmail, it opportunistically mirrors their
// lightweight metadata (sender, subject, snippet, labels, date) into a local
// store. Searching then runs entirely in-memory — sub-millisecond, no network —
// so you can fly through your mail with the keyboard instead of waiting ~300ms
// per Gmail round-trip. A click always re-fetches the full thread, so a stale
// hit self-heals; the index is a best-effort accelerator, not a source of truth.
//
// Persistence is the Origin Private File System (on the user's disk, origin-
// private, zero cost), with a localStorage fallback. Nothing leaves the device.
// Bodies are NOT indexed here — that's the Phase-2 SQLite-WASM + FTS5 upgrade.

import type { ThreadRow } from "../gmail/inbox";
import { isEmptyQuery, parseQuery, type ParsedQuery } from "./ftsQuery";

/** A thread row enriched with search-only fields (label tokens, attachment flag). */
export interface IndexDoc extends ThreadRow {
  /** Normalized label tokens (system + user label names), lowercased. */
  searchLabels?: string[];
  /** Whether the thread has an attachment (known only after a body backfill). */
  hasAttachment?: boolean;
}

const OPFS_FILE = "augment-search-index.json";
const LS_KEY = "augment.search.v1";
const MAX_OPFS = 5000;
const MAX_LS = 1500;
const PERSIST_DEBOUNCE_MS = 1500;

// --- pure search logic (unit-tested) ---------------------------------------

function fieldsOf(row: ThreadRow): { from: string; subject: string; rest: string } {
  return {
    from: `${row.from.name ?? ""} ${row.from.email}`.toLowerCase(),
    subject: row.subject.toLowerCase(),
    // The metadata index only has the snippet (no full body) for body: terms.
    rest: (row.snippet ?? "").toLowerCase(),
  };
}

/**
 * Score a row against a parsed query (operator-aware). Every constraint must be
 * satisfied (AND); field/sender hits weigh more than snippet hits. Returns null
 * when the row doesn't match.
 */
function scoreRow(row: IndexDoc, query: ParsedQuery): number | null {
  if (query.unread !== undefined && row.unread !== query.unread) return null;
  if (query.hasAttachment && !row.hasAttachment) return null;
  if (query.after !== undefined && row.date < query.after) return null;
  if (query.before !== undefined && row.date >= query.before) return null;
  if (query.labels.length > 0) {
    const labels = row.searchLabels ?? [];
    for (const term of query.labels) {
      if (!labels.some((token) => token.includes(term))) return null;
    }
  }
  const f = fieldsOf(row);
  const any = `${f.from} ${f.subject} ${f.rest}`;
  let score = 0;
  for (const term of query.from) {
    if (!f.from.includes(term)) return null;
    score += 3;
  }
  for (const term of query.subject) {
    if (!f.subject.includes(term)) return null;
    score += 2;
  }
  for (const term of query.body) {
    if (!f.rest.includes(term)) return null;
    score += 1;
  }
  for (const term of query.terms) {
    if (!any.includes(term)) return null;
    score += f.from.includes(term) || f.subject.includes(term) ? 2 : 1;
  }
  return score;
}

/** Filter + rank rows for a query. Empty query returns most-recent first. */
export function searchRows(rows: IndexDoc[], query: string, limit = 50): IndexDoc[] {
  const parsed = parseQuery(query);
  if (isEmptyQuery(parsed)) {
    return [...rows].sort((a, b) => b.date - a.date).slice(0, limit);
  }
  const scored: { row: IndexDoc; score: number }[] = [];
  for (const row of rows) {
    const score = scoreRow(row, parsed);
    if (score !== null) scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score || b.row.date - a.row.date);
  return scored.slice(0, limit).map((entry) => entry.row);
}

// --- persistence helpers ----------------------------------------------------

function opfsAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.storage?.getDirectory;
}

async function opfsRead(): Promise<string | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(OPFS_FILE);
    return await (await handle.getFile()).text();
  } catch {
    return null;
  }
}

async function opfsWrite(text: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(OPFS_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

// --- the index --------------------------------------------------------------

export class SearchIndex {
  private rows = new Map<string, IndexDoc>();
  private loaded = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  /** Load the persisted index once. Safe to call repeatedly. */
  async init(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = opfsAvailable() ? await opfsRead() : localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as IndexDoc[];
        for (const row of parsed) {
          if (row?.id) this.rows.set(row.id, row);
        }
      }
    } catch {
      // A corrupt cache is non-fatal — we just start empty.
    }
  }

  /** Mirror freshly-loaded rows into the index (upsert by id). */
  indexRows(rows: IndexDoc[]): void {
    if (rows.length === 0) return;
    for (const row of rows) this.rows.set(row.id, row);
    this.evict();
    this.schedulePersist();
  }

  remove(id: string): void {
    if (this.rows.delete(id)) this.schedulePersist();
  }

  search(query: string, limit = 50): IndexDoc[] {
    return searchRows([...this.rows.values()], query, limit);
  }

  count(): number {
    return this.rows.size;
  }

  clear(): void {
    this.rows.clear();
    this.schedulePersist();
  }

  private evict(): void {
    const cap = opfsAvailable() ? MAX_OPFS : MAX_LS;
    if (this.rows.size <= cap) return;
    // Drop the oldest rows by date until back under the cap.
    const ordered = [...this.rows.values()].sort((a, b) => a.date - b.date);
    for (let i = 0; i < this.rows.size - cap; i += 1) {
      this.rows.delete(ordered[i].id);
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persist(), PERSIST_DEBOUNCE_MS);
  }

  private async persist(): Promise<void> {
    const cap = opfsAvailable() ? MAX_OPFS : MAX_LS;
    const values = [...this.rows.values()]
      .sort((a, b) => b.date - a.date)
      .slice(0, cap);
    const text = JSON.stringify(values);
    try {
      if (opfsAvailable()) await opfsWrite(text);
      else localStorage.setItem(LS_KEY, text);
    } catch {
      // Out of quota or storage unavailable — search still works in-memory.
    }
  }
}

/** App-wide singleton. The constructor is side-effect free; call init() to load. */
export const searchIndex = new SearchIndex();
