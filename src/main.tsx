import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AugmentProvider } from "./state/augment";
import { SettingsApp } from "./ui/SettingsWindow";
import { applyTheme, watchSystemMode } from "./lib/theme";
import { loadSettings } from "./lib/store";
import { onSettingsBroadcast } from "./lib/settingsSync";
// IBM Plex Mono, self-hosted (bundled by Vite) so it works offline in Tauri.
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import "./styles.css";

// Paint the saved theme before React mounts (applies in both windows). Keep it
// live: follow OS light/dark in "system" mode, and re-skin when the other
// window changes a setting.
applyTheme(loadSettings());
watchSystemMode(loadSettings);
void onSettingsBroadcast(applyTheme);

// The dedicated settings window loads the same bundle with `?view=settings`
// (see src-tauri/src/menu.rs). It renders a standalone settings app with no
// auth/Gmail — just the localStorage-backed preferences.
const isSettingsWindow = new URLSearchParams(window.location.search).get("view") === "settings";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isSettingsWindow ? (
      <SettingsApp />
    ) : (
      <AugmentProvider>
        <App />
      </AugmentProvider>
    )}
  </React.StrictMode>,
);
