import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AugmentProvider } from "./state/augment";
import { SettingsApp } from "./ui/SettingsWindow";
import "./styles.css";

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
