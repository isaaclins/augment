import { describe, expect, it } from "vitest";
import { blankDraft, buildMime, draftFromMessage } from "./compose";
import type { ParsedMessage } from "../gmail/parse";

// Decode the base64url RFC 2822 message back to text for assertions.
function decode(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const original: ParsedMessage = {
  id: "m1",
  threadId: "t1",
  labelIds: ["INBOX"],
  internalDate: 1_700_000_000_000,
  from: { name: "Ada", email: "ada@x.com" },
  to: [{ email: "me@x.com" }],
  cc: [{ email: "team@x.com" }],
  subject: "Lunch?",
  messageId: "<abc@x.com>",
  text: "Want lunch?",
  isUnread: true,
};

describe("buildMime", () => {
  it("encodes headers and a base64 plain-text body", () => {
    const draft = { ...blankDraft(), to: "a@b.com", subject: "Hi", body: "Hello" };
    const mime = decode(buildMime(draft, "me@x.com"));
    expect(mime).toContain("From: me@x.com");
    expect(mime).toContain("To: a@b.com");
    expect(mime).toContain("Subject: Hi");
    expect(mime).toContain('text/plain; charset="UTF-8"');
    expect(mime).toContain("SGVsbG8="); // base64 of "Hello"
  });

  it("produces a multipart/mixed message when attachments are present", () => {
    const draft = {
      ...blankDraft(),
      to: "a@b.com",
      subject: "With file",
      body: "see attached",
      attachments: [{ name: "note.txt", mimeType: "text/plain", data: "aGk=", size: 2 }],
    };
    const mime = decode(buildMime(draft, "me@x.com"));
    expect(mime).toContain("multipart/mixed; boundary=");
    expect(mime).toContain('Content-Disposition: attachment; filename="note.txt"');
  });

  it("carries reply threading headers", () => {
    const draft = draftFromMessage("reply", original, "me@x.com");
    const mime = decode(buildMime(draft, "me@x.com"));
    expect(mime).toContain("In-Reply-To: <abc@x.com>");
    expect(mime).toContain("References: <abc@x.com>");
  });
});

describe("draftFromMessage", () => {
  it("prefills a reply (Re:, sender, thread, in-reply-to)", () => {
    const d = draftFromMessage("reply", original, "me@x.com");
    expect(d.subject).toBe("Re: Lunch?");
    expect(d.to).toContain("ada@x.com");
    expect(d.inReplyTo).toBe("<abc@x.com>");
    expect(d.threadId).toBe("t1");
  });

  it("reply-all adds other recipients to cc and drops self", () => {
    const d = draftFromMessage("replyAll", original, "me@x.com");
    expect(d.to).toContain("ada@x.com");
    expect(d.cc).toContain("team@x.com");
    expect(d.cc).not.toContain("me@x.com");
  });

  it("forward prefixes Fwd: and quotes the original with empty recipients", () => {
    const d = draftFromMessage("forward", original, "me@x.com");
    expect(d.subject).toBe("Fwd: Lunch?");
    expect(d.body).toContain("Forwarded message");
    expect(d.to).toBe("");
  });
});
