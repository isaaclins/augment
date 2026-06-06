import { describe, expect, it } from "vitest";
import {
  addressLabel,
  decodeBase64Url,
  extractBodies,
  getHeader,
  htmlToText,
  parseAddress,
  parseAddressList,
  parseMessage,
} from "./parse";
import type { GmailMessage, GmailMessagePart } from "./types";

describe("decodeBase64Url", () => {
  it("decodes plain ASCII", () => {
    // "Hello, world!" -> base64url (no padding)
    expect(decodeBase64Url("SGVsbG8sIHdvcmxkIQ")).toBe("Hello, world!");
  });

  it("decodes multi-byte UTF-8", () => {
    // "Héllo" UTF-8 bytes -> base64
    expect(decodeBase64Url("SMOpbGxv")).toBe("Héllo");
  });

  it("handles the url-safe '_' and '-' substitutions and honours charset", () => {
    // base64url "__8" -> bytes [0xFF, 0xFF]; latin1 renders them as ÿÿ
    expect(decodeBase64Url("__8", "iso-8859-1")).toBe("ÿÿ");
    // base64url "-vv8" -> bytes [0xFA, 0xFB, 0xFC]
    expect(decodeBase64Url("-vv8", "iso-8859-1")).toBe("úûü");
  });
});

describe("getHeader", () => {
  const headers = [
    { name: "From", value: "a@b.com" },
    { name: "Subject", value: "Hi" },
  ];
  it("is case-insensitive", () => {
    expect(getHeader(headers, "from")).toBe("a@b.com");
    expect(getHeader(headers, "SUBJECT")).toBe("Hi");
  });
  it("returns undefined for missing headers", () => {
    expect(getHeader(headers, "Cc")).toBeUndefined();
    expect(getHeader(undefined, "From")).toBeUndefined();
  });
});

describe("parseAddress / parseAddressList", () => {
  it("parses a named address", () => {
    expect(parseAddress('"Ada Lovelace" <ada@x.com>')).toEqual({
      name: "Ada Lovelace",
      email: "ada@x.com",
    });
  });
  it("parses a bare address", () => {
    expect(parseAddress("bob@x.com")).toEqual({ email: "bob@x.com" });
  });
  it("lowercases the email", () => {
    expect(parseAddress("Bob@Example.COM").email).toBe("bob@example.com");
  });
  it("splits a list, ignoring commas inside quoted names", () => {
    const list = parseAddressList('"Doe, John" <john@x.com>, jane@y.com');
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ name: "Doe, John", email: "john@x.com" });
    expect(list[1]).toEqual({ email: "jane@y.com" });
  });
});

describe("extractBodies", () => {
  it("prefers the first text/plain and text/html in a multipart/alternative", () => {
    const part: GmailMessagePart = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: "SGk" } }, // "Hi"
        { mimeType: "text/html", body: { data: "PGI+SGk8L2I+" } }, // "<b>Hi</b>"
      ],
    };
    expect(extractBodies(part)).toEqual({ text: "Hi", html: "<b>Hi</b>" });
  });

  it("skips attachment parts (those with a filename)", () => {
    const part: GmailMessagePart = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: "SGk" } },
        { mimeType: "text/plain", filename: "note.txt", body: { data: "U2VjcmV0" } },
      ],
    };
    expect(extractBodies(part)).toEqual({ text: "Hi" });
  });

  it("recurses through nested multipart/related", () => {
    const part: GmailMessagePart = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/related",
          parts: [{ mimeType: "text/html", body: { data: "PHA+eDwvcD4" } }], // "<p>x</p>"
        },
      ],
    };
    expect(extractBodies(part).html).toBe("<p>x</p>");
  });
});

describe("parseMessage", () => {
  const message: GmailMessage = {
    id: "m1",
    threadId: "t1",
    labelIds: ["INBOX", "UNREAD"],
    internalDate: "1700000000000",
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: '"Ada" <ada@x.com>' },
        { name: "To", value: "me@y.com, two@y.com" },
        { name: "Subject", value: "Quarterly report" },
        { name: "Message-ID", value: "<abc@x.com>" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: "SGk" } },
        { mimeType: "text/html", body: { data: "PGI+SGk8L2I+" } },
      ],
    },
  };

  it("normalizes headers, bodies, labels and dates", () => {
    const parsed = parseMessage(message);
    expect(parsed.id).toBe("m1");
    expect(parsed.from).toEqual({ name: "Ada", email: "ada@x.com" });
    expect(parsed.to).toHaveLength(2);
    expect(parsed.subject).toBe("Quarterly report");
    expect(parsed.messageId).toBe("<abc@x.com>");
    expect(parsed.internalDate).toBe(1700000000000);
    expect(parsed.html).toBe("<b>Hi</b>");
    expect(parsed.text).toBe("Hi");
    expect(parsed.isUnread).toBe(true);
  });

  it("marks read messages as not unread and defaults the subject", () => {
    const parsed = parseMessage({ id: "m2", threadId: "t1", labelIds: ["INBOX"], payload: {} });
    expect(parsed.isUnread).toBe(false);
    expect(parsed.subject).toBe("(no subject)");
  });
});

describe("htmlToText / addressLabel", () => {
  it("strips tags and decodes basic entities", () => {
    expect(htmlToText("<p>Hello&nbsp;<b>world</b> &amp; more</p>")).toBe("Hello world & more");
  });
  it("drops script/style content", () => {
    expect(htmlToText("<style>p{color:red}</style><p>Hi</p><script>x()</script>")).toBe("Hi");
  });
  it("labels addresses by name then local-part", () => {
    expect(addressLabel({ name: "Ada", email: "ada@x.com" })).toBe("Ada");
    expect(addressLabel({ email: "ada@x.com" })).toBe("ada");
  });
});
