import { describe, expect, it } from "vitest";
import { planFolderSync, planTagSync } from "./sync";
import type { GmailLabel } from "./types";
import type { Folder } from "../store";
import type { Tag } from "../tags";

const label = (id: string, name: string): GmailLabel =>
  ({ id, name, type: "user" }) as unknown as GmailLabel;

const folder = (id: string, name: string): Folder => ({ id, name });

const tag = (id: string, name: string, labelId = `Label_${id}`): Tag => ({
  id,
  name,
  labelId,
  color: "blue",
  icon: "tag",
  source: "user",
});

describe("planFolderSync", () => {
  it("returns an empty plan when both sides are empty", () => {
    expect(planFolderSync({ localFolders: [], gmailLabels: [] })).toEqual({
      migrations: [],
      prunes: [],
      imports: [],
    });
  });

  it("ignores Gmail labels that aren't Augment/Folders/* and don't match a local folder", () => {
    const plan = planFolderSync({
      localFolders: [],
      gmailLabels: [label("L1", "INBOX"), label("L2", "Random/Label")],
    });
    expect(plan).toEqual({ migrations: [], prunes: [], imports: [] });
  });

  it("migrates a folder whose Gmail label is still the bare <name>", () => {
    const plan = planFolderSync({
      localFolders: [folder("f1", "Receipts")],
      gmailLabels: [label("Label_3", "Receipts")],
    });
    expect(plan.migrations).toEqual([
      { labelId: "Label_3", fromName: "Receipts", toName: "Augment/Folders/Receipts" },
    ]);
    expect(plan.prunes).toEqual([]);
    expect(plan.imports).toEqual([]);
  });

  it("does not migrate when the prefixed label already exists", () => {
    const plan = planFolderSync({
      localFolders: [folder("f1", "Receipts")],
      gmailLabels: [
        label("Label_3", "Receipts"),
        label("Label_9", "Augment/Folders/Receipts"),
      ],
    });
    // The bare label is left alone (possibly a third-party label).
    expect(plan.migrations).toEqual([]);
    expect(plan.prunes).toEqual([]);
    expect(plan.imports).toEqual([]);
  });

  it("prunes a folder whose backing label is gone from Gmail entirely", () => {
    const plan = planFolderSync({
      localFolders: [folder("f1", "OldStuff")],
      gmailLabels: [label("L1", "INBOX")],
    });
    expect(plan.prunes).toEqual([folder("f1", "OldStuff")]);
    expect(plan.migrations).toEqual([]);
    expect(plan.imports).toEqual([]);
  });

  it("does NOT prune a folder whose bare label still exists (migration will fix it)", () => {
    // This is the bug guard: a transient updateLabel failure must not wipe the
    // folder locally — the user's mail is still attached to the bare label.
    const plan = planFolderSync({
      localFolders: [folder("f1", "Receipts")],
      gmailLabels: [label("Label_3", "Receipts")],
    });
    expect(plan.prunes).toEqual([]);
  });

  it("imports a prefixed Gmail label not yet tracked locally", () => {
    const plan = planFolderSync({
      localFolders: [],
      gmailLabels: [label("L1", "Augment/Folders/Projects")],
    });
    expect(plan.imports).toEqual([{ name: "Projects" }]);
    expect(plan.prunes).toEqual([]);
    expect(plan.migrations).toEqual([]);
  });

  it("skips importing a prefixed label whose name matches an existing folder (case-insensitive)", () => {
    const plan = planFolderSync({
      localFolders: [folder("f1", "projects")],
      gmailLabels: [label("L1", "Augment/Folders/Projects")],
    });
    expect(plan.imports).toEqual([]);
  });

  it("dedupes duplicate prefixed labels", () => {
    const plan = planFolderSync({
      localFolders: [],
      gmailLabels: [
        label("L1", "Augment/Folders/Foo"),
        label("L2", "Augment/Folders/foo"),
      ],
    });
    expect(plan.imports).toEqual([{ name: "Foo" }]);
  });

  it("composes a realistic mixed scenario", () => {
    const plan = planFolderSync({
      localFolders: [
        folder("f1", "Receipts"), // has bare → migrate
        folder("f2", "Watching"), // has prefixed → no-op
        folder("f3", "Dead"), // neither → prune
      ],
      gmailLabels: [
        label("L1", "INBOX"),
        label("L2", "Receipts"),
        label("L3", "Augment/Folders/Watching"),
        label("L4", "Augment/Folders/Newcomer"), // → import
      ],
    });
    expect(plan.migrations).toEqual([
      { labelId: "L2", fromName: "Receipts", toName: "Augment/Folders/Receipts" },
    ]);
    expect(plan.prunes).toEqual([folder("f3", "Dead")]);
    expect(plan.imports).toEqual([{ name: "Newcomer" }]);
  });
});

describe("planTagSync", () => {
  it("returns an empty plan when both sides are empty", () => {
    expect(planTagSync({ localTags: [], gmailLabels: [] })).toEqual({
      prunes: [],
      imports: [],
    });
  });

  it("prunes a local tag whose Gmail label is gone", () => {
    const t = tag("t1", "Personal");
    const plan = planTagSync({
      localTags: [t],
      gmailLabels: [label("L1", "INBOX")],
    });
    expect(plan.prunes).toEqual([t]);
    expect(plan.imports).toEqual([]);
  });

  it("imports a Gmail Augment/Tags/* label not tracked locally", () => {
    const plan = planTagSync({
      localTags: [],
      gmailLabels: [label("L1", "Augment/Tags/Travel")],
    });
    expect(plan.imports).toHaveLength(1);
    expect(plan.imports[0]).toMatchObject({ name: "Travel", labelId: "L1" });
    expect(plan.imports[0].color).toBeDefined();
    expect(plan.imports[0].icon).toBeDefined();
    expect(plan.prunes).toEqual([]);
  });

  it("imports use the starter style for known names", () => {
    const plan = planTagSync({
      localTags: [],
      gmailLabels: [label("L1", "Augment/Tags/Finance")],
    });
    expect(plan.imports[0]).toMatchObject({ color: "green", icon: "bookmark" });
  });

  it("does not prune or re-import a tag whose label matches (case-insensitive)", () => {
    const t = tag("t1", "personal");
    const plan = planTagSync({
      localTags: [t],
      gmailLabels: [label("L1", "Augment/Tags/Personal")],
    });
    expect(plan.prunes).toEqual([]);
    expect(plan.imports).toEqual([]);
  });

  it("ignores non-tag Gmail labels", () => {
    const plan = planTagSync({
      localTags: [],
      gmailLabels: [
        label("L1", "INBOX"),
        label("L2", "Augment/Folders/Receipts"),
        label("L3", "Random/Label"),
      ],
    });
    expect(plan.imports).toEqual([]);
    expect(plan.prunes).toEqual([]);
  });

  it("composes prune + import together", () => {
    const stale = tag("t1", "OldTag");
    const plan = planTagSync({
      localTags: [stale, tag("t2", "Personal")],
      gmailLabels: [
        label("L1", "Augment/Tags/Personal"),
        label("L2", "Augment/Tags/Travel"),
      ],
    });
    expect(plan.prunes).toEqual([stale]);
    expect(plan.imports).toHaveLength(1);
    expect(plan.imports[0]).toMatchObject({ name: "Travel" });
  });
});
