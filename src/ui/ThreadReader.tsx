import { useEffect, useState } from "react";
import { useAugment } from "../state/augment";
import { addressLabel, type ParsedMessage } from "../lib/gmail/parse";
import { formatDateTime } from "../lib/time";
import { SNOOZE_PRESETS, WATCH_PRESETS } from "../lib/time";
import { EmailView } from "./EmailView";
import { DurationMenu } from "./DurationMenu";
import { ArchiveIcon, ClockIcon, CloseIcon, ExternalIcon, EyeIcon, MailIcon } from "./icons";

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
          <span className="rail-from">{addressLabel(message.from)}</span>
          <span className="rail-date">{formatDateTime(message.internalDate)}</span>
        </button>
      ))}
    </div>
  );
}

export function ThreadReader() {
  const { reader, selectedId, archiveThread, snooze, watch, openInGmail, closeThread } = useAugment();
  const [activeIndex, setActiveIndex] = useState(0);

  const threadId = reader?.threadId;
  useEffect(() => {
    setActiveIndex(0);
  }, [threadId]);

  if (!selectedId) {
    return (
      <div className="reader reader-empty">
        <MailIcon size={30} />
        <p>Select a conversation to read it here.</p>
      </div>
    );
  }

  if (!reader || reader.loading) {
    return (
      <div className="reader reader-empty">
        <div className="spinner" />
        <p>Loading conversation…</p>
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
            onPick={(dueAt) => void watch(selectedId, subject, dueAt)}
          />
          <button className="action-btn" type="button" onClick={() => void archiveThread(selectedId)}>
            <ArchiveIcon size={15} />
            <span>Archive</span>
          </button>
          <button className="action-btn" type="button" onClick={() => void openInGmail(selectedId)}>
            <ExternalIcon size={15} />
            <span>Open in Gmail</span>
          </button>
        </div>

        <div className="reader-meta">
          <div className="reader-from">
            <span className="reader-from-name">{addressLabel(active.from)}</span>
            <span className="reader-from-email">{active.from.email}</span>
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
