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

/** How long an indefinite watch waits between reply-checks. */
const WATCH_RECHECK_MS = 2 * 60 * 1000;

/** Watch a thread for a reply. `indefinite` keeps re-checking forever (until a
 *  reply lands) instead of firing a one-off "no reply by `dueAt`" notice. */
export async function watchThread(
  threadId: string,
  subject: string,
  dueAt: number,
  watchSince = Date.now(),
  indefinite = false,
): Promise<ScheduleItem> {
  return scheduleAdd({ kind: "watch", threadId, subject, dueAt, watchSince, indefinite });
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

/** Check a watched thread for an inbound reply. On a reply, notify + stop. With
 *  no reply: an indefinite watch re-schedules the next check (preserving when
 *  watching began); a bounded watch fires a one-off "still no reply" notice. */
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

  if (replied) {
    await notify("📬 They replied", item.subject);
    await scheduleRemove(item.id);
    return { replied: true };
  }

  if (item.indefinite) {
    // Keep watching: queue the next check, keep `watchSince` so a reply at any
    // point still counts. No "no reply" notification — only a real reply pings.
    await watchThread(item.threadId, item.subject, Date.now() + WATCH_RECHECK_MS, since, true);
    await scheduleRemove(item.id);
    return { replied: false };
  }

  await notify("📭 Still no reply", item.subject);
  await scheduleRemove(item.id);
  return { replied: false };
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
  if (outcome.replied) return `Reply received for “${item.subject}”`;
  return item.indefinite
    ? `Still watching “${item.subject}” for a reply`
    : `No reply yet for “${item.subject}” — notified`;
}
