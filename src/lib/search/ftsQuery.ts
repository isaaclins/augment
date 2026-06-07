// Parse a search box query (Gmail-ish operators) into a structured form both
// search backends understand, and render the FTS5 MATCH expression.
//
// Text operators:   from:/sender:, subject:/title:, body:/message:
// Flag/label:        is:unread|read, is:starred|important (+ any is:/in:/label:)
// Attachment:        has:attachment
// Date:              after:/since:, before:/until: (YYYY/MM/DD or YYYY-MM-DD),
//                    newer_than:/older_than: (Nd, Nw, Nm, Ny)
// Bare words match any field. unicode61 prefix matching, so from:google ->
// sender:google*.

export interface ParsedQuery {
  from: string[];
  subject: string[];
  body: string[];
  /** Free-text terms matched against any field. */
  terms: string[];
  /** label:/is:(non-unread)/in: tokens — matched against a thread's labels. */
  labels: string[];
  /** is:unread -> true, is:read -> false, otherwise undefined. */
  unread?: boolean;
  /** has:attachment -> true. */
  hasAttachment?: boolean;
  /** Inclusive lower bound (epoch ms). */
  after?: number;
  /** Exclusive upper bound (epoch ms). */
  before?: number;
}

const FIELD_ALIASES: Record<string, "from" | "subject" | "body"> = {
  from: "from",
  sender: "from",
  subject: "subject",
  title: "subject",
  body: "body",
  message: "body",
};

const DAY_MS = 86_400_000;
const DURATION_MS: Record<string, number> = { d: DAY_MS, w: 7 * DAY_MS, m: 30 * DAY_MS, y: 365 * DAY_MS };

// Strip everything that isn't a letter or number so a term can never break the
// FTS5 grammar (and so the JS index can substring-match it).
function clean(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Parse YYYY/MM/DD or YYYY-MM-DD to a local-midnight epoch (ms), or undefined. */
function parseDate(value: string): number | undefined {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value.trim());
  if (!m) return undefined;
  const time = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(time) ? undefined : time;
}

/** Parse a relative duration like "7d", "2w" to milliseconds, or undefined. */
function parseDuration(value: string): number | undefined {
  const m = /^(\d+)\s*([dwmy])$/.exec(value.trim().toLowerCase());
  if (!m) return undefined;
  return Number(m[1]) * DURATION_MS[m[2]];
}

export function parseQuery(input: string, now: number = Date.now()): ParsedQuery {
  const query: ParsedQuery = { from: [], subject: [], body: [], terms: [], labels: [] };
  for (const raw of input.split(/\s+/).filter(Boolean)) {
    const match = /^([a-zA-Z_]+):(.*)$/.exec(raw);
    if (!match) {
      const cleaned = clean(raw);
      if (cleaned) query.terms.push(cleaned);
      continue;
    }

    const op = match[1].toLowerCase();
    const value = match[2];

    if (op === "is") {
      const v = value.toLowerCase();
      if (v === "unread") query.unread = true;
      else if (v === "read") query.unread = false;
      else {
        const cleaned = clean(value);
        if (cleaned) query.labels.push(cleaned);
      }
      continue;
    }
    if (op === "has") {
      const v = value.toLowerCase();
      if (v.startsWith("attach") || v === "file") query.hasAttachment = true;
      continue;
    }
    if (op === "in" || op === "label") {
      const cleaned = clean(value);
      if (cleaned) query.labels.push(cleaned);
      continue;
    }
    if (op === "after" || op === "since" || op === "newer_than" || op === "newer") {
      const date = parseDate(value);
      const dur = parseDuration(value);
      if (date !== undefined) query.after = date;
      else if (dur !== undefined) query.after = now - dur;
      continue;
    }
    if (op === "before" || op === "until" || op === "older_than" || op === "older") {
      const date = parseDate(value);
      const dur = parseDuration(value);
      if (date !== undefined) query.before = date;
      else if (dur !== undefined) query.before = now - dur;
      continue;
    }

    const field = FIELD_ALIASES[op];
    if (field) {
      const cleaned = clean(value);
      if (cleaned) query[field].push(cleaned);
      continue;
    }

    // Unknown operator — fall back to matching its value as free text.
    const cleaned = clean(value || raw);
    if (cleaned) query.terms.push(cleaned);
  }
  return query;
}

/** True when the query has no constraints at all (blank box). */
export function isEmptyQuery(query: ParsedQuery): boolean {
  return (
    query.from.length === 0 &&
    query.subject.length === 0 &&
    query.body.length === 0 &&
    query.terms.length === 0 &&
    query.labels.length === 0 &&
    query.unread === undefined &&
    query.hasAttachment === undefined &&
    query.after === undefined &&
    query.before === undefined
  );
}

/** Render a parsed query as an FTS5 MATCH expression (column-scoped prefixes). */
export function buildFtsMatch(query: ParsedQuery): string {
  const parts: string[] = [];
  for (const term of query.from) parts.push(`sender:${term}*`);
  for (const term of query.subject) parts.push(`subject:${term}*`);
  for (const term of query.body) parts.push(`body:${term}*`);
  for (const term of query.terms) parts.push(`${term}*`);
  return parts.join(" ");
}

/** Convenience: parse a raw string straight to an FTS5 MATCH expression. */
export function buildFtsQuery(input: string): string {
  return buildFtsMatch(parseQuery(input));
}
