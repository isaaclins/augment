// Bridge to the Rust scheduler + native notifications. Rust owns the timing and
// the OS notification; the frontend reacts to `schedule-due` and performs the
// Gmail-side work, then fires the notification through `notify`.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ScheduleKind = "snooze" | "watch";

export interface ScheduleItem {
  id: string;
  kind: ScheduleKind;
  threadId: string;
  subject: string;
  dueAt: number; // epoch ms
  createdAt: number; // epoch ms
  watchSince?: number; // epoch ms (watch only)
  indefinite?: boolean; // watch only: keep re-checking until a reply arrives
}

export interface NewScheduleItem {
  kind: ScheduleKind;
  threadId: string;
  subject: string;
  dueAt: number;
  watchSince?: number;
  indefinite?: boolean;
}

export const SCHEDULE_DUE_EVENT = "schedule-due";

export function scheduleList(): Promise<ScheduleItem[]> {
  return invoke<ScheduleItem[]>("schedule_list");
}

export function scheduleAdd(item: NewScheduleItem): Promise<ScheduleItem> {
  return invoke<ScheduleItem>("schedule_add", { item });
}

export function scheduleRemove(id: string): Promise<void> {
  return invoke<void>("schedule_remove", { id });
}

/** Fire a native OS notification (always routed through Rust). */
export function notify(title: string, body: string): Promise<void> {
  return invoke<void>("notify", { title, body });
}

/** Subscribe to due items emitted by the Rust ticker. */
export function onScheduleDue(callback: (item: ScheduleItem) => void): Promise<UnlistenFn> {
  return listen<ScheduleItem>(SCHEDULE_DUE_EVENT, (event) => callback(event.payload));
}
