import { describe, expect, it } from "vitest";
import {
  defaultTagStyle,
  parseTagLabelName,
  TAG_LABEL_PREFIX,
  tagLabelName,
  TAG_COLOR_KEYS,
} from "./tags";

describe("tagLabelName", () => {
  it("prefixes the given name", () => {
    expect(tagLabelName("Travel")).toBe("Augment/Tags/Travel");
  });

  it("uses the exported prefix constant", () => {
    expect(tagLabelName("X").startsWith(TAG_LABEL_PREFIX)).toBe(true);
  });
});

describe("parseTagLabelName", () => {
  it("returns the bare name for a prefixed label", () => {
    expect(parseTagLabelName("Augment/Tags/Travel")).toBe("Travel");
  });

  it("preserves casing", () => {
    expect(parseTagLabelName("Augment/Tags/CamelCase")).toBe("CamelCase");
  });

  it("returns null when the prefix is missing", () => {
    expect(parseTagLabelName("Travel")).toBeNull();
    expect(parseTagLabelName("INBOX")).toBeNull();
    expect(parseTagLabelName("Augment/Folders/Receipts")).toBeNull();
  });

  it("returns null for an empty name after the prefix", () => {
    expect(parseTagLabelName("Augment/Tags/")).toBeNull();
    expect(parseTagLabelName("Augment/Tags/   ")).toBeNull();
  });

  it("round-trips with tagLabelName", () => {
    expect(parseTagLabelName(tagLabelName("Finance"))).toBe("Finance");
  });
});

describe("defaultTagStyle", () => {
  it("uses the hand-picked starter style for known names", () => {
    expect(defaultTagStyle("personal")).toEqual({ color: "blue", icon: "heart" });
    expect(defaultTagStyle("Finance")).toEqual({ color: "green", icon: "bookmark" });
    expect(defaultTagStyle("SECURITY")).toEqual({ color: "red", icon: "flag" });
  });

  it("is deterministic for unknown names", () => {
    const a = defaultTagStyle("ProjectX");
    const b = defaultTagStyle("ProjectX");
    expect(a).toEqual(b);
  });

  it("returns a valid color and the default tag icon for unknown names", () => {
    const style = defaultTagStyle("zzzzz-uncommon-name");
    expect(TAG_COLOR_KEYS).toContain(style.color);
    expect(style.icon).toBe("tag");
  });
});
