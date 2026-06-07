import { useState } from "react";
import { useAugment } from "../state/augment";
import { newId } from "../lib/store";
import {
  conditionNode,
  emptyGroup,
  type Rule,
  type RuleAction,
  type RuleConditionNode,
  type RuleField,
  type RuleGroup,
  type RuleNode,
  type RuleOperator,
} from "../lib/rules/types";
import { CheckIcon, CloseIcon, PlusIcon, RefreshIcon, SlidersIcon, TrashIcon } from "./icons";

const FIELDS: { value: RuleField; label: string }[] = [
  { value: "from", label: "From" },
  { value: "to", label: "To" },
  { value: "subject", label: "Subject" },
  { value: "body", label: "Body" },
];

const OPERATORS: { value: RuleOperator; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "notContains", label: "does not contain" },
  { value: "equals", label: "equals" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "matches", label: "matches regex" },
];

const ACTION_TYPES: { value: RuleAction["type"]; label: string }[] = [
  { value: "addLabel", label: "Add label" },
  { value: "archive", label: "Archive" },
  { value: "markRead", label: "Mark read" },
  { value: "star", label: "Star" },
];

function blankRule(): Rule {
  return {
    id: newId(),
    name: "New rule",
    enabled: true,
    match: { kind: "group", match: "all", children: [conditionNode()] },
    actions: [{ type: "addLabel", label: "Augment/Flagged" }],
  };
}

function describeAction(action: RuleAction): string {
  switch (action.type) {
    case "addLabel":
      return `label “${action.label || "…"}”`;
    case "archive":
      return "archive";
    case "markRead":
      return "mark read";
    case "star":
      return "star";
  }
}

const opLabel = (op: RuleOperator) => OPERATORS.find((o) => o.value === op)?.label ?? op;

/** Render a node as a bracketed boolean expression, e.g.
 *  (from contains "x") OR ((to contains "y") AND (subject contains "z")). */
function summarizeNode(node: RuleNode): string {
  if (node.kind === "condition") return `${node.field} ${opLabel(node.operator)} “${node.value}”`;
  if (node.children.length === 0) return "";
  const inner = node.children.map(summarizeNode).filter(Boolean).join(node.match === "all" ? " AND " : " OR ");
  return node.children.length > 1 ? `(${inner})` : inner;
}

function summarize(rule: Rule): string {
  // Drop the outer brackets at the root for readability.
  const conds =
    rule.match.children
      .map(summarizeNode)
      .filter(Boolean)
      .join(rule.match.match === "all" ? " AND " : " OR ") || "no conditions";
  const acts = rule.actions.map(describeAction).join(", ");
  return `${conds} → ${acts || "no actions"}`;
}

function collectConditions(node: RuleNode): RuleConditionNode[] {
  return node.kind === "condition" ? [node] : node.children.flatMap(collectConditions);
}

function defaultAction(type: RuleAction["type"]): RuleAction {
  return type === "addLabel" ? { type: "addLabel", label: "" } : { type };
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: RuleConditionNode;
  onChange: (next: RuleConditionNode) => void;
  onRemove: () => void;
}) {
  return (
    <div className="cond-row">
      <select
        className="select"
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value as RuleField })}
      >
        {FIELDS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        className="select"
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as RuleOperator })}
      >
        {OPERATORS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        className="input"
        value={condition.value}
        placeholder="value"
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
      />
      <button className="icon-btn" type="button" title="Remove condition" onClick={onRemove}>
        <TrashIcon size={14} />
      </button>
    </div>
  );
}

/** Recursive editor for a boolean group. Nested groups render as indented,
 *  bracketed boxes so the structure reads like A OR (B AND C). */
