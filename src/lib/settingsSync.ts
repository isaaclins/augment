// Settings live in localStorage, but the dedicated settings window and the main
// window are separate webviews with independent React state. To keep them in
// lockstep, whichever window changes a setting persists it AND broadcasts the
// new value over a Tauri event; both windows listen and apply it. Applying an
// incoming value never re-broadcasts, so there's no echo loop.

import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Settings } from "./store";

export const SETTINGS_EVENT = "augment:settings-updated";

/** Notify other windows that settings changed. Fire-and-forget. */
export function broadcastSettings(settings: Settings): void {
  void emit(SETTINGS_EVENT, settings);
}

/** Subscribe to settings broadcasts from other windows. */
export function onSettingsBroadcast(handler: (settings: Settings) => void): Promise<UnlistenFn> {
  return listen<Settings>(SETTINGS_EVENT, (event) => handler(event.payload));
}
