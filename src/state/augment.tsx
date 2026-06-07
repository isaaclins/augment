// Central application state. Owns the in-memory session, the single GmailClient,
// the rules + settings (persisted to localStorage), the live schedule (from
// Rust), and the schedule-due subscription that drives snooze/watch handling.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

import { cancelOAuth, clearStoredSession, refreshAccessToken, startOAuth } from "../lib/auth/commands";
import { Session } from "../lib/auth/session";
import { GmailClient } from "../lib/gmail/client";
import { loadLatestMessages, loadThreadRows, type ThreadRow } from "../lib/gmail/inbox";
import { addressLabel, htmlToText, parseMessage, type ParsedMessage } from "../lib/gmail/parse";
import { searchEngine } from "../lib/search/engine";
import { runRules } from "../lib/rules/apply";
import type { Rule } from "../lib/rules/types";
import {
  handleScheduleDue,
  snoozeThread as snoozeThreadFeature,
  watchThread as watchThreadFeature,
} from "../lib/features/schedule";
import {
  deleteTemplate as deleteTemplateFeature,
  draftFromTemplate,
  loadTemplates,
  saveTemplate as saveTemplateFeature,
  type Template,
} from "../lib/features/templates";
import {
  onScheduleDue,
  scheduleList,
  scheduleRemove,
  type ScheduleItem,
} from "../lib/scheduler/api";
import {
  DEFAULT_SETTINGS,
  clearAssistantChat as clearAssistantChatStorage,
  loadAssistantChat,
  loadFolders,
  loadQuickActions,
  loadRules,
  loadSettings,
  loadSkippedLabels,
  loadTags,
  loadTriage,
  saveAssistantChat,
  saveFolders,
  saveQuickActions,
  saveRules,
  saveSettings,
  saveSkippedLabels,
  saveTags,
  saveTriage,
  type Folder,
  type Settings,
} from "../lib/store";
import { defaultTagStyle, tagLabelName, type Tag, type TagColor, type TagIconKey } from "../lib/tags";
import { isComposeStep, type QuickAction, type QuickStep } from "../lib/quickActions";
import { checkOllama, STARTER_LABELS, triageThread, type TriageResult } from "../lib/features/triage";
import { defaultSortDir, sortRows, type SortDir, type SortKey } from "../lib/features/view";
import {
  NAVIGATION_ACTIONS,
  runAssist,
  type AssistantAction,
  type AssistantMessage,
  type AssistantMode,
} from "../lib/features/assistant";
import { dueAtFromPreset, SNOOZE_PRESETS } from "../lib/time";
import {
  blankDraft,
  draftFromMessage,
  saveDraft as saveDraftToGmail,
  sendDraft,
  type ComposeDraft,
  type ComposeMode,
} from "../lib/features/compose";
import { broadcastSettings, onSettingsBroadcast } from "../lib/settingsSync";

export type Status = "restoring" | "signedOut" | "authenticating" | "ready" | "error";
export type View =
  | "inbox"
  | "snoozed"
  | "watching"
  | "rules"
  | "folder"
  | "templates"
  | "quickActions"
  | "settings"
  | "tag";

export interface ActivityEntry {
  id: string;
  ts: number;
  text: string;
  tone: "info" | "success" | "warn";
}

export interface ReaderState {
  threadId: string;
  loading: boolean;
  messages: ParsedMessage[];
}

/** A label the AI invented during triage that isn't yet a tag — pending the
 *  user's approval, with the triaged threads it would apply to. */
export interface LabelSuggestion {
  name: string;
  ids: string[];
}

export interface AugmentApi {
  status: Status;
  error: string | null;
  email: string | null;

  view: View;
  setView: (view: View) => void;

  // User-created folders (Gmail labels) shown in the sidebar.
  folders: Folder[];
  activeFolderId: string | null;
  createFolder: (name: string) => Promise<void>;
  removeFolder: (id: string) => void;
  openFolder: (folder: Folder) => void;

  rows: ThreadRow[];
  /** Title of the list currently in `rows` ("Inbox" or a folder name). */
  listTitle: string;
  inboxLoading: boolean;

  // Client-side ordering of the loaded rows + assistant/UI-driven filtering.
  sortKey: SortKey;
  sortDir: SortDir;
  setSort: (key: SortKey, dir?: SortDir) => void;
  /** True when the list is showing an ad-hoc filter query (vs. a mailbox). */
  filterActive: boolean;
  /** Replace the list with an arbitrary Gmail query (used by the assistant). */
  applyListQuery: (query: string, title: string) => void;
  clearFilter: () => void;
  refresh: () => Promise<void>;
  /** Fetch and append the next page of the current list. */
  loadMore: () => Promise<void>;
  hasMore: boolean;
  loadingMore: boolean;

  // Bulk selection of inbox rows (Cmd/Ctrl+A, Cmd/Ctrl+click) for batch actions.
  selectedIds: Set<string>;
  toggleSelected: (id: string) => void;
  selectRange: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  archiveSelected: () => Promise<void>;
  moveSelectedToFolder: (folder: Folder) => Promise<void>;
  moveThreadsToFolder: (ids: string[], folder: Folder) => Promise<void>;

  selectedId: string | null;
  reader: ReaderState | null;
  openThread: (id: string) => Promise<void>;
  closeThread: () => void;

  schedule: ScheduleItem[];
  rules: Rule[];
  activity: ActivityEntry[];
  busy: string | null;

  signIn: () => Promise<void>;
  cancelSignIn: () => void;
  signOut: () => void;

