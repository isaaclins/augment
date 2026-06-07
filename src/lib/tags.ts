// User-defined tags: colored, icon-bearing labels you apply to threads. Unlike
// folders (a mutually-exclusive "move"), a thread can carry many tags. Each tag
// is backed 1:1 by a nested Gmail label ("Augment/Tags/<name>") so applying one
// syncs to Gmail and survives relaunch. The tag's *metadata* (display name +
// colour + icon) lives in localStorage; the thread association lives in Gmail.

export type TagColor =
  | "red"
  | "amber"
  | "green"
  | "teal"
  | "blue"
  | "violet"
  | "pink"
  | "slate";

export type TagIconKey =
  | "tag"
  | "star"
  | "flag"
  | "bolt"
  | "heart"
  | "bookmark"
  | "flame"
  | "dot";

export interface Tag {
  id: string;
  /** Display name; the backing Gmail label is `Augment/Tags/<name>`. */
  name: string;
  /** Resolved Gmail label id — used to match threads and modify labels. */
  labelId: string;
  color: TagColor;
  icon: TagIconKey;
  /** "user" = made by hand in the editor; "auto" = born from an approved AI
   *  category suggestion. Auto tags get a ✨ marker in the sidebar. Older stored
   *  tags without this field are treated as "user" (see `loadTags`). */
  source: TagSource;
}

export type TagSource = "user" | "auto";

/** Base hex per colour. The UI tints it at low alpha for chip backgrounds, so a
 *  single value reads well in both light and dark themes. */
export const TAG_PALETTE: Record<TagColor, string> = {
  red: "#e0533d",
  amber: "#d8930a",
  green: "#1f9d57",
  teal: "#0d9488",
  blue: "#2f6bff",
  violet: "#7c5cff",
  pink: "#d6409f",
  slate: "#64748b",
};

export const TAG_COLOR_KEYS: TagColor[] = [
  "red",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
  "slate",
];

export const TAG_ICON_KEYS: TagIconKey[] = [
  "tag",
  "star",
  "flag",
  "bolt",
  "heart",
  "bookmark",
  "flame",
  "dot",
];

export const DEFAULT_TAG_COLOR: TagColor = "blue";
export const DEFAULT_TAG_ICON: TagIconKey = "tag";

const TAG_LABEL_PREFIX = "Augment/Tags/";

/** The Gmail label name backing a tag with the given display name. */
export function tagLabelName(name: string): string {
  return `${TAG_LABEL_PREFIX}${name}`;
}

// Hand-picked colours/icons for the built-in "starter" labels (the old fixed
// taxonomy), so an approved Receipt/Security/etc. tag looks the way it always
// did. Keyed by lower-cased name. Anything not here gets a deterministic style.
const STARTER_TAG_STYLE: Record<string, { color: TagColor; icon: TagIconKey }> = {
  personal: { color: "blue", icon: "heart" },
  work: { color: "violet", icon: "bolt" },
  finance: { color: "green", icon: "bookmark" },
  receipt: { color: "teal", icon: "bookmark" },
  newsletter: { color: "amber", icon: "bookmark" },
  promotion: { color: "pink", icon: "flame" },
  update: { color: "slate", icon: "dot" },
  security: { color: "red", icon: "flag" },
  travel: { color: "blue", icon: "star" },
  social: { color: "pink", icon: "heart" },
  other: { color: "slate", icon: "tag" },
};

/** Deterministic colour/icon for a tag created from a label name. Starter names
 *  keep their hand-picked look; invented names get a stable colour derived from
 *  the name so the same label always lands on the same colour. */
export function defaultTagStyle(name: string): { color: TagColor; icon: TagIconKey } {
  const key = name.trim().toLowerCase();
  const starter = STARTER_TAG_STYLE[key];
  if (starter) return starter;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return { color: TAG_COLOR_KEYS[hash % TAG_COLOR_KEYS.length], icon: DEFAULT_TAG_ICON };
}
