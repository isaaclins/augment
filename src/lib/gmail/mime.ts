// Shared RFC 2822 / base64 helpers for building outbound messages (templates,
// drafts, and the composer). Kept dependency-free so it's easy to unit-test.

/** base64-encode a UTF-8 string. */
export function base64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** base64url variant (Gmail's `raw` field wants url-safe, unpadded). */
export function base64Url(input: string): string {
  return base64(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64-encode raw bytes (for binary attachments). */
export function base64Bytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000; // chunk to avoid arg-count limits on String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Wrap a base64 string at 76 columns, as MIME bodies require. */
export function wrap76(b64: string): string {
  return b64.replace(/(.{76})/g, "$1\r\n");
}

/** RFC 2047-encode a header value when it contains non-ASCII characters. */
export function encodeHeaderWord(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${base64(value)}?=`;
}
