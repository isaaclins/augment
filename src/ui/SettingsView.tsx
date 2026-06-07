import { useEffect, useRef, useState } from "react";
import type { Settings } from "../lib/store";
import {
  DEFAULT_KEYBINDS,
  NAV_ACTIONS,
  eventToCombo,
  formatCombo,
  type Keybinds,
  type NavAction,
} from "../lib/keybinds";
import { checkOllama } from "../lib/features/triage";
import { THEMES, type ThemeId, type ThemeMode } from "../lib/theme";
import { CloseIcon, CpuIcon, RefreshIcon } from "./icons";

type TestState = "idle" | "testing" | "ok" | "fail";

const MODES: { id: ThemeMode; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

// Appearance: theme palette picker, custom accent, and light/dark/system mode.
// Every change re-skins the whole app live (updateSettings calls applyTheme and
// broadcasts to the other window).
function AppearanceSection({
  settings,
  updateSettings,
}: {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}) {
  const activeTheme = settings.theme || "cafe";
  const accent = (settings.accent || "").toLowerCase();
  const themeAccent = THEMES.find((t) => t.id === activeTheme)?.swatch.accent ?? "#5d4432";

  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <div>
          <h3>Appearance</h3>
          <p className="settings-section-sub">
            Pick a palette, set a custom accent, and choose how light and dark follow your system.
          </p>
        </div>
      </div>

      <div className="settings-rows">
        <div className="settings-row settings-row-stack">
          <div className="settings-row-text">
            <span className="settings-row-label">Theme</span>
            <span className="settings-row-hint">The mono type system stays the same — only color changes.</span>
          </div>
          <div className="theme-grid" role="radiogroup" aria-label="Color theme">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={activeTheme === theme.id}
                className={`theme-card ${activeTheme === theme.id ? "is-active" : ""}`}
                onClick={() => updateSettings({ theme: theme.id as ThemeId })}
              >
                <span
                  className="theme-card-swatch"
                  style={{ background: theme.swatch.bg, color: theme.swatch.text }}
                >
                  <span style={{ color: theme.swatch.text }}>Aa</span>
                  <span className="theme-card-dot" style={{ background: theme.swatch.accent }} />
                </span>
                <span className="theme-card-meta">
                  <span className="theme-card-label">{theme.label}</span>
                  <span className="theme-card-blurb">{theme.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row settings-row-stack">
          <div className="settings-row-text">
            <span className="settings-row-label">Accent</span>
            <span className="settings-row-hint">Override the theme's accent, or keep the default.</span>
          </div>
          <div className="accent-picks">
            <button
              type="button"
              className={`accent-pick accent-pick-default ${accent ? "" : "is-active"}`}
              title="Use the theme's accent"
              onClick={() => updateSettings({ accent: "" })}
            >
              Theme
            </button>
            <label className="accent-custom" title="Custom accent">
              <input
                type="color"
                value={accent || themeAccent}
                onChange={(e) => updateSettings({ accent: e.target.value })}
              />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-label">Mode</span>
            <span className="settings-row-hint">"System" follows your macOS light/dark setting.</span>
          </div>
          <div className="settings-row-control">
            <div className="seg" role="radiogroup" aria-label="Appearance mode">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={(settings.mode || "system") === m.id}
                  className={`seg-btn ${(settings.mode || "system") === m.id ? "is-active" : ""}`}
                  onClick={() => updateSettings({ mode: m.id })}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// "Local AI triage" settings: a master toggle plus model/endpoint and a live
// connection test against the local Ollama daemon.
function TriageSection({
  settings,
  updateSettings,
}: {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}) {
  const [test, setTest] = useState<TestState>("idle");

  async function testConnection() {
    setTest("testing");
    try {
      setTest((await checkOllama(settings.triageEndpoint)) ? "ok" : "fail");
    } catch {
      setTest("fail");
    }
  }

  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <div>
          <h3>
            <CpuIcon size={15} /> Local AI triage
          </h3>
          <p className="settings-section-sub">
            Classify and summarize mail with a local Ollama model. Runs on-device — nothing leaves
            your machine.
          </p>
        </div>
      </div>

      <div className="settings-rows">
        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-label">Enable triage</span>
            <span className="settings-row-hint">Requires a running Ollama daemon with the model pulled.</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.triageEnabled}
                onChange={(e) => updateSettings({ triageEnabled: e.target.checked })}
              />
              <span />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-label">Triage on refresh</span>
            <span className="settings-row-hint">Automatically triage newly-loaded mail.</span>
          </div>
          <div className="settings-row-control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.triageAuto}
                disabled={!settings.triageEnabled}
                onChange={(e) => updateSettings({ triageAuto: e.target.checked })}
              />
              <span />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-label">Sync labels to Gmail</span>
            <span className="settings-row-hint">
              Apply category labels to Gmail (synced to web/phone). Off keeps the chips in
              Augment only.
            </span>
          </div>
          <div className="settings-row-control">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.syncLabelsToGmail}
                disabled={!settings.triageEnabled}
                onChange={(e) => updateSettings({ syncLabelsToGmail: e.target.checked })}
              />
              <span />
            </label>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-label">Suggested labels</span>
            <span className="settings-row-hint">
              Comma-separated hints the AI should prefer reusing (e.g. Recruiters, Invoices).
            </span>
          </div>
          <div className="settings-row-control">
            <input
              className="input settings-input"
              value={settings.suggestedLabels.join(", ")}
              spellCheck={false}
              onChange={(e) =>
                updateSettings({
                  suggestedLabels: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Recruiters, Invoices, Receipts"
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-label">Model</span>
            <span className="settings-row-hint">A small, fast model is plenty (e.g. qwen2.5:1.5b, gemma2:2b).</span>
          </div>
          <div className="settings-row-control">
            <input
              className="input settings-input"
              value={settings.triageModel}
              spellCheck={false}
              onChange={(e) => updateSettings({ triageModel: e.target.value })}
              placeholder="qwen2.5:1.5b"
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-label">Assistant model</span>
            <span className="settings-row-hint">
              Model for the assistant's chat/agent. Leave blank to reuse the triage model.
            </span>
          </div>
          <div className="settings-row-control">
            <input
              className="input settings-input"
              value={settings.assistantModel}
              spellCheck={false}
              onChange={(e) => updateSettings({ assistantModel: e.target.value })}
              placeholder="(same as triage model)"
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-label">Ollama endpoint</span>
            <span className="settings-row-hint">The local daemon URL.</span>
          </div>
          <div className="settings-row-control">
            <input
              className="input settings-input"
              value={settings.triageEndpoint}
              spellCheck={false}
              onChange={(e) => {
                setTest("idle");
                updateSettings({ triageEndpoint: e.target.value });
              }}
              placeholder="http://localhost:11434"
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-text">
            <span className="settings-row-label">Connection</span>
            <span className="settings-row-hint">
              {test === "ok"
                ? "Connected — Ollama is reachable."
                : test === "fail"
                  ? "Couldn't reach Ollama at that endpoint."
                  : "Check that the daemon is running and reachable."}
            </span>
          </div>
          <div className="settings-row-control">
            <button className="btn" type="button" disabled={test === "testing"} onClick={() => void testConnection()}>
              {test === "testing" ? "Testing…" : "Test connection"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// A button that records the next key combo the user presses. While recording we
// listen on `window` in the capture phase rather than on the button itself —
// macOS WebKit doesn't focus a <button> on click, so a focus-based onKeyDown
// would never fire. Capture phase also lets us intercept the keys before the
// app-wide nav shortcut handler and stop them there.
export function KeybindCapture({
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

export function SettingsView({
  settings,
  updateSettings,
}: {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}) {
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
        <AppearanceSection settings={settings} updateSettings={updateSettings} />

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

        <TriageSection settings={settings} updateSettings={updateSettings} />
      </div>
    </div>
  );
}
