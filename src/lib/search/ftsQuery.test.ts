import { describe, expect, it } from "vitest";
import { buildFtsQuery, isEmptyQuery, parseQuery } from "./ftsQuery";

describe("parseQuery", () => {
  it("splits bare words into free terms", () => {
    const q = parseQuery("pay Invoice");
    expect(q.terms).toEqual(["pay", "invoice"]);
    expect(q.from).toEqual([]);
  });

  it("recognises from:/sender:, subject:/title:, body: operators", () => {
    const q = parseQuery("from:google subject:alert body:signed lunch");
    expect(q.from).toEqual(["google"]);
    expect(q.subject).toEqual(["alert"]);
    expect(q.body).toEqual(["signed"]);
    expect(q.terms).toEqual(["lunch"]);
  });

  it("recognises is:unread and is:read", () => {
    expect(parseQuery("is:unread report").unread).toBe(true);
    expect(parseQuery("is:read").unread).toBe(false);
    expect(parseQuery("report").unread).toBeUndefined();
  });

  it("treats unknown operators as free terms on their value", () => {
    expect(parseQuery("xyz:foo").terms).toEqual(["foo"]);
  });

  it("strips punctuation from operator values", () => {
    expect(parseQuery('from:"google.com"').from).toEqual(["googlecom"]);
  });

  it("collects label:, in: and is:<flag> into labels", () => {
    const q = parseQuery("label:work in:inbox is:starred");
    expect([...q.labels].sort()).toEqual(["inbox", "starred", "work"]);
  });

  it("recognises has:attachment", () => {
    expect(parseQuery("has:attachment").hasAttachment).toBe(true);
    expect(parseQuery("has:attachments").hasAttachment).toBe(true);
    expect(parseQuery("report").hasAttachment).toBeUndefined();
  });

  it("parses after:/before: absolute dates", () => {
    const q = parseQuery("after:2024/01/15 before:2024-02-01");
    expect(q.after).toBe(new Date(2024, 0, 15).getTime());
    expect(q.before).toBe(new Date(2024, 1, 1).getTime());
  });

  it("parses newer_than:/older_than: relative to now", () => {
    const now = 1_000_000_000_000;
    const q = parseQuery("newer_than:7d older_than:2w", now);
    expect(q.after).toBe(now - 7 * 86_400_000);
    expect(q.before).toBe(now - 14 * 86_400_000);
  });
});

describe("buildFtsQuery", () => {
  it("maps operators to column-scoped prefix terms", () => {
    expect(buildFtsQuery("from:google")).toBe("sender:google*");
    expect(buildFtsQuery("subject:invoice")).toBe("subject:invoice*");
    expect(buildFtsQuery("from:google alert")).toBe("sender:google* alert*");
  });

  it("returns empty for a blank or unread-only query", () => {
    expect(buildFtsQuery("   ")).toBe("");
    expect(buildFtsQuery("is:unread")).toBe("");
  });
});

describe("isEmptyQuery", () => {
  it("is true only with no constraints", () => {
    expect(isEmptyQuery(parseQuery(""))).toBe(true);
    expect(isEmptyQuery(parseQuery("is:unread"))).toBe(false);
    expect(isEmptyQuery(parseQuery("hi"))).toBe(false);
  });
});
