// Pure parsing helpers for Gmail message payloads: base64url body decoding,
// header lookup, recursive MIME body extraction, and address parsing. Kept free
// of any network or DOM dependency so it is trivially unit-testable.

import type { GmailHeader, GmailMessage, GmailMessagePart } from "./types";
import { SystemLabel } from "./types";

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface ParsedMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  internalDate: number; // epoch ms
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  messageId?: string;
  html?: string;
  text?: string;
  isUnread: boolean;
}

/** Decode Gmail's base64url body data into a string, honouring the part charset. */
export function decodeBase64Url(data: string, charset = "utf-8"): string {
  const compact = data.replace(/[\r\n\s]/g, "");
  const base64 = compact.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.length % 4 === 0 ? base64 : base64 + "=".repeat(4 - (base64.length % 4));

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  try {
    return new TextDecoder(normalizeCharset(charset)).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function normalizeCharset(charset: string): string {
  const c = charset.trim().toLowerCase();
  // A few common aliases TextDecoder may not recognise verbatim.
  if (c === "utf8") return "utf-8";
  if (c === "latin1" || c === "iso8859-1") return "iso-8859-1";
  return c || "utf-8";
}

/** Case-insensitive header lookup. */
export function getHeader(headers: GmailHeader[] | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === lower)?.value;
}

function charsetFromHeaders(headers: GmailHeader[] | undefined): string {
  const contentType = getHeader(headers, "Content-Type") ?? "";
  const match = /charset\s*=\s*"?([^";]+)"?/i.exec(contentType);
  return match ? match[1] : "utf-8";
}

/**
 * Walk a (possibly multipart) payload and collect the first text/plain and
 * text/html bodies. Attachments (parts with a filename) are skipped.
 */
export function extractBodies(
  part: GmailMessagePart | undefined,
  acc: { html?: string; text?: string } = {},
): { html?: string; text?: string } {
  if (!part) return acc;

  const mime = (part.mimeType ?? "").toLowerCase();
  const isAttachment = !!part.filename && part.filename.length > 0;

  if (!isAttachment && part.body?.data) {
    const charset = charsetFromHeaders(part.headers);
    if (mime === "text/html" && acc.html === undefined) {
      acc.html = decodeBase64Url(part.body.data, charset);
    } else if (mime === "text/plain" && acc.text === undefined) {
      acc.text = decodeBase64Url(part.body.data, charset);
    }
  }

  if (part.parts) {
    for (const child of part.parts) {
      extractBodies(child, acc);
    }
  }
  return acc;
}

/** Parse a single address string like `"Ada Lovelace" <ada@x.com>` or `a@x.com`. */
export function parseAddress(raw: string): EmailAddress {
  const value = raw.trim();
  const angle = /^(.*?)<([^>]+)>$/.exec(value);
  if (angle) {
    const name = angle[1].trim().replace(/^"|"$/g, "").trim();
    return { name: name || undefined, email: angle[2].trim().toLowerCase() };
  }
  return { email: value.toLowerCase() };
}

/** Parse a comma-separated address list (To/Cc). */
export function parseAddressList(raw: string | undefined): EmailAddress[] {
  if (!raw) return [];
  return splitAddresses(raw).map(parseAddress).filter((a) => a.email.length > 0);
}

// Split on commas that are not inside quoted display names.
function splitAddresses(raw: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current);
  return out;
}

/** Turn a raw Gmail message into the normalized shape the UI and rules use. */
export function parseMessage(message: GmailMessage): ParsedMessage {
  const headers = message.payload?.headers;
  const bodies = extractBodies(message.payload);
  const labelIds = message.labelIds ?? [];

  return {
    id: message.id,
    threadId: message.threadId,
    labelIds,
    internalDate: message.internalDate ? Number(message.internalDate) : 0,
    from: parseAddress(getHeader(headers, "From") ?? ""),
    to: parseAddressList(getHeader(headers, "To")),
    subject: getHeader(headers, "Subject") ?? "(no subject)",
    messageId: getHeader(headers, "Message-ID"),
    html: bodies.html,
    text: bodies.text,
    isUnread: labelIds.includes(SystemLabel.Unread),
  };
}

/** Strip HTML tags to a rough plaintext for rule matching / previews. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** The display name for an address, falling back to the local-part of the email. */
export function addressLabel(addr: EmailAddress): string {
  if (addr.name) return addr.name;
  return addr.email.split("@")[0] || addr.email;
}
