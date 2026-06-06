import { describe, expect, it } from "vitest";
import { buildSrcDoc, renderEmailSrcDoc, sanitizeEmailHtml } from "./sanitizeEmail";

describe("sanitizeEmailHtml — remote content is never loadable", () => {
  it("strips remote <img> src and counts it as blocked", () => {
    const { clean, blockedRemoteCount } = sanitizeEmailHtml(
      '<img src="https://tracker.example.com/pixel.gif?u=123">',
    );
    expect(clean).not.toContain("https://tracker.example.com");
    expect(clean).not.toMatch(/\ssrc=/);
    expect(clean).toContain('data-blocked="remote"');
    expect(blockedRemoteCount).toBe(1);
  });

  it("strips protocol-relative and relative img sources", () => {
    expect(sanitizeEmailHtml('<img src="//evil.example/x.png">').clean).not.toContain("evil.example");
    expect(sanitizeEmailHtml('<img src="/local/x.png">').clean).not.toMatch(/\ssrc=/);
  });

  it("keeps inline data: images (no network needed)", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgo=";
    const { clean, blockedRemoteCount } = sanitizeEmailHtml(`<img src="${dataUri}">`);
    expect(clean).toContain(dataUri);
    expect(blockedRemoteCount).toBe(0);
  });

  it("removes srcset, poster and background loading attributes", () => {
    const html =
      '<img srcset="https://a/x.png 1x"><video poster="https://a/p.jpg"></video>' +
      '<table background="https://a/bg.png"><tr><td>x</td></tr></table>';
    const { clean, blockedRemoteCount } = sanitizeEmailHtml(html);
    expect(clean).not.toContain("https://a/");
    expect(blockedRemoteCount).toBeGreaterThanOrEqual(3);
  });

  it("strips url() from inline styles (background-image tracking)", () => {
    const { clean, blockedRemoteCount } = sanitizeEmailHtml(
      '<div style="background-image:url(https://evil.example/bg.png); color:red">x</div>',
    );
    expect(clean).not.toContain("evil.example");
    expect(clean).not.toMatch(/url\s*\(/i);
    expect(clean).toContain("color:red");
    expect(blockedRemoteCount).toBe(1);
  });
});

describe("sanitizeEmailHtml — scripts and handlers are removed", () => {
  it("drops <script> tags", () => {
    const { clean } = sanitizeEmailHtml('<p>hi</p><script>alert(1)</script>');
    expect(clean).toContain("hi");
    expect(clean.toLowerCase()).not.toContain("<script");
    expect(clean).not.toContain("alert(1)");
  });

  it("removes inline event handlers", () => {
    const { clean } = sanitizeEmailHtml('<img src="x" onerror="alert(1)">');
    expect(clean.toLowerCase()).not.toContain("onerror");
    expect(clean).not.toContain("alert(1)");
  });

  it("neutralizes javascript: links", () => {
    const { clean } = sanitizeEmailHtml('<a href="javascript:alert(1)">click</a>');
    expect(clean.toLowerCase()).not.toContain("javascript:");
  });

  it("drops <style> and <link> stylesheet elements", () => {
    const { clean } = sanitizeEmailHtml(
      '<style>@import url(https://evil/x.css)</style><link rel="stylesheet" href="https://evil/x.css"><p>ok</p>',
    );
    expect(clean).not.toContain("evil");
    expect(clean.toLowerCase()).not.toContain("<style");
    expect(clean.toLowerCase()).not.toContain("<link");
    expect(clean).toContain("ok");
  });
});

describe("sanitizeEmailHtml — formatting is preserved", () => {
  it("keeps safe rich formatting and external link href", () => {
    const { clean } = sanitizeEmailHtml(
      '<p><strong>Bold</strong> and <a href="https://example.com">link</a></p>',
    );
    expect(clean).toContain("<strong>Bold</strong>");
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('rel="noopener noreferrer"');
  });
});

describe("buildSrcDoc / renderEmailSrcDoc", () => {
  it("embeds a default-src 'none' CSP so the iframe can never reach the network", () => {
    const doc = buildSrcDoc("<p>hi</p>");
    expect(doc).toContain('http-equiv="Content-Security-Policy"');
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain("img-src data:");
  });

  it("renders HTML mode when html is present, blocking remote refs", () => {
    const result = renderEmailSrcDoc({ html: '<img src="https://x/y.png"><p>Hi</p>' });
    expect(result.mode).toBe("html");
    expect(result.blockedRemoteCount).toBe(1);
    expect(result.srcDoc).toContain("Hi");
    expect(result.srcDoc).not.toContain("https://x/y.png");
  });

  it("falls back to escaped plaintext when no HTML body exists", () => {
    const result = renderEmailSrcDoc({ text: "1 < 2 & 3 > 2 <script>" });
    expect(result.mode).toBe("text");
    expect(result.srcDoc).toContain("augment-plain");
    expect(result.srcDoc).toContain("&lt;script&gt;");
    expect(result.srcDoc).not.toContain("<script>");
  });
});
