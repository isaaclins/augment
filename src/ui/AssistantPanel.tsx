// The right-side assistant panel: a label-suggestion queue at the top, then the
// conversation. The mode selector (Ask / Request / Agent) is the confirmation
// spectrum — Request proposes changes as cards you Apply/Cancel; Agent runs them
// and logs to Activity; Ask never changes anything.

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useAugment } from "../state/augment";
import {
  ASSISTANT_MODES,
  describeAction,
  type AssistantMessage,
} from "../lib/features/assistant";
import { CheckIcon, CloseIcon, RefreshIcon, SparkleIcon } from "./icons";

function ProposalCard({
  message,
  targetCount,
  canUndo,
  onApply,
  onCancel,
  onUndo,
}: {
  message: AssistantMessage;
  targetCount: number;
  canUndo: boolean;
  onApply: () => void;
  onCancel: () => void;
  onUndo: () => void;
}) {
  const actions = message.actions ?? [];
  return (
    <div className={`proposal proposal-${message.status}`}>
      <ul className="proposal-list">
        {actions.map((action, i) => (
          <li key={i}>{describeAction(action, targetCount)}</li>
        ))}
      </ul>
      {message.status === "proposed" ? (
        <div className="proposal-actions">
          <button type="button" className="btn btn-approve" onClick={onApply}>
            <CheckIcon size={13} /> Apply all
          </button>
          <button type="button" className="link-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : message.status === "applied" ? (
        <div className="proposal-actions">
          <span className="proposal-status">Applied</span>
          {canUndo && (
            <button type="button" className="link-btn" onClick={onUndo}>
              Undo
            </button>
          )}
        </div>
      ) : (
        <div className="proposal-status">{message.status === "undone" ? "Undone" : "Cancelled"}</div>
      )}
    </div>
  );
}

export function AssistantPanel() {
  const {
    assistantOpen,
    setAssistantOpen,
    suggestions,
    approveSuggestion,
    skipSuggestion,
    settings,
    triaging,
    runTriageNow,
    assistantMode,
    setAssistantMode,
    assistantMessages,
    assistantBusy,
    sendAssistantMessage,
    applyProposal,
    cancelProposal,
    clearAssistantChat,
    undoableIds,
    undoMessage,
    selectedIds,
  } = useAugment();

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest turn in view.
  useEffect(() => {
    if (assistantOpen) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [assistantMessages, assistantOpen, assistantBusy]);

  if (!assistantOpen) return null;

  function send() {
    const text = draft.trim();
    if (!text || assistantBusy) return;
    setDraft("");
    void sendAssistantMessage(text);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  return (
    <aside className="assistant-panel">
      <div className="assistant-head">
        <div className="assistant-title">
          <SparkleIcon size={16} />
          <span>Assistant</span>
        </div>
        <div className="assistant-head-actions">
          {settings.triageEnabled && (
            <button type="button" className="link-btn" disabled={triaging} onClick={() => void runTriageNow()}>
              <RefreshIcon size={13} className={triaging ? "spin" : undefined} />
              {triaging ? "Triaging…" : "Run triage now"}
            </button>
          )}
          <button type="button" className="icon-btn" title="Close assistant" onClick={() => setAssistantOpen(false)}>
            <CloseIcon size={15} />
          </button>
        </div>
      </div>

      <div className="assistant-modes" role="tablist">
        {ASSISTANT_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={assistantMode === mode.id}
            className={`assistant-mode ${assistantMode === mode.id ? "is-active" : ""}`}
            title={mode.hint}
            onClick={() => setAssistantMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="assistant-body" ref={scrollRef}>
        {suggestions.length > 0 && (
          <div className="assistant-suggestions">
            <div className="assistant-section-head">Suggested labels ({suggestions.length})</div>
            <div className="suggestion-list">
              {suggestions.map((suggestion) => (
                <div className="suggestion-row" key={suggestion.name}>
                  <div className="suggestion-text">
                    <span className="suggestion-name">{suggestion.name}</span>
                    <span className="suggestion-count">
                      {suggestion.ids.length} {suggestion.ids.length === 1 ? "email" : "emails"}
                    </span>
                  </div>
                  <div className="suggestion-actions">
                    <button
                      type="button"
                      className="btn btn-approve"
                      title="Create this label and apply it"
                      onClick={() => void approveSuggestion(suggestion.name)}
                    >
                      <CheckIcon size={13} /> Approve
                    </button>
                    <button type="button" className="link-btn" onClick={() => skipSuggestion(suggestion.name)}>
                      Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {assistantMessages.length === 0 ? (
          <div className="assistant-empty">
            Ask me about your mail, or tell me what to do with it.
            <ul className="assistant-examples">
              <li>“make a label for these and apply it”</li>
              <li>“sort my mails by sender”</li>
              <li>“what's urgent in my selection?”</li>
              <li>“archive all the receipts”</li>
            </ul>
          </div>
        ) : (
          <div className="chat-log">
            {assistantMessages.map((message) => (
              <div key={message.id} className={`chat-msg chat-${message.role}`}>
                {message.content && <div className="chat-bubble">{message.content}</div>}
                {message.actions && message.actions.length > 0 && (
                  <ProposalCard
                    message={message}
                    targetCount={selectedIds.size}
                    canUndo={undoableIds.has(message.id)}
                    onApply={() => void applyProposal(message.id)}
                    onCancel={() => cancelProposal(message.id)}
                    onUndo={() => void undoMessage(message.id)}
                  />
                )}
              </div>
            ))}
            {assistantBusy && (
              <div className="chat-msg chat-assistant">
                <div className="chat-bubble chat-thinking">
                  <span>Thinking</span>
                  <span className="thinking-dots" aria-hidden>
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="assistant-input">
        {selectedIds.size > 0 && (
          <div className="assistant-input-ctx">Acting on {selectedIds.size} selected</div>
        )}
        <div className="assistant-input-row">
          <textarea
            className="assistant-textarea"
            rows={1}
            value={draft}
            placeholder={`Message the assistant (${assistantMode})…`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="btn btn-approve assistant-send" disabled={!draft.trim() || assistantBusy} onClick={send}>
            Send
          </button>
        </div>
        {assistantMessages.length > 0 && (
          <button type="button" className="link-btn assistant-clear" onClick={clearAssistantChat}>
            Clear conversation
          </button>
        )}
      </div>
    </aside>
  );
}
