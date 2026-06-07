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
import { useClickOutside } from "./hooks";
import { CloseIcon, PlusIcon, TrashIcon } from "./icons";

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

// The dropdown that adds a step, grouped by category.
function AddStepMenu({ onAdd }: { onAdd: (type: QuickStepType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  return (
    <div className="menu" ref={ref}>
      <button className="action-btn" type="button" onClick={() => setOpen((o) => !o)}>
        <PlusIcon size={14} />
        <span>Add step</span>
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {STEP_GROUPS.map((group) => (
            <div key={group.group}>
              <div className="menu-section">{group.group}</div>
              {group.types.map((type) => (
                <button
                  key={type}
                  className="menu-item"
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
          ))}
        </div>
      )}
    </div>
  );
}

// The value control for a step, depending on its kind.
function StepValue({ step, onChange }: { step: QuickStep; onChange: (patch: Partial<QuickStep>) => void }) {
  const { tags, folders, templates } = useAugment();
  const kind = STEP_META[step.type].value;

  if (kind === "tag") {
    return (
      <select className="select" value={step.value ?? ""} onChange={(e) => onChange({ value: e.target.value })}>
        <option value="">(choose tag)</option>
        {tags.map((t) => (
          <option key={t.id} value={t.name}>
            {t.name}
          </option>
        ))}
      </select>
    );
  }
  if (kind === "folder") {
    return (
      <select className="select" value={step.value ?? ""} onChange={(e) => onChange({ value: e.target.value })}>
        <option value="">(choose folder)</option>
        {folders.map((f) => (
          <option key={f.id} value={f.name}>
            {f.name}
          </option>
        ))}
      </select>
    );
  }
  if (kind === "snooze") {
    return (
      <select className="select" value={step.value ?? ""} onChange={(e) => onChange({ value: e.target.value })}>
        <option value="">(choose when)</option>
        {SNOOZE_PRESETS.map((p) => (
          <option key={p.label} value={p.label}>
            {p.label}
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
          <option value="">No template (open composer)</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
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
  return null;
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
    const name = draft.name.trim() || "Untitled";
    const next = { ...draft, name };
    const exists = quickActions.some((q) => q.id === next.id);
    persistQuickActions(
      exists ? quickActions.map((q) => (q.id === next.id ? next : q)) : [...quickActions, next],
    );
    onClose();
  }

  const conflict = draft.shortcut && reserved.has(draft.shortcut);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal qa-editor" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Quick Action</h2>
          <button className="icon-btn" type="button" title="Close" onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="qa-editor-body">
          <div className="qa-editor-top">
            <label className="composer-field">
              <span className="composer-label">Name</span>
              <input
                className="input"
                value={draft.name}
                autoFocus
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </label>
            <label className="composer-field">
              <span className="composer-label">Shortcut</span>
              <KeybindCapture value={draft.shortcut} onChange={(combo) => setDraft((d) => ({ ...d, shortcut: combo }))} />
              {draft.shortcut && (
                <button
                  className="link-btn"
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, shortcut: "" }))}
                >
                  Clear
                </button>
              )}
            </label>
            {conflict && <div className="qa-conflict">That shortcut is already in use.</div>}
          </div>

          <div className="qa-steps">
            {draft.steps.length === 0 && <div className="folder-empty">No steps yet — add one below.</div>}
            {draft.steps.map((step, i) => {
              const meta = STEP_META[step.type];
              return (
                <div className={`qa-step ${meta.destructive ? "qa-step-danger" : ""}`} key={step.id}>
                  <span className="qa-step-label">{meta.label}</span>
                  <div className="qa-step-value">
                    <StepValue step={step} onChange={(patch) => setStep(step.id, patch)} />
                  </div>
                  <div className="qa-step-actions">
                    <button className="icon-btn" type="button" title="Up" onClick={() => moveStep(i, -1)}>
                      ↑
                    </button>
                    <button className="icon-btn" type="button" title="Down" onClick={() => moveStep(i, 1)}>
                      ↓
                    </button>
                    <button
                      className="icon-btn"
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

          <AddStepMenu onAdd={(type) => setDraft((d) => ({ ...d, steps: [...d.steps, newStep(type)] }))} />
        </div>

        <div className="composer-foot">
          <div />
          <div className="composer-foot-right">
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
    const copy: QuickAction = {
      ...action,
      id: crypto.randomUUID(),
      name: `${action.name} copy`,
      shortcut: "",
      steps: action.steps.map((s) => ({ ...s, id: crypto.randomUUID() })),
    };
    persistQuickActions([...quickActions, copy]);
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
        <h2>Quick Actions</h2>
        <button className="btn btn-primary" type="button" onClick={() => setEditing(newAction())}>
          <PlusIcon size={14} /> New action
        </button>
      </div>

      <div className="qa-list">
        {quickActions.length === 0 && (
          <div className="folder-empty">
            No Quick Actions yet. Create a macro of steps and bind it to a shortcut.
          </div>
        )}
        {quickActions.map((action, i) => (
          <div className="qa-row" key={action.id}>
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
              <button className="action-btn" type="button" onClick={() => duplicate(action)}>
                Duplicate
              </button>
              <button className="icon-btn" type="button" title="Up" onClick={() => move(i, -1)}>
                ↑
              </button>
              <button className="icon-btn" type="button" title="Down" onClick={() => move(i, 1)}>
                ↓
              </button>
              <button className="icon-btn" type="button" title="Delete" onClick={() => remove(action.id)}>
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
