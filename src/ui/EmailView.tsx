// Renders a single email body. The sanitized HTML lives inside a sandboxed
// iframe whose own CSP is `default-src 'none'` — so even a sanitizer bypass
// could not reach the network or run a script. See lib/sanitize/sanitizeEmail.
//
// Remote content (tracking pixels, images) is blocked by default. The user can
// opt in per-email or per-sender; `allowRemote` then widens the iframe CSP to
// permit https/http images only.

import { useMemo } from "react";
import { renderEmailSrcDoc } from "../lib/sanitize/sanitizeEmail";
import { ShieldIcon } from "./icons";

interface EmailViewProps {
  html?: string;
  text?: string;
  /** Load remote images for this render (the user opted in). */
  allowRemote?: boolean;
  /** Whether this sender is already on the allow-list (hides that button). */
  senderAllowed?: boolean;
  /** Allow remote content for this email only (this session). */
  onAllowOnce?: () => void;
  /** Always allow remote content from this sender (persisted). */
  onAllowSender?: () => void;
}

export function EmailView({
  html,
  text,
  allowRemote = false,
  senderAllowed = false,
  onAllowOnce,
  onAllowSender,
}: EmailViewProps) {
  const { srcDoc, blockedRemoteCount } = useMemo(
    () => renderEmailSrcDoc({ html, text }, { allowRemote }),
    [html, text, allowRemote],
  );

  return (
    <div className="email-view">
      {!allowRemote && blockedRemoteCount > 0 && (
        <div className="email-shield" title="Augment never loads remote content from email until you allow it.">
          <ShieldIcon size={12} />
          <span className="email-shield-text">
            {blockedRemoteCount} remote {blockedRemoteCount === 1 ? "item" : "items"} blocked
          </span>
          <div className="email-shield-actions">
            {onAllowOnce && (
              <button
                className="email-shield-btn"
                type="button"
                title="Allow these remote items"
                onClick={onAllowOnce}
              >
                Allow these
              </button>
            )}
            {onAllowSender && !senderAllowed && (
              <button
                className="email-shield-btn"
                type="button"
                title="Allow remote items from this sender"
                onClick={onAllowSender}
              >
                Allow from sender
              </button>
            )}
          </div>
        </div>
      )}
      <iframe
        className="email-frame"
        title="Email body"
        // No allow-scripts and no allow-same-origin: the frame gets an opaque
        // origin so its embedded CSP applies; allow-popups only lets a user
        // click open an external link.
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcDoc}
      />
    </div>
  );
}
