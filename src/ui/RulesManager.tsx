import { useState } from "react";
import { useAugment } from "../state/augment";
import { newId } from "../lib/store";
import type {
  Rule,
  RuleAction,
  RuleCondition,
  RuleField,
  RuleMatchMode,
  RuleOperator,
} from "../lib/rules/types";
import { CheckIcon, PlusIcon, RefreshIcon, SlidersIcon, TrashIcon } from "./icons";

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
    matchMode: "all",
    conditions: [{ field: "from", operator: "contains", value: "" }],
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

function summarize(rule: Rule): string {
  const conds = rule.conditions
    .map((c) => `${c.field} ${OPERATORS.find((o) => o.value === c.operator)?.label ?? c.operator} “${c.value}”`)
    .join(rule.matchMode === "all" ? " AND " : " OR ");
  const acts = rule.actions.map(describeAction).join(", ");
  return `${conds || "no conditions"} → ${acts || "no actions"}`;
}

function defaultAction(type: RuleAction["type"]): RuleAction {
  return type === "addLabel" ? { type: "addLabel", label: "" } : { type };
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

  const updateCondition = (index: number, patch: Partial<RuleCondition>) =>
    update({ conditions: draft.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) });

  const updateAction = (index: number, action: RuleAction) =>
    update({ actions: draft.actions.map((a, i) => (i === index ? action : a)) });

  const canSave = draft.name.trim().length > 0 && draft.conditions.every((c) => c.value.trim().length > 0 || c.operator === "matches") && draft.actions.length > 0;

  return (
    <div className="rule-editor">
      <div className="rule-editor-head">
        <input
          className="input rule-name"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Rule name"
        />
        <label className="match-mode">
          Match
          <select
            className="select"
            value={draft.matchMode}
            onChange={(e) => update({ matchMode: e.target.value as RuleMatchMode })}
          >
            <option value="all">all conditions</option>
            <option value="any">any condition</option>
          </select>
        </label>
      </div>

      <div className="rule-section">
        <div className="rule-section-head">
          <span>When</span>
          <button
            className="link-btn"
            type="button"
            onClick={() => update({ conditions: [...draft.conditions, { field: "subject", operator: "contains", value: "" }] })}
          >
            <PlusIcon size={13} /> condition
          </button>
        </div>
        {draft.conditions.map((condition, index) => (
          <div key={index} className="cond-row">
            <select
              className="select"
              value={condition.field}
              onChange={(e) => updateCondition(index, { field: e.target.value as RuleField })}
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
              onChange={(e) => updateCondition(index, { operator: e.target.value as RuleOperator })}
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
              onChange={(e) => updateCondition(index, { value: e.target.value })}
            />
            {draft.conditions.length > 1 && (
              <button
                className="icon-btn"
                type="button"
                title="Remove condition"
                onClick={() => update({ conditions: draft.conditions.filter((_, i) => i !== index) })}
              >
                <TrashIcon size={14} />
              </button>
            )}
          </div>
        ))}
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
