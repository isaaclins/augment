// The in-app composer: a plain-text email draft (new / reply / reply-all /
// forward) with optional attachments, encoded to an RFC 2822 MIME message and
// sent or saved as a draft via the Gmail API. Replies thread correctly by
// carrying the original Message-ID in In-Reply-To/References and reusing the
// thread id. Sending needs the gmail.send scope (a 403 means reconnect).

import type { GmailClient } from "../gmail/client";
import { base64, base64Url, base64Bytes, encodeHeaderWord, wrap76 } from "../gmail/mime";
import { addressLabel, htmlToText, type EmailAddress, type ParsedMessage } from "../gmail/parse";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export interface ComposeAttachment {
  name: string;
  mimeType: string;
  /** Standard base64 (not url-safe) of the file bytes. */
  data: string;
  size: number;
}

export interface ComposeDraft {
  mode: ComposeMode;
  /** Set on a reply so the sent message stays in the original thread. */
  threadId?: string;
  /** Set when reopening an existing Gmail draft. Send replaces it; Save
   *  updates it in place instead of creating a duplicate. */
  draftId?: string;
  to: string; // comma-separated raw input
  cc: string;
  bcc: string;
  subject: string;
  body: string; // plain-text version (canonical fallback)
  /** Optional HTML body. When non-empty, the message is sent as
   *  multipart/alternative so recipients see formatting. The Composer keeps
   *  `body` in sync with `htmlToText(bodyHtml)` whenever this is edited. */
  bodyHtml: string;
  inReplyTo?: string; // original Message-ID
  references?: string;
  attachments: ComposeAttachment[];
}

function fmtAddr(addr: EmailAddress): string {
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}

function joinAddrs(addrs: EmailAddress[]): string {
  return addrs.map(fmtAddr).join(", ");
}

