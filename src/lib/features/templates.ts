// Rich-text email templates, stored server-side so they sync across devices.
// Gmail's API can't tell a "template" draft from a normal one, so we store each
// template as an HTML message inserted into the mailbox (messages.insert — this
// does NOT send) tagged with our own label. Listing the label gives them back.
// "Using" a template creates a real Gmail draft (HTML preserved). Everything
// here works under the gmail.modify scope; nothing is ever sent.

import DOMPurify from "dompurify";

import type { GmailClient } from "../gmail/client";
import { htmlToText, parseMessage } from "../gmail/parse";

export const TEMPLATE_LABEL = "Augment/Templates";

export interface Template {
  /** Gmail message id backing this template. */
  id: string;
  /** Template name — stored as the message Subject. */
  name: string;
  /** Template body as sanitized HTML. */
  body: string;
}

// Formatting-only allowlist: enough for a basic rich-text editor, nothing that
// can load remote content or run script.
const ALLOWED_TAGS = [
  "b", "strong", "i", "em", "u", "s", "strike", "a", "ul", "ol", "li",
  "p", "br", "div", "span", "blockquote", "h1", "h2", "h3", "code", "pre",
];

/** Sanitize template HTML down to safe formatting tags (links keep href only). */
export function sanitizeTemplateHtml(dirty: string): string {
  return String(
    DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ["href"],
      ALLOW_DATA_ATTR: false,
    }),
  );
}

/**
 * Turn an HTML string — a full document or a fragment — into a clean template
 * body. Extracts just the <body> (so the <head>, <style>, <title>, doctype are
 * dropped rather than rendered as text), strips style/script/comments, and
 * sanitizes to the formatting allowlist.
 */
export function htmlToTemplateBody(source: string): string {
  let html = source;
  try {
    const doc = new DOMParser().parseFromString(source, "text/html");
    if (doc.body) html = doc.body.innerHTML;
  } catch {
    // Fall back to treating the input as a fragment.
  }
  html = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  return sanitizeTemplateHtml(html);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function base64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Url(input: string): string {
  return base64(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// RFC 2047 encode a header value when it contains non-ASCII characters.
function encodeHeaderWord(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${base64(value)}?=`;
}

/** Build the base64url-encoded RFC 2822 HTML message for insert / draft. */
function encodeHtmlMessage(opts: { from?: string; to?: string; subject: string; html: string }): string {
  const headers: string[] = [];
  if (opts.from) headers.push(`From: ${opts.from}`);
  if (opts.to) headers.push(`To: ${opts.to}`);
  headers.push(`Subject: ${encodeHeaderWord(opts.subject)}`);
  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/html; charset="UTF-8"');
  headers.push("Content-Transfer-Encoding: base64");
  // MIME wants base64 bodies wrapped at 76 columns.
  const encodedBody = base64(opts.html).replace(/(.{76})/g, "$1\r\n");
  return base64Url(`${headers.join("\r\n")}\r\n\r\n${encodedBody}`);
}

/** Load every stored template (one message fetch each, run concurrently). */
export async function loadTemplates(client: GmailClient): Promise<Template[]> {
  // Ensure the label exists so the search query is always valid.
  await client.ensureLabelId(TEMPLATE_LABEL);
  const list = await client.listMessages(`label:${JSON.stringify(TEMPLATE_LABEL)}`, 100);
  const refs = list.messages ?? [];

  const templates = await Promise.all(
    refs.map(async (ref) => {
      const parsed = parseMessage(await client.getMessage(ref.id));
      const name = parsed.subject && parsed.subject !== "(no subject)" ? parsed.subject : "Untitled";
      // Prefer HTML; fall back to escaping any legacy plain-text body.
      const rawBody = parsed.html ?? (parsed.text ? escapeHtml(parsed.text).replace(/\n/g, "<br>") : "");
      return { id: ref.id, name, body: sanitizeTemplateHtml(rawBody) };
    }),
  );

  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Save a template. Inserted messages are immutable, so editing replaces the old
 * message: insert the new one, then trash the previous one.
 */
export async function saveTemplate(
  client: GmailClient,
  selfEmail: string,
  template: { name: string; body: string },
  replaceId?: string,
): Promise<void> {
  const labelId = await client.ensureLabelId(TEMPLATE_LABEL);
  const address = selfEmail || "me@localhost";
  const raw = encodeHtmlMessage({
    from: address,
    to: address,
    subject: template.name,
    html: sanitizeTemplateHtml(template.body),
  });
  await client.insertMessage(raw, [labelId]);
  if (replaceId) {
    await client.trashMessage(replaceId).catch(() => {
      // The new copy is already saved; a failed cleanup is non-fatal.
    });
  }
}

export function deleteTemplate(client: GmailClient, id: string): Promise<unknown> {
  return client.trashMessage(id);
}

/**
 * Create a Gmail draft from a template, preserving its HTML formatting. The
 * draft lands in Gmail's Drafts (nothing is sent); the user finishes it there.
 */
export async function draftFromTemplate(client: GmailClient, template: Template): Promise<void> {
  const raw = encodeHtmlMessage({ subject: template.name, html: sanitizeTemplateHtml(template.body) });
  await client.createDraft(raw);
}

/** A rough plaintext preview of a template body, for the list cards. */
export function templatePreview(template: Template): string {
  return htmlToText(template.body);
}
