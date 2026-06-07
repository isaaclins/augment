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
  to: string; // comma-separated raw input
  cc: string;
  bcc: string;
  subject: string;
  body: string; // plain text
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
  return { mode: "new", to: "", cc: "", bcc: "", subject: "", body: "", attachments: [] };
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
      attachments: [],
    };
  }

  const to = [original.from];
  const cc = mode === "replyAll" ? [...original.to, ...original.cc].filter(notSelf) : [];
  // Drop the sender from cc if it's already the primary recipient.
  const ccDeduped = cc.filter((a) => a.email.toLowerCase() !== original.from.email.toLowerCase());
  return {
    mode,
    threadId: original.threadId,
    to: joinAddrs(to),
    cc: joinAddrs(ccDeduped),
    bcc: "",
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
    body: quoteOriginal(original),
    inReplyTo: original.messageId,
    references: original.messageId,
    attachments: [],
  };
}

/** Encode a draft to a base64url RFC 2822 message (multipart when it has files). */
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

  const bodyB64 = wrap76(base64(draft.body));

  if (draft.attachments.length === 0) {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    headers.push("Content-Transfer-Encoding: base64");
    return base64Url(`${headers.join("\r\n")}\r\n\r\n${bodyB64}`);
  }

  const boundary = `=_aug_${crypto.randomUUID()}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [];
  parts.push(
    `--${boundary}\r\n` +
      'Content-Type: text/plain; charset="UTF-8"\r\n' +
      "Content-Transfer-Encoding: base64\r\n\r\n" +
      bodyB64,
  );
  for (const att of draft.attachments) {
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: ${att.mimeType}; name="${att.name}"\r\n` +
        "Content-Transfer-Encoding: base64\r\n" +
        `Content-Disposition: attachment; filename="${att.name}"\r\n\r\n` +
        wrap76(att.data),
    );
  }
  parts.push(`--${boundary}--`);
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