/** Original message text (plain, or stripped from HTML), quoted with "> ". */
function quoteOriginal(original: ParsedMessage): string {
  const text = original.text ?? (original.html ? htmlToText(original.html) : "");
  const when = new Date(original.internalDate || Date.now()).toLocaleString();
  const quoted = text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nOn ${when}, ${addressLabel(original.from)} wrote:\n${quoted}`;
}

/** An empty draft for a brand-new message. */
export function blankDraft(): ComposeDraft {
  return { mode: "new", to: "", cc: "", bcc: "", subject: "", body: "", bodyHtml: "", attachments: [] };
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

/** Convert a plain-text body to HTML for the rich editor. Preserves line
 *  breaks and wraps quoted blocks (lines prefixed with "> ") in a single
 *  <blockquote>, so a reply's quoted history renders cleanly. */
export function plainBodyToHtml(body: string): string {
  if (!body) return "";
  const lines = body.split("\n");
  const out: string[] = [];
  let inQuote = false;
  for (const line of lines) {
    const isQuote = line.startsWith("> ") || line === ">";
    if (isQuote && !inQuote) {
      out.push("<blockquote>");
      inQuote = true;
    } else if (!isQuote && inQuote) {
      out.push("</blockquote>");
      inQuote = false;
    }
    const content = escapeHtml(isQuote ? line.replace(/^> ?/, "") : line);
    out.push(content || "<br>");
  }
  if (inQuote) out.push("</blockquote>");
  return out.join("\n");
}

/** Rehydrate an existing draft message (Gmail "DRAFT" label) into the composer
 *  so the user can finish writing it. Keeps the original thread id so any
 *  later send threads correctly. The original Gmail draft is left in Drafts. */
export function draftFromExisting(message: ParsedMessage): ComposeDraft {
  const subject = message.subject === "(no subject)" ? "" : message.subject;
  const plainBody = message.text ?? (message.html ? htmlToText(message.html) : "");
  const htmlBody = message.html ?? plainBodyToHtml(plainBody);
  return {
    mode: "new",
    threadId: message.threadId,
    to: joinAddrs(message.to),
    cc: joinAddrs(message.cc),
    bcc: "",
    subject,
    body: plainBody,
    bodyHtml: htmlBody,
    attachments: [],
  };
}

/** Build a reply / reply-all / forward draft prefilled from the original. */
export function draftFromMessage(
  mode: Exclude<ComposeMode, "new">,
  original: ParsedMessage,
  selfEmail: string,
): ComposeDraft {
  const self = selfEmail.toLowerCase();
  const notSelf = (a: EmailAddress) => a.email && a.email.toLowerCase() !== self;
  const subject = original.subject || "(no subject)";

  if (mode === "forward") {
    const header =
      `\n\n---------- Forwarded message ----------\n` +
      `From: ${fmtAddr(original.from)}\n` +
      `Subject: ${subject}\n` +
      `To: ${joinAddrs(original.to)}\n\n` +
      (original.text ?? (original.html ? htmlToText(original.html) : ""));
    return {
      mode,
      to: "",
      cc: "",
      bcc: "",
      subject: /^fwd:/i.test(subject) ? subject : `Fwd: ${subject}`,
      body: header,
      bodyHtml: plainBodyToHtml(header),
      attachments: [],
    };
  }

  const to = [original.from];
  const cc = mode === "replyAll" ? [...original.to, ...original.cc].filter(notSelf) : [];
  // Drop the sender from cc if it's already the primary recipient.
  const ccDeduped = cc.filter((a) => a.email.toLowerCase() !== original.from.email.toLowerCase());
  const quotedBody = quoteOriginal(original);
  return {
    mode,
    threadId: original.threadId,
    to: joinAddrs(to),
    cc: joinAddrs(ccDeduped),
    bcc: "",
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
    body: quotedBody,
    bodyHtml: plainBodyToHtml(quotedBody),
    inReplyTo: original.messageId,
    references: original.messageId,
    attachments: [],
  };
}

/** Encode a draft to a base64url RFC 2822 message. Layout:
 *    - text only, no files       → text/plain
 *    - text + html, no files     → multipart/alternative
 *    - any-of-above + attachments → multipart/mixed wrapping the body part. */
export function buildMime(draft: ComposeDraft, fromEmail: string): string {
  const headers: string[] = [];
  if (fromEmail) headers.push(`From: ${fromEmail}`);
  if (draft.to.trim()) headers.push(`To: ${draft.to.trim()}`);
  if (draft.cc.trim()) headers.push(`Cc: ${draft.cc.trim()}`);
  if (draft.bcc.trim()) headers.push(`Bcc: ${draft.bcc.trim()}`);
  headers.push(`Subject: ${encodeHeaderWord(draft.subject)}`);
  if (draft.inReplyTo) headers.push(`In-Reply-To: ${draft.inReplyTo}`);
  if (draft.references) headers.push(`References: ${draft.references}`);
  headers.push("MIME-Version: 1.0");

  const hasHtml = draft.bodyHtml.trim() !== "";
  const textBody = hasHtml ? htmlToText(draft.bodyHtml) : draft.body;
  const textB64 = wrap76(base64(textBody));

  // Build the body section (without the outer message headers): either a
  // text/plain leaf, or a multipart/alternative wrapper around text + html.
  let bodyHeaders: string[];
  let bodyContent: string;
  if (hasHtml) {
    const altBoundary = `=_alt_${crypto.randomUUID()}`;
    const htmlB64 = wrap76(base64(draft.bodyHtml));
    bodyHeaders = [`Content-Type: multipart/alternative; boundary="${altBoundary}"`];
    bodyContent =
      `--${altBoundary}\r\n` +
      'Content-Type: text/plain; charset="UTF-8"\r\n' +
      "Content-Transfer-Encoding: base64\r\n\r\n" +
      textB64 + "\r\n" +
      `--${altBoundary}\r\n` +
      'Content-Type: text/html; charset="UTF-8"\r\n' +
      "Content-Transfer-Encoding: base64\r\n\r\n" +
      htmlB64 + "\r\n" +
      `--${altBoundary}--`;
  } else {
    bodyHeaders = [
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
    ];
    bodyContent = textB64;
  }

  if (draft.attachments.length === 0) {
    return base64Url(`${[...headers, ...bodyHeaders].join("\r\n")}\r\n\r\n${bodyContent}`);
  }

  const mixedBoundary = `=_aug_${crypto.randomUUID()}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

  const parts: string[] = [];
  parts.push(`--${mixedBoundary}\r\n` + bodyHeaders.join("\r\n") + "\r\n\r\n" + bodyContent);
  for (const att of draft.attachments) {
    parts.push(
      `--${mixedBoundary}\r\n` +
        `Content-Type: ${att.mimeType}; name="${att.name}"\r\n` +
        "Content-Transfer-Encoding: base64\r\n" +
        `Content-Disposition: attachment; filename="${att.name}"\r\n\r\n` +
        wrap76(att.data),
    );
  }
  parts.push(`--${mixedBoundary}--`);
  return base64Url(`${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`);
}

/** Read a picked File into an attachment (base64-encoded bytes). */
export async function fileToAttachment(file: File): Promise<ComposeAttachment> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    data: base64Bytes(bytes),
    size: file.size,
  };
}

/** Send the draft (requires gmail.send). Keeps replies in their thread. */
export async function sendDraft(client: GmailClient, draft: ComposeDraft, fromEmail: string): Promise<void> {
  await client.sendMessage(buildMime(draft, fromEmail), draft.threadId);
}

/** Save the draft to Gmail's Drafts without sending. */
export async function saveDraft(client: GmailClient, draft: ComposeDraft, fromEmail: string): Promise<void> {
  await client.createDraft(buildMime(draft, fromEmail));
}
