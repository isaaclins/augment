// Criterion-2 proof at the rendering-pipeline level: a realistic marketing email
// — tracking pixel, remote logo, remote stylesheet, remote background-image, an
// inline event handler, plus a legitimate link and a data: image — goes through
// the FULL render path (sanitize → sandboxed srcdoc). We assert the final
// document contains no remote-loading reference at all, while keeping the link
// (navigation is not a content fetch) and the inline data: image.

import { describe, expect, it } from "vitest";
import { renderEmailSrcDoc } from "./sanitizeEmail";

const REALISTIC_EMAIL = `
  <html>
    <head>
      <link rel="stylesheet" href="https://cdn.tracker.example/newsletter.css">
      <style>@import url(https://cdn.tracker.example/fonts.css);</style>
    </head>
    <body style="background-image:url('https://cdn.tracker.example/bg.png')">
      <img src="https://track.tracker.example/open.gif?uid=abc123" width="1" height="1" alt="">
      <table background="https://cdn.tracker.example/table-bg.png">
        <tr><td>
          <img src="https://cdn.tracker.example/logo.png" alt="Acme">
          <h1>Your weekly digest</h1>
          <p style="background:url(https://cdn.tracker.example/divider.png) no-repeat">
            Hi there — here's what's new.
          </p>
          <p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="inline ok"></p>
          <a href="https://acme.example/article/42" onclick="steal()">Read the article</a>
          <img src="https://track.tracker.example/click.gif" onerror="exfiltrate()">
        </td></tr>
      </table>
    </body>
  </html>
`;

describe("full render pipeline blocks every remote-loading reference", () => {
  const result = renderEmailSrcDoc({ html: REALISTIC_EMAIL });
  const doc = result.srcDoc;

  it("renders in HTML mode and reports remote items blocked", () => {
    expect(result.mode).toBe("html");
    // The three remote <img> srcs and the inline background-image url() are all
    // neutralized (the <body>/<head> wrappers — and their remote refs — are
    // dropped entirely in fragment mode). At least four are reported blocked.
    expect(result.blockedRemoteCount).toBeGreaterThanOrEqual(4);
  });

  it("contains no reference to any remote tracker/CDN host", () => {
    expect(doc).not.toContain("track.tracker.example");
    expect(doc).not.toContain("cdn.tracker.example");
  });

  it("has no remote src= and no url() pointing at the network", () => {
    expect(doc).not.toMatch(/src\s*=\s*["']https?:/i);
    expect(doc).not.toMatch(/\bsrcset\s*=/i);
    expect(doc).not.toMatch(/url\(\s*["']?https?:/i);
    expect(doc).not.toMatch(/background\s*=\s*["']https?:/i);
  });

  it("strips stylesheet elements, scripts, inline handlers, and @import", () => {
    expect(doc.toLowerCase()).not.toContain("<link");
    expect(doc.toLowerCase()).not.toContain("<script");
    expect(doc.toLowerCase()).not.toContain("onclick");
    expect(doc.toLowerCase()).not.toContain("onerror");
    expect(doc).not.toContain("@import");
    expect(doc).not.toContain("steal()");
    expect(doc).not.toContain("exfiltrate()");
  });

  it("keeps legitimate content: the link href, the data: image, and the text", () => {
    expect(doc).toContain("https://acme.example/article/42"); // link navigation is allowed
    expect(doc).toContain('target="_blank"');
    expect(doc).toContain("data:image/gif;base64,");
    expect(doc).toContain("Your weekly digest");
    expect(doc).toContain("here's what's new.");
  });

  it("wraps everything in a default-src 'none' document", () => {
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("connect-src 'none'");
  });
});
