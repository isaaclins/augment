// User-defined mail rules. A rule matches a message when its condition tree
// holds, then applies its actions via the Gmail API. Persisted verbatim to the
// on-disk store, so this shape is also the serialization format.
//
// Conditions form a boolean tree of nested groups, so a rule can express
// arbitrary logic with brackets, e.g.  A OR (B AND C). Each group joins its
// children with AND ("all") or OR ("any"); a leaf is a single condition.

export type RuleField = "from" | "to" | "subject" | "body";

export type RuleOperator =
  | "contains"
  | "notContains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "matches"; // regular expression

export interface RuleCondition {
  field: RuleField;
  operator: RuleOperator;
  value: string;
  caseSensitive?: boolean;
}

/** How a group joins its children: "all" = AND, "any" = OR. */
export type RuleMatchMode = "all" | "any";

/** A leaf in the condition tree — one condition. */
export interface RuleConditionNode extends RuleCondition {
  kind: "condition";
}

/** A bracketed group of conditions and/or nested groups. */
export interface RuleGroup {
  kind: "group";
  match: RuleMatchMode;
  children: RuleNode[];
}

export type RuleNode = RuleConditionNode | RuleGroup;

export type RuleAction =
  | { type: "addLabel"; label: string }
  | { type: "archive" }
  | { type: "markRead" }
  | { type: "star" };

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  /** Root boolean group the message is evaluated against. */
  match: RuleGroup;
  actions: RuleAction[];
}

/** The normalized fields a rule is evaluated against. */
export interface RuleTarget {
  from: string; // full "Name <email>" so a condition can match name or address
  to: string;
  subject: string;
  body: string;
}

// ----------------------------------------------------------------- builders

/** A fresh leaf condition (overridable). */
export function conditionNode(patch?: Partial<RuleCondition>): RuleConditionNode {
  return { kind: "condition", field: "from", operator: "contains", value: "", ...patch };
}

/** An empty group with the given join mode. */
export function emptyGroup(match: RuleMatchMode = "all"): RuleGroup {
  return { kind: "group", match, children: [] };
}

// --------------------------------------------------------------- migration

/** The shape a stored rule may take on disk: either the current tree
 *  (`match`) or the legacy flat form (`matchMode` + `conditions`). */
export interface StoredRule {
  id: string;
  name: string;
  enabled?: boolean;
  actions?: RuleAction[];
  match?: RuleGroup;
  matchMode?: RuleMatchMode;
  conditions?: RuleCondition[];
}

function normalizeGroup(group: RuleGroup): RuleGroup {
  return {
    kind: "group",
    match: group.match === "any" ? "any" : "all",
    children: (group.children ?? []).map((child) =>
      child.kind === "group" ? normalizeGroup(child) : { ...child, kind: "condition" },
    ),
  };
}

/** Upgrade a stored rule to the current tree shape. Idempotent: a rule already
 *  in tree form is returned (re-normalized); a legacy flat rule is wrapped into
 *  a single root group preserving its old all/any mode. */
export function normalizeRule(raw: StoredRule): Rule {
  const base = {
    id: raw.id,
    name: raw.name,
    enabled: raw.enabled ?? true,
    actions: raw.actions ?? [],
  };
  if (raw.match && raw.match.kind === "group") {
    return { ...base, match: normalizeGroup(raw.match) };
  }
  const children: RuleNode[] = (raw.conditions ?? []).map((c) => ({ kind: "condition", ...c }));
  return { ...base, match: { kind: "group", match: raw.matchMode === "any" ? "any" : "all", children } };
}
