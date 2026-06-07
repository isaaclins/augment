// Helpers that turn Gmail thread listings into the compact rows the UI renders,
// and that fetch the representative message per thread for the rules engine.

import type { GmailClient } from "./client";
import { parseMessage, type EmailAddress, type ParsedMessage } from "./parse";
import { SystemLabel } from "./types";

export interface ThreadRow {
  id: string;
  snippet: string;
  from: EmailAddress;
  subject: string;
  date: number; // epoch ms of the latest message
  unread: boolean;
  messageCount: number;
  /** Union of every message's Gmail label ids — used to match applied tags. */
  labelIds: string[];
}

export interface ThreadPage {
  rows: ThreadRow[];
  /** Token for the next page, or undefined when this is the last page. */
  nextPageToken?: string;
}

function rowFromMessages(id: string, snippet: string, messages: ParsedMessage[]): ThreadRow {
  const latest = messages[messages.length - 1];
  const unread = messages.some((m) => m.labelIds.includes(SystemLabel.Unread));
  const labelIds = Array.from(new Set(messages.flatMap((m) => m.labelIds)));
  return {
    id,
    snippet,
    from: latest?.from ?? { email: "" },
    subject: latest?.subject ?? "(no subject)",
    date: latest?.internalDate ?? 0,
    unread,
    messageCount: messages.length,
    labelIds,
  };
}

/**
 * Load a page of compact inbox rows (one metadata fetch per thread, run
 * concurrently). Pass the previous page's `nextPageToken` to fetch the next.
 */
export async function loadThreadRows(
  client: GmailClient,
  query = "in:inbox",
  maxResults = 25,
  pageToken?: string,
): Promise<ThreadPage> {
  const list = await client.listThreads(query, maxResults, pageToken);
  const summaries = list.threads ?? [];

  const rows = await Promise.all(
    summaries.map(async (summary) => {
      const thread = await client.getThreadMetadata(summary.id);
      const messages = (thread.messages ?? []).map(parseMessage);
      return rowFromMessages(summary.id, summary.snippet, messages);
    }),
  );

  // Newest first within the page.
  return { rows: rows.sort((a, b) => b.date - a.date), nextPageToken: list.nextPageToken };
}

/** Fetch the latest full message of each inbox thread, for running rules. */
export async function loadLatestMessages(
  client: GmailClient,
  query = "in:inbox",
  maxResults = 25,
): Promise<ParsedMessage[]> {
  const list = await client.listThreads(query, maxResults);
  const summaries = list.threads ?? [];

  const messages = await Promise.all(
    summaries.map(async (summary) => {
      const thread = await client.getThread(summary.id);
      const parsed = (thread.messages ?? []).map(parseMessage);
      return parsed[parsed.length - 1];
    }),
  );

  return messages.filter((m): m is ParsedMessage => Boolean(m));
}
