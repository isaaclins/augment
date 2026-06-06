// Shape of the Gmail REST API v1 payloads Augment consumes. Only the fields we
// actually use are modelled; everything optional is treated as possibly-absent.

export interface GmailThreadSummary {
  id: string;
  snippet: string;
  historyId: string;
}

export interface GmailThreadsListResponse {
  threads?: GmailThreadSummary[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailBody {
  data?: string; // base64url
  size?: number;
  attachmentId?: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailBody;
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string; // epoch milliseconds, as a string
  payload?: GmailMessagePart;
}

export interface GmailThread {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
}

export type GmailLabelType = "system" | "user";

export interface GmailLabel {
  id: string;
  name: string;
  type?: GmailLabelType;
  labelListVisibility?: string;
  messageListVisibility?: string;
}

export interface GmailLabelsListResponse {
  labels?: GmailLabel[];
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
}

// System label IDs we reference directly.
export const SystemLabel = {
  Inbox: "INBOX",
  Unread: "UNREAD",
  Starred: "STARRED",
  Sent: "SENT",
  Important: "IMPORTANT",
} as const;
