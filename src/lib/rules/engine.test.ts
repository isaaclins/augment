import { describe, expect, it } from "vitest";
import {
  evaluateCondition,
  evaluateNode,
  matchingRules,
  ruleMatches,
  ruleTargetFromMessage,
} from "./engine";
import {
  normalizeRule,
  type Rule,
  type RuleConditionNode,
  type RuleField,
  type RuleGroup,
  type RuleNode,
  type RuleOperator,
  type RuleTarget,
} from "./types";
import type { ParsedMessage } from "../gmail/parse";

const target: RuleTarget = {
  from: "Ada Lovelace <ada@analytical.com>",
  to: "me@x.com",
  subject: "Your weekly Analytical Engine digest",
  body: "Here is your newsletter. Unsubscribe anytime.",
};

// Shorthand builders for readable tree literals.
const cond = (field: RuleField, operator: RuleOperator, value: string): RuleConditionNode => ({
  kind: "condition",
  field,
  operator,
  value,
});
const all = (...children: RuleNode[]): RuleGroup => ({ kind: "group", match: "all", children });
const any = (...children: RuleNode[]): RuleGroup => ({ kind: "group", match: "any", children });

describe("evaluateCondition", () => {
  it("contains is case-insensitive by default", () => {
    expect(evaluateCondition({ field: "from", operator: "contains", value: "ANALYTICAL" }, target)).toBe(true);
  });

  it("respects caseSensitive when requested", () => {
    expect(
      evaluateCondition({ field: "from", operator: "contains", value: "ANALYTICAL", caseSensitive: true }, target),
    ).toBe(false);
  });

  it("matches against the sender display name as well as the address", () => {
    expect(evaluateCondition({ field: "from", operator: "contains", value: "lovelace" }, target)).toBe(true);
  });

  it("supports equals / startsWith / endsWith / notContains", () => {
    expect(evaluateCondition({ field: "to", operator: "equals", value: "me@x.com" }, target)).toBe(true);
    expect(evaluateCondition({ field: "subject", operator: "startsWith", value: "Your weekly" }, target)).toBe(true);
    expect(evaluateCondition({ field: "body", operator: "endsWith", value: "anytime." }, target)).toBe(true);
    expect(evaluateCondition({ field: "subject", operator: "notContains", value: "invoice" }, target)).toBe(true);
  });

  it("supports regex matches and tolerates invalid patterns", () => {
    expect(evaluateCondition({ field: "subject", operator: "matches", value: "digest$" }, target)).toBe(true);
    expect(evaluateCondition({ field: "subject", operator: "matches", value: "[" }, target)).toBe(false);
  });
});

describe("evaluateNode (boolean tree)", () => {
  it("AND group requires every child", () => {
    expect(evaluateNode(all(cond("from", "contains", "analytical"), cond("subject", "contains", "digest")), target)).toBe(true);
    expect(evaluateNode(all(cond("from", "contains", "analytical"), cond("subject", "contains", "invoice")), target)).toBe(false);
  });

  it("OR group needs at least one child", () => {
    expect(evaluateNode(any(cond("subject", "contains", "invoice"), cond("from", "contains", "lovelace")), target)).toBe(true);
    expect(evaluateNode(any(cond("subject", "contains", "invoice"), cond("to", "equals", "nope")), target)).toBe(false);
  });

  it("empty groups never match (AND or OR)", () => {
    expect(evaluateNode(all(), target)).toBe(false);
    expect(evaluateNode(any(), target)).toBe(false);
  });

  it("evaluates nested brackets: A OR (B AND C)", () => {
    // A = from contains zzz (false); B = subject contains digest (true);
    // C = body contains newsletter (true)  → A OR (B AND C) = true
    const tree = any(cond("from", "contains", "zzz"), all(cond("subject", "contains", "digest"), cond("body", "contains", "newsletter")));
    expect(evaluateNode(tree, target)).toBe(true);

    // Now make C false → A OR (B AND C) = false OR (true AND false) = false
    const tree2 = any(cond("from", "contains", "zzz"), all(cond("subject", "contains", "digest"), cond("body", "contains", "invoice")));
    expect(evaluateNode(tree2, target)).toBe(false);

    // A true short-circuits regardless of the failing AND group.
    const tree3 = any(cond("from", "contains", "lovelace"), all(cond("subject", "contains", "invoice"), cond("body", "contains", "invoice")));
    expect(evaluateNode(tree3, target)).toBe(true);
  });
});

