import { useEffect, useState, type MouseEvent, type UIEvent } from "react";
import { useAugment } from "../state/augment";
import { addressLabel } from "../lib/gmail/parse";
import { dueAtFromPreset, formatListDate, SNOOZE_PRESETS, WATCH_PRESETS } from "../lib/time";
import type { ThreadRow } from "../lib/gmail/inbox";
import type { Folder } from "../lib/store";
import { ThreadReader } from "./ThreadReader";
import { ContextMenu, type MenuNode } from "./ContextMenu";
import { useClickOutside } from "./hooks";
import {
  ArchiveIcon,
  CheckIcon,
  ClockIcon,
  ExternalIcon,
  EyeIcon,
  FolderIcon,
  MailIcon,
  RefreshIcon,
} from "./icons";

// Dropdown in the selection toolbar that files the selected threads into a
// folder. Reuses the shared `.menu` popover styling.
function MoveMenu() {
  const { folders, moveSelectedToFolder, busy } = useAugment();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  return (
    <div className="menu" ref={ref}>
      <button
        className="action-btn"
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!!busy}
      >
        <FolderIcon size={14} />
        <span>Move to</span>
      </button>
      {open && (
        <div className="menu-pop menu-pop-right" role="menu">
          {folders.length === 0 && <div className="menu-empty">No folders yet</div>}
          {folders.map((folder) => (
            <button
              key={folder.id}
              className="menu-item"
              role="menuitem"
              type="button"
              onClick={() => {
                void moveSelectedToFolder(folder);
                setOpen(false);
              }}
            >
              {folder.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function InboxView() {
  const {
    rows,
    listTitle,
    view,
    inboxLoading,
    selectedId,
    openThread,
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
    archiveThread,
    markRead,
    snooze,
    watch,
    openInGmail,
    moveSelectedToFolder,
    moveThreadsToFolder,
    folders,
    busy,
  } = useAugment();

  // Right-click context menu: position + the row it targets.
  const [menu, setMenu] = useState<{ x: number; y: number; row: ThreadRow } | null>(null);

  // Infinite scroll: pull the next page as the list nears the bottom.
  function onScroll(event: UIEvent<HTMLDivElement>) {
    if (!hasMore || loadingMore) return;
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 280) {
      void loadMore();
    }
  }

  function folderTargets(onPick: (folder: Folder) => void): MenuNode[] {
    if (folders.length === 0) {
      return [{ kind: "item", label: "No folders yet", disabled: true, onSelect: () => {} }];
    }
    return folders.map((folder) => ({
      kind: "item",
      label: folder.name,
      onSelect: () => onPick(folder),
    }));
  }

  // Build the menu for a right-clicked row. If the row is part of a multi-
  // selection, the actions apply to the whole selection; otherwise to that row.
  function menuItems(row: ThreadRow): MenuNode[] {
    const bulk = selectedIds.has(row.id) && selectedIds.size > 1;
    if (bulk) {
      const n = selectedIds.size;
      return [
        { kind: "item", label: `Archive ${n}`, icon: <ArchiveIcon size={15} />, onSelect: () => void archiveSelected() },
        {
          kind: "submenu",
          label: `Move ${n} to folder`,
          icon: <FolderIcon size={15} />,
          items: folderTargets((folder) => void moveSelectedToFolder(folder)),
        },
        { kind: "separator" },
        { kind: "item", label: "Clear selection", onSelect: clearSelection },
      ];
    }

    const items: MenuNode[] = [
      { kind: "item", label: "Open", icon: <MailIcon size={15} />, onSelect: () => void openThread(row.id) },
      { kind: "separator" },
      { kind: "item", label: "Archive", icon: <ArchiveIcon size={15} />, onSelect: () => void archiveThread(row.id) },
    ];
    if (row.unread) {
      items.push({ kind: "item", label: "Mark as read", icon: <CheckIcon size={15} />, onSelect: () => void markRead(row.id) });
    }
    items.push(
      {
        kind: "submenu",
        label: "Snooze",
        icon: <ClockIcon size={15} />,
        items: SNOOZE_PRESETS.map((preset) => ({
          kind: "item",
          label: preset.label,
          onSelect: () => void snooze(row.id, row.subject, dueAtFromPreset(preset)),
        })),
      },
      {
        kind: "submenu",
        label: "Watch for reply",
        icon: <EyeIcon size={15} />,
        items: WATCH_PRESETS.map((preset) => ({
          kind: "item",
          label: preset.label,
          onSelect: () => void watch(row.id, row.subject, dueAtFromPreset(preset)),
        })),
      },
      {
        kind: "submenu",
        label: "Move to folder",
        icon: <FolderIcon size={15} />,
        items: folderTargets((folder) => void moveThreadsToFolder([row.id], folder)),
      },
      { kind: "separator" },
      { kind: "item", label: "Open in Gmail", icon: <ExternalIcon size={15} />, onSelect: () => void openInGmail(row.id) },
    );
    return items;
  }

  function onRowContextMenu(event: MouseEvent, row: ThreadRow) {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, row });
  }

  // Cmd/Ctrl+A selects every inbox row; Escape clears the selection. We skip
  // the shortcut while the user is typing or has focus inside the reader, so
  // native "select all text" still works there.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && (event.key === "a" || event.key === "A")) {
        const target = event.target as HTMLElement | null;
        if (target?.closest('input, textarea, [contenteditable="true"], .reader')) return;
        event.preventDefault();
        selectAll();
      } else if (event.key === "Escape" && selectedIds.size > 0) {
        clearSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectAll, clearSelection, selectedIds.size]);

  return (
    <div className="inbox">
      <div className="list">
        <div className="list-head">
          <h2>{listTitle}</h2>
          <button
            className="icon-btn"
            onClick={() => void refresh()}
            disabled={inboxLoading}
            title="Refresh"
            type="button"
          >
            <RefreshIcon size={16} className={inboxLoading ? "spin" : undefined} />
          </button>
        </div>

        {selectedIds.size > 0 && (
          <div className="select-bar">
            <span className="select-bar-count">{selectedIds.size} selected</span>
            <div className="select-bar-actions">
              <MoveMenu />
              <button
                className="action-btn"
                type="button"
                onClick={() => void archiveSelected()}
                disabled={!!busy}
              >
                <ArchiveIcon size={14} />
                <span>Archive</span>
              </button>
              <button className="select-bar-clear" type="button" onClick={clearSelection}>
                Clear
              </button>
            </div>
          </div>
        )}

        <div className="list-scroll" onScroll={onScroll}>
          {rows.length === 0 && inboxLoading && <div className="list-empty">Loading…</div>}
          {rows.length === 0 && !inboxLoading && (
            <div className="list-empty">
              {view === "folder" ? "This folder is empty." : "Inbox zero. 🎉"}
            </div>
          )}

          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`row ${row.id === selectedId ? "row-active" : ""} ${
                selectedIds.has(row.id) ? "row-selected" : ""
              } ${row.unread ? "row-unread" : ""}`}
              onClick={(event) => {
                if (event.shiftKey) {
                  selectRange(row.id);
                  return;
                }
                if (event.metaKey || event.ctrlKey) {
                  toggleSelected(row.id);
                  return;
                }
                void openThread(row.id);
              }}
              onContextMenu={(event) => onRowContextMenu(event, row)}
            >
              <div className="row-top">
                <span className="row-from">{addressLabel(row.from)}</span>
                <span className="row-date">{formatListDate(row.date)}</span>
              </div>
              <div className="row-subject">
                {row.unread && <span className="row-dot" aria-label="unread" />}
                {row.subject}
                {row.messageCount > 1 && <span className="row-count">{row.messageCount}</span>}
              </div>
              <div className="row-snippet">{row.snippet}</div>
            </button>
          ))}

          {loadingMore && <div className="list-more">Loading more…</div>}
          {hasMore && !loadingMore && (
            <button className="list-more-btn" type="button" onClick={() => void loadMore()}>
              Load more
            </button>
          )}
        </div>
      </div>

      <ThreadReader />

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.row)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
