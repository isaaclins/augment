// Quick Actions manager: a sidebar view listing the user's keyboard-triggered
// macros, plus an inline editor for one action (name, shortcut, ordered steps).
// Mirrors the Rules/Templates views. Triggering happens elsewhere (shortcut,
// context menu, ⌘K); this is pure CRUD over the persisted list.

import { useEffect, useMemo, useState } from "react";
import { useAugment } from "../state/augment";
import {
  STEP_GROUPS,
  STEP_META,
  type QuickAction,
  type QuickStep,
  type QuickStepType,
} from "../lib/quickActions";
import { SNOOZE_PRESETS } from "../lib/time";
import { formatCombo } from "../lib/keybinds";
import { KeybindCapture } from "./SettingsView";
import { BoltIcon, CloseIcon, PlusIcon, TrashIcon } from "./icons";

function newStep(type: QuickStepType): QuickStep {
  return { id: crypto.randomUUID(), type };
}

function newAction(): QuickAction {
  return { id: crypto.randomUUID(), name: "New action", shortcut: "", steps: [] };
}

// Reserved combos a Quick Action shortcut shouldn't collide with.
function useReservedCombos(exceptId: string): Set<string> {
  const { settings, quickActions } = useAugment();
  return useMemo(() => {
    const set = new Set<string>(["mod+k", "mod+,"]);
    for (const combo of Object.values(settings.keybinds)) if (combo) set.add(combo);
    for (const qa of quickActions) if (qa.id !== exceptId && qa.shortcut) set.add(qa.shortcut);
    return set;
  }, [settings.keybinds, quickActions, exceptId]);
}

// The value control for a step, depending on its kind.
function StepValue({ step, onChange }: { step: QuickStep; onChange: (patch: Partial<QuickStep>) => void }) {
  const { tags, folders, templates } = useAugment();
  const kind = STEP_META[step.type].value;

  if (kind === "tag" || kind === "folder" || kind === "snooze") {
    const options =
      kind === "tag"
        ? tags.map((t) => t.name)
        : kind === "folder"
          ? folders.map((f) => f.name)
          : SNOOZE_PRESETS.map((p) => p.label);
    const placeholder = kind === "tag" ? "Choose tag…" : kind === "folder" ? "Choose folder…" : "When…";
    return (
      <select className="select" value={step.value ?? ""} onChange={(e) => onChange({ value: e.target.value })}>
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (kind === "compose") {
    return (
      <div className="step-compose">
        <select
          className="select"
          value={step.templateId ?? ""}
          onChange={(e) => {
            const tpl = templates.find((t) => t.id === e.target.value);
            onChange({ templateId: e.target.value || undefined, templateName: tpl?.name });
          }}
        >
          <option value="">No template — open composer</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              Template: {t.name}
            </option>
          ))}
        </select>
        <label className="step-checkbox" title="Send immediately without opening the composer">
          <input
            type="checkbox"
            checked={Boolean(step.sendWithoutReview)}
            disabled={!step.templateId}
            onChange={(e) => onChange({ sendWithoutReview: e.target.checked })}
          />
          <span>Send without review</span>
        </label>
      </div>
    );
  }
  return <span className="qa-step-novalue">No options</span>;
}

