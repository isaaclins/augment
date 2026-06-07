import { describe, expect, it } from "vitest";
import {
  evaluateCondition,
  matchingRules,
  ruleMatches,
  ruleTargetFromMessage,
} from "./engine";
import type { Rule, RuleTarget } from "./types";
import type { ParsedMessage } from "../gmail/parse";

const target: RuleTarget = {
  from: "Ada Lovelace <ada@analytical.com>",
  to: "me@x.com",
  subject: "Your weekly Analytical Engine digest",
  body: "Here is your newsletter. Unsubscribe anytime.",
};

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

describe("ruleMatches", () => {
  const baseRule: Rule = {
    id: "r1",
    name: "Newsletters",
    enabled: true,
    matchMode: "all",
    conditions: [
      { field: "from", operator: "contains", value: "analytical.com" },
      { field: "subject", operator: "contains", value: "digest" },
    ],
    actions: [{ type: "addLabel", label: "Augment/Newsletters" }, { type: "archive" }],
  };

  it("matches when all conditions hold (matchMode all)", () => {
    expect(ruleMatches(baseRule, target)).toBe(true);
  });

  it("fails 'all' when one condition fails", () => {
    const rule = { ...baseRule, conditions: [...baseRule.conditions, { field: "subject", operator: "contains", value: "invoice" } as const] };
    expect(ruleMatches(rule, target)).toBe(false);
  });

  it("matches 'any' when at least one condition holds", () => {
    const rule: Rule = {
      ...baseRule,
      matchMode: "any",
      conditions: [
        { field: "subject", operator: "contains", value: "invoice" },
        { field: "from", operator: "contains", value: "lovelace" },
      ],
    };
    expect(ruleMatches(rule, target)).toBe(true);
  });

  it("never matches a disabled rule or one with no conditions", () => {
    expect(ruleMatches({ ...baseRule, enabled: false }, target)).toBe(false);
    expect(ruleMatches({ ...baseRule, conditions: [] }, target)).toBe(false);
  });
});

describe("matchingRules", () => {
  it("returns only matching, enabled rules in order", () => {
    const rules: Rule[] = [
      { id: "a", name: "A", enabled: true, matchMode: "all", conditions: [{ field: "from", operator: "contains", value: "analytical" }], actions: [{ type: "archive" }] },
      { id: "b", name: "B", enabled: false, matchMode: "all", conditions: [{ field: "from", operator: "contains", value: "analytical" }], actions: [{ type: "archive" }] },
      { id: "c", name: "C", enabled: true, matchMode: "all", conditions: [{ field: "subject", operator: "contains", value: "invoice" }], actions: [{ type: "archive" }] },
    ];
    expect(matchingRules(rules, target).map((r) => r.id)).toEqual(["a"]);
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
