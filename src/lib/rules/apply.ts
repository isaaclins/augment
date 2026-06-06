// Applies matched rule actions to Gmail. Separated from the pure engine so the
// engine stays test-only and this thin layer carries the side effects.

import type { GmailClient } from "../gmail/client";
import type { ParsedMessage } from "../gmail/parse";
import { rulesForMessage } from "./engine";
import type { Rule, RuleAction } from "./types";

export interface AppliedRule {
  ruleId: string;
  ruleName: string;
  threadId: string;
  subject: string;
  actions: string[];
}

function describeAction(action: RuleAction): string {
  switch (action.type) {
    case "addLabel":
      return `label “${action.label}”`;
    case "archive":
      return "archive";
    case "markRead":
      return "mark read";
    case "star":
      return "star";
  }
}

/** Execute a rule's actions against one thread; returns human-readable summaries. */
export async function applyRuleActions(
  client: GmailClient,
  threadId: string,
  rule: Rule,
): Promise<string[]> {
  const done: string[] = [];
  for (const action of rule.actions) {
    switch (action.type) {
      case "addLabel":
        await client.addLabelByName(threadId, action.label);
        break;
      case "archive":
        await client.archiveThread(threadId);
        break;
      case "markRead":
        await client.markRead(threadId);
        break;
      case "star":
        await client.star(threadId);
        break;
    }
    done.push(describeAction(action));
  }
  return done;
}

/**
 * Run every enabled rule across a batch of messages (one representative message
 * per thread). Returns what changed, for an in-app activity log.
 */
export async function runRules(
  client: GmailClient,
  rules: Rule[],
  messages: ParsedMessage[],
): Promise<AppliedRule[]> {
  const applied: AppliedRule[] = [];
  for (const message of messages) {
    for (const rule of rulesForMessage(rules, message)) {
      const actions = await applyRuleActions(client, message.threadId, rule);
      applied.push({
        ruleId: rule.id,
        ruleName: rule.name,
        threadId: message.threadId,
        subject: message.subject,
        actions,
      });
    }
  }
  return applied;
}
