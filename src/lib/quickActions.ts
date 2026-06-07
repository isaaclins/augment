// User-defined Quick Actions: named, keyboard-triggered macros. A Quick Action
// is an ordered list of steps applied to the current email(s). Mailbox steps
// (tag/move/archive/…) run on every target; a compose step (reply/forward/…)
// runs once on the primary email — opening the composer, or auto-sending when it
// carries a template and is flagged "send without review". Persisted verbatim to
// localStorage, so this shape is also the serialization format.

export type QuickStepType =
  | "tag"
  | "untag"
  | "moveToFolder"
  | "archive"
  | "delete"
  | "markRead"
  | "markUnread"
  | "star"
  | "unstar"
  | "snooze"
  | "notifyWhenReplied"
  | "reply"
  | "replyAll"
  | "forward"
  | "newMail";

export interface QuickStep {
  id: string;
  type: QuickStepType;
  /** Tag name / folder name / snooze-preset label, depending on the step type. */
  value?: string;
  /** Tag step only: if the email already has this tag, remove it instead of
   *  re-adding it (toggle behaviour). Evaluated per email. */
  toggle?: boolean;
  /** Compose steps only: a template to prefill the body. */
  templateId?: string;
  templateName?: string;
  /** Compose steps only: send immediately, no composer UI (needs a template). */
  sendWithoutReview?: boolean;
}

export interface QuickAction {
  id: string;
  name: string;
  /** Combo string ("mod+s"), or "" when unbound. */
  shortcut: string;
  steps: QuickStep[];
}

/** What kind of value a step takes — drives the editor's value picker. */
export type StepValueKind = "none" | "tag" | "folder" | "snooze" | "compose";

export interface StepMeta {
  label: string;
  value: StepValueKind;
  /** Marked in the editor as higher-stakes (delete, sending). */
  destructive?: boolean;
}

export const STEP_META: Record<QuickStepType, StepMeta> = {
  tag: { label: "Tag", value: "tag" },
  untag: { label: "Remove tag", value: "tag" },
  moveToFolder: { label: "Move to folder", value: "folder" },
  archive: { label: "Archive", value: "none" },
  delete: { label: "Delete (Trash)", value: "none", destructive: true },
  markRead: { label: "Mark as read", value: "none" },
  markUnread: { label: "Mark as unread", value: "none" },
  star: { label: "Star", value: "none" },
  unstar: { label: "Unstar", value: "none" },
  snooze: { label: "Snooze", value: "snooze" },
  notifyWhenReplied: { label: "Notify when replied", value: "none" },
  reply: { label: "Reply", value: "compose" },
  replyAll: { label: "Reply all", value: "compose" },
  forward: { label: "Forward", value: "compose" },
  newMail: { label: "New mail", value: "compose", destructive: false },
};

/** Step types grouped for the "add step" menu. */
export const STEP_GROUPS: { group: string; types: QuickStepType[] }[] = [
  { group: "Organize", types: ["tag", "untag", "moveToFolder", "archive", "delete"] },
  { group: "Status", types: ["markRead", "markUnread", "star", "unstar"] },
  { group: "Time", types: ["snooze", "notifyWhenReplied"] },
  { group: "Compose", types: ["reply", "replyAll", "forward", "newMail"] },
];

const COMPOSE_STEPS: QuickStepType[] = ["reply", "replyAll", "forward", "newMail"];

export function isComposeStep(type: QuickStepType): boolean {
  return COMPOSE_STEPS.includes(type);
}
