// Snooze + watch-for-reply behaviour. These tie the Rust scheduler's timing to
// Gmail-side effects:
//
//   • Snooze   — archive the thread and tag it `Augment/Snoozed`; when due, undo
//                that (re-add INBOX, drop the label, mark unread) so it
//                resurfaces in both Augment and Gmail web, then notify.
//   • Watch    — when due, inspect the thread; if no inbound reply arrived after
//                the watch began, fire a "no reply yet" notification.

import type { GmailClient } from "../gmail/client";
import { parseMessage } from "../gmail/parse";
import {
  notify,
  scheduleAdd,
  scheduleRemove,
  type ScheduleItem,
} from "../scheduler/api";

// --- creating schedule items ----------------------------------------------

/** Snooze a thread: archive + label now, schedule its return. */
export async function snoozeThread(
  client: GmailClient,
  threadId: string,
  subject: string,
  dueAt: number,
  snoozeLabel: string,
): Promise<ScheduleItem> {
  const labelId = await client.ensureLabelId(snoozeLabel);
  await client.modifyThread(threadId, {
    addLabelIds: [labelId],
    removeLabelIds: ["INBOX"],
  });
  return scheduleAdd({ kind: "snooze", threadId, subject, dueAt });
}

/** Watch a thread for a reply by `dueAt`. `watchSince` defaults to now. */
export async function watchThread(
  threadId: string,
  subject: string,
  dueAt: number,
  watchSince = Date.now(),
): Promise<ScheduleItem> {
  return scheduleAdd({ kind: "watch", threadId, subject, dueAt, watchSince });
}

// --- handling due items ----------------------------------------------------

/** Resurface a snoozed thread and notify. */
export async function handleSnoozeDue(
  client: GmailClient,
  item: ScheduleItem,
  snoozeLabel: string,
): Promise<void> {
  const labelId = await client.ensureLabelId(snoozeLabel);
  await client.modifyThread(item.threadId, {
    addLabelIds: ["INBOX", "UNREAD"],
    removeLabelIds: [labelId],
  });
  await notify("⏰ Back in your inbox", item.subject);
  await scheduleRemove(item.id);
}

export interface WatchOutcome {
  replied: boolean;
}

/** Check a watched thread for an inbound reply; notify if none arrived. */
export async function handleWatchDue(
  client: GmailClient,
  item: ScheduleItem,
  selfEmail: string,
): Promise<WatchOutcome> {
  const thread = await client.getThread(item.threadId);
  const since = item.watchSince ?? item.createdAt;
  const self = selfEmail.toLowerCase();

  const replied = (thread.messages ?? [])
    .map(parseMessage)
    .some((message) => message.from.email !== self && message.internalDate > since);

  if (!replied) {
    await notify("📭 Still no reply", item.subject);
  }
  await scheduleRemove(item.id);
  return { replied };
}

/** Dispatch a due item to the right handler. Returns a short status string. */
export async function handleScheduleDue(
  client: GmailClient,
  item: ScheduleItem,
  options: { snoozeLabel: string; selfEmail: string },
): Promise<string> {
  if (item.kind === "snooze") {
    await handleSnoozeDue(client, item, options.snoozeLabel);
    return `Resurfaced “${item.subject}”`;
  }
  const outcome = await handleWatchDue(client, item, options.selfEmail);
  return outcome.replied
    ? `Reply received for “${item.subject}”`
    : `No reply yet for “${item.subject}” — notified`;
}
