// Thin bridge to window-management commands in the Rust backend.

import { invoke } from "@tauri-apps/api/core";

/** Open (or focus) the dedicated Settings window. */
export function openSettingsWindow(): Promise<void> {
  return invoke("open_settings_window");
}
