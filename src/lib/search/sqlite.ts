// Phase 2 — full-text search of message bodies via SQLite (WASM) + FTS5.
//
// Runs entirely in the webview. Persists to OPFS through the `opfs-sahpool` VFS
// (no COOP/COEP headers required); if OPFS is unavailable it transparently
// falls back to an in-memory database (full FTS for the session, re-built on
// next launch), and if WASM itself can't load the caller falls back to the
// metadata-only JS index. The SQL here (external-content FTS5 + triggers,
// unicode61 prefix matching with diacritic folding) is verified in Node.

import type { ThreadRow } from "../gmail/inbox";
import { addressLabel, type EmailAddress } from "../gmail/parse";
import { buildFtsMatch, isEmptyQuery, parseQuery, type ParsedQuery } from "./ftsQuery";
import type { IndexDoc } from "./searchIndex";

// Minimal shape of the sqlite-wasm API we use (the package's own types are
// incomplete around the OPFS SAH pool), kept local so we don't depend on them.
interface OoDb {
  exec(
    opts:
      | string
      | { sql: string; bind?: unknown[]; rowMode?: string; returnValue?: string },
  ): unknown;
  close(): void;
}
interface SahPoolUtil {
  OpfsSAHPoolDb: new (filename: string) => OoDb;
}
interface SqliteApi {
  oo1: { DB: new (filename: string, flags?: string) => OoDb };
  installOpfsSAHPoolVfs(opts: { name?: string; initialCapacity?: number }): Promise<SahPoolUtil>;
}

