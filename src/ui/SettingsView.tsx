import { useEffect, useRef, useState } from "react";
import { useAugment } from "../state/augment";
import {
  DEFAULT_KEYBINDS,
  NAV_ACTIONS,
  eventToCombo,
  formatCombo,
  type Keybinds,
  type NavAction,
} from "../lib/keybinds";
import { CloseIcon, RefreshIcon } from "./icons";

// A button that records the next key combo the user presses. While recording we
// listen on `window` in the capture phase rather than on the button itself —
// macOS WebKit doesn't focus a <button> on click, so a focus-based onKeyDown
// would never fire. Capture phase also lets us intercept the keys before the
// app-wide nav shortcut handler and stop them there.
function KeybindCapture({
  value,
  onChange,
}: {
  value: string;
  onChange: (combo: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!capturing) return undefined;

    function onKeyDown(event: KeyboardEvent) {
      // Swallow the keypress so it neither types nor triggers a global shortcut.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setCapturing(false);
        return;
      }
      const combo = eventToCombo(event);
      if (!combo) return; // modifier-only so far — keep listening
      onChange(combo);
      setCapturing(false);
    }

    // Clicking anywhere but this button cancels recording.
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setCapturing(false);
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [capturing, onChange]);

  return (
    <button
      ref={ref}
      type="button"
      data-keycapture
      className={`keybind ${capturing ? "keybind-capturing" : ""}`}
      onClick={() => setCapturing((c) => !c)}
    >
      {capturing ? "Press keys…" : value ? formatCombo(value) : "Unset"}
    </button>
  );
}

export function SettingsView() {
  const { settings, updateSettings } = useAugment();
  const { keybinds } = settings;

  // Assign a shortcut to one action, clearing it from any other action that
  // held it so two views can't share a combo.
  function setBind(action: NavAction, combo: string) {
    const next: Keybinds = { ...keybinds };
    for (const item of NAV_ACTIONS) {
      if (item.id !== action && next[item.id] === combo) next[item.id] = "";
    }
    next[action] = combo;
    updateSettings({ keybinds: next });
  }

  function clearBind(action: NavAction) {
    updateSettings({ keybinds: { ...keybinds, [action]: "" } });
  }

  const isDefault = NAV_ACTIONS.every((a) => keybinds[a.id] === DEFAULT_KEYBINDS[a.id]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Settings</h2>
      </div>

      <div className="settings-scroll">
        <section className="settings-section">
          <div className="settings-section-head">
            <div>
              <h3>Keyboard shortcuts</h3>
              <p className="settings-section-sub">
                Jump straight to a view. Click a shortcut, then press the keys you want.
              </p>
            </div>
            <button
              className="link-btn"
              type="button"
              disabled={isDefault}
              onClick={() => updateSettings({ keybinds: DEFAULT_KEYBINDS })}
            >
              <RefreshIcon size={13} /> Reset to defaults
            </button>
          </div>

          <div className="settings-rows">
            {NAV_ACTIONS.map((action) => (
              <div className="settings-row" key={action.id}>
                <span className="settings-row-label">{action.label}</span>
                <div className="settings-row-control keybind-control">
                  <KeybindCapture
                    value={keybinds[action.id]}
                    onChange={(combo) => setBind(action.id, combo)}
                  />
                  {/* Always reserve the clear slot so the chips stay aligned. */}
                  <button
                    className={`icon-btn keybind-clear ${keybinds[action.id] ? "" : "is-hidden"}`}
                    type="button"
                    title="Clear shortcut"
                    disabled={!keybinds[action.id]}
                    onClick={() => clearBind(action.id)}
                  >
                    <CloseIcon size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-head">
            <div>
              <h3>Mail</h3>
              <p className="settings-section-sub">How Augment files and processes your mail.</p>
            </div>
          </div>

          <div className="settings-rows">
            <div className="settings-row">
              <div className="settings-row-text">
                <span className="settings-row-label">Auto-apply rules on refresh</span>
                <span className="settings-row-hint">
                  Run your enabled rules every time the inbox reloads.
                </span>
              </div>
              <div className="settings-row-control">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.autoApplyRules}
                    onChange={(e) => updateSettings({ autoApplyRules: e.target.checked })}
                  />
                  <span />
                </label>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-text">
                <span className="settings-row-label">Snooze label</span>
                <span className="settings-row-hint">
                  Gmail label used to hold snoozed threads until they're due.
                </span>
              </div>
              <div className="settings-row-control">
                <input
                  className="input settings-input"
                  value={settings.snoozeLabel}
                  spellCheck={false}
                  onChange={(e) => updateSettings({ snoozeLabel: e.target.value })}
                  placeholder="Augment/Snoozed"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
