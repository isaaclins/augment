// Thin, typed wrapper over the Gmail REST API v1. This is the *only* place mail
// data is fetched — the Rust backend never touches Gmail. The access token is
// supplied per-request by a provider so it can rotate underneath us; on a 401 we
// transparently refresh once and retry.

import type {
  GmailDraft,
  GmailHistoryResponse,
  GmailLabel,
  GmailLabelsListResponse,
  GmailMessage,
  GmailMessagesListResponse,
  GmailProfile,
  GmailThread,
  GmailThreadsListResponse,
} from "./types";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Thrown when Gmail returns a non-2xx response. */
export class GmailApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Gmail API ${status}: ${body.slice(0, 300)}`);
    this.name = "GmailApiError";
  }
}

export interface GmailClientOptions {
  /** Returns the current access token. */
  getToken: () => string;
  /** Called once on a 401 to mint a fresh token before a single retry. */
  refresh?: () => Promise<void>;
}

export interface ModifyLabels {
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

export class GmailClient {
  private labelCache: GmailLabel[] | null = null;

  constructor(private readonly options: GmailClientOptions) {}

  private async request<T>(path: string, init?: RequestInit, allowRetry = true): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.getToken()}`,
    };
    if (init?.body) headers["Content-Type"] = "application/json";

    const response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    });

    if (response.status === 401 && allowRetry && this.options.refresh) {
      await this.options.refresh();
      return this.request<T>(path, init, false);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new GmailApiError(response.status, body);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  // --- raw endpoints -------------------------------------------------------

  getProfile(): Promise<GmailProfile> {
    return this.request<GmailProfile>("/profile");
  }

  listThreads(query: string, maxResults = 25, pageToken?: string): Promise<GmailThreadsListResponse> {
    const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
    if (pageToken) params.set("pageToken", pageToken);
    return this.request<GmailThreadsListResponse>(`/threads?${params.toString()}`);
  }

  getThread(id: string): Promise<GmailThread> {
    return this.request<GmailThread>(`/threads/${encodeURIComponent(id)}?format=full`);
  }

  /** Lighter thread fetch (headers only) for building list rows. */
  getThreadMetadata(id: string): Promise<GmailThread> {
    const params = new URLSearchParams({ format: "metadata" });
    for (const header of ["From", "To", "Subject", "Date", "Message-ID"]) {
      params.append("metadataHeaders", header);
    }
    return this.request<GmailThread>(`/threads/${encodeURIComponent(id)}?${params.toString()}`);
  }

  listMessages(query: string, maxResults = 100): Promise<GmailMessagesListResponse> {
    const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
    return this.request<GmailMessagesListResponse>(`/messages?${params.toString()}`);
  }

  getMessage(id: string): Promise<GmailMessage> {
    return this.request<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`);
  }

  /**
   * Incremental mailbox changes since `startHistoryId`. Throws a 404
   * GmailApiError when the id is too old (history expired) — caller re-syncs.
   */
  listHistory(startHistoryId: string, pageToken?: string): Promise<GmailHistoryResponse> {
    const params = new URLSearchParams({ startHistoryId });
    params.append("historyTypes", "messageAdded");
    params.append("historyTypes", "messageDeleted");
    if (pageToken) params.set("pageToken", pageToken);
    return this.request<GmailHistoryResponse>(`/history?${params.toString()}`);
  }

  /**
   * Insert a message straight into the mailbox (like IMAP APPEND) — this does
   * NOT send anything. Used to store templates as labeled messages.
   */
  insertMessage(raw: string, labelIds: string[]): Promise<GmailMessage> {
    return this.request<GmailMessage>("/messages", {
      method: "POST",
      body: JSON.stringify({ raw, labelIds }),
    });
  }

  /** Move a message to Trash (reversible; works under gmail.modify). */
  trashMessage(id: string): Promise<GmailMessage> {
    return this.request<GmailMessage>(`/messages/${encodeURIComponent(id)}/trash`, { method: "POST" });
  }

  /** Create a draft (not sent) from a base64url RFC 2822 message. */
  createDraft(raw: string): Promise<GmailDraft> {
    return this.request<GmailDraft>("/drafts", {
      method: "POST",
      body: JSON.stringify({ message: { raw } }),
    });
  }

  /**
   * Send a base64url RFC 2822 message. Pass `threadId` to keep a reply in its
   * original thread (the message's References/In-Reply-To must also match).
   * Requires the `gmail.send` scope — a 403 means the account needs reconnecting.
   */
  sendMessage(raw: string, threadId?: string): Promise<GmailMessage> {
    return this.request<GmailMessage>("/messages/send", {
      method: "POST",
      body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
    });
  }

  listLabels(): Promise<GmailLabelsListResponse> {
    return this.request<GmailLabelsListResponse>("/labels");
  }

  createLabel(name: string): Promise<GmailLabel> {
    return this.request<GmailLabel>("/labels", {
      method: "POST",
      body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
    });
  }

  /** Rename an existing label (used when a tag is renamed). Keeps the cache fresh. */
  async updateLabel(id: string, name: string): Promise<GmailLabel> {
    const updated = await this.request<GmailLabel>(`/labels/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    if (this.labelCache) {
      const index = this.labelCache.findIndex((label) => label.id === id);
      if (index >= 0) this.labelCache[index] = updated;
    }
    return updated;
  }

  modifyThread(id: string, body: ModifyLabels): Promise<GmailThread> {
    return this.request<GmailThread>(`/threads/${encodeURIComponent(id)}/modify`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // --- label cache + high-level helpers -----------------------------------

  /** Resolve a label name to its ID, creating the label (nested ok) if absent. */
  async ensureLabelId(name: string): Promise<string> {
    if (!this.labelCache) {
      this.labelCache = (await this.listLabels()).labels ?? [];
    }
    const existing = this.labelCache.find((label) => label.name === name);
    if (existing) return existing.id;

    const created = await this.createLabel(name);
    this.labelCache.push(created);
    return created.id;
  }

  invalidateLabelCache(): void {
    this.labelCache = null;
  }

  archiveThread(id: string): Promise<GmailThread> {
    return this.modifyThread(id, { removeLabelIds: ["INBOX"] });
  }

  /** Move a whole thread to Trash (reversible; works under gmail.modify). */
  trashThread(id: string): Promise<GmailThread> {
    return this.request<GmailThread>(`/threads/${encodeURIComponent(id)}/trash`, { method: "POST" });
  }

  unarchiveThread(id: string): Promise<GmailThread> {
    return this.modifyThread(id, { addLabelIds: ["INBOX"] });
  }

  async addLabelByName(id: string, name: string): Promise<GmailThread> {
    const labelId = await this.ensureLabelId(name);
    return this.modifyThread(id, { addLabelIds: [labelId] });
  }

  async removeLabelByName(id: string, name: string): Promise<GmailThread> {
    const labelId = await this.ensureLabelId(name);
    return this.modifyThread(id, { removeLabelIds: [labelId] });
  }

  markRead(id: string): Promise<GmailThread> {
    return this.modifyThread(id, { removeLabelIds: ["UNREAD"] });
  }

  star(id: string): Promise<GmailThread> {
    return this.modifyThread(id, { addLabelIds: ["STARRED"] });
  }
}