const DB_FILE = "/augment-search.sqlite3";
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS thread (
    rowid INTEGER PRIMARY KEY,
    thread_id TEXT UNIQUE,
    sender TEXT, subject TEXT, body TEXT, snippet TEXT,
    date INTEGER, has_body INTEGER DEFAULT 0, unread INTEGER DEFAULT 0,
    labels TEXT DEFAULT '', has_attach INTEGER DEFAULT 0
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS thread_fts USING fts5(
    sender, subject, body,
    content='thread', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER IF NOT EXISTS thread_ai AFTER INSERT ON thread BEGIN
    INSERT INTO thread_fts(rowid, sender, subject, body)
      VALUES (new.rowid, new.sender, new.subject, new.body);
  END;
  CREATE TRIGGER IF NOT EXISTS thread_ad AFTER DELETE ON thread BEGIN
    INSERT INTO thread_fts(thread_fts, rowid, sender, subject, body)
      VALUES ('delete', old.rowid, old.sender, old.subject, old.body);
  END;
  CREATE TRIGGER IF NOT EXISTS thread_au AFTER UPDATE ON thread BEGIN
    INSERT INTO thread_fts(thread_fts, rowid, sender, subject, body)
      VALUES ('delete', old.rowid, old.sender, old.subject, old.body);
    INSERT INTO thread_fts(rowid, sender, subject, body)
      VALUES (new.rowid, new.sender, new.subject, new.body);
  END;
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

// Upsert keyed on thread_id. Real bodies are never overwritten by snippet-only
// metadata refreshes (has_body guards it).
const UPSERT = `
  INSERT INTO thread (thread_id, sender, subject, body, snippet, date, has_body, unread, labels, has_attach)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(thread_id) DO UPDATE SET
    sender = excluded.sender,
    subject = excluded.subject,
    snippet = excluded.snippet,
    date = excluded.date,
    unread = excluded.unread,
    labels = excluded.labels,
    body = CASE WHEN excluded.has_body = 1 THEN excluded.body ELSE thread.body END,
    has_body = max(thread.has_body, excluded.has_body),
    has_attach = max(thread.has_attach, excluded.has_attach)
`;

function labelsString(tokens: string[] | undefined): string {
  return (tokens ?? []).join(" ");
}

/** Non-FTS WHERE fragments + binds for a parsed query (unread/label/date/attach). */
function filterClauses(query: ParsedQuery): { clauses: string[]; binds: unknown[] } {
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (query.unread !== undefined) {
    clauses.push("t.unread = ?");
    binds.push(query.unread ? 1 : 0);
  }
  if (query.hasAttachment) clauses.push("t.has_attach = 1");
  if (query.after !== undefined) {
    clauses.push("t.date >= ?");
    binds.push(query.after);
  }
  if (query.before !== undefined) {
    clauses.push("t.date < ?");
    binds.push(query.before);
  }
  for (const label of query.labels) {
    clauses.push("t.labels LIKE ?");
    binds.push(`%${label}%`);
  }
  return { clauses, binds };
}

function snippetOf(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function rowFrom(sender: string): EmailAddress {
  return { name: sender || undefined, email: "" };
}

export interface SqliteStatus {
  ready: boolean;
  persistent: boolean;
}

export class SqliteSearch {
  private db: OoDb | null = null;
  private state: "idle" | "init" | "ready" | "failed" = "idle";
  private persistent = false;

  get ready(): boolean {
    return this.state === "ready";
  }

  status(): SqliteStatus {
    return { ready: this.ready, persistent: this.persistent };
  }

  /** Initialize once. Returns true if FTS search is available (persistent or not). */
  async init(): Promise<boolean> {
    if (this.state === "ready") return true;
    if (this.state === "failed" || this.state === "init") return this.ready;
    this.state = "init";
    try {
      // Lazy-load the ~865 KB WASM module only when search is first used.
      const sqlite3InitModule = (await import("@sqlite.org/sqlite-wasm")).default;
      const sqlite3 = (await sqlite3InitModule()) as unknown as SqliteApi;
      try {
        const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "augment-search", initialCapacity: 8 });
        this.db = new pool.OpfsSAHPoolDb(DB_FILE);
        this.persistent = true;
      } catch {
        // OPFS unavailable in this webview — fall back to a session DB.
        this.db = new sqlite3.oo1.DB(":memory:", "c");
        this.persistent = false;
      }
      this.run(SCHEMA);
      // Migrate older index files that predate added columns (each ALTER throws
      // harmlessly if the column already exists).
      for (const column of [
        "unread INTEGER DEFAULT 0",
        "labels TEXT DEFAULT ''",
        "has_attach INTEGER DEFAULT 0",
      ]) {
        try {
          this.run(`ALTER TABLE thread ADD COLUMN ${column}`);
        } catch {
          /* column already present */
        }
      }
      this.state = "ready";
      return true;
    } catch {
      // WASM blocked/unavailable — caller keeps using the JS metadata index.
      this.state = "failed";
      return false;
    }
  }

  private run(sql: string, bind: unknown[] = []): void {
    this.db?.exec({ sql, bind });
  }

  private all(sql: string, bind: unknown[] = []): Record<string, unknown>[] {
    if (!this.db) return [];
    return (this.db.exec({ sql, bind, rowMode: "object", returnValue: "resultRows" }) ??
      []) as Record<string, unknown>[];
  }

  /** Index thread-list metadata (no body yet). */
  upsertMeta(rows: IndexDoc[]): void {
    if (!this.ready || rows.length === 0) return;
    this.run("BEGIN");
    try {
      for (const row of rows) {
        this.run(UPSERT, [
          row.id,
          addressLabel(row.from),
          row.subject,
          row.snippet,
          row.snippet,
          row.date,
          0,
          row.unread ? 1 : 0,
          labelsString(row.searchLabels),
          row.hasAttachment ? 1 : 0,
        ]);
      }
      this.run("COMMIT");
    } catch {
      this.run("ROLLBACK");
    }
  }

  /** Index (or upgrade) a thread with its full body text. */
  upsertBody(input: {
    threadId: string;
    sender: string;
    subject: string;
    body: string;
    date: number;
    unread: boolean;
    labels: string[];
    hasAttachment: boolean;
  }): void {
    if (!this.ready) return;
    this.run(UPSERT, [
      input.threadId,
      input.sender,
      input.subject,
      input.body,
      snippetOf(input.body),
      input.date,
      1,
      input.unread ? 1 : 0,
      labelsString(input.labels),
      input.hasAttachment ? 1 : 0,
    ]);
  }

  hasBody(threadId: string): boolean {
    const rows = this.all("SELECT has_body FROM thread WHERE thread_id = ?", [threadId]);
    return rows.length > 0 && Number(rows[0].has_body) === 1;
  }

  remove(threadId: string): void {
    if (this.ready) this.run("DELETE FROM thread WHERE thread_id = ?", [threadId]);
  }

  search(query: string, limit = 50): ThreadRow[] {
    if (!this.ready) return [];
    const parsed = parseQuery(query);
    if (isEmptyQuery(parsed)) return [];
    const match = buildFtsMatch(parsed);
    const cols = "t.thread_id AS id, t.sender AS sender, t.subject AS subject, t.snippet AS snippet, t.date AS date, t.unread AS unread";
    const { clauses, binds: filterBinds } = filterClauses(parsed);

    let rows: Record<string, unknown>[];
    if (!match) {
      // Filter-only query (is:/label:/has:/date) — plain table scan, newest first.
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      rows = this.all(
        `SELECT ${cols} FROM thread t ${where} ORDER BY t.date DESC LIMIT ?`,
        [...filterBinds, limit],
      );
    } else {
      const where = ["thread_fts MATCH ?", ...clauses].join(" AND ");
      rows = this.all(
        `SELECT ${cols}, bm25(thread_fts, 10.0, 8.0, 1.0) AS rank
         FROM thread_fts JOIN thread t ON t.rowid = thread_fts.rowid
         WHERE ${where}
         ORDER BY rank
         LIMIT ?`,
        [match, ...filterBinds, limit],
      );
    }

    return rows.map((r) => ({
      id: String(r.id),
      from: rowFrom(String(r.sender ?? "")),
      subject: String(r.subject ?? ""),
      snippet: String(r.snippet ?? ""),
      date: Number(r.date ?? 0),
      unread: Number(r.unread ?? 0) === 1,
      messageCount: 1,
      labelIds: [],
    }));
  }

  count(): number {
    const rows = this.all("SELECT count(*) AS c FROM thread");
    return rows.length ? Number(rows[0].c) : 0;
  }

  bodyCount(): number {
    const rows = this.all("SELECT count(*) AS c FROM thread WHERE has_body = 1");
    return rows.length ? Number(rows[0].c) : 0;
  }

  getMeta(key: string): string | null {
    const rows = this.all("SELECT value FROM meta WHERE key = ?", [key]);
    return rows.length ? String(rows[0].value) : null;
  }

  setMeta(key: string, value: string): void {
    if (this.ready) {
      this.run(
        "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
      );
    }
  }

  clear(): void {
    if (!this.ready) return;
    this.run("DELETE FROM thread");
    this.run("DELETE FROM meta");
  }
}