describe("ruleMatches", () => {
  const baseRule: Rule = {
    id: "r1",
    name: "Newsletters",
    enabled: true,
    match: all(cond("from", "contains", "analytical.com"), cond("subject", "contains", "digest")),
    actions: [{ type: "addLabel", label: "Augment/Newsletters" }, { type: "archive" }],
  };

  it("matches when the root AND group holds", () => {
    expect(ruleMatches(baseRule, target)).toBe(true);
  });

  it("fails when one AND child fails", () => {
    const rule: Rule = { ...baseRule, match: all(...baseRule.match.children, cond("subject", "contains", "invoice")) };
    expect(ruleMatches(rule, target)).toBe(false);
  });

  it("matches an OR root when at least one child holds", () => {
    const rule: Rule = { ...baseRule, match: any(cond("subject", "contains", "invoice"), cond("from", "contains", "lovelace")) };
    expect(ruleMatches(rule, target)).toBe(true);
  });

  it("matches a bracketed mix: A OR (B AND C)", () => {
    const rule: Rule = {
      ...baseRule,
      match: any(cond("from", "contains", "stripe"), all(cond("subject", "contains", "digest"), cond("to", "equals", "me@x.com"))),
    };
    expect(ruleMatches(rule, target)).toBe(true);
  });

  it("never matches a disabled rule or an empty condition tree", () => {
    expect(ruleMatches({ ...baseRule, enabled: false }, target)).toBe(false);
    expect(ruleMatches({ ...baseRule, match: all() }, target)).toBe(false);
  });
});

describe("matchingRules", () => {
  it("returns only matching, enabled rules in order", () => {
    const rules: Rule[] = [
      { id: "a", name: "A", enabled: true, match: all(cond("from", "contains", "analytical")), actions: [{ type: "archive" }] },
      { id: "b", name: "B", enabled: false, match: all(cond("from", "contains", "analytical")), actions: [{ type: "archive" }] },
      { id: "c", name: "C", enabled: true, match: all(cond("subject", "contains", "invoice")), actions: [{ type: "archive" }] },
    ];
    expect(matchingRules(rules, target).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("normalizeRule (migration)", () => {
  it("wraps a legacy flat rule into a root group preserving its mode", () => {
    const legacy = {
      id: "old",
      name: "Legacy",
      enabled: true,
      matchMode: "any" as const,
      conditions: [
        { field: "from" as const, operator: "contains" as const, value: "x" },
        { field: "subject" as const, operator: "contains" as const, value: "y" },
      ],
      actions: [{ type: "archive" as const }],
    };
    const migrated = normalizeRule(legacy);
    expect(migrated.match.kind).toBe("group");
    expect(migrated.match.match).toBe("any");
    expect(migrated.match.children).toHaveLength(2);
    expect(migrated.match.children[0]).toMatchObject({ kind: "condition", field: "from", value: "x" });
  });

  it("passes a tree-shaped rule through, defaulting a missing mode to all", () => {
    const treeRule = {
      id: "new",
      name: "Tree",
      enabled: true,
      match: all(cond("from", "contains", "x")),
      actions: [{ type: "archive" as const }],
    };
    expect(normalizeRule(treeRule).match.match).toBe("all");
  });
});

describe("ruleTargetFromMessage", () => {
  it("derives from/to/subject/body from a parsed message, stripping HTML", () => {
    const parsed: ParsedMessage = {
      id: "m",
      threadId: "t",
      labelIds: ["INBOX"],
      internalDate: 0,
      from: { name: "Ada", email: "ada@x.com" },
      to: [{ email: "me@x.com" }, { email: "cc@x.com" }],
      cc: [],
      subject: "Hi",
      html: "<p>Hello <b>world</b></p>",
      isUnread: true,
    };
    const t = ruleTargetFromMessage(parsed);
    expect(t.from).toBe("Ada <ada@x.com>");
    expect(t.to).toBe("me@x.com, cc@x.com");
    expect(t.subject).toBe("Hi");
    expect(t.body).toBe("Hello world");
  });

  it("prefers the plaintext body when present", () => {
    const parsed: ParsedMessage = {
      id: "m",
      threadId: "t",
      labelIds: [],
      internalDate: 0,
      from: { email: "a@x.com" },
      to: [],
      cc: [],
      subject: "S",
      text: "plain body",
      html: "<p>html body</p>",
      isUnread: false,
    };
    expect(ruleTargetFromMessage(parsed).body).toBe("plain body");
  });
});