  archiveThread: (id: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  snooze: (id: string, subject: string, dueAt: number) => Promise<void>;
  watch: (id: string, subject: string, dueAt: number) => Promise<void>;
  cancelSchedule: (item: ScheduleItem) => Promise<void>;
  openInGmail: (id: string) => Promise<void>;

  runRulesNow: () => Promise<void>;
  saveRule: (rule: Rule) => void;
  deleteRule: (id: string) => void;
  toggleRule: (id: string) => void;

  // Email templates, stored as labeled messages in Gmail (synced, never sent).
  templates: Template[];
  templatesLoading: boolean;
  refreshTemplates: () => Promise<void>;
  saveTemplate: (name: string, body: string, replaceId?: string) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  useTemplate: (template: Template) => Promise<void>;

  // Colored, icon-bearing tags backed by Gmail labels; applied to threads.
  tags: Tag[];
  activeTagId: string | null;
  openTag: (tag: Tag) => void;
  createTag: (input: { name: string; color: TagColor; icon: TagIconKey }) => Promise<void>;
  updateTag: (id: string, patch: { name?: string; color?: TagColor; icon?: TagIconKey }) => Promise<void>;
  deleteTag: (id: string) => void;
  setThreadTag: (threadId: string, tag: Tag, apply: boolean) => Promise<void>;
  addTagToThreads: (ids: string[], tag: Tag) => Promise<void>;

  // Local AI triage (Ollama): label + priority + one-line summary per thread.
  triage: Record<string, TriageResult>;
  triaging: boolean;
  runTriageNow: () => Promise<void>;

  // AI-invented labels not yet promoted to tags, awaiting approval.
  suggestions: LabelSuggestion[];
  approveSuggestion: (name: string) => Promise<void>;
  skipSuggestion: (name: string) => void;

  // The right-side assistant panel (hosts label suggestions + chat).
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;

  // Conversational assistant (Ask / Request / Agent confirmation spectrum).
  assistantMode: AssistantMode;
  setAssistantMode: (mode: AssistantMode) => void;
  assistantMessages: AssistantMessage[];
  assistantBusy: boolean;
  sendAssistantMessage: (text: string) => Promise<void>;
  applyProposal: (messageId: string) => Promise<void>;
  cancelProposal: (messageId: string) => void;
  clearAssistantChat: () => void;

  // In-app composer (new / reply / reply-all / forward; send + save draft).
  compose: ComposeDraft | null;
  composeBusy: boolean;
  composeError: string | null;
  /** Hint: the granted scope includes sending (send still handles a 403). */
  canSend: boolean;
  composeNew: () => void;
  composeReply: (mode: Exclude<ComposeMode, "new">, original: ParsedMessage) => void;
  updateCompose: (patch: Partial<ComposeDraft>) => void;
  closeCompose: () => void;
  sendCompose: () => Promise<void>;
  saveComposeDraft: () => Promise<void>;

  // User-defined Quick Actions (keyboard-triggered macros).
  quickActions: QuickAction[];
  persistQuickActions: (next: QuickAction[]) => void;
  runQuickAction: (action: QuickAction) => Promise<void>;

  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

const AugmentContext = createContext<AugmentApi | null>(null);

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

function makeActivity(text: string, tone: ActivityEntry["tone"]): ActivityEntry {
  return { id: crypto.randomUUID(), ts: Date.now(), text, tone };
}

/** Action types that operate on a set of emails — these fall back to the current
 *  selection when the model didn't name explicit ids. */
const NEEDS_IDS = new Set<AssistantAction["type"]>([
  "createLabel",
  "applyLabel",
  "removeLabel",
  "archive",
  "snooze",
  "markRead",
  "moveToFolder",
]);

// Words too generic to identify which email the user means.
const QUERY_STOPWORDS = new Set([
  "what", "whats", "did", "does", "do", "want", "wants", "from", "the", "to", "say", "said", "says",
  "is", "are", "was", "were", "an", "of", "for", "about", "my", "me", "you", "he", "she", "they",
  "them", "this", "that", "these", "those", "email", "emails", "mail", "mails", "tell", "show",
  "open", "how", "much", "can", "could", "would", "please", "and", "or", "with", "get", "got",
  "need", "needs", "who", "when", "where", "why", "have", "has", "any",
]);

/** Best-effort: which loaded rows does the user's message point at? Scores each
 *  row by how many message keywords appear in its sender/subject, so "what did
 *  Veronica say" resolves to Veronica's email and we can deep-read + open it. */
function matchRelevantRows(message: string, rows: ThreadRow[], limit = 3): string[] {
  const tokens = (message.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length > 2 && !QUERY_STOPWORDS.has(t),
  );
  if (tokens.length === 0) return [];
  return rows
    .map((row) => {
      const hay = `${addressLabel(row.from)} ${row.from.email} ${row.subject}`.toLowerCase();
      const score = tokens.reduce((sum, t) => (hay.includes(t) ? sum + 1 : sum), 0);
      return { id: row.id, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.id);
}

/** Trim, drop blanks, and de-duplicate label names case-insensitively while
 *  keeping the first-seen display casing. */
function dedupeLabels(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function AugmentProvider({ children }: { children: ReactNode }): ReactElement {
  const sessionRef = useRef(new Session());
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const rulesRef = useRef<Rule[]>([]);
  const tagsRef = useRef<Tag[]>([]);
  const triageRef = useRef<Record<string, TriageResult>>({});
  // Guards against overlapping triage batches (e.g. rapid refreshes).
  const triagingRef = useRef(false);
  // Tracks whether we've already warned that Ollama is unreachable, so an
  // enabled-but-offline setup doesn't warn on every refresh.
  const triageUnreachableRef = useRef(false);
  const rowsRef = useRef<ThreadRow[]>([]);
  const handlingRef = useRef<Set<string>>(new Set());
  // Mirrors read by the long-lived assistant callbacks.
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const assistantMessagesRef = useRef<AssistantMessage[]>([]);
  const assistantModeRef = useRef<AssistantMode>("request");
  const readerRef = useRef<ReaderState | null>(null);
  const templatesRef = useRef<Template[]>([]);

  // Start in "restoring" while we attempt to revive a persisted session; the
  // mount effect below resolves it to "ready" or "signedOut".
  const [status, setStatus] = useState<Status>("restoring");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [view, setViewState] = useState<View>("inbox");

  const [folders, setFolders] = useState<Folder[]>(() => loadFolders());
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const [tags, setTags] = useState<Tag[]>(() => loadTags());
  const [activeTagId, setActiveTagId] = useState<string | null>(null);

  const [triage, setTriage] = useState<Record<string, TriageResult>>(() => loadTriage());
  const [triaging, setTriaging] = useState(false);
  // Label names the user dismissed from the suggestion list (lower-cased).
  const [skippedLabels, setSkippedLabels] = useState<string[]>(() => loadSkippedLabels());
  // Right-side assistant panel open state (shared so the header ✨ can toggle it).
  const [assistantOpen, setAssistantOpen] = useState(false);
  // Client-side sort of the loaded rows, and whether an ad-hoc filter is active.
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterActive, setFilterActive] = useState(false);
  // In-app composer: the open draft (null = closed), in-flight + error state, and
  // whether the granted scope includes sending (a hint; send still handles 403).
  const [compose, setCompose] = useState<ComposeDraft | null>(null);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [canSend, setCanSend] = useState(false);
  // Conversational assistant: mode + chat log (persisted) + in-flight flag.
  const [assistantMode, setAssistantModeState] = useState<AssistantMode>(() => loadAssistantChat().mode);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>(
    () => loadAssistantChat().messages,
  );
  const [assistantBusy, setAssistantBusy] = useState(false);
  // User-defined Quick Actions (keyboard-triggered macros), persisted.
  const [quickActions, setQuickActionsState] = useState<QuickAction[]>(() => loadQuickActions());

  const [rows, setRows] = useState<ThreadRow[]>([]);
  const [listTitle, setListTitle] = useState("Inbox");
  // Gmail search query backing the current list; a ref so loadList reads the
  // latest value without being re-created when the active mailbox changes.
  const listQueryRef = useRef("in:inbox");
  const [inboxLoading, setInboxLoading] = useState(false);
  // Pagination of the current list. The page token is a ref (read on demand by
  // loadMore); hasMore drives the "load more" UI.
  const nextPageTokenRef = useRef<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reader, setReader] = useState<ReaderState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // The row a range selection extends from — set by a plain or Cmd/Ctrl+click,
  // read by Shift+click. A ref so it never triggers a re-render.
  const selectionAnchorRef = useRef<string | null>(null);

  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [rules, setRules] = useState<Rule[]>(() => loadRules());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // The rows as displayed: the fetched page(s) reordered by the active sort. All
  // consumers (rendering + range selection) read this so order stays consistent.
  const orderedRows = useMemo(
    () => sortRows(rows, triage, sortKey, sortDir),
    [rows, triage, sortKey, sortDir],
  );

  // Mirror reactive state into refs the long-lived callbacks/listeners read.
  settingsRef.current = settings;
  rulesRef.current = rules;
  tagsRef.current = tags;
  triageRef.current = triage;
  rowsRef.current = rows;
  selectedIdsRef.current = selectedIds;
  assistantMessagesRef.current = assistantMessages;
  assistantModeRef.current = assistantMode;
  readerRef.current = reader;
  templatesRef.current = templates;

  const pushActivity = useCallback((text: string, tone: ActivityEntry["tone"] = "info") => {
    setActivity((prev) => [makeActivity(text, tone), ...prev].slice(0, 60));
  }, []);

  // A single GmailClient, reading the token from the session and refreshing on 401.
  const clientRef = useRef<GmailClient | null>(null);
  if (clientRef.current === null) {
    clientRef.current = new GmailClient({
      getToken: () => sessionRef.current.getToken(),
      refresh: async () => {
        const result = await refreshAccessToken();
        sessionRef.current.setTokens(result);
      },
    });
  }
  const client = clientRef.current;
  searchEngine.attachClient(client);

  const refreshSchedule = useCallback(async () => {
    try {
      setSchedule(await scheduleList());
    } catch (err) {
      pushActivity(`Could not read schedule: ${errorMessage(err)}`, "warn");
    }
  }, [pushActivity]);

  // Reloads whichever mailbox is currently shown (inbox or an open folder),
  // using the query held in listQueryRef.
  const refreshInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const page = await loadThreadRows(client, listQueryRef.current, 30);
      const next = page.rows;
      setRows(next);
      searchEngine.indexRows(next); // mirror into the local search index
      nextPageTokenRef.current = page.nextPageToken;
      setHasMore(Boolean(page.nextPageToken));
      // Drop any selected IDs that no longer exist in the refreshed list.
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const present = new Set(next.map((r) => r.id));
        const pruned = new Set([...prev].filter((id) => present.has(id)));
        return pruned.size === prev.size ? prev : pruned;
      });
    } catch (err) {
      pushActivity(`Could not load mail: ${errorMessage(err)}`, "warn");
    } finally {
      setInboxLoading(false);
    }
  }, [client, pushActivity]);

  // Appends the next page of the current list, de-duplicating against rows we
  // already hold (in case the mailbox shifted between fetches).
  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    const token = nextPageTokenRef.current;
    if (!token) return;
    setLoadingMore(true);
    try {
      const page = await loadThreadRows(client, listQueryRef.current, 30, token);
      searchEngine.indexRows(page.rows); // mirror into the local search index
      nextPageTokenRef.current = page.nextPageToken;
      setHasMore(Boolean(page.nextPageToken));
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.rows.filter((r) => !seen.has(r.id))];
      });
    } catch (err) {
      pushActivity(`Could not load more mail: ${errorMessage(err)}`, "warn");
    } finally {
      setLoadingMore(false);
    }
  }, [client, loadingMore, pushActivity]);

  const runRulesInternal = useCallback(
    async (silent: boolean): Promise<void> => {
      const enabled = rulesRef.current.filter((rule) => rule.enabled);
      if (enabled.length === 0) {
        if (!silent) pushActivity("No enabled rules to run.", "info");
        return;
      }
      if (!silent) setBusy("Running rules…");
      try {
        const messages = await loadLatestMessages(client, "in:inbox", 30);
        const applied = await runRules(client, enabled, messages);
        if (applied.length === 0) {
          if (!silent) pushActivity("Rules ran — no matching threads.", "info");
          return;
        }
        for (const entry of applied) {
          pushActivity(`Rule “${entry.ruleName}” → ${entry.actions.join(", ")} on “${entry.subject}”`, "success");
        }
        await refreshInbox();
      } catch (err) {
        pushActivity(`Running rules failed: ${errorMessage(err)}`, "warn");
      } finally {
        if (!silent) setBusy(null);
      }
    },
    [client, pushActivity, refreshInbox],
  );

  const refresh = useCallback(async () => {
    await Promise.all([refreshInbox(), refreshSchedule()]);
    if (settingsRef.current.autoApplyRules) {
      await runRulesInternal(true);
    }
    // Keep the full-text index current via Gmail History (no-op until backfilled).
    void searchEngine.syncHistory();
  }, [refreshInbox, refreshSchedule, runRulesInternal]);

  // Triage the not-yet-classified rows through the local Ollama model, a few at
  // a time. Skips quietly when the daemon is unreachable, and the in-flight
  // guard keeps overlapping refreshes from double-triaging the same thread.
  const runTriage = useCallback(
    async (rowsToConsider: ThreadRow[]) => {
      const current = settingsRef.current;
      if (!current.triageEnabled) return;
      const pending = rowsToConsider.filter((row) => !triageRef.current[row.id]);
      if (pending.length === 0 || triagingRef.current) return;

      triagingRef.current = true;
      setTriaging(true);
      try {
        const reachable = await checkOllama(current.triageEndpoint);
        if (!reachable) {
          // Warn only on the transition to "down" — not on every refresh.
          if (!triageUnreachableRef.current) {
            pushActivity(`Ollama not reachable at ${current.triageEndpoint} — triage paused`, "warn");
            triageUnreachableRef.current = true;
          }
          return;
        }
        triageUnreachableRef.current = false;
        // Ideas list the model should prefer reusing: the user's existing tags,
        // the built-in starters, and any hints from settings (deduped, case-insensitive).
        const ideas = dedupeLabels([
          ...tagsRef.current.map((t) => t.name),
          ...STARTER_LABELS,
          ...current.suggestedLabels,
        ]);
        const queue = [...pending];
        let done = 0;
        let failed = 0;
        const worker = async () => {
          for (let row = queue.shift(); row; row = queue.shift()) {
            try {
              const result = await triageThread(row, current.triageModel, current.triageEndpoint, ideas);
              const next = { ...triageRef.current, [row.id]: result };
              triageRef.current = next;
              setTriage(next);
              saveTriage(next);
              done += 1;
              // If the assigned label is already a known tag, apply it to Gmail
              // now (synced) so the tag chip shows. Brand-new labels instead
              // surface as suggestions for the user to approve.
              if (current.syncLabelsToGmail) {
                const known = tagsRef.current.find(
                  (t) => t.name.toLowerCase() === result.category.toLowerCase(),
                );
                const onRow = rowsRef.current.find((r) => r.id === row.id);
                if (known && onRow && !onRow.labelIds.includes(known.labelId)) {
                  try {
                    await client.modifyThread(row.id, { addLabelIds: [known.labelId] });
                    setRows((prev) =>
                      prev.map((r) =>
                        r.id === row.id
                          ? { ...r, labelIds: Array.from(new Set([...r.labelIds, known.labelId])) }
                          : r,
                      ),
                    );
                  } catch {
                    /* a failed label apply just means the chip waits for a refresh */
                  }
                }
              }
            } catch {
              failed += 1;
            }
          }
        };
        const lanes = Math.min(3, pending.length);
        await Promise.all(Array.from({ length: lanes }, () => worker()));
        if (done > 0) pushActivity(`Triaged ${done} ${done === 1 ? "email" : "emails"}`, "success");
        if (failed > 0) {
          pushActivity(`Triage failed on ${failed} ${failed === 1 ? "email" : "emails"}`, "warn");
        }
      } finally {
        triagingRef.current = false;
        setTriaging(false);
      }
    },
    [pushActivity],
  );

  const runTriageNow = useCallback(() => runTriage(rowsRef.current), [runTriage]);

  // Auto-triage newly-loaded mail when enabled. `runTriage` returns early when
  // nothing is pending, so this is cheap on unrelated row updates.
  useEffect(() => {
    if (!settings.triageEnabled || !settings.triageAuto) return;
    void runTriage(rows);
  }, [rows, settings.triageEnabled, settings.triageAuto, runTriage]);

  const handleDue = useCallback(
    async (item: ScheduleItem) => {
      if (handlingRef.current.has(item.id)) return;
      handlingRef.current.add(item.id);
      try {
        const outcome = await handleScheduleDue(client, item, {
          snoozeLabel: settingsRef.current.snoozeLabel,
          selfEmail: sessionRef.current.getEmail() ?? "",
        });
        pushActivity(outcome, "success");
        await refreshSchedule();
        if (item.kind === "snooze") await refreshInbox();
      } catch (err) {
        handlingRef.current.delete(item.id); // allow a retry on the next tick
        pushActivity(`Scheduled action failed: ${errorMessage(err)}`, "warn");
      }
    },
    [client, pushActivity, refreshInbox, refreshSchedule],
  );

  // Subscribe to Rust's scheduler once we're signed in.
  useEffect(() => {
    if (status !== "ready") return undefined;
    let unlisten: (() => void) | undefined;
    let active = true;
    void onScheduleDue((item) => void handleDue(item)).then((fn) => {
      if (active) unlisten = fn;
      else fn();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [status, handleDue]);

  // Tags cache their Gmail label id, but ids differ per account and labels can
  // be renamed/recreated externally. Re-resolve each by name once we're ready so
  // row chips keep matching. ensureLabelId shares the folder label cache, so this
  // is effectively one label list fetch.
  const resolveTagLabels = useCallback(async () => {
    if (tagsRef.current.length === 0) return;
    try {
      const resolved = await Promise.all(
        tagsRef.current.map(async (tag) => ({
          id: tag.id,
          labelId: await client.ensureLabelId(tagLabelName(tag.name)),
        })),
      );
      setTags((prev) => {
        let changed = false;
        const next = prev.map((tag) => {
          const match = resolved.find((r) => r.id === tag.id);
          if (match && match.labelId !== tag.labelId) {
            changed = true;
            return { ...tag, labelId: match.labelId };
          }
          return tag;
        });
        if (changed) saveTags(next);
        return changed ? next : prev;
      });
    } catch {
      // A failed resolve just means chips may not match until the next load.
    }
  }, [client]);

  useEffect(() => {
    if (status === "ready") void resolveTagLabels();
  }, [status, resolveTagLabels]);

  // Each sign-in gets an attempt id; cancelling bumps it so a late resolve or
  // reject from the abandoned flow can't flip the UI back.
  const authAttemptRef = useRef(0);

  const signIn = useCallback(async () => {
    const attempt = (authAttemptRef.current += 1);
    setStatus("authenticating");
    setError(null);
    try {
      const result = await startOAuth();
      if (authAttemptRef.current !== attempt) return; // cancelled/superseded
      sessionRef.current.setTokens(result);
      const profile = await client.getProfile();
      if (authAttemptRef.current !== attempt) return;
      sessionRef.current.setEmail(profile.emailAddress);
      setEmail(profile.emailAddress);
      setStatus("ready");
      setCanSend(sessionRef.current.canSend());
      pushActivity(`Signed in as ${profile.emailAddress}`, "success");
      await refresh();
    } catch (err) {
      if (authAttemptRef.current !== attempt) return; // cancelled — ignore
      sessionRef.current.clear();
      setStatus("error");
      setError(errorMessage(err));
    }
  }, [client, pushActivity, refresh]);

  const cancelSignIn = useCallback(() => {
    authAttemptRef.current += 1; // invalidate the in-flight attempt
    void cancelOAuth().catch(() => {}); // abort the loopback wait in Rust
    sessionRef.current.clear();
    setError(null);
    setStatus("signedOut");
  }, []);

  // On launch, try to restore a persisted session: the Rust side preloads the
  // refresh token from the OS keychain, so a silent refresh succeeds if we were
  // signed in last time. If not, fall through to the sign-in screen.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await refreshAccessToken();
        if (!active) return;
        sessionRef.current.setTokens(result);
        const profile = await client.getProfile();
        if (!active) return;
        sessionRef.current.setEmail(profile.emailAddress);
        setEmail(profile.emailAddress);
        setStatus("ready");
        setCanSend(sessionRef.current.canSend());
        pushActivity(`Welcome back, ${profile.emailAddress}`, "info");
        await refresh();
      } catch (err) {
        if (!active) return;
        // A revoked/expired refresh token will never work again — forget it so
        // we don't keep trying. Transient (e.g. network) failures are left alone.
        if (errorMessage(err).includes("invalid_grant")) {
          void clearStoredSession().catch(() => {});
        }
        setStatus("signedOut");
      }
    })();
    return () => {
      active = false;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(() => {
    // Erase the persisted refresh token so the next launch starts signed out.
    void clearStoredSession().catch(() => {});
    sessionRef.current.clear();
    client.invalidateLabelCache();
    handlingRef.current.clear();
    setStatus("signedOut");
    setEmail(null);
    setRows([]);
    setSchedule([]);
    setReader(null);
    setSelectedId(null);
    setSelectedIds(new Set());
    setActivity([]);
    setActiveFolderId(null);
    setActiveTagId(null);
    setListTitle("Inbox");
    listQueryRef.current = "in:inbox";
    setViewState("inbox");
    nextPageTokenRef.current = undefined;
    setHasMore(false);
    setLoadingMore(false);
    setTemplates([]);
    setFilterActive(false);
    // Forget the assistant conversation — it's derived from this account's mail.
    setAssistantOpen(false);
    setAssistantMessages([]);
    assistantMessagesRef.current = [];
    clearAssistantChatStorage();
    searchEngine.clear(); // don't leave indexed mail on disk after sign-out
  }, [client]);

  const removeRow = useCallback(
    (id: string) => {
      setRows((prev) => prev.filter((r) => r.id !== id));
      setSelectedId((current) => (current === id ? null : current));
      setReader((current) => (current?.threadId === id ? null : current));
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [],
  );

  const openThread = useCallback(
    async (id: string) => {
      selectionAnchorRef.current = id;
      setSelectedId(id);
      setReader({ threadId: id, loading: true, messages: [] });
      try {
        const thread = await client.getThread(id);
        const messages = (thread.messages ?? []).map(parseMessage);
        setReader({ threadId: id, loading: false, messages });

        const row = rows.find((r) => r.id === id);
        if (row?.unread) {
          await client.markRead(id);
          setRows((prev) => prev.map((r) => (r.id === id ? { ...r, unread: false } : r)));
        }
      } catch (err) {
        setReader({ threadId: id, loading: false, messages: [] });
        pushActivity(`Could not open thread: ${errorMessage(err)}`, "warn");
      }
    },
    [client, rows, pushActivity],
  );

  const closeThread = useCallback(() => {
    setSelectedId(null);
    setReader(null);
  }, []);

  const toggleSelected = useCallback((id: string) => {
    selectionAnchorRef.current = id;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Shift+click: add every row between the anchor and `id` (inclusive) to the
  // selection. With no valid anchor yet, just selects the clicked row.
  const selectRange = useCallback(
    (id: string) => {
      const toIndex = orderedRows.findIndex((r) => r.id === id);
      if (toIndex === -1) return;
      const anchor = selectionAnchorRef.current;
      const fromIndex = anchor ? orderedRows.findIndex((r) => r.id === anchor) : -1;
      if (fromIndex === -1) {
        selectionAnchorRef.current = id;
        setSelectedIds((prev) => new Set(prev).add(id));
        return;
      }
      const lo = Math.min(fromIndex, toIndex);
      const hi = Math.max(fromIndex, toIndex);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i += 1) next.add(orderedRows[i].id);
        return next;
      });
    },
    [orderedRows],
  );

  const setSort = useCallback((key: SortKey, dir?: SortDir) => {
    setSortKey(key);
    setSortDir(dir ?? defaultSortDir(key));
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(rows.map((r) => r.id)));
  }, [rows]);

  const clearSelection = useCallback(() => {
    selectionAnchorRef.current = null;
    setSelectedIds(new Set());
  }, []);

  // Replace the list with an arbitrary Gmail query (the assistant's "filter").
  // Tracked as a filter overlay so the UI can offer a one-click "clear".
  const applyListQuery = useCallback(
    (query: string, title: string) => {
      setActiveFolderId(null);
      setActiveTagId(null);
      listQueryRef.current = query;
      setListTitle(title);
      setFilterActive(true);
      clearSelection();
      closeThread();
      setViewState("inbox");
      void refreshInbox();
    },
    [clearSelection, closeThread, refreshInbox],
  );

  const clearFilter = useCallback(() => {
    setFilterActive(false);
    setActiveFolderId(null);
    setActiveTagId(null);
    listQueryRef.current = "in:inbox";
    setListTitle("Inbox");
    clearSelection();
    setViewState("inbox");
    void refreshInbox();
  }, [clearSelection, refreshInbox]);

  // Switch the main view. Navigating to the inbox reloads it (rows may still
  // hold a folder's mail); the snoozed/watching/rules panels read their own
  // data and don't touch the mail list.
  const refreshTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      setTemplates(await loadTemplates(client));
    } catch (err) {
      pushActivity(`Could not load templates: ${errorMessage(err)}`, "warn");
    } finally {
      setTemplatesLoading(false);
    }
  }, [client, pushActivity]);

  const saveTemplate = useCallback(
    async (name: string, body: string, replaceId?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        const selfEmail = sessionRef.current.getEmail() ?? "";
        await saveTemplateFeature(client, selfEmail, { name: trimmed, body }, replaceId);
        pushActivity(replaceId ? `Updated template “${trimmed}”` : `Created template “${trimmed}”`, "success");
        await refreshTemplates();
      } catch (err) {
        pushActivity(`Could not save template: ${errorMessage(err)}`, "warn");
      }
    },
    [client, pushActivity, refreshTemplates],
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      try {
        await deleteTemplateFeature(client, id);
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        pushActivity("Template deleted", "info");
      } catch (err) {
        pushActivity(`Could not delete template: ${errorMessage(err)}`, "warn");
      }
    },
    [client, pushActivity],
  );

  // Turn a template into a real Gmail draft (HTML preserved), then open Gmail's
  // Drafts so the user can finish and send it there.
  const useTemplate = useCallback(
    async (template: Template) => {
      try {
        await draftFromTemplate(client, template);
        await openUrl("https://mail.google.com/mail/u/0/#drafts");
        pushActivity(`Drafted “${template.name}” in Gmail`, "success");
      } catch (err) {
        pushActivity(`Could not create draft: ${errorMessage(err)}`, "warn");
      }
    },
    [client, pushActivity],
  );

  const changeView = useCallback(
    (next: View) => {
      if (next === "inbox") {
        setActiveFolderId(null);
        setActiveTagId(null);
        setFilterActive(false);
        listQueryRef.current = "in:inbox";
        setListTitle("Inbox");
        clearSelection();
        setViewState("inbox");
        void refreshInbox();
        return;
      }
      if (next !== "folder") setActiveFolderId(null);
      if (next !== "tag") setActiveTagId(null);
      if (next === "templates") void refreshTemplates();
      setViewState(next);
    },
    [clearSelection, refreshInbox, refreshTemplates],
  );

  const openFolder = useCallback(
    (folder: Folder) => {
      setActiveFolderId(folder.id);
      setActiveTagId(null);
      setFilterActive(false);
      // Gmail search query for the folder's label; JSON.stringify quotes and
      // escapes the name so multi-word labels match.
      listQueryRef.current = `label:${JSON.stringify(folder.name)}`;
      setListTitle(folder.name);
      clearSelection();
      closeThread();
      setViewState("folder");
      void refreshInbox();
    },
    [clearSelection, closeThread, refreshInbox],
  );

  // Filter the list to threads carrying a tag's label (works like opening a
  // folder, but a tagged thread also stays in its inbox/folder).
  const openTag = useCallback(
    (tag: Tag) => {
      setActiveFolderId(null);
      setActiveTagId(tag.id);
      setFilterActive(false);
      listQueryRef.current = `label:${JSON.stringify(tagLabelName(tag.name))}`;
      setListTitle(tag.name);
      clearSelection();
      closeThread();
      setViewState("tag");
      void refreshInbox();
    },
    [clearSelection, closeThread, refreshInbox],
  );

  const createFolder = useCallback(
    async (rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      if (folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
        pushActivity(`Folder “${name}” already exists`, "warn");
        return;
      }
      try {
        // Create the backing Gmail label (idempotent if it already exists).
        await client.ensureLabelId(name);
        const folder: Folder = { id: crypto.randomUUID(), name };
        setFolders((prev) => {
          const nextFolders = [...prev, folder];
          saveFolders(nextFolders);
          return nextFolders;
        });
        pushActivity(`Created folder “${name}”`, "success");
      } catch (err) {
        pushActivity(`Could not create folder: ${errorMessage(err)}`, "warn");
      }
    },
    [folders, client, pushActivity],
  );

  // Removes a folder from the sidebar only — the Gmail label and any mail filed
  // under it are left untouched.
  const removeFolder = useCallback(
    (id: string) => {
      setFolders((prev) => {
        const nextFolders = prev.filter((f) => f.id !== id);
        saveFolders(nextFolders);
        return nextFolders;
      });
      if (activeFolderId === id) changeView("inbox");
    },
    [activeFolderId, changeView],
  );

  const persistTags = useCallback((next: Tag[]) => {
    setTags(next);
    saveTags(next);
  }, []);

  const createTag = useCallback(
    async (input: { name: string; color: TagColor; icon: TagIconKey }) => {
      const name = input.name.trim();
      if (!name) return;
      if (tagsRef.current.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
        pushActivity(`Tag “${name}” already exists`, "warn");
        return;
      }
      try {
        // Create the backing Gmail label (idempotent) and remember its id.
        const labelId = await client.ensureLabelId(tagLabelName(name));
        const tag: Tag = { id: crypto.randomUUID(), name, labelId, color: input.color, icon: input.icon, source: "user" };
        persistTags([...tagsRef.current, tag]);
        pushActivity(`Created tag “${name}”`, "success");
      } catch (err) {
        pushActivity(`Could not create tag: ${errorMessage(err)}`, "warn");
      }
    },
    [client, persistTags, pushActivity],
  );

  const updateTag = useCallback(
    async (id: string, patch: { name?: string; color?: TagColor; icon?: TagIconKey }) => {
      const tag = tagsRef.current.find((t) => t.id === id);
      if (!tag) return;
      const nextName = patch.name?.trim();
      try {
        if (nextName && nextName !== tag.name) {
          if (tagsRef.current.some((t) => t.id !== id && t.name.toLowerCase() === nextName.toLowerCase())) {
            pushActivity(`Tag “${nextName}” already exists`, "warn");
            return;
          }
          // Rename the backing Gmail label so the tag keeps its threads.
          await client.updateLabel(tag.labelId, tagLabelName(nextName));
        }
        const next = tagsRef.current.map((t) =>
          t.id === id ? { ...t, ...patch, name: nextName ?? t.name } : t,
        );
        persistTags(next);
        pushActivity(`Updated tag “${nextName ?? tag.name}”`, "info");
      } catch (err) {
        pushActivity(`Could not update tag: ${errorMessage(err)}`, "warn");
      }
    },
    [client, persistTags, pushActivity],
  );

  // Removes the tag from the app only — the Gmail label and any threads carrying
  // it are left untouched (matching how folders are removed).
  const deleteTag = useCallback(
    (id: string) => {
      const tag = tagsRef.current.find((t) => t.id === id);
      persistTags(tagsRef.current.filter((t) => t.id !== id));
      if (activeTagId === id) changeView("inbox");
      if (tag) pushActivity(`Deleted tag “${tag.name}”`, "info");
    },
    [activeTagId, changeView, persistTags, pushActivity],
  );

  const archiveThread = useCallback(
    async (id: string) => {
      try {
        await client.archiveThread(id);
        removeRow(id);
        pushActivity("Archived", "success");
      } catch (err) {
        pushActivity(`Archive failed: ${errorMessage(err)}`, "warn");
      }
    },
    [client, removeRow, pushActivity],
  );

  const archiveSelected = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBusy(`Archiving ${ids.length}…`);
    try {
      const results = await Promise.allSettled(ids.map((id) => client.archiveThread(id)));
      let archived = 0;
      results.forEach((result, i) => {
        if (result.status === "fulfilled") {
          removeRow(ids[i]);
          archived += 1;
        }
      });
      if (archived > 0) {
        pushActivity(`Archived ${archived} ${archived === 1 ? "thread" : "threads"}`, "success");
      }
      const failed = ids.length - archived;
      if (failed > 0) {
        pushActivity(`${failed} ${failed === 1 ? "thread" : "threads"} failed to archive`, "warn");
      }
    } finally {
      setBusy(null);
    }
  }, [selectedIds, client, removeRow, pushActivity]);

  // Files the given threads under `folder` by applying its Gmail label and
  // taking them out of the inbox (and out of the source folder, when moving
  // between folders). The label change is written to Gmail, so it persists.
  const moveThreadsToFolder = useCallback(
    async (ids: string[], folder: Folder) => {
      if (ids.length === 0) return;
      setBusy(`Moving ${ids.length}…`);
      try {
        const labelId = await client.ensureLabelId(folder.name);
        const removeLabelIds = ["INBOX"];
        const source = folders.find((f) => f.id === activeFolderId);
        if (source && source.id !== folder.id) {
          removeLabelIds.push(await client.ensureLabelId(source.name));
        }
        const results = await Promise.allSettled(
          ids.map((id) => client.modifyThread(id, { addLabelIds: [labelId], removeLabelIds })),
        );
        let moved = 0;
        results.forEach((result, i) => {
          if (result.status === "fulfilled") {
            removeRow(ids[i]);
            moved += 1;
          }
        });
        if (moved > 0) {
          pushActivity(`Moved ${moved} to “${folder.name}”`, "success");
        }
        const failed = ids.length - moved;
        if (failed > 0) {
          pushActivity(`${failed} ${failed === 1 ? "thread" : "threads"} failed to move`, "warn");
        }
      } finally {
        setBusy(null);
      }
    },
    [client, removeRow, pushActivity, folders, activeFolderId],
  );

  const moveSelectedToFolder = useCallback(
    (folder: Folder) => moveThreadsToFolder([...selectedIds], folder),
    [moveThreadsToFolder, selectedIds],
  );

  // Apply (or remove) a tag's label on a single thread, updating the row's
  // chips optimistically and reverting if Gmail rejects it.
  const setThreadTag = useCallback(
    async (threadId: string, tag: Tag, apply: boolean) => {
      const patchRow = (add: boolean) =>
        setRows((prev) =>
          prev.map((r) =>
            r.id === threadId
              ? {
                  ...r,
                  labelIds: add
                    ? Array.from(new Set([...r.labelIds, tag.labelId]))
                    : r.labelIds.filter((l) => l !== tag.labelId),
                }
              : r,
          ),
        );
      patchRow(apply);
      try {
        await client.modifyThread(threadId, apply ? { addLabelIds: [tag.labelId] } : { removeLabelIds: [tag.labelId] });
        pushActivity(apply ? `Tagged “${tag.name}”` : `Removed tag “${tag.name}”`, "info");
      } catch (err) {
        patchRow(!apply); // revert
        pushActivity(`Could not update tag: ${errorMessage(err)}`, "warn");
      }
    },
    [client, pushActivity],
  );

  // Bulk-apply a tag to many threads (used from the multi-select context menu).
  const addTagToThreads = useCallback(
    async (ids: string[], tag: Tag) => {
      if (ids.length === 0) return;
      setBusy(`Tagging ${ids.length}…`);
      try {
        const results = await Promise.allSettled(
          ids.map((id) => client.modifyThread(id, { addLabelIds: [tag.labelId] })),
        );
        let tagged = 0;
        results.forEach((result, i) => {
          if (result.status === "fulfilled") {
            tagged += 1;
            setRows((prev) =>
              prev.map((r) =>
                r.id === ids[i] ? { ...r, labelIds: Array.from(new Set([...r.labelIds, tag.labelId])) } : r,
              ),
            );
          }
        });
        if (tagged > 0) pushActivity(`Tagged ${tagged} with “${tag.name}”`, "success");
        const failed = ids.length - tagged;
        if (failed > 0) pushActivity(`${failed} ${failed === 1 ? "thread" : "threads"} failed to tag`, "warn");
      } finally {
        setBusy(null);
      }
    },
    [client, pushActivity],
  );

  // Labels the AI invented that aren't tags yet (and weren't dismissed), grouped
  // with the threads they'd apply to. Pure derivation of triage + tags + skips.
  const suggestions = useMemo<LabelSuggestion[]>(() => {
    const known = new Set(tags.map((t) => t.name.toLowerCase()));
    const skipped = new Set(skippedLabels);
    const groups = new Map<string, LabelSuggestion>();
    for (const [id, result] of Object.entries(triage)) {
      const name = result.category;
      if (!name) continue;
      const key = name.toLowerCase();
      // "Other" is the model's fallback for unclassifiable mail — not a label
      // worth proposing.
      if (key === "other" || known.has(key) || skipped.has(key)) continue;
      const group = groups.get(key);
      if (group) group.ids.push(id);
      else groups.set(key, { name, ids: [id] });
    }
    return [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);
  }, [triage, tags, skippedLabels]);

  // Promote a suggested label to a real (auto-origin) tag and apply it to every
  // thread triaged under it. Approval is explicit, so it always writes to Gmail
  // regardless of the auto-sync setting. Once it's a tag, it leaves `suggestions`.
  const approveSuggestion = useCallback(
    async (name: string) => {
      const key = name.toLowerCase();
      const ids = Object.entries(triageRef.current)
        .filter(([, r]) => r.category.toLowerCase() === key)
        .map(([id]) => id);
      try {
        let tag = tagsRef.current.find((t) => t.name.toLowerCase() === key);
        if (!tag) {
          const style = defaultTagStyle(name);
          const labelId = await client.ensureLabelId(tagLabelName(name));
          tag = { id: crypto.randomUUID(), name, labelId, color: style.color, icon: style.icon, source: "auto" };
          persistTags([...tagsRef.current, tag]);
          pushActivity(`Created label “${name}”`, "success");
        }
        if (ids.length > 0) await addTagToThreads(ids, tag);
      } catch (err) {
        pushActivity(`Could not approve “${name}”: ${errorMessage(err)}`, "warn");
      }
    },
    [client, persistTags, pushActivity, addTagToThreads],
  );

  // Dismiss a suggested label so triage stops proposing it (persisted).
  const skipSuggestion = useCallback((name: string) => {
    const key = name.toLowerCase();
    setSkippedLabels((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      saveSkippedLabels(next);
      return next;
    });
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      try {
        await client.markRead(id);
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, unread: false } : r)));
      } catch (err) {
        pushActivity(`Mark read failed: ${errorMessage(err)}`, "warn");
      }
    },
    [client, pushActivity],
  );

  const snooze = useCallback(
    async (id: string, subject: string, dueAt: number) => {
      try {
        await snoozeThreadFeature(client, id, subject, dueAt, settingsRef.current.snoozeLabel);
        removeRow(id);
        await refreshSchedule();
        pushActivity(`Snoozed “${subject}”`, "success");
      } catch (err) {
        pushActivity(`Snooze failed: ${errorMessage(err)}`, "warn");
      }
    },
    [client, removeRow, refreshSchedule, pushActivity],
  );

  const watch = useCallback(
    async (id: string, subject: string, dueAt: number) => {
      try {
        await watchThreadFeature(id, subject, dueAt);
        await refreshSchedule();
        pushActivity(`Watching “${subject}” for a reply`, "success");
      } catch (err) {
        pushActivity(`Watch failed: ${errorMessage(err)}`, "warn");
      }
    },
    [refreshSchedule, pushActivity],
  );

  const cancelSchedule = useCallback(
    async (item: ScheduleItem) => {
      try {
        if (item.kind === "snooze") {
          const labelId = await client.ensureLabelId(settingsRef.current.snoozeLabel);
          await client.modifyThread(item.threadId, {
            addLabelIds: ["INBOX"],
            removeLabelIds: [labelId],
          });
        }
        await scheduleRemove(item.id);
        await refreshSchedule();
        pushActivity(item.kind === "snooze" ? "Un-snoozed" : "Stopped watching", "info");
        if (item.kind === "snooze") await refreshInbox();
      } catch (err) {
        pushActivity(`Could not cancel: ${errorMessage(err)}`, "warn");
      }
    },
    [client, refreshSchedule, refreshInbox, pushActivity],
  );

  const openInGmail = useCallback(
    async (id: string) => {
      try {
        await openUrl(`https://mail.google.com/mail/u/0/#all/${id}`);
      } catch (err) {
        pushActivity(`Could not open Gmail: ${errorMessage(err)}`, "warn");
      }
    },
    [pushActivity],
  );

  // ---- Conversational assistant -----------------------------------------

  // setState + persist in one move, always saving with the current mode.
  const commitMessages = useCallback(
    (updater: (prev: AssistantMessage[]) => AssistantMessage[]) => {
      setAssistantMessages((prev) => {
        const next = updater(prev);
        assistantMessagesRef.current = next;
        saveAssistantChat({ mode: assistantModeRef.current, messages: next });
        return next;
      });
    },
    [],
  );

  const setAssistantMode = useCallback((mode: AssistantMode) => {
    assistantModeRef.current = mode;
    setAssistantModeState(mode);
    saveAssistantChat({ mode, messages: assistantMessagesRef.current });
  }, []);

  const clearAssistantChat = useCallback(() => {
    assistantMessagesRef.current = [];
    setAssistantMessages([]);
    clearAssistantChatStorage();
  }, []);

  // Find or create a tag by name (auto origin) so the assistant can apply it.
  const ensureTag = useCallback(
    async (name: string): Promise<Tag> => {
      const existing = tagsRef.current.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing;
      const style = defaultTagStyle(name);
      const labelId = await client.ensureLabelId(tagLabelName(name));
      const tag: Tag = {
        id: crypto.randomUUID(),
        name,
        labelId,
        color: style.color,
        icon: style.icon,
        source: "auto",
      };
      persistTags([...tagsRef.current, tag]);
      return tag;
    },
    [client, persistTags],
  );

  // Find or create a sidebar folder by name.
  const ensureFolder = useCallback(
    async (name: string): Promise<Folder> => {
      const existing = folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing;
      await client.ensureLabelId(name);
      const folder: Folder = { id: crypto.randomUUID(), name };
      setFolders((prev) => {
        const next = [...prev, folder];
        saveFolders(next);
        return next;
      });
      return folder;
    },
    [client, folders],
  );

  // Carry out a single assistant action, returning a one-line log of the result.
  const runAction = useCallback(
    async (action: AssistantAction): Promise<string> => {
      // Target: explicit ids → current selection → the open email ("this mail").
      const ids =
        action.ids && action.ids.length > 0
          ? action.ids
          : selectedIdsRef.current.size > 0
            ? [...selectedIdsRef.current]
            : readerRef.current?.threadId
              ? [readerRef.current.threadId]
              : [];
      const count = (n: number) => `${n} ${n === 1 ? "email" : "emails"}`;
      switch (action.type) {
        case "createLabel":
        case "applyLabel": {
          if (!action.label) return "";
          const tag = await ensureTag(action.label);
          if (ids.length > 0) await addTagToThreads(ids, tag);
          return `Applied “${tag.name}” to ${count(ids.length)}`;
        }
        case "removeLabel": {
          if (!action.label) return "";
          const tag = tagsRef.current.find((t) => t.name.toLowerCase() === action.label!.toLowerCase());
          if (!tag) return `No label “${action.label}” to remove`;
          for (const id of ids) await setThreadTag(id, tag, false);
          return `Removed “${tag.name}” from ${count(ids.length)}`;
        }
        case "archive": {
          await Promise.allSettled(
            ids.map((id) => client.archiveThread(id).then(() => removeRow(id))),
          );
          return `Archived ${count(ids.length)}`;
        }
        case "markRead": {
          await Promise.allSettled(ids.map((id) => markRead(id)));
          return `Marked ${count(ids.length)} read`;
        }
        case "snooze": {
          const preset =
            SNOOZE_PRESETS.find(
              (p) => p.label.toLowerCase() === (action.snoozePreset ?? "").toLowerCase(),
            ) ?? SNOOZE_PRESETS[0];
          const dueAt = dueAtFromPreset(preset);
          for (const id of ids) {
            const row = rowsRef.current.find((r) => r.id === id);
            await snooze(id, row?.subject ?? "(no subject)", dueAt);
          }
          return `Snoozed ${count(ids.length)} (${preset.label})`;
        }
        case "moveToFolder": {
          if (!action.folder) return "";
          const folder = await ensureFolder(action.folder);
          await moveThreadsToFolder(ids, folder);
          return `Moved ${count(ids.length)} to “${folder.name}”`;
        }
        case "openThread": {
          const id = action.ids?.[0] ?? [...selectedIdsRef.current][0];
          if (!id) return "No email to open";
          await openThread(id);
          const row = rowsRef.current.find((r) => r.id === id);
          return row ? `Opened “${row.subject || "(no subject)"}”` : "Opened the email";
        }
        case "setSort": {
          setSort(action.sortKey ?? "date", action.sortDir);
          return `Sorted by ${action.sortKey ?? "date"}`;
        }
        case "setFilter": {
          const parts: string[] = [];
          if (action.query) parts.push(action.query);
          if (action.label) {
            const tag = tagsRef.current.find((t) => t.name.toLowerCase() === action.label!.toLowerCase());
            parts.push(`label:${JSON.stringify(tag ? tagLabelName(tag.name) : action.label)}`);
          }
          if (action.from) parts.push(`from:${action.from}`);
          if (action.unread) parts.push("is:unread");
          const query = parts.join(" ").trim() || "in:inbox";
          const title = action.filterTitle ?? action.label ?? action.from ?? "Filtered";
          applyListQuery(query, title);
          return `Filtered: ${title}`;
        }
        case "answer":
        default:
          return "";
      }
    },
    [
      ensureTag,
      ensureFolder,
      addTagToThreads,
      setThreadTag,
      client,
      removeRow,
      markRead,
      snooze,
      moveThreadsToFolder,
      openThread,
      setSort,
      applyListQuery,
    ],
  );

  const executeActions = useCallback(
    async (actions: AssistantAction[]): Promise<void> => {
      for (const action of actions) {
        try {
          const log = await runAction(action);
          if (log) pushActivity(log, "success");
        } catch (err) {
          pushActivity(`Assistant action failed: ${errorMessage(err)}`, "warn");
        }
      }
    },
    [runAction, pushActivity],
  );

  // Model-facing snapshot of the mail in view. A compact list (id + sender +
  // subject + snippet + triage summary) for everything loaded, PLUS the full body
  // text of the open thread and any selected threads — so questions about
  // amounts/details ("how much did I pay?") can actually be answered.
  const buildAssistantContext = useCallback(async (relevantIds: string[] = []): Promise<string> => {
    const selected = selectedIdsRef.current;
    const open = readerRef.current;
    const visible = rowsRef.current.slice(0, 40);
    const lines = visible.map((row) => {
      const t = triageRef.current[row.id];
      const flags = `${selected.has(row.id) ? "*" : ""}${open?.threadId === row.id ? ">" : ""}` || "-";
      const summary = t?.summary ? ` — ${t.summary}` : "";
      const snippet = row.snippet ? ` — ${row.snippet.slice(0, 100)}` : "";
      return `${flags} [${row.id}] ${addressLabel(row.from)} | ${row.subject || "(no subject)"}${summary}${snippet}`;
    });

    // Deep read: the open thread, the emails the message points at, then any
    // selected threads (capped, deduped) — so the model can actually summarize.
    const detailIds: string[] = [];
    const addDetail = (id: string | undefined) => {
      if (id && detailIds.length < 5 && !detailIds.includes(id)) detailIds.push(id);
    };
    addDetail(open?.threadId);
    for (const id of relevantIds) addDetail(id);
    for (const id of selected) addDetail(id);
    const bodyText = async (id: string): Promise<string> => {
      if (open && open.threadId === id && open.messages.length > 0) {
        return open.messages.map((m) => m.text ?? (m.html ? htmlToText(m.html) : "")).join("\n");
      }
      try {
        const thread = await client.getThread(id);
        return (thread.messages ?? [])
          .map(parseMessage)
          .map((m) => m.text ?? (m.html ? htmlToText(m.html) : ""))
          .join("\n");
      } catch {
        return "";
      }
    };
    const details = await Promise.all(
      detailIds.map(async (id) => {
        const row = rowsRef.current.find((r) => r.id === id);
        const head = row ? `${addressLabel(row.from)} | ${row.subject || "(no subject)"}` : id;
        const text = (await bodyText(id)).replace(/\n{3,}/g, "\n\n").trim().slice(0, 1500);
        return `[${id}] ${head}\n${text || "(no readable text)"}`;
      }),
    );

    return [
      `Emails (* = selected, > = open; ${selected.size} selected of ${visible.length} shown):`,
      lines.join("\n") || "(no emails loaded)",
      details.length ? `\nFull content of the open/selected emails:\n${details.join("\n\n")}` : "",
      ``,
      `Existing labels: ${tagsRef.current.map((t) => t.name).join(", ") || "(none)"}`,
      `Folders: ${folders.map((f) => f.name).join(", ") || "(none)"}`,
      `Snooze presets: ${SNOOZE_PRESETS.map((p) => p.label).join(", ")}`,
      `Current sort: ${sortKey} ${sortDir}`,
    ].join("\n");
  }, [client, folders, sortKey, sortDir]);

  const sendAssistantMessage = useCallback(
    async (text: string): Promise<void> => {
      const message = text.trim();
      if (!message || assistantBusy) return;
      const current = settingsRef.current;
      const model = current.assistantModel.trim() || current.triageModel;
      // Capture prior turns BEFORE appending this one, so the current message is
      // only sent as the request (not duplicated in history).
      const mode = assistantModeRef.current;
      // Which loaded emails does this message point at? Used both to deep-read
      // them (so the model can summarize) and to auto-open the top match.
      const relevantIds = matchRelevantRows(message, rowsRef.current.slice(0, 40));
      const history = assistantMessagesRef.current
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));
      const userMsg: AssistantMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        ts: Date.now(),
      };
      commitMessages((prev) => [...prev, userMsg]);
      setAssistantBusy(true);
      try {
        const output = await runAssist({
          model,
          endpoint: current.triageEndpoint,
          mode,
          message,
          history,
          context: await buildAssistantContext(relevantIds),
        });
        // Target fallback for actions that didn't name ids: current selection,
        // else the open email ("this mail"), else the best keyword match.
        const fallbackIds =
          selectedIdsRef.current.size > 0
            ? [...selectedIdsRef.current]
            : readerRef.current?.threadId
              ? [readerRef.current.threadId]
              : relevantIds.slice(0, 1);
        const resolved = (output.actions ?? []).map((action) =>
          NEEDS_IDS.has(action.type) && !(action.ids && action.ids.length > 0)
            ? { ...action, ids: fallbackIds }
            : action,
        );
        // Navigation (open / sort / filter) is non-destructive — run it now in
        // every mode. Mail-changing actions are blocked in Ask, proposed in
        // Request, executed in Agent.
        const nav = resolved.filter((a) => NAVIGATION_ACTIONS.has(a.type));
        const mutating = resolved.filter((a) => !NAVIGATION_ACTIONS.has(a.type));
        // If the message clearly points at an email and the model didn't open one
        // itself, open the top match for the user (open it, don't tell them to).
        const topMatch = relevantIds[0];
        if (
          topMatch &&
          topMatch !== readerRef.current?.threadId &&
          !resolved.some((a) => a.type === "openThread")
        ) {
          nav.push({ type: "openThread", ids: [topMatch] });
        }
        if (nav.length > 0) await executeActions(nav);
        const pending = mode === "ask" ? [] : mutating;
        const reply =
          output.reply?.trim() || (pending.length || nav.length ? "Done." : "…");
        if (mode === "agent" && pending.length > 0) {
          await executeActions(pending);
          commitMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "assistant", content: reply, ts: Date.now(), actions: pending, status: "applied" },
          ]);
        } else {
          commitMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: reply,
              ts: Date.now(),
              actions: pending.length ? pending : undefined,
              status: pending.length ? "proposed" : undefined,
            },
          ]);
        }
      } catch (err) {
        commitMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Sorry — I couldn't reach the model. ${errorMessage(err)}`,
            ts: Date.now(),
          },
        ]);
      } finally {
        setAssistantBusy(false);
      }
    },
    [assistantBusy, buildAssistantContext, commitMessages, executeActions],
  );

  const applyProposal = useCallback(
    async (messageId: string): Promise<void> => {
      const msg = assistantMessagesRef.current.find((m) => m.id === messageId);
      if (!msg?.actions || msg.status !== "proposed") return;
      await executeActions(msg.actions);
      commitMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: "applied" } : m)),
      );
    },
    [executeActions, commitMessages],
  );

  const cancelProposal = useCallback(
    (messageId: string): void => {
      commitMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status: "cancelled" } : m)),
      );
    },
    [commitMessages],
  );

  // ---- Composer ----------------------------------------------------------

  const composeNew = useCallback(() => {
    setComposeError(null);
    setCompose(blankDraft());
  }, []);

  // Open the composer prefilled as a reply / reply-all / forward of `original`.
  const composeReply = useCallback(
    (mode: Exclude<ComposeMode, "new">, original: ParsedMessage) => {
      setComposeError(null);
      setCompose(draftFromMessage(mode, original, sessionRef.current.getEmail() ?? ""));
    },
    [],
  );

  // Open the composer on a fully-formed draft (used by Quick Action compose steps).
  const setComposeDraft = useCallback((draft: ComposeDraft) => {
    setComposeError(null);
    setCompose(draft);
  }, []);

  const updateCompose = useCallback((patch: Partial<ComposeDraft>) => {
    setCompose((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const closeCompose = useCallback(() => {
    setCompose(null);
    setComposeError(null);
  }, []);

  // Low-level send of a given draft (also used for Quick Action auto-send).
  const sendComposeDraft = useCallback(
    (draft: ComposeDraft) => sendDraft(client, draft, sessionRef.current.getEmail() ?? ""),
    [client],
  );

  const sendCompose = useCallback(async () => {
    if (!compose) return;
    setComposeBusy(true);
    setComposeError(null);
    try {
      await sendComposeDraft(compose);
      pushActivity(`Sent “${compose.subject || "(no subject)"}”`, "success");
      setCompose(null);
    } catch (err) {
      const msg = errorMessage(err);
      setComposeError(
        /\b403\b|insufficient|permission|scope/i.test(msg)
          ? "Sending needs the send permission — sign out and back in to reconnect your account."
          : msg,
      );
    } finally {
      setComposeBusy(false);
    }
  }, [compose, sendComposeDraft, pushActivity]);

  const saveComposeDraft = useCallback(async () => {
    if (!compose) return;
    setComposeBusy(true);
    setComposeError(null);
    try {
      await saveDraftToGmail(client, compose, sessionRef.current.getEmail() ?? "");
      pushActivity(`Saved draft “${compose.subject || "(no subject)"}”`, "info");
      setCompose(null);
    } catch (err) {
      setComposeError(errorMessage(err));
    } finally {
      setComposeBusy(false);
    }
  }, [compose, client, pushActivity]);

  // ---- Quick Actions -----------------------------------------------------

  const persistQuickActions = useCallback((next: QuickAction[]) => {
    setQuickActionsState(next);
    saveQuickActions(next);
  }, []);

  // A compose step's template body, flattened to plain text.
  const templateBodyText = useCallback((templateId?: string): string => {
    if (!templateId) return "";
    const tpl = templatesRef.current.find((t) => t.id === templateId);
    return tpl ? htmlToText(tpl.body) : "";
  }, []);

  // Run a compose step once on the primary thread: open the composer prefilled,
  // or auto-send when it carries a template, the send flag, and recipients.
  const runComposeStep = useCallback(
    async (step: QuickStep, primaryId: string) => {
      const self = sessionRef.current.getEmail() ?? "";
      let draft: ComposeDraft;
      if (step.type === "newMail") {
        draft = blankDraft();
      } else {
        const open = readerRef.current;
        let original: ParsedMessage | undefined;
        if (open?.threadId === primaryId && open.messages.length > 0) {
          original = open.messages[open.messages.length - 1];
        } else {
          const thread = await client.getThread(primaryId);
          const msgs = (thread.messages ?? []).map(parseMessage);
          original = msgs[msgs.length - 1];
        }
        if (!original) return;
        const mode: ComposeMode =
          step.type === "replyAll" ? "replyAll" : step.type === "forward" ? "forward" : "reply";
        draft = draftFromMessage(mode, original, self);
      }
      const body = templateBodyText(step.templateId);
      if (body) draft = { ...draft, body: draft.mode === "new" ? body : `${body}\n${draft.body}` };
      if (step.sendWithoutReview && step.templateId && draft.to.trim()) {
        await sendComposeDraft(draft);
        pushActivity(`Sent “${draft.subject || "(no subject)"}”`, "success");
      } else {
        setComposeDraft(draft);
      }
    },
    [client, templateBodyText, sendComposeDraft, setComposeDraft, pushActivity],
  );

  // Run one mailbox step across every target id.
  const runMailboxStep = useCallback(
    async (step: QuickStep, ids: string[]) => {
      const settle = (work: (id: string) => Promise<unknown>) =>
        Promise.allSettled(ids.map((id) => work(id)));
      switch (step.type) {
        case "tag": {
          if (!step.value) return;
          await addTagToThreads(ids, await ensureTag(step.value));
          break;
        }
        case "untag": {
          const tag = tagsRef.current.find((t) => t.name.toLowerCase() === (step.value ?? "").toLowerCase());
          if (!tag) return;
          for (const id of ids) await setThreadTag(id, tag, false);
          break;
        }
        case "moveToFolder": {
          if (!step.value) return;
          await moveThreadsToFolder(ids, await ensureFolder(step.value));
          break;
        }
        case "archive":
          await settle((id) => client.archiveThread(id).then(() => removeRow(id)));
          break;
        case "delete":
          await settle((id) => client.trashThread(id).then(() => removeRow(id)));
          break;
        case "markRead":
          await settle((id) => markRead(id));
          break;
        case "markUnread":
          await settle((id) =>
            client.modifyThread(id, { addLabelIds: ["UNREAD"] }).then(() => {
              setRows((prev) => prev.map((r) => (r.id === id ? { ...r, unread: true } : r)));
            }),
          );
          break;
        case "star":
          await settle((id) => client.modifyThread(id, { addLabelIds: ["STARRED"] }));
          break;
        case "unstar":
          await settle((id) => client.modifyThread(id, { removeLabelIds: ["STARRED"] }));
          break;
        case "snooze": {
          const preset =
            SNOOZE_PRESETS.find((p) => p.label.toLowerCase() === (step.value ?? "").toLowerCase()) ??
            SNOOZE_PRESETS[0];
          const dueAt = dueAtFromPreset(preset);
          for (const id of ids) {
            const row = rowsRef.current.find((r) => r.id === id);
            await snooze(id, row?.subject ?? "(no subject)", dueAt);
          }
          break;
        }
        case "notifyWhenReplied": {
          const dueAt = Date.now() + 3 * 24 * 60 * 60 * 1000; // default 3-day window
          for (const id of ids) {
            const row = rowsRef.current.find((r) => r.id === id);
            await watch(id, row?.subject ?? "(no subject)", dueAt);
          }
          break;
        }
      }
    },
    [
      addTagToThreads,
      ensureTag,
      setThreadTag,
      moveThreadsToFolder,
      ensureFolder,
      client,
      removeRow,
      markRead,
      snooze,
      watch,
    ],
  );

  // Execute a Quick Action: target = selection if any, else the open email.
  // Mailbox steps hit all targets; a compose step runs once on the primary.
  // Steps run in order, continue-on-error, with a single Activity summary.
  const runQuickAction = useCallback(
    async (action: QuickAction) => {
      const targets =
        selectedIdsRef.current.size > 0
          ? [...selectedIdsRef.current]
          : readerRef.current?.threadId
            ? [readerRef.current.threadId]
            : [];
      if (targets.length === 0) {
        pushActivity(`“${action.name}” — select or open an email first`, "warn");
        return;
      }
      const primary = readerRef.current?.threadId ?? targets[0];
      let failed = 0;
      for (const step of action.steps) {
        try {
          if (isComposeStep(step.type)) await runComposeStep(step, primary);
          else await runMailboxStep(step, targets);
        } catch {
          failed += 1;
        }
      }
      if (failed > 0) pushActivity(`“${action.name}” — ${failed} step(s) failed`, "warn");
      else pushActivity(`Ran “${action.name}”`, "success");
    },
    [pushActivity, runComposeStep, runMailboxStep],
  );

  const runRulesNow = useCallback(() => runRulesInternal(false), [runRulesInternal]);

  const persistRules = useCallback((next: Rule[]) => {
    rulesRef.current = next;
    setRules(next);
    saveRules(next);
  }, []);

  const saveRule = useCallback(
    (rule: Rule) => {
      const exists = rulesRef.current.some((r) => r.id === rule.id);
      const next = exists
        ? rulesRef.current.map((r) => (r.id === rule.id ? rule : r))
        : [...rulesRef.current, rule];
      persistRules(next);
      pushActivity(exists ? `Updated rule “${rule.name}”` : `Created rule “${rule.name}”`, "info");
    },
    [persistRules, pushActivity],
  );

  const deleteRule = useCallback(
    (id: string) => {
      persistRules(rulesRef.current.filter((r) => r.id !== id));
    },
    [persistRules],
  );

  const toggleRule = useCallback(
    (id: string) => {
      persistRules(rulesRef.current.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
    },
    [persistRules],
  );

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
    // Mirror the change into the dedicated settings window (and vice-versa).
    broadcastSettings(next);
  }, []);

  // Apply settings changed in the dedicated settings window. Applying an
  // incoming value doesn't re-broadcast, so there's no echo loop.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;
    void onSettingsBroadcast((incoming) => {
      settingsRef.current = incoming;
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

  const value = useMemo<AugmentApi>(
    () => ({
      status,
      error,
      email,
      view,
      setView: changeView,
      folders,
      activeFolderId,
      createFolder,
      removeFolder,
      openFolder,
      rows: orderedRows,
      listTitle,
      inboxLoading,
      sortKey,
      sortDir,
      setSort,
      filterActive,
      applyListQuery,
      clearFilter,
      refresh,
      loadMore,
      hasMore,
      loadingMore,
      selectedIds,
      toggleSelected,
      selectRange,
      selectAll,
      clearSelection,
      archiveSelected,
      moveSelectedToFolder,
      moveThreadsToFolder,
      selectedId,
      reader,
      openThread,
      closeThread,
      schedule,
      rules,
      activity,
      busy,
      signIn,
      cancelSignIn,
      signOut,
      archiveThread,
      markRead,
      snooze,
      watch,
      cancelSchedule,
      openInGmail,
      runRulesNow,
      saveRule,
      deleteRule,
      toggleRule,
      templates,
      templatesLoading,
      refreshTemplates,
      saveTemplate,
      deleteTemplate,
      useTemplate,
      tags,
      activeTagId,
      openTag,
      createTag,
      updateTag,
      deleteTag,
      setThreadTag,
      addTagToThreads,
      triage,
      triaging,
      runTriageNow,
      suggestions,
      approveSuggestion,
      skipSuggestion,
      assistantOpen,
      setAssistantOpen,
      assistantMode,
      setAssistantMode,
      assistantMessages,
      assistantBusy,
      sendAssistantMessage,
      applyProposal,
      cancelProposal,
      clearAssistantChat,
      compose,
      composeBusy,
      composeError,
      canSend,
      composeNew,
      composeReply,
      updateCompose,
      closeCompose,
      sendCompose,
      saveComposeDraft,
      quickActions,
      persistQuickActions,
      runQuickAction,
      settings,
      updateSettings,
    }),
    [
      status,
      error,
      email,
      view,
      changeView,
      folders,
      activeFolderId,
      createFolder,
      removeFolder,
      openFolder,
      orderedRows,
      listTitle,
      inboxLoading,
      sortKey,
      sortDir,
      setSort,
      filterActive,
      applyListQuery,
      clearFilter,
      refresh,
      loadMore,
      hasMore,
      loadingMore,
      selectedIds,
      toggleSelected,
      selectRange,
      selectAll,
      clearSelection,
      archiveSelected,
      moveSelectedToFolder,
      moveThreadsToFolder,
      selectedId,
      reader,
      schedule,
      rules,
      activity,
      busy,
      signIn,
      cancelSignIn,
      signOut,
      openThread,
      closeThread,
      archiveThread,
      markRead,
      snooze,
      watch,
      cancelSchedule,
      openInGmail,
      runRulesNow,
      saveRule,
      deleteRule,
      toggleRule,
      templates,
      templatesLoading,
      refreshTemplates,
      saveTemplate,
      deleteTemplate,
      useTemplate,
      tags,
      activeTagId,
      openTag,
      createTag,
      updateTag,
      deleteTag,
      setThreadTag,
      addTagToThreads,
      triage,
      triaging,
      runTriageNow,
      suggestions,
      approveSuggestion,
      skipSuggestion,
      assistantOpen,
      assistantMode,
      setAssistantMode,
      assistantMessages,
      assistantBusy,
      sendAssistantMessage,
      applyProposal,
      cancelProposal,
      clearAssistantChat,
      compose,
      composeBusy,
      composeError,
      canSend,
      composeNew,
      composeReply,
      updateCompose,
      closeCompose,
      sendCompose,
      saveComposeDraft,
      quickActions,
      persistQuickActions,
      runQuickAction,
      settings,
      updateSettings,
    ],
  );

  return <AugmentContext.Provider value={value}>{children}</AugmentContext.Provider>;
}

export function useAugment(): AugmentApi {
  const ctx = useContext(AugmentContext);
  if (!ctx) throw new Error("useAugment must be used inside <AugmentProvider>");
  return ctx;
}
