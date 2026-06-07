// Root of the dedicated Settings window (a separate webview opened via the app
// menu / ⌘,). It runs without the AugmentProvider — settings are purely
// localStorage-backed, so there's no auth or Gmail here. Changes persist and
// broadcast so the main window updates live, and vice-versa.

import { useCallback, useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings, type Settings } from "../lib/store";
import { broadcastSettings, onSettingsBroadcast } from "../lib/settingsSync";
import { applyTheme } from "../lib/theme";
import { SettingsView } from "./SettingsView";

function useWindowSettings() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const ref = useRef(settings);
  ref.current = settings;

  // Apply changes broadcast by the main window (e.g. the rules auto-apply
  // toggle), without re-broadcasting.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;
    void onSettingsBroadcast((incoming) => {
      ref.current = incoming;
      setSettings(incoming);
    }).then((fn) => {
      if (active) unlisten = fn;
      else fn();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...ref.current, ...patch };
    ref.current = next;
    setSettings(next);
    saveSettings(next);
    applyTheme(next);
    broadcastSettings(next);
  }, []);

  return { settings, updateSettings };
}

export function SettingsApp() {
  const { settings, updateSettings } = useWindowSettings();
  return (
    <div className="settings-window">
      <SettingsView settings={settings} updateSettings={updateSettings} />
    </div>
  );
}
