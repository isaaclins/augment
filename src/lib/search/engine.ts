// Search engine facade. Coordinates two backends:
//   • searchIndex (JS, metadata-only) — always available, the Phase-0/1 path.
//   • SqliteSearch (FTS5 over bodies)  — Phase 2, when WASM/OPFS is available.
//
// indexRows() feeds both. search() prefers SQLite (full-text bodies) and falls
// back to the JS index. backfill() walks the mailbox fetching bodies into FTS5;
// syncHistory() keeps it fresh via Gmail's History API. All best-effort — a
// click always re-fetches the real thread, so a stale hit self-heals.

import type { GmailClient } from "../gmail/client";
import { GmailApiError } from "../gmail/client";
import type { ThreadRow } from "../gmail/inbox";
import type { GmailThread } from "../gmail/types";
import { addressLabel, htmlToText, parseMessage } from "../gmail/parse";
import { searchIndex, type IndexDoc } from "./searchIndex";
import { SqliteSearch } from "./sqlite";

// System label ids → the token a user would type after is:/in:.
const SYSTEM_LABEL_TOKENS: Record<string, string> = {
  INBOX: "inbox",
  SENT: "sent",
  DRAFT: "draft",
  SPAM: "spam",
  TRASH: "trash",
  STARRED: "starred",
  IMPORTANT: "important",
  UNREAD: "unread",
  CATEGORY_PERSONAL: "personal",
  CATEGORY_SOCIAL: "social",
  CATEGORY_PROMOTIONS: "promotions",
  CATEGORY_UPDATES: "updates",
  CATEGORY_FORUMS: "forums",
};

/** Searchable tokens for a label: a readable system token, or the user label's
 *  name split into segments ("Work/Clients" -> ["work", "clients"]). */
