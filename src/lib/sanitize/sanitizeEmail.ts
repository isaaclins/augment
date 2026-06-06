// Safe rendering of untrusted email HTML. Defense in depth:
//
//  1. DOMPurify strips scripts, event handlers, and dangerous tags.
//  2. Hooks here neutralize every *remote-loading* vector — img/src, srcset,
//     poster, background, and url(...) inside inline styles — so only data:
//     URIs survive. Nothing in a rendered email can reach the network.
//  3. The result is wrapped in a sandboxed <iframe srcdoc> (see EmailView) whose
//     own <meta> CSP is `default-src 'none'`, which blocks network + scripts
//     even if a sanitizer bypass ever slipped through.
//
// The app-level CSP in tauri.conf.json is the outermost backstop.

import DOMPurify from "dompurify";

export interface SanitizeResult {
  /** Sanitized HTML fragment, safe to embed in the sandboxed iframe. */
  clean: string;
  /** How many remote resources were blocked (images, styles). Drives the UI badge. */
  blockedRemoteCount: number;
}

export interface RenderResult extends SanitizeResult {
  /** Full srcdoc document ready for the sandboxed iframe. */
  srcDoc: string;
  mode: "html" | "text";
}

// Tags that can pull remote content or execute — removed entirely. Inline
// `style` attributes are still allowed (and url()-stripped); only <style>/<link>
// stylesheet *elements* are dropped.
const FORBIDDEN_TAGS = [
  "style",
  "link",
  "base",
  "meta",
  "script",
  "noscript",
  "iframe",
  "frame",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "svg",
  "math",
  "title",
];

const LOADING_ATTRS = ["src", "srcset", "poster", "background"] as const;

let blockedRemote = 0;
let hooksInstalled = false;

function isDataUri(value: string): boolean {
  return value.trim().toLowerCase().startsWith("data:");
}

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element)) return;
    const el = node;

    // Neutralize auto-loading attributes unless they are inline data: URIs.
    for (const attr of LOADING_ATTRS) {
      if (!el.hasAttribute(attr)) continue;
      const value = el.getAttribute(attr) ?? "";
      if (!isDataUri(value)) {
        el.removeAttribute(attr);
        blockedRemote += 1;
        if (el.tagName === "IMG") {
          el.setAttribute("alt", el.getAttribute("alt") || "🚫 blocked image");
          el.setAttribute("data-blocked", "remote");
        }
      }
    }

    // Strip url(...) from inline styles (e.g. background-image) — the iframe CSP
    // would block them anyway, but removing the reference is belt-and-braces.
    const style = el.getAttribute("style");
    if (style && /url\s*\(/i.test(style)) {
      el.setAttribute("style", style.replace(/url\s*\([^)]*\)/gi, "none"));
      blockedRemote += 1;
    }

    // Make any surviving links open externally and leak no referrer.
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  });
}

/** Sanitize an untrusted HTML fragment and report how much remote content was blocked. */
export function sanitizeEmailHtml(dirty: string): SanitizeResult {
  installHooks();
  blockedRemote = 0;

  const clean = DOMPurify.sanitize(dirty, {
    FORBID_TAGS: FORBIDDEN_TAGS,
    ADD_ATTR: ["target", "rel", "data-blocked"],
    ALLOW_DATA_ATTR: false,
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
    RETURN_TRUSTED_TYPE: false,
  });

  return { clean: String(clean), blockedRemoteCount: blockedRemote };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BASE_STYLES = `
  :root { color-scheme: light dark; }
  html, body { margin: 0; padding: 0; }
  body {
    font: 14px/1.55 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    color: #1c1f26;
    background: #ffffff;
    padding: 18px 20px 28px;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #e7e9ee; background: #16181d; }
    a { color: #6aa6ff; }
  }
  a { color: #1a6dff; }
  img { max-width: 100%; height: auto; }
  img[data-blocked] {
    display: inline-block; min-width: 22px; min-height: 22px;
    padding: 2px 6px; border: 1px dashed #b9c0cc; border-radius: 6px;
    color: #8a93a3; font-size: 12px; background: rgba(140,150,170,0.08);
  }
  pre.augment-plain { white-space: pre-wrap; font: inherit; margin: 0; }
  blockquote { margin: 0 0 0 12px; padding-left: 12px; border-left: 3px solid #d4d9e2; color: #5b6472; }
  table { max-width: 100%; }
`;

/**
 * Wrap a sanitized body in a locked-down standalone document for the sandboxed
 * iframe. The embedded CSP is the second hard guarantee that no network request
 * can originate from rendered mail.
 */
export function buildSrcDoc(bodyHtml: string): string {
  const csp =
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; " +
    "media-src 'none'; frame-src 'none'; child-src 'none'; connect-src 'none'; " +
    "base-uri 'none'; form-action 'none'";
  return (
    "<!doctype html><html><head><meta charset=\"utf-8\">" +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<style>${BASE_STYLES}</style></head><body>${bodyHtml}</body></html>`
  );
}

/** Render a parsed message body (HTML preferred, else plaintext) to a safe srcdoc. */
export function renderEmailSrcDoc(input: { html?: string; text?: string }): RenderResult {
  if (input.html && input.html.trim().length > 0) {
    const { clean, blockedRemoteCount } = sanitizeEmailHtml(input.html);
    return {
      clean,
      blockedRemoteCount,
      srcDoc: buildSrcDoc(clean),
      mode: "html",
    };
  }

  const text = input.text ?? "";
  const body = `<pre class="augment-plain">${escapeHtml(text)}</pre>`;
  return {
    clean: body,
    blockedRemoteCount: 0,
    srcDoc: buildSrcDoc(body),
    mode: "text",
  };
}
