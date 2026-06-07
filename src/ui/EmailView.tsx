// Renders a single email body. The sanitized HTML lives inside a sandboxed
// iframe whose own CSP is `default-src 'none'` — so even a sanitizer bypass
// could not reach the network or run a script. See lib/sanitize/sanitizeEmail.

import { useMemo } from "react";
import { renderEmailSrcDoc } from "../lib/sanitize/sanitizeEmail";
import { ShieldIcon } from "./icons";

interface EmailViewProps {
  html?: string;
  text?: string;
}

export function EmailView({ html, text }: EmailViewProps) {
  const { srcDoc, blockedRemoteCount } = useMemo(
    () => renderEmailSrcDoc({ html, text }),
    [html, text],
  );

  return (
    <div className="email-view">
      {blockedRemoteCount > 0 && (
        <div className="email-shield" title="Augment never loads remote content from email.">
          <ShieldIcon size={14} />
          <span>
            {blockedRemoteCount} remote {blockedRemoteCount === 1 ? "item" : "items"} blocked
          </span>
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
