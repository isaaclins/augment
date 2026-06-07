import { describe, expect, it } from "vitest";
import { searchRows, type IndexDoc } from "./searchIndex";

function row(partial: Partial<IndexDoc> & { id: string }): IndexDoc {
  return {
    id: partial.id,
    snippet: partial.snippet ?? "",
    from: partial.from ?? { email: "" },
    subject: partial.subject ?? "",
    date: partial.date ?? 0,
    unread: partial.unread ?? false,
    messageCount: partial.messageCount ?? 1,
    labelIds: partial.labelIds ?? [],
    searchLabels: partial.searchLabels,
    hasAttachment: partial.hasAttachment,
  };
}

const rows: IndexDoc[] = [
  row({ id: "a", from: { name: "Google", email: "no-reply@google.com" }, subject: "Security alert", snippet: "someone signed in", date: 100, unread: true }),
  row({ id: "b", from: { name: "Bob", email: "bob@x.com" }, subject: "Invoice April", snippet: "invoice attached", date: 300 }),
  row({ id: "c", from: { name: "Google", email: "pay@google.com" }, subject: "Invoice March", snippet: "payment due", date: 200 }),
];

describe("searchRows — free text", () => {
  it("matches across fields and ranks by score then recency", () => {
    const ids = searchRows(rows, "invoice").map((r) => r.id);
    expect([...ids].sort()).toEqual(["b", "c"]);
    expect(ids[0]).toBe("b"); // tie on subject score, b is newer
  });

  it("empty query returns most-recent first", () => {
    expect(searchRows(rows, "  ").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("respects the limit", () => {
    expect(searchRows(rows, "", 1)).toHaveLength(1);
  });
});

describe("searchRows — operators", () => {
  it("from: restricts to the sender field", () => {
    const ids = searchRows(rows, "from:google").map((r) => r.id);
    expect([...ids].sort()).toEqual(["a", "c"]); // not Bob
  });

  it("subject: restricts to the subject field", () => {
    expect(searchRows(rows, "subject:invoice").map((r) => r.id).sort()).toEqual(["b", "c"]);
  });

  it("combines operators with free text (AND)", () => {
    expect(searchRows(rows, "from:google invoice").map((r) => r.id)).toEqual(["c"]);
  });

  it("is:unread filters by unread state", () => {
    expect(searchRows(rows, "is:unread").map((r) => r.id)).toEqual(["a"]);
  });
});

describe("searchRows — label / attachment / date filters", () => {
  const docs: IndexDoc[] = [
    row({ id: "x", subject: "Receipt", date: 1000, searchLabels: ["starred", "work"], hasAttachment: true }),
    row({ id: "y", subject: "Note", date: 2000, searchLabels: ["inbox"] }),
    row({ id: "z", subject: "Photo", date: 3000, searchLabels: ["work"], hasAttachment: true }),
  ];

  it("label:/is:/in: filter by label tokens", () => {
    expect(searchRows(docs, "label:work").map((r) => r.id).sort()).toEqual(["x", "z"]);
    expect(searchRows(docs, "is:starred").map((r) => r.id)).toEqual(["x"]);
  });

  it("has:attachment filters to threads with attachments", () => {
    expect(searchRows(docs, "has:attachment").map((r) => r.id).sort()).toEqual(["x", "z"]);
  });

  it("after:/before: bound by date", () => {
    const dated: IndexDoc[] = [
      row({ id: "old", date: new Date(2020, 0, 1).getTime() }),
      row({ id: "mid", date: new Date(2022, 5, 1).getTime() }),
      row({ id: "new", date: new Date(2024, 0, 1).getTime() }),
    ];
    expect(searchRows(dated, "after:2021/01/01").map((r) => r.id).sort()).toEqual(["mid", "new"]);
    expect(searchRows(dated, "before:2023/01/01").map((r) => r.id).sort()).toEqual(["mid", "old"]);
  });

  it("combines a label filter with free text", () => {
    expect(searchRows(docs, "label:work photo").map((r) => r.id)).toEqual(["z"]);
  });
});
