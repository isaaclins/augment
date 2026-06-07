// A sender avatar: the sender's domain logo (Google's favicon service) when one
// exists, falling back to initials on a colour derived from the address. The
// logo is a remote fetch — the only one the app makes for chrome — so it's
// referrer-stripped and degrades to the initials badge if it can't load.

import { useState } from "react";
import { addressLabel, type EmailAddress } from "../lib/gmail/parse";

function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return domain || null;
}

export function Avatar({ from, size = 36 }: { from: EmailAddress; size?: number }) {
  const [loaded, setLoaded] = useState(false);
  const label = addressLabel(from);
  const domain = domainOf(from.email);

  return (
    <div
      className="avatar"
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: `hsl(${hue(from.email || label)} 52% 48%)`,
      }}
    >
      {!loaded && <span className="avatar-initials">{initials(label)}</span>}
      {domain && (
        <img
          className="avatar-img"
          src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={(e) => {
            // s2 returns a 16px generic globe for unknown domains — treat those
            // as "no logo" and keep the initials.
            if (e.currentTarget.naturalWidth > 16) setLoaded(true);
          }}
          onError={() => setLoaded(false)}
        />
      )}
    </div>
  );
}