function tokensForLabel(id: string, name: string): string[] {
  const system = SYSTEM_LABEL_TOKENS[id];
  if (system) return [system];
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export interface EngineStatus {
  /** FTS5 (body search) is available. */
  ftsReady: boolean;
  /** FTS5 persists to disk (vs. in-memory session only). */
  persistent: boolean;
  /** Threads with full body text indexed. */
  withBody: number;
  /** A full-index backfill is running. */
  backfilling: boolean;
  /** Threads scanned in the current/last backfill. */
  scanned: number;
  /** The mailbox has been fully backfilled at least once. */
  complete: boolean;
  error: string | null;
}

type Listener = (status: EngineStatus) => void;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

class SearchEngine {
  private sqlite = new SqliteSearch();
  private client: GmailClient | null = null;
  private listeners = new Set<Listener>();
  private stopFlag = false;

  private backfilling = false;
  private scanned = 0;
  private error: string | null = null;

  // label id -> searchable tokens, loaded once from the Gmail label list.
  private labelTokensById = new Map<string, string[]>();
  private labelsLoaded = false;

  attachClient(client: GmailClient): void {
    this.client = client;
  }

  private async ensureLabels(): Promise<void> {
    if (this.labelsLoaded || !this.client) return;
    try {
      const res = await this.client.listLabels();
      for (const label of res.labels ?? []) {
        this.labelTokensById.set(label.id, tokensForLabel(label.id, label.name));
      }
      this.labelsLoaded = true;
    } catch {
      // Retry on a later init/refresh; system-label tokens still resolve below.
    }
  }

  private labelTokens(labelIds: string[]): string[] {
    const out = new Set<string>();
    for (const id of labelIds) {
      const cached = this.labelTokensById.get(id);
      if (cached) {
        for (const token of cached) out.add(token);
      } else if (SYSTEM_LABEL_TOKENS[id]) {
        out.add(SYSTEM_LABEL_TOKENS[id]);
      }
    }
    return [...out];
  }

  /** Build a full-text doc for a thread from its messages. */
  private buildDoc(thread: GmailThread): {
    threadId: string;
    sender: string;
    subject: string;
    body: string;
    date: number;
    unread: boolean;
    labels: string[];
    hasAttachment: boolean;
  } | null {
    const messages = (thread.messages ?? []).map(parseMessage);
    if (messages.length === 0) return null;
    const latest = messages[messages.length - 1];
    const body = messages
      .map((m) => m.text ?? (m.html ? htmlToText(m.html) : ""))
      .join("\n")
      .trim();
    const labelIds = [...new Set(messages.flatMap((m) => m.labelIds))];
    return {
      threadId: thread.id,
      sender: addressLabel(latest.from),
      subject: latest.subject,
      body,
      date: latest.internalDate,
      unread: messages.some((m) => m.isUnread),
      labels: this.labelTokens(labelIds),
      hasAttachment: messages.some((m) => m.hasAttachment),
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const status = this.status();
    for (const listener of this.listeners) listener(status);
  }

  status(): EngineStatus {
    const ftsReady = this.sqlite.ready;
    return {
      ftsReady,
      persistent: this.sqlite.status().persistent,
      withBody: ftsReady ? this.sqlite.bodyCount() : 0,
      backfilling: this.backfilling,
      scanned: this.scanned,
      complete: ftsReady && this.sqlite.getMeta("backfillComplete") === "1",
      error: this.error,
    };
  }

  async init(): Promise<void> {
    await searchIndex.init();
    await this.sqlite.init();
    void this.ensureLabels();
    this.emit();
  }

  indexRows(rows: ThreadRow[]): void {
    // Enrich with label tokens so label:/is:/in: filters work. Attachment state
    // isn't known from list metadata — it's filled in during the body backfill.
    const docs: IndexDoc[] = rows.map((row) => ({ ...row, searchLabels: this.labelTokens(row.labelIds) }));
    searchIndex.indexRows(docs);
    if (this.sqlite.ready) this.sqlite.upsertMeta(docs);
  }

  async search(query: string, limit = 50): Promise<ThreadRow[]> {
    if (this.sqlite.ready) return this.sqlite.search(query, limit);
    return searchIndex.search(query, limit);
  }

  indexedCount(): number {
    return this.sqlite.ready ? this.sqlite.count() : searchIndex.count();
  }

  clear(): void {
    searchIndex.clear();
    this.sqlite.clear();
    this.scanned = 0;
    this.emit();
  }

  stopBackfill(): void {
    this.stopFlag = true;
  }

  /** Walk the whole mailbox, fetching bodies into FTS5. Resumable + stoppable. */
  async backfill(): Promise<void> {
    if (!this.sqlite.ready || !this.client || this.backfilling) return;
    const client = this.client;
    this.stopFlag = false;
    this.backfilling = true;
    this.error = null;
    this.scanned = 0;
    this.emit();
    try {
      // Capture a baseline historyId up front so changes during the (possibly
      // long) backfill aren't missed — syncHistory replays from here afterward.
      let baseline = this.sqlite.getMeta("historyId");
      if (!baseline) {
        try {
          const profile = await client.getProfile();
          if (profile.historyId) baseline = profile.historyId;
        } catch {
          /* non-fatal */
        }
      }

      let pageToken = this.sqlite.getMeta("backfillPageToken") || undefined;
      do {
        if (this.stopFlag) break;
        const page = await client.listThreads("", 100, pageToken);
        const summaries = page.threads ?? [];
        for (let i = 0; i < summaries.length; i += 4) {
          if (this.stopFlag) break;
          const batch = summaries
            .slice(i, i + 4)
            .filter((summary) => !this.sqlite.hasBody(summary.id));
          await Promise.all(
            batch.map(async (summary) => {
              try {
                const doc = this.buildDoc(await client.getThread(summary.id));
                if (doc) this.sqlite.upsertBody(doc);
              } catch {
                /* skip a thread that fails to fetch/parse */
              }
            }),
          );
          this.scanned += Math.min(4, summaries.length - i);
        }
        pageToken = page.nextPageToken;
        this.sqlite.setMeta("backfillPageToken", pageToken ?? "");
        this.emit();
        // Be gentle on the Gmail quota between pages.
        await new Promise((resolve) => setTimeout(resolve, 60));
      } while (pageToken && !this.stopFlag);

      if (!pageToken && !this.stopFlag) {
        this.sqlite.setMeta("backfillComplete", "1");
        this.sqlite.setMeta("backfillPageToken", "");
        if (baseline) this.sqlite.setMeta("historyId", baseline);
      }
    } catch (err) {
      this.error = errorMessage(err);
    } finally {
      this.backfilling = false;
      this.emit();
    }
  }

  /** Apply Gmail History deltas since the stored baseline. No-op before backfill. */
  async syncHistory(): Promise<void> {
    if (!this.sqlite.ready || !this.client) return;
    const start = this.sqlite.getMeta("historyId");
    if (!start) return;
    const client = this.client;
    try {
      const affected = new Set<string>();
      let pageToken: string | undefined;
      let latest = start;
      do {
        const res = await client.listHistory(start, pageToken);
        for (const record of res.history ?? []) {
          for (const added of record.messagesAdded ?? []) affected.add(added.message.threadId);
          for (const deleted of record.messagesDeleted ?? []) affected.add(deleted.message.threadId);
        }
        if (res.historyId) latest = res.historyId;
        pageToken = res.nextPageToken;
      } while (pageToken);

      for (const threadId of affected) {
        try {
          const doc = this.buildDoc(await client.getThread(threadId));
          if (doc) this.sqlite.upsertBody(doc);
        } catch (err) {
          if (err instanceof GmailApiError && err.status === 404) this.sqlite.remove(threadId);
        }
      }
      this.sqlite.setMeta("historyId", latest);
      if (affected.size > 0) this.emit();
    } catch (err) {
      if (err instanceof GmailApiError && err.status === 404) {
        // Baseline expired — drop it so a fresh backfill re-establishes sync.
        this.sqlite.setMeta("historyId", "");
        this.sqlite.setMeta("backfillComplete", "");
        this.emit();
      }
    }
  }
}

export const searchEngine = new SearchEngine();