function GroupEditor({
  group,
  depth,
  onChange,
  onRemove,
}: {
  group: RuleGroup;
  depth: number;
  onChange: (next: RuleGroup) => void;
  onRemove?: () => void;
}) {
  const setChild = (index: number, child: RuleNode) =>
    onChange({ ...group, children: group.children.map((c, i) => (i === index ? child : c)) });
  const removeChild = (index: number) =>
    onChange({ ...group, children: group.children.filter((_, i) => i !== index) });

  return (
    <div className={`rule-group ${depth > 0 ? "rule-group-nested" : ""}`}>
      <div className="rule-group-head">
        <span className="rule-group-label">{depth === 0 ? "Match" : "where"}</span>
        <select
          className="select rule-group-mode"
          value={group.match}
          onChange={(e) => onChange({ ...group, match: e.target.value as RuleGroup["match"] })}
        >
          <option value="all">ALL</option>
          <option value="any">ANY</option>
        </select>
        <span className="rule-group-label">of:</span>
        {onRemove && (
          <button className="icon-btn rule-group-remove" type="button" title="Remove group" onClick={onRemove}>
            <CloseIcon size={13} />
          </button>
        )}
      </div>

      <div className="rule-group-children">
        {group.children.length === 0 && (
          <div className="rule-group-empty">Empty group — add a condition or group below.</div>
        )}
        {group.children.map((child, index) => (
          <div className="rule-node" key={index}>
            {index > 0 && <div className="rule-joiner">{group.match === "all" ? "AND" : "OR"}</div>}
            {child.kind === "group" ? (
              <GroupEditor
                group={child}
                depth={depth + 1}
                onChange={(next) => setChild(index, next)}
                onRemove={() => removeChild(index)}
              />
            ) : (
              <ConditionRow
                condition={child}
                onChange={(next) => setChild(index, next)}
                onRemove={() => removeChild(index)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="rule-group-add">
        <button
          className="link-btn"
          type="button"
          onClick={() => onChange({ ...group, children: [...group.children, conditionNode({ field: "subject" })] })}
        >
          <PlusIcon size={13} /> condition
        </button>
        <button
          className="link-btn"
          type="button"
          onClick={() =>
            onChange({ ...group, children: [...group.children, emptyGroup(group.match === "all" ? "any" : "all")] })
          }
        >
          <PlusIcon size={13} /> group
        </button>
      </div>
    </div>
  );
}

function RuleEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Rule;
  onSave: (rule: Rule) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Rule>(initial);

  const update = (patch: Partial<Rule>) => setDraft((prev) => ({ ...prev, ...patch }));
  const updateAction = (index: number, action: RuleAction) =>
    update({ actions: draft.actions.map((a, i) => (i === index ? action : a)) });

  const conditions = collectConditions(draft.match);
  const canSave =
    draft.name.trim().length > 0 &&
    conditions.length > 0 &&
    conditions.every((c) => c.value.trim().length > 0 || c.operator === "matches") &&
    draft.actions.length > 0;

  return (
    <div className="rule-editor">
      <div className="rule-editor-head">
        <input
          className="input rule-name"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Rule name"
        />
      </div>

      <div className="rule-section">
        <div className="rule-section-head">
          <span>When</span>
        </div>
        <GroupEditor group={draft.match} depth={0} onChange={(match) => update({ match })} />
      </div>

      <div className="rule-section">
        <div className="rule-section-head">
          <span>Then</span>
          <button
            className="link-btn"
            type="button"
            onClick={() => update({ actions: [...draft.actions, { type: "markRead" }] })}
          >
            <PlusIcon size={13} /> action
          </button>
        </div>
        {draft.actions.map((action, index) => (
          <div key={index} className="cond-row">
            <select
              className="select"
              value={action.type}
              onChange={(e) => updateAction(index, defaultAction(e.target.value as RuleAction["type"]))}
            >
              {ACTION_TYPES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            {action.type === "addLabel" && (
              <input
                className="input"
                value={action.label}
                placeholder="Label name (e.g. Augment/Newsletters)"
                onChange={(e) => updateAction(index, { type: "addLabel", label: e.target.value })}
              />
            )}
            {draft.actions.length > 1 && (
              <button
                className="icon-btn"
                type="button"
                title="Remove action"
                onClick={() => update({ actions: draft.actions.filter((_, i) => i !== index) })}
              >
                <TrashIcon size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="rule-editor-foot">
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" type="button" disabled={!canSave} onClick={() => onSave(draft)}>
          <CheckIcon size={15} /> Save rule
        </button>
      </div>
    </div>
  );
}

export function RulesManager() {
  const { rules, saveRule, deleteRule, toggleRule, runRulesNow, busy, settings, updateSettings } = useAugment();
  const [editing, setEditing] = useState<Rule | null>(null);

  if (editing) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h2>{rules.some((r) => r.id === editing.id) ? "Edit rule" : "New rule"}</h2>
        </div>
        <RuleEditor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(rule) => {
            saveRule(rule);
            setEditing(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Rules</h2>
        <div className="panel-head-actions">
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.autoApplyRules}
              onChange={(e) => updateSettings({ autoApplyRules: e.target.checked })}
            />
            <span>Auto-apply on refresh</span>
          </label>
          <button className="btn" type="button" disabled={!!busy} onClick={() => void runRulesNow()}>
            <RefreshIcon size={14} className={busy ? "spin" : undefined} />
            {busy ? "Running…" : "Run rules now"}
          </button>
          <button className="btn btn-primary" type="button" onClick={() => setEditing(blankRule())}>
            <PlusIcon size={15} /> New rule
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="panel-empty">
          <SlidersIcon size={22} />
          <p>No rules yet. Create one to auto-label or archive matching mail.</p>
        </div>
      ) : (
        <div className="panel-list">
          {rules.map((rule) => (
            <div key={rule.id} className={`rule-card ${rule.enabled ? "" : "rule-disabled"}`}>
              <label className="toggle rule-toggle">
                <input type="checkbox" checked={rule.enabled} onChange={() => toggleRule(rule.id)} />
                <span />
              </label>
              <div className="rule-card-body" onClick={() => setEditing(rule)}>
                <div className="rule-card-name">{rule.name}</div>
                <div className="rule-card-summary">{summarize(rule)}</div>
              </div>
              <div className="rule-card-actions">
                <button className="action-btn" type="button" onClick={() => setEditing(rule)}>
                  Edit
                </button>
                <button className="icon-btn" type="button" title="Delete rule" onClick={() => deleteRule(rule.id)}>
                  <TrashIcon size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
