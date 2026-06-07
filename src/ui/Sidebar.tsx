import { useState } from "react";
import { useAugment, type View } from "../state/augment";
import { formatRelative } from "../lib/time";
import { formatCombo } from "../lib/keybinds";
import type { Tag } from "../lib/tags";
import { openSettingsWindow } from "../lib/window";
import { TagGlyph } from "./tags";
import { TagEditor } from "./TagEditor";
import {
  BoltIcon,
  ClockIcon,
  CloseIcon,
  EyeIcon,
  FileIcon,
  FolderIcon,
  InboxIcon,
  MailIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  SlidersIcon,
  SparkleIcon,
} from "./icons";
import type { ReactNode } from "react";

interface NavItem {
  id: View;
  label: string;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  { id: "inbox", label: "Inbox", icon: <InboxIcon size={17} /> },
  { id: "snoozed", label: "Snoozed", icon: <ClockIcon size={17} /> },
  { id: "watching", label: "Watching", icon: <EyeIcon size={17} /> },
  { id: "rules", label: "Rules", icon: <SlidersIcon size={17} /> },
  { id: "templates", label: "Templates", icon: <FileIcon size={17} /> },
  { id: "quickActions", label: "Quick Actions", icon: <BoltIcon size={17} /> },
];

export function Sidebar() {
  const {
    view,
    setView,
    email,
    signOut,
    schedule,
    rules,
    activity,
    folders,
    activeFolderId,
    createFolder,
    removeFolder,
    openFolder,
    tags,
    activeTagId,
    openTag,
    deleteTag,
    settings,
  } = useAugment();

  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  // Open tag editor: { tag: null } for a new tag, { tag } to edit an existing one.
  const [tagEditor, setTagEditor] = useState<{ tag: Tag | null } | null>(null);

  const counts: Record<string, number | null> = {
    inbox: null,
    snoozed: schedule.filter((s) => s.kind === "snooze").length,
    watching: schedule.filter((s) => s.kind === "watch").length,
    rules: rules.filter((r) => r.enabled).length,
  };

  function submitFolder() {
    void createFolder(draftName);
    setDraftName("");
    setAdding(false);
  }

  function cancelFolder() {
    setDraftName("");
    setAdding(false);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <MailIcon size={18} />
        </div>
        <span>Augment</span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((item) => {
          const shortcut = (settings.keybinds as Record<string, string | undefined>)[item.id];
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${view === item.id ? "nav-item-active" : ""}`}
              onClick={() => setView(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {counts[item.id] ? <span className="nav-count">{counts[item.id]}</span> : null}
              {shortcut ? <kbd className="nav-shortcut">{formatCombo(shortcut)}</kbd> : null}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-folders">
        <div className="sidebar-section-head">
          <span>Folders</span>
          <button
            type="button"
            className="section-add"
            title="New folder"
            onClick={() => setAdding((v) => !v)}
          >
            <PlusIcon size={14} />
          </button>
        </div>

        {adding && (
          <input
            className="folder-input"
            autoFocus
            value={draftName}
            placeholder="Folder name"
            maxLength={60}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitFolder();
              else if (event.key === "Escape") cancelFolder();
            }}
            onBlur={cancelFolder}
          />
        )}

        <div className="folder-list">
          {folders.length === 0 && !adding && (
            <div className="folder-empty">No folders yet.</div>
          )}
          {folders.map((folder) => {
            const active = view === "folder" && activeFolderId === folder.id;
            return (
              <div className="folder-row" key={folder.id}>
                <button
                  type="button"
                  className={`nav-item folder-item ${active ? "nav-item-active" : ""}`}
                  onClick={() => openFolder(folder)}
                >
                  <span className="nav-icon">
                    <FolderIcon size={16} />
                  </span>
                  <span className="nav-label">{folder.name}</span>
                </button>
                <button
                  type="button"
                  className="folder-remove"
                  title="Remove folder"
                  onClick={() => removeFolder(folder.id)}
                >
                  <CloseIcon size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sidebar-tags">
        <div className="sidebar-section-head">
          <span>Tags</span>
          <button
            type="button"
            className="section-add"
            title="New tag"
            onClick={() => setTagEditor({ tag: null })}
          >
            <PlusIcon size={14} />
          </button>
        </div>

        <div className="tag-list">
          {tags.length === 0 && <div className="folder-empty">No tags yet.</div>}
          {tags.map((tag) => {
            const active = view === "tag" && activeTagId === tag.id;
            return (
              <div className="folder-row tag-row" key={tag.id}>
                <button
                  type="button"
                  className={`nav-item folder-item tag-item ${active ? "nav-item-active" : ""}`}
                  onClick={() => openTag(tag)}
                >
                  <span className="nav-icon">
                    <TagGlyph color={tag.color} icon={tag.icon} size={16} />
                  </span>
                  <span className="nav-label">{tag.name}</span>
                  {tag.source === "auto" && (
                    <SparkleIcon size={11} className="tag-auto-mark" />
                  )}
                </button>
                <div className="tag-row-actions">
                  <button
                    type="button"
                    className="tag-action"
                    title="Edit tag"
                    onClick={() => setTagEditor({ tag })}
                  >
                    <PencilIcon size={13} />
                  </button>
                  <button
                    type="button"
                    className="tag-action tag-action-del"
                    title="Remove tag"
                    onClick={() => deleteTag(tag.id)}
                  >
                    <CloseIcon size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sidebar-activity">
        <div className="sidebar-activity-head">Activity</div>
        <div className="sidebar-activity-list">
          {activity.length === 0 && <div className="activity-empty">Nothing yet.</div>}
          {activity.slice(0, 6).map((entry) => (
            <div key={entry.id} className={`activity-row activity-${entry.tone}`}>
              <span className="activity-dot" />
              <span className="activity-text">{entry.text}</span>
              <span className="activity-time">{formatRelative(entry.ts)}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="nav-item sidebar-settings"
        title="Open settings"
        onClick={() => void openSettingsWindow()}
      >
        <span className="nav-icon">
          <SettingsIcon size={17} />
        </span>
        <span className="nav-label">Settings</span>
        <kbd className="nav-shortcut">{formatCombo("mod+,")}</kbd>
      </button>

      <div className="sidebar-account">
        <div className="account-email" title={email ?? ""}>
          {email ?? "Not signed in"}
        </div>
        <button className="link-btn" type="button" onClick={signOut}>
          Sign out
        </button>
      </div>

      {tagEditor && <TagEditor initial={tagEditor.tag} onClose={() => setTagEditor(null)} />}
    </aside>
  );
}