// Inline, non-clipping step-type picker (15 types is too many for a dropdown).
function AddStep({ onAdd }: { onAdd: (type: QuickStepType) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="qa-add-btn" type="button" onClick={() => setOpen(true)}>
        <PlusIcon size={14} /> Add step
      </button>
    );
  }
  return (
    <div className="qa-add-panel">
      {STEP_GROUPS.map((group) => (
        <div className="qa-add-group" key={group.group}>
          <span className="qa-add-group-label">{group.group}</span>
          <div className="qa-add-options">
            {group.types.map((type) => (
              <button
                key={type}
                className={`qa-add-option ${STEP_META[type].destructive ? "qa-add-option-danger" : ""}`}
                type="button"
                onClick={() => {
                  onAdd(type);
                  setOpen(false);
                }}
              >
                {STEP_META[type].label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="link-btn qa-add-cancel" type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

function ActionEditor({ initial, onClose }: { initial: QuickAction; onClose: () => void }) {
  const { quickActions, persistQuickActions, templates, refreshTemplates } = useAugment();
  const [draft, setDraft] = useState<QuickAction>(initial);
  const reserved = useReservedCombos(initial.id);

  // Templates power the compose-step picker — make sure they're loaded.
  useEffect(() => {
    if (templates.length === 0) void refreshTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setStep(id: string, patch: Partial<QuickStep>) {
    setDraft((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }
  function moveStep(index: number, delta: number) {
    setDraft((d) => {
      const steps = [...d.steps];
      const to = index + delta;
      if (to < 0 || to >= steps.length) return d;
      [steps[index], steps[to]] = [steps[to], steps[index]];
      return { ...d, steps };
    });
  }

  function save() {
    const next = { ...draft, name: draft.name.trim() || "Untitled" };
    const exists = quickActions.some((q) => q.id === next.id);
    persistQuickActions(
      exists ? quickActions.map((q) => (q.id === next.id ? next : q)) : [...quickActions, next],
    );
    onClose();
  }

  const conflict = Boolean(draft.shortcut) && reserved.has(draft.shortcut);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal qa-editor" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{initial.steps.length === 0 && initial.name === "New action" ? "New Quick Action" : "Edit Quick Action"}</h2>
          <button className="icon-btn" type="button" title="Close" onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="qa-editor-body">
          <div className="qa-field">
            <label className="qa-field-label">Name</label>
            <input
              className="input"
              value={draft.name}
              autoFocus
              placeholder="e.g. File under Job Applications"
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>

          <div className="qa-field">
            <label className="qa-field-label">Shortcut</label>
            <div className="qa-shortcut-row">
              <KeybindCapture value={draft.shortcut} onChange={(combo) => setDraft((d) => ({ ...d, shortcut: combo }))} />
              {draft.shortcut && (
                <button className="link-btn" type="button" onClick={() => setDraft((d) => ({ ...d, shortcut: "" }))}>
                  Clear
                </button>
              )}
              {conflict && <span className="qa-conflict">already in use</span>}
            </div>
          </div>

          <div className="qa-field">
            <label className="qa-field-label">Steps</label>
            <div className="qa-steps">
              {draft.steps.length === 0 && (
                <div className="qa-steps-empty">No steps yet — add the first one below.</div>
              )}
              {draft.steps.map((step, i) => {
                const meta = STEP_META[step.type];
                return (
                  <div className={`qa-step ${meta.destructive ? "qa-step-danger" : ""}`} key={step.id}>
                    <span className="qa-step-num">{i + 1}</span>
                    <span className="qa-step-label">{meta.label}</span>
                    <div className="qa-step-value">
                      <StepValue step={step} onChange={(patch) => setStep(step.id, patch)} />
                    </div>
                    <div className="qa-step-actions">
                      <button className="qa-icon" type="button" title="Move up" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                        ↑
                      </button>
                      <button
                        className="qa-icon"
                        type="button"
                        title="Move down"
                        disabled={i === draft.steps.length - 1}
                        onClick={() => moveStep(i, 1)}
                      >
                        ↓
                      </button>
                      <button
                        className="qa-icon qa-icon-del"
                        type="button"
                        title="Remove step"
                        onClick={() => setDraft((d) => ({ ...d, steps: d.steps.filter((s) => s.id !== step.id) }))}
                      >
                        <CloseIcon size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <AddStep onAdd={(type) => setDraft((d) => ({ ...d, steps: [...d.steps, newStep(type)] }))} />
          </div>
        </div>

        <div className="modal-foot">
          <span className="qa-foot-hint">Runs on your selection, or the open email.</span>
          <div className="modal-foot-right">
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" type="button" onClick={save}>
              Save &amp; close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuickActionsManager() {
  const { quickActions, persistQuickActions, runQuickAction } = useAugment();
  const [editing, setEditing] = useState<QuickAction | null>(null);

  function duplicate(action: QuickAction) {
    persistQuickActions([
      ...quickActions,
      {
        ...action,
        id: crypto.randomUUID(),
        name: `${action.name} copy`,
        shortcut: "",
        steps: action.steps.map((s) => ({ ...s, id: crypto.randomUUID() })),
      },
    ]);
  }
  function remove(id: string) {
    persistQuickActions(quickActions.filter((q) => q.id !== id));
  }
  function move(index: number, delta: number) {
    const next = [...quickActions];
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    persistQuickActions(next);
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>Quick Actions</h2>
          <p className="panel-sub">One-keystroke macros that run on your selection or the open email.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setEditing(newAction())}>
          <PlusIcon size={14} /> New action
        </button>
      </div>

      <div className="qa-list">
        {quickActions.length === 0 && (
          <div className="qa-list-empty">
            <BoltIcon size={22} />
            <p>No Quick Actions yet.</p>
            <span>Build a macro of steps and bind it to a shortcut.</span>
          </div>
        )}
        {quickActions.map((action, i) => (
          <div className="qa-row" key={action.id}>
            <span className="qa-row-icon">
              <BoltIcon size={15} />
            </span>
            <div className="qa-row-main">
              <span className="qa-row-name">{action.name}</span>
              <span className="qa-row-meta">
                {action.steps.length} step{action.steps.length === 1 ? "" : "s"}
                {action.shortcut && <kbd className="nav-shortcut">{formatCombo(action.shortcut)}</kbd>}
              </span>
            </div>
            <div className="qa-row-actions">
              <button className="action-btn" type="button" onClick={() => void runQuickAction(action)}>
                Run
              </button>
              <button className="action-btn" type="button" onClick={() => setEditing(action)}>
                Edit
              </button>
              <button className="qa-icon" type="button" title="Duplicate" onClick={() => duplicate(action)}>
                <PlusIcon size={14} />
              </button>
              <button className="qa-icon" type="button" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button
                className="qa-icon"
                type="button"
                title="Move down"
                disabled={i === quickActions.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button className="qa-icon qa-icon-del" type="button" title="Delete" onClick={() => remove(action.id)}>
                <TrashIcon size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && <ActionEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
