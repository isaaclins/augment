// The in-app composer modal: new / reply / reply-all / forward, with To/Cc/Bcc,
// subject, a plain-text body, and file attachments. Send goes out via Gmail
// (gmail.send); Save draft stores it in Drafts. A reply stays in its thread.

import { useEffect, useRef, type ChangeEvent } from "react";
import { useAugment } from "../state/augment";
import { fileToAttachment, type ComposeMode } from "../lib/features/compose";
import { htmlToText } from "../lib/gmail/parse";
import { RichTextEditor } from "./RichTextEditor";
import { CloseIcon, FileIcon } from "./icons";

const MODE_TITLE: Record<ComposeMode, string> = {
  new: "New message",
  reply: "Reply",
  replyAll: "Reply all",
  forward: "Forward",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Composer() {
  const {
    compose,
    composeBusy,
    composeError,
    canSend,
    updateCompose,
    closeCompose,
    sendCompose,
    saveComposeDraft,
  } = useAugment();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!compose) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeCompose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compose, closeCompose]);

  if (!compose) return null;

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow re-picking the same file
    if (files.length === 0) return;
    const added = await Promise.all(files.map(fileToAttachment));
    updateCompose({ attachments: [...(compose?.attachments ?? []), ...added] });
  }

  function removeAttachment(index: number) {
    updateCompose({ attachments: (compose?.attachments ?? []).filter((_, i) => i !== index) });
  }

  const canSubmit = !composeBusy && (compose.to.trim() !== "" || compose.mode !== "new");

  return (
    <div className="modal-backdrop" onMouseDown={closeCompose}>
      <div className="modal composer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{MODE_TITLE[compose.mode]}</h2>
          <button className="icon-btn" type="button" title="Close" onClick={closeCompose}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="composer-body">
          {!canSend && (
            <div className="composer-warn">
              Sending may need you to reconnect (sign out and back in) to grant send access.
            </div>
          )}

          <label className="composer-field">
            <span className="composer-label">To</span>
            <input
              className="input"
              value={compose.to}
              placeholder="recipient@example.com"
              spellCheck={false}
              onChange={(e) => updateCompose({ to: e.target.value })}
            />
          </label>
          <label className="composer-field">
            <span className="composer-label">Cc</span>
            <input
              className="input"
              value={compose.cc}
              spellCheck={false}
              onChange={(e) => updateCompose({ cc: e.target.value })}
            />
          </label>
          <label className="composer-field">
            <span className="composer-label">Bcc</span>
            <input
              className="input"
              value={compose.bcc}
              spellCheck={false}
              onChange={(e) => updateCompose({ bcc: e.target.value })}
            />
          </label>
          <label className="composer-field">
            <span className="composer-label">Subject</span>
            <input
              className="input"
              value={compose.subject}
              onChange={(e) => updateCompose({ subject: e.target.value })}
            />
          </label>

          <div className="composer-richtext">
            <RichTextEditor
              initialHtml={compose.bodyHtml}
              placeholder="Write your message…"
              onChange={(html) => updateCompose({ bodyHtml: html, body: htmlToText(html) })}
            />
          </div>

          {compose.attachments.length > 0 && (
            <div className="composer-attachments">
              {compose.attachments.map((att, i) => (
                <div className="composer-attachment" key={`${att.name}-${i}`}>
                  <FileIcon size={13} />
                  <span className="composer-attachment-name">{att.name}</span>
                  <span className="composer-attachment-size">{formatSize(att.size)}</span>
                  <button
                    type="button"
                    className="composer-attachment-remove"
                    title="Remove"
                    onClick={() => removeAttachment(i)}
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {composeError && <div className="composer-error">{composeError}</div>}
        </div>

        <div className="composer-foot">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => void onFiles(e)} />
          <button className="action-btn" type="button" onClick={() => fileRef.current?.click()}>
            <FileIcon size={14} />
            <span>Attach</span>
          </button>
          <div className="composer-foot-right">
            <button className="btn" type="button" disabled={composeBusy} onClick={() => void saveComposeDraft()}>
              Save draft
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!canSubmit}
              onClick={() => void sendCompose()}
            >
              {composeBusy ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
