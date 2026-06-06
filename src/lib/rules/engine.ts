// The rules engine — pure, deterministic, and dependency-free so it is fully
// unit-tested. Applying the matched actions to Gmail lives in `apply.ts`.

import { addressLabel, htmlToText } from "../gmail/parse";
import type { ParsedMessage } from "../gmail/parse";
import type { Rule, RuleCondition, RuleTarget } from "./types";

/** Build the normalized evaluation target from a parsed message. */
export function ruleTargetFromMessage(message: ParsedMessage): RuleTarget {
  const fromName = message.from.name ?? addressLabel(message.from);
  const body = message.text ?? (message.html ? htmlToText(message.html) : "");
  return {
    from: `${fromName} <${message.from.email}>`.trim(),
    to: message.to.map((a) => a.email).join(", "),
    subject: message.subject,
    body,
  };
}

function fieldValue(target: RuleTarget, field: RuleCondition["field"]): string {
  return target[field] ?? "";
}

/** Evaluate a single condition against the target. Invalid regexes never match. */
export function evaluateCondition(condition: RuleCondition, target: RuleTarget): boolean {
  const caseSensitive = condition.caseSensitive ?? false;
  const haystackRaw = fieldValue(target, condition.field);
  const needleRaw = condition.value;

  if (condition.operator === "matches") {
    try {
      return new RegExp(needleRaw, caseSensitive ? "" : "i").test(haystackRaw);
    } catch {
      return false; // a malformed pattern simply doesn't match
    }
  }

  const haystack = caseSensitive ? haystackRaw : haystackRaw.toLowerCase();
  const needle = caseSensitive ? needleRaw : needleRaw.toLowerCase();

  switch (condition.operator) {
    case "contains":
      return haystack.includes(needle);
    case "notContains":
      return !haystack.includes(needle);
    case "equals":
      return haystack === needle;
    case "startsWith":
      return haystack.startsWith(needle);
    case "endsWith":
      return haystack.endsWith(needle);
    default:
      return false;
  }
}

/** Does a rule match the target? Disabled rules and rules without conditions never match. */
export function ruleMatches(rule: Rule, target: RuleTarget): boolean {
  if (!rule.enabled) return false;
  if (rule.conditions.length === 0) return false;

  if (rule.matchMode === "any") {
    return rule.conditions.some((c) => evaluateCondition(c, target));
  }
  return rule.conditions.every((c) => evaluateCondition(c, target));
}

/** All enabled rules whose conditions match, in declaration order. */
export function matchingRules(rules: Rule[], target: RuleTarget): Rule[] {
  return rules.filter((rule) => ruleMatches(rule, target));
}

/** Convenience: evaluate the rule set directly against a parsed message. */
export function rulesForMessage(rules: Rule[], message: ParsedMessage): Rule[] {
  return matchingRules(rules, ruleTargetFromMessage(message));
}
