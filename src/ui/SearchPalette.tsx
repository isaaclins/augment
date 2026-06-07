// ⌘K command palette. Runs Quick Actions (on the current target) and searches
// mail. Instant metadata search always; full-text body search once the
// SQLite/FTS5 index is built. Keyboard-first: type to filter, ↑/↓ to move, ↵ to
// run/open, esc to close. Opening a result re-fetches the full thread.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useAugment } from "../state/augment";
import { searchEngine, type EngineStatus } from "../lib/search/engine";
import { addressLabel } from "../lib/gmail/parse";
import { formatListDate } from "../lib/time";
import { formatCombo } from "../lib/keybinds";
import type { ThreadRow } from "../lib/gmail/inbox";
import type { QuickAction } from "../lib/quickActions";
import { BoltIcon, SearchIcon } from "./icons";

type PaletteItem =
  | { kind: "action"; action: QuickAction }
  | { kind: "thread"; row: ThreadRow };

export function SearchPalette() {
  const { openThread, setView, quickActions, runQuickAction } = useAugment();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<ThreadRow[]>([]);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void searchEngine.init();
    return searchEngine.subscribe(setStatus);
  }, []);

  // ⌘/Ctrl+K toggles the palette from anywhere.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  // Run the (async) mail search; ignore results that arrive after a newer query.
  useEffect(() => {
    if (!open) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void searchEngine.search(query, 50).then((rows) => {
      if (!cancelled) setResults(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, query]);

  // Quick Actions whose name matches (all of them when the query is empty).
  const actionMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? quickActions.filter((a) => a.name.toLowerCase().includes(q)) : quickActions;
  }, [query, quickActions]);

  const items = useMemo<PaletteItem[]>(
    () => [
      ...actionMatches.map((action) => ({ kind: "action" as const, action })),
      ...results.map((row) => ({ kind: "thread" as const, row })),
    ],
    [actionMatches, results],
  );

  useEffect(() => {
    setActive((value) => Math.min(value, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(item: PaletteItem) {
    if (item.kind === "action") {
      setOpen(false);
      void runQuickAction(item.action);
      return;
    }
    setView("inbox");
    void openThread(item.row.id);
    setOpen(false);
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(value + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (item) choose(item);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  if (!open) return null;

  const indexed = searchEngine.indexedCount();
  const emptyMessage =
    indexed === 0
      ? "Open your inbox to start indexing mail."
      : query
        ? "No matches."
        : "Type to search — try from:, subject:, body:, is:unread";

  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input-row">
          <SearchIcon size={16} />
          <input
            autoFocus
            className="palette-input"
            placeholder={status?.ftsReady ? "Run an action or search your mail…" : "Run an action or search…"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <kbd className="palette-esc">esc</kbd>
        </div>

        <div className="palette-results" ref={listRef}>
          {items.length === 0 ? (
            <div className="palette-empty">{emptyMessage}</div>
          ) : (
            items.map((item, i) =>
              item.kind === "action" ? (
                <button
                  key={`a-${item.action.id}`}
                  type="button"
                  data-i={i}
                  className={`palette-row palette-action ${i === active ? "palette-row-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                >
                  <span className="palette-action-icon">
                    <BoltIcon size={15} />
                  </span>
                  <span className="palette-action-name">{item.action.name}</span>
                  {item.action.shortcut && (
                    <kbd className="nav-shortcut">{formatCombo(item.action.shortcut)}</kbd>
                  )}
                </button>
              ) : (
                <button
                  key={`t-${item.row.id}`}
                  type="button"
                  data-i={i}
                  className={`palette-row ${i === active ? "palette-row-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                >
                  <div className="palette-row-top">
                    <span className="palette-from">{addressLabel(item.row.from)}</span>
                    <span className="palette-date">{formatListDate(item.row.date)}</span>
                  </div>
                  <div className="palette-subject">
                    {item.row.unread && <span className="row-dot" aria-label="unread" />}
                    {item.row.subject || "(no subject)"}
                  </div>
                  {item.row.snippet && <div className="palette-snippet">{item.row.snippet}</div>}
                </button>
              ),
            )
          )}
        </div>

        <div className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> run / open
          </span>
          <span className="palette-count">
            {status?.ftsReady ? <FtsControl status={status} /> : `${indexed} indexed`}
          </span>
        </div>
      </div>
    </div>
  );
}

function FtsControl({ status }: { status: EngineStatus }) {
  if (status.backfilling) {
    return (
      <>
        <span>Indexing… {status.scanned}</span>
        <button
          type="button"
          className="palette-link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => searchEngine.stopBackfill()}
        >
          stop
        </button>
      </>
    );
  }
  if (status.complete) {
    return <span>{status.withBody} full-text · synced</span>;
  }
  return (
    <button
      type="button"
      className="palette-link"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void searchEngine.backfill()}
    >
      {status.withBody > 0 ? `${status.withBody} full-text · build full index` : "Build full-text index"}
    </button>
  );
}
