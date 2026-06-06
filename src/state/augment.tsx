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

import { clearStoredSession, refreshAccessToken, startOAuth } from "../lib/auth/commands";
import { Session } from "../lib/auth/session";
import { GmailClient } from "../lib/gmail/client";
import { loadLatestMessages, loadThreadRows, type ThreadRow } from "../lib/gmail/inbox";
import { parseMessage, type ParsedMessage } from "../lib/gmail/parse";
import { runRules } from "../lib/rules/apply";
import type { Rule } from "../lib/rules/types";
import {
  handleScheduleDue,
  snoozeThread as snoozeThreadFeature,
  watchThread as watchThreadFeature,
} from "../lib/features/schedule";
import {
  onScheduleDue,
  scheduleList,
  scheduleRemove,
  type ScheduleItem,
} from "../lib/scheduler/api";
import {
  DEFAULT_SETTINGS,
  loadFolders,
  loadRules,
  loadSettings,
  saveFolders,
  saveRules,
  saveSettings,
  type Folder,
  type Settings,
} from "../lib/store";

export type Status = "restoring" | "signedOut" | "authenticating" | "ready" | "error";
export type View = "inbox" | "snoozed" | "watching" | "rules" | "folder";

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

export function AugmentProvider({ children }: { children: ReactNode }): ReactElement {
  const sessionRef = useRef(new Session());
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const rulesRef = useRef<Rule[]>([]);
  const handlingRef = useRef<Set<string>>(new Set());

  // Start in "restoring" while we attempt to revive a persisted session; the
  // mount effect below resolves it to "ready" or "signedOut".
  const [status, setStatus] = useState<Status>("restoring");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [view, setViewState] = useState<View>("inbox");

  const [folders, setFolders] = useState<Folder[]>(() => loadFolders());
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

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

  // Mirror reactive state into refs the long-lived callbacks/listeners read.
  settingsRef.current = settings;
  rulesRef.current = rules;

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
  }, [refreshInbox, refreshSchedule, runRulesInternal]);

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

  const signIn = useCallback(async () => {
    setStatus("authenticating");
    setError(null);
    try {
      const result = await startOAuth();
      sessionRef.current.setTokens(result);
      const profile = await client.getProfile();
      sessionRef.current.setEmail(profile.emailAddress);
      setEmail(profile.emailAddress);
      setStatus("ready");
      pushActivity(`Signed in as ${profile.emailAddress}`, "success");
      await refresh();
    } catch (err) {
      sessionRef.current.clear();
      setStatus("error");
      setError(errorMessage(err));
    }
  }, [client, pushActivity, refresh]);

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
    setListTitle("Inbox");
    listQueryRef.current = "in:inbox";
    setViewState("inbox");
    nextPageTokenRef.current = undefined;
    setHasMore(false);
    setLoadingMore(false);
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
      const toIndex = rows.findIndex((r) => r.id === id);
      if (toIndex === -1) return;
      const anchor = selectionAnchorRef.current;
      const fromIndex = anchor ? rows.findIndex((r) => r.id === anchor) : -1;
      if (fromIndex === -1) {
        selectionAnchorRef.current = id;
        setSelectedIds((prev) => new Set(prev).add(id));
        return;
      }
      const lo = Math.min(fromIndex, toIndex);
      const hi = Math.max(fromIndex, toIndex);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i += 1) next.add(rows[i].id);
        return next;
      });
    },
    [rows],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(rows.map((r) => r.id)));
  }, [rows]);

  const clearSelection = useCallback(() => {
    selectionAnchorRef.current = null;
    setSelectedIds(new Set());
  }, []);

  // Switch the main view. Navigating to the inbox reloads it (rows may still
  // hold a folder's mail); the snoozed/watching/rules panels read their own
  // data and don't touch the mail list.
  const changeView = useCallback(
    (next: View) => {
      if (next === "inbox") {
        setActiveFolderId(null);
        listQueryRef.current = "in:inbox";
        setListTitle("Inbox");
        clearSelection();
        setViewState("inbox");
        void refreshInbox();
        return;
      }
      if (next !== "folder") setActiveFolderId(null);
      setViewState(next);
    },
    [clearSelection, refreshInbox],
  );

  const openFolder = useCallback(
    (folder: Folder) => {
      setActiveFolderId(folder.id);
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
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
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
      rows,
      listTitle,
      inboxLoading,
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
      rows,
      listTitle,
      inboxLoading,
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
