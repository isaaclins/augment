import { useEffect, useState, type ReactNode } from "react";
import { useAugment } from "../state/augment";
import { addressLabel, type ParsedMessage } from "../lib/gmail/parse";
import { formatDateTime } from "../lib/time";
import { SNOOZE_PRESETS, WATCH_PRESETS } from "../lib/time";
import { EmailView } from "./EmailView";
import { DurationMenu } from "./DurationMenu";
import { Avatar } from "./Avatar";
import { useClickOutside } from "./hooks";
import { ArchiveIcon, ClockIcon, CloseIcon, EyeIcon, MailIcon } from "./icons";

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
  const { reader, selectedId, archiveThread, snooze, watch, openInGmail, closeThread, composeReply } =
    useAugment();
  const [activeIndex, setActiveIndex] = useState(0);

  const threadId = reader?.threadId;
  useEffect(() => {
    setActiveIndex(0);
  }, [threadId]);

  if (!selectedId) {
    return (
      <div className="reader reader-empty">
        <div className="empty-state">
          <span className="empty-state-icon">
            <MailIcon size={24} />
          </span>
          <p className="empty-state-title">No conversation open</p>
          <p className="empty-state-text">Select a thread on the left to read it here.</p>
        </div>
      </div>
    );
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

      <EmailView html={active.html} text={active.text} />
    </div>
  );
}
