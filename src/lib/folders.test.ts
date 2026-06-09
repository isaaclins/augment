import { describe, expect, it } from "vitest";
import { folderLabelName, parseFolderLabelName, FOLDER_LABEL_PREFIX } from "./folders";

describe("folderLabelName", () => {
  it("prefixes the given name", () => {
    expect(folderLabelName("Receipts")).toBe("Augment/Folders/Receipts");
  });

  it("uses the exported prefix constant", () => {
    expect(folderLabelName("X").startsWith(FOLDER_LABEL_PREFIX)).toBe(true);
  });

  it("does not trim or normalise the name (callers own input shape)", () => {
    expect(folderLabelName(" Spaced ")).toBe("Augment/Folders/ Spaced ");
  });
});

describe("parseFolderLabelName", () => {
  it("returns the bare name for a prefixed label", () => {
    expect(parseFolderLabelName("Augment/Folders/Receipts")).toBe("Receipts");
  });

  it("preserves casing of the bare name", () => {
    expect(parseFolderLabelName("Augment/Folders/CamelCase")).toBe("CamelCase");
  });

  it("returns null when the prefix is missing", () => {
    expect(parseFolderLabelName("Receipts")).toBeNull();
    expect(parseFolderLabelName("INBOX")).toBeNull();
    expect(parseFolderLabelName("Augment/Tags/Personal")).toBeNull();
  });

  it("returns null for an empty name after the prefix", () => {
    expect(parseFolderLabelName("Augment/Folders/")).toBeNull();
    expect(parseFolderLabelName("Augment/Folders/   ")).toBeNull();
  });

  it("round-trips with folderLabelName", () => {
    expect(parseFolderLabelName(folderLabelName("Projects"))).toBe("Projects");
  });
});
