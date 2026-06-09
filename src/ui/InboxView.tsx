import { useEffect, useState, type MouseEvent, type UIEvent } from "react";
import { useAugment } from "../state/augment";
import { addressLabel } from "../lib/gmail/parse";
import { dueAtFromPreset, formatListDate, SNOOZE_PRESETS, WATCH_PRESETS } from "../lib/time";
import type { ThreadRow } from "../lib/gmail/inbox";
import type { Folder } from "../lib/store";
import { ThreadReader } from "./ThreadReader";
import { ContextMenu, type MenuNode } from "./ContextMenu";
import { TagChip, TagGlyph } from "./tags";
import { CategoryChip, PriorityPill } from "./triage";
import { Avatar } from "./Avatar";
import { useClickOutside } from "./hooks";
import { SORT_OPTIONS, type SortKey } from "../lib/features/view";
import {
  ArchiveIcon,
  BoltIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  ExternalIcon,
  EyeIcon,
  FolderIcon,
  MailIcon,
  PencilIcon,
  RefreshIcon,
  SendIcon,
  SparkleIcon,
  TagIcon,
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

// Skeleton placeholder shown while the first page of mail loads. Mirrors the
// row shape (avatar + three lines) so the layout doesn't jump when real rows
// arrive. Decorative, so it's hidden from assistive tech.
function InboxSkeleton() {
  return (
    <div className="skeleton" aria-hidden>
      {Array.from({ length: 7 }).map((_, i) => (
        <div className="skel-row" key={i}>
          <div className="skel-avatar" />
          <div className="skel-body">
            <div className="skel-line skel-line-sm" />
            <div className="skel-line skel-line-lg" />
            <div className="skel-line skel-line-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InboxView() {
  const {
    rows,
    listTitle,
    view,
    inboxLoading,
    sortKey,
    sortDir,
    setSort,
    filterActive,
    clearFilter,
    selectedId,
    openThread,
    closeThread,
    editDraft,
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
    tags,
    setThreadTag,
    addTagToThreads,
    triage,
    suggestions,
    approveSuggestion,
    assistantOpen,
    setAssistantOpen,
    composeNew,
    quickActions,
    runQuickAction,
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

  // The "Quick Actions ▸" submenu, run against the given thread ids.
  function quickActionItems(ids: string[]): MenuNode[] {
    if (quickActions.length === 0) {
      return [{ kind: "item", label: "No quick actions", disabled: true, onSelect: () => {} }];
    }
    return quickActions.map((qa) => ({
      kind: "item",
      label: qa.name,
      onSelect: () => void runQuickAction(qa, ids),
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
        {
          kind: "submenu",
          label: `Tag ${n}`,
          icon: <TagIcon size={15} />,
          items:
            tags.length === 0
              ? [{ kind: "item", label: "No tags yet", disabled: true, onSelect: () => {} }]
              : tags.map((tag) => ({
                  kind: "item",
                  label: tag.name,
                  icon: <TagGlyph color={tag.color} icon={tag.icon} size={15} />,
                  onSelect: () => void addTagToThreads([...selectedIds], tag),
                })),
        },
        {
          kind: "submenu",
          label: "Quick Actions",
          icon: <BoltIcon size={15} />,
          items: quickActionItems([...selectedIds]),
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
          onSelect: () => void watch(row.id, row.subject, dueAtFromPreset(preset), preset.indefinite),
        })),
      },
      {
        kind: "submenu",
        label: "Move to folder",
        icon: <FolderIcon size={15} />,
        items: folderTargets((folder) => void moveThreadsToFolder([row.id], folder)),
      },
      {
        kind: "submenu",
        label: "Tag",
        icon: <TagIcon size={15} />,
        items:
          tags.length === 0
            ? [{ kind: "item", label: "No tags yet", disabled: true, onSelect: () => {} }]
            : tags.map((tag) => {
                const applied = row.labelIds.includes(tag.labelId);
                return {
                  kind: "item",
                  label: `${applied ? "✓ " : ""}${tag.name}`,
                  icon: <TagGlyph color={tag.color} icon={tag.icon} size={15} />,
                  onSelect: () => void setThreadTag(row.id, tag, !applied),
                };
              }),
      },
      {
        kind: "submenu",
        label: "Quick Actions",
        icon: <BoltIcon size={15} />,
        items: quickActionItems([row.id]),
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
      } else if (event.key === "Escape") {
        const target = event.target as HTMLElement | null;
        // Let inline editors handle their own Escape (blur, cancel).
        if (target?.closest('input, textarea, [contenteditable="true"]')) return;
        // Let a foreground modal/overlay own Escape (composer, context menu).
        if (document.querySelector(".modal-backdrop, .context-menu")) return;
        if (selectedIds.size > 0) {
          clearSelection();
        } else if (selectedId) {
          closeThread();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectAll, clearSelection, closeThread, selectedId, selectedIds.size]);

  return (
    <div className="inbox">
      <div className="list">
        <div className="list-head">
          <div className="list-head-title">
            <h2>{listTitle}</h2>
            {filterActive && (
              <button
                className="filter-clear"
                type="button"
                onClick={clearFilter}
                title="Clear filter"
              >
                <CloseIcon size={12} /> Clear filter
              </button>
            )}
          </div>
          <div className="list-head-actions">
            <button className="icon-btn" type="button" title="New message" onClick={composeNew}>
              <PencilIcon size={16} />
            </button>
            <select
              className="select sort-select"
              value={sortKey}
              title="Sort"
              onChange={(event) => setSort(event.target.value as SortKey)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className="icon-btn sort-dir"
              type="button"
              title={sortDir === "asc" ? "Ascending" : "Descending"}
              onClick={() => setSort(sortKey, sortDir === "asc" ? "desc" : "asc")}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
            <button
              className={`icon-btn assistant-toggle ${assistantOpen ? "is-active" : ""}`}
              onClick={() => setAssistantOpen(!assistantOpen)}
              title="Assistant"
              type="button"
            >
              <SparkleIcon size={16} />
              {suggestions.length > 0 && (
                <span className="assistant-badge">{suggestions.length}</span>
              )}
            </button>
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
          {rows.length === 0 && inboxLoading && <InboxSkeleton />}
          {rows.length === 0 && !inboxLoading && (
            <div className="empty-state">
              <span className="empty-state-icon">
                {view === "folder" ? (
                  <FolderIcon size={24} />
                ) : view === "tag" ? (
                  <TagIcon size={24} />
                ) : view === "sent" ? (
                  <SendIcon size={24} />
                ) : view === "drafts" ? (
                  <PencilIcon size={24} />
                ) : (
                  <MailIcon size={24} />
                )}
              </span>
              <p className="empty-state-title">
                {view === "folder"
                  ? "Empty folder"
                  : view === "tag"
                    ? "No tagged mail"
                    : view === "sent"
                      ? "Nothing sent yet"
                      : view === "drafts"
                        ? "No drafts"
                        : "Inbox zero"}
              </p>
              <p className="empty-state-text">
                {view === "folder"
                  ? "Nothing filed here yet. Move threads in from the inbox."
                  : view === "tag"
                    ? "Tag a thread and it will show up here."
                    : view === "sent"
                      ? "Mail you send from Augment will appear here."
                      : view === "drafts"
                        ? "Messages you save as drafts will appear here."
                        : "You are all caught up. New mail lands here."}
              </p>
            </div>
          )}

          {rows.map((row) => {
            const rowTags = tags.filter((t) => row.labelIds.includes(t.labelId));
            const rowTriage = triage[row.id];
            const catName = rowTriage?.category;
            const catTag = catName
              ? tags.find((t) => t.name.toLowerCase() === catName.toLowerCase())
              : undefined;
            // Show the AI's label as a chip unless it's the "Other" fallback or
            // already applied as a tag (the real TagChip below covers that case).
            const showCat =
              Boolean(catName) &&
              catName!.toLowerCase() !== "other" &&
              !(catTag && row.labelIds.includes(catTag.labelId));
            const isDraft = row.labelIds.includes("DRAFT");
            return (
              <button
                key={row.id}
                type="button"
                className={`row ${row.id === selectedId ? "row-active" : ""} ${
                  selectedIds.has(row.id) ? "row-selected" : ""
                } ${row.unread ? "row-unread" : ""} ${isDraft ? "row-draft" : ""}`}
                onClick={(event) => {
                  if (event.shiftKey) {
                    selectRange(row.id);
                    return;
                  }
                  if (event.metaKey || event.ctrlKey) {
                    toggleSelected(row.id);
                    return;
                  }
                  if (isDraft) {
                    void editDraft(row.id);
                    return;
                  }
                  void openThread(row.id);
                }}
                onContextMenu={(event) => onRowContextMenu(event, row)}
              >
                <span className="row-avatar">
                  <Avatar from={row.from} size={32} />
                </span>
                <div className="row-body">
                  <div className="row-top">
                    <span className="row-from">
                      {isDraft && <span className="row-draft-badge">DRAFT</span>}
                      {addressLabel(row.from) || (isDraft ? "(no recipient)" : "")}
                    </span>
                    <span className="row-date">{formatListDate(row.date)}</span>
                  </div>
                  <div className="row-subject">
                    {row.unread && <span className="row-dot" aria-label="unread" />}
                    {row.subject}
                    {row.messageCount > 1 && <span className="row-count">{row.messageCount}</span>}
                  </div>
                  <div className="row-snippet">{row.snippet}</div>
                  {rowTriage?.summary && (
                    <div className="row-summary">
                      <SparkleIcon size={12} />
                      <span>{rowTriage.summary}</span>
                    </div>
                  )}
                  {(rowTriage || rowTags.length > 0) && (
                    <div className="row-tags">
                      {showCat && catName && (
                        <CategoryChip
                          name={catName}
                          tag={catTag}
                          onApprove={catTag ? undefined : () => void approveSuggestion(catName)}
                        />
                      )}
                      {rowTriage && <PriorityPill priority={rowTriage.priority} />}
                      {rowTags.map((tag) => (
                        <TagChip key={tag.id} tag={tag} />
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}

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
