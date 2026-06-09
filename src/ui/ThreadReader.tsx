import { useEffect, useState, type ReactNode } from "react";
import { useAugment } from "../state/augment";
import { addressLabel, type ParsedMessage } from "../lib/gmail/parse";
import { formatDateTime, formatRelative } from "../lib/time";
import { SNOOZE_PRESETS, WATCH_PRESETS } from "../lib/time";
import { formatCombo } from "../lib/keybinds";
import { EmailView } from "./EmailView";
import { DurationMenu } from "./DurationMenu";
import { Avatar } from "./Avatar";
import { useClickOutside } from "./hooks";
import {
  ArchiveIcon,
  ClockIcon,
  CloseIcon,
  EyeIcon,
  InboxIcon,
  MailIcon,
  PencilIcon,
  SparkleIcon,
} from "./icons";

// The "⋯" overflow for secondary reader actions (Reply all / Forward / Open in
// Gmail) so the bar leads with the triage actions (UI-AUDIT H3).
function OverflowMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  return (
    <div className="menu reader-overflow" ref={ref}>
      <button
        className="action-btn"
        type="button"
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>⋯</span>
      </button>
      {open && (
        <div className="menu-pop menu-pop-right" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function MessageRail({
  messages,
  activeIndex,
  onSelect,
}: {
  messages: ParsedMessage[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (messages.length <= 1) return null;
  return (
    <div className="reader-rail">
      {messages.map((message, index) => (
        <button
          key={message.id}
          type="button"
          className={`rail-item ${index === activeIndex ? "rail-item-active" : ""}`}
          onClick={() => onSelect(index)}
        >
          <Avatar from={message.from} size={18} />
          <span className="rail-from">{addressLabel(message.from)}</span>
          <span className="rail-date">{formatDateTime(message.internalDate)}</span>
        </button>
      ))}
    </div>
  );
}

export function ThreadReader() {
  const { reader, selectedId, archiveThread, snooze, watch, openInGmail, closeThread, composeReply, settings, updateSettings } =
    useAugment();
  const [activeIndex, setActiveIndex] = useState(0);
  // Remote content is opt-in. "Allow these" turns it on for the current message
  // this session; switching message or thread resets it.
  const [allowOnce, setAllowOnce] = useState(false);

  const threadId = reader?.threadId;
  useEffect(() => {
    setActiveIndex(0);
  }, [threadId]);
  useEffect(() => {
    setAllowOnce(false);
  }, [threadId, activeIndex]);

  if (!selectedId) {
    return <DashboardEmpty />;
  }

  if (!reader || reader.loading) {
    return (
      <div className="reader reader-empty">
        <div className="dot-pulse" aria-label="Loading">
          <span />
          <span />
          <span />
        </div>
        <p>Loading conversation</p>
      </div>
    );
  }

  const { messages } = reader;
  if (messages.length === 0) {
    return (
      <div className="reader reader-empty">
        <p>This conversation has no readable messages.</p>
      </div>
    );
  }

  const index = Math.min(activeIndex, messages.length - 1);
  const active = messages[index];
  const subject = messages[messages.length - 1]?.subject ?? "(no subject)";
  const toLine = active.to.map(addressLabel).join(", ");

  const senderEmail = active.from.email.toLowerCase();
  const senderAllowed = settings.allowedSenders.includes(senderEmail);
  const allowRemote = senderAllowed || allowOnce;

  return (
    <div className="reader">
      <header className="reader-head">
        <div className="reader-subject-row">
          <h2 className="reader-subject">{subject}</h2>
          <button className="icon-btn" title="Close" onClick={closeThread} type="button">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="reader-actions">
          <button className="action-btn" type="button" onClick={() => composeReply("reply", active)}>
            <MailIcon size={15} />
            <span>Reply</span>
          </button>
          <button className="action-btn" type="button" onClick={() => void archiveThread(selectedId)}>
            <ArchiveIcon size={15} />
            <span>Archive</span>
          </button>
          <DurationMenu
            label="Snooze"
            icon={<ClockIcon size={15} />}
            presets={SNOOZE_PRESETS}
            onPick={(dueAt) => {
              void snooze(selectedId, subject, dueAt);
              closeThread();
            }}
          />
          <DurationMenu
            label="Watch for reply"
            icon={<EyeIcon size={15} />}
            presets={WATCH_PRESETS}
            onPick={(dueAt, preset) => void watch(selectedId, subject, dueAt, preset.indefinite)}
          />
          <OverflowMenu>
            {active.to.length + active.cc.length > 1 && (
              <button className="menu-item" type="button" role="menuitem" onClick={() => composeReply("replyAll", active)}>
                Reply all
              </button>
            )}
            <button className="menu-item" type="button" role="menuitem" onClick={() => composeReply("forward", active)}>
              Forward
            </button>
            <button className="menu-item" type="button" role="menuitem" onClick={() => void openInGmail(selectedId)}>
              Open in Gmail
            </button>
          </OverflowMenu>
        </div>

        <div className="reader-meta">
          <div className="reader-from-wrap">
            <Avatar from={active.from} size={38} />
            <div className="reader-from">
              <span className="reader-from-name">{addressLabel(active.from)}</span>
              <span className="reader-from-email">{active.from.email}</span>
            </div>
          </div>
          <div className="reader-meta-right">
            {toLine && <span className="reader-to">to {toLine}</span>}
            <span className="reader-date">{formatDateTime(active.internalDate)}</span>
          </div>
        </div>
      </header>

      <MessageRail messages={messages} activeIndex={index} onSelect={setActiveIndex} />

      <EmailView
        html={active.html}
        text={active.text}
        allowRemote={allowRemote}
        senderAllowed={senderAllowed}
        onAllowOnce={() => setAllowOnce(true)}
        onAllowSender={() =>
          updateSettings({ allowedSenders: [...settings.allowedSenders, senderEmail] })
        }
      />
    </div>
  );
}

// Shown when no thread is open. Replaces the bare "no conversation" stub with a
// quick glance dashboard: greeting, four counters that double as navigation,
// the next snoozed/watching item coming back, and keyboard shortcut hints.
function DashboardEmpty() {
  const {
    email,
    rows,
    schedule,
    suggestions,
    setView,
    setAssistantOpen,
    composeNew,
    openThread,
    settings,
  } = useAugment();

  const unreadCount = rows.filter((r) => r.unread).length;
  const snoozed = schedule.filter((s) => s.kind === "snooze");
  const watching = schedule.filter((s) => s.kind === "watch");
  const suggestionCount = suggestions.length;
  const nextDue = [...snoozed, ...watching].sort((a, b) => a.dueAt - b.dueAt)[0];

  const greeting = greetingFor(new Date().getHours());
  const displayName = firstName(email);
  const keybinds = settings.keybinds as Record<string, string | undefined>;

  return (
    <div className="reader reader-dash">
      <div className="dash">
        <header className="dash-head">
          <div className="dash-eyebrow">
            <span className="signin-dot" aria-hidden />
            <span>TODAY</span>
            <span className="signin-eyebrow-sep" aria-hidden>·</span>
            <span>{formatToday()}</span>
          </div>
          <h1 className="dash-greeting">
            {greeting}
            {displayName ? <span className="dash-name">, {displayName}</span> : null}.
          </h1>
          <p className="dash-sub">
            Pick a thread on the left to read it here — or jump straight to something below.
          </p>
        </header>

        <div className="dash-stats">
          <DashStat
            icon={<InboxIcon size={16} />}
            value={unreadCount}
            label="Unread"
            onClick={() => setView("inbox")}
          />
          <DashStat
            icon={<SparkleIcon size={16} />}
            value={suggestionCount}
            label="Suggestions"
            disabled={suggestionCount === 0}
            onClick={() => setAssistantOpen(true)}
          />
          <DashStat
            icon={<ClockIcon size={16} />}
            value={snoozed.length}
            label="Snoozed"
            disabled={snoozed.length === 0}
            onClick={() => setView("snoozed")}
          />
          <DashStat
            icon={<EyeIcon size={16} />}
            value={watching.length}
            label="Watching"
            disabled={watching.length === 0}
            onClick={() => setView("watching")}
          />
        </div>

        {nextDue && (
          <button
            className="dash-next"
            type="button"
            onClick={() => void openThread(nextDue.threadId)}
            title="Open this thread"
          >
            <span className="dash-next-kind">
              {nextDue.kind === "snooze" ? <ClockIcon size={13} /> : <EyeIcon size={13} />}
              <span>{nextDue.kind === "snooze" ? "Coming back" : "Watching"}</span>
            </span>
            <span className="dash-next-subject">{nextDue.subject || "(no subject)"}</span>
            <span className="dash-next-when">{formatRelative(nextDue.dueAt)}</span>
          </button>
        )}

        <div className="dash-actions">
          <button className="btn btn-primary dash-cta" type="button" onClick={composeNew}>
            <PencilIcon size={14} />
            <span>New message</span>
          </button>
          <div className="dash-shortcuts">
            <DashShortcut combo={keybinds.inbox ?? "mod+1"} label="Inbox" />
            <DashShortcut combo={keybinds.snoozed ?? "mod+2"} label="Snoozed" />
            <DashShortcut combo={keybinds.watching ?? "mod+3"} label="Watching" />
            <DashShortcut combo={keybinds.search ?? "mod+k"} label="Search" />
          </div>
        </div>
      </div>
    </div>
  );
}

function DashStat({
  icon,
  value,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  value: number;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`dash-stat${value > 0 ? " is-live" : ""}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="dash-stat-icon" aria-hidden>{icon}</span>
      <span className="dash-stat-num">{value}</span>
      <span className="dash-stat-label">{label}</span>
    </button>
  );
}

function DashShortcut({ combo, label }: { combo: string; label: string }) {
  return (
    <span className="dash-shortcut">
      <kbd>{formatCombo(combo)}</kbd>
      <span>{label}</span>
    </span>
  );
}

function greetingFor(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Late one";
}

function firstName(email: string | null): string | null {
  if (!email) return null;
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0] ?? "";
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function formatToday(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
