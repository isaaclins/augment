// User-defined mail rules. A rule matches a message when its conditions hold
// (all or any), then applies its actions via the Gmail API. Persisted verbatim
// to the on-disk store, so this shape is also the serialization format.

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

export type RuleMatchMode = "all" | "any";

export type RuleAction =
  | { type: "addLabel"; label: string }
  | { type: "archive" }
  | { type: "markRead" }
  | { type: "star" };

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  matchMode: RuleMatchMode;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

/** The normalized fields a rule is evaluated against. */
export interface RuleTarget {
  from: string; // full "Name <email>" so a condition can match name or address
  to: string;
  subject: string;
  body: string;
}
