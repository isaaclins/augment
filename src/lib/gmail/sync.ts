// Pure planners that decide how to reconcile Augment's local tags and folders
// with Gmail's user-label list. The orchestrator in `state/augment.tsx` calls
// these to compute a plan, then executes the migrations/prunes/imports as side
// effects. Splitting the decision out keeps the tricky bits testable without
// stubbing React state.
//
// Folder model: a sidebar folder is backed 1:1 by a `Augment/Folders/<name>`
// Gmail label. Legacy folders were backed by a bare `<name>` label and get
// migrated lazily on sign-in (see `migrations` below).
//
// Tag model: a sidebar tag is always backed by `Augment/Tags/<name>`; no
// migration step needed.

import type { Folder } from "../store";
import {
  defaultTagStyle,
  parseTagLabelName,
  type Tag,
  type TagColor,
  type TagIconKey,
} from "../tags";
import { folderLabelName, parseFolderLabelName } from "../folders";
import type { GmailLabel } from "./types";

export interface FolderMigration {
  /** Gmail label id of the bare `<name>` label to rename. */
  labelId: string;
  /** Current Gmail label name (bare). */
  fromName: string;
  /** Target Gmail label name (`Augment/Folders/<name>`). */
  toName: string;
}

export interface FolderImport {
  name: string;
}

export interface FolderSyncPlan {
  migrations: FolderMigration[];
  /** Local folders whose backing label is gone from Gmail (neither bare nor
   *  prefixed). Safe to drop. */
  prunes: Folder[];
  /** Gmail `Augment/Folders/*` labels not yet tracked locally. */
  imports: FolderImport[];
}

export function planFolderSync(input: {
  localFolders: Folder[];
  gmailLabels: GmailLabel[];
}): FolderSyncPlan {
  const byName = new Map(input.gmailLabels.map((l) => [l.name, l]));

  // Migrations: any folder whose prefixed label is missing but bare label
  // exists. We just record the intent; the executor calls updateLabel.
  const migrations: FolderMigration[] = [];
  for (const folder of input.localFolders) {
    const prefixed = folderLabelName(folder.name);
    if (byName.has(prefixed)) continue;
    const bare = byName.get(folder.name);
    if (!bare) continue;
    migrations.push({ labelId: bare.id, fromName: folder.name, toName: prefixed });
  }

  // Prunes: only when BOTH bare and prefixed labels are missing. A folder with
  // a still-present bare label is queued for migration above — even if the
  // migration fails (e.g. transient API error), the user's filed mail is still
  // attached to the bare label, so dropping the folder locally would be wrong.
  const prunes = input.localFolders.filter(
    (f) => !byName.has(folderLabelName(f.name)) && !byName.has(f.name),
  );

  // Imports: every prefixed Gmail label whose bare name isn't a locally known
  // folder. Case-insensitive match against local names; duplicate Gmail labels
  // (e.g. `Augment/Folders/Foo` and `Augment/Folders/foo`) are deduped.
  const localNames = new Set(input.localFolders.map((f) => f.name.toLowerCase()));
  const seen = new Set<string>();
  const imports: FolderImport[] = [];
  for (const label of input.gmailLabels) {
    const name = parseFolderLabelName(label.name);
    if (!name) continue;
    const lower = name.toLowerCase();
    if (localNames.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    imports.push({ name });
  }

  return { migrations, prunes, imports };
}

export interface TagImport {
  name: string;
  labelId: string;
  color: TagColor;
  icon: TagIconKey;
}

export interface TagSyncPlan {
  /** Local tags whose `Augment/Tags/<name>` label is gone from Gmail. */
  prunes: Tag[];
  /** Gmail `Augment/Tags/*` labels not yet tracked locally. */
  imports: TagImport[];
}

export function planTagSync(input: {
  localTags: Tag[];
  gmailLabels: GmailLabel[];
}): TagSyncPlan {
  const gmailTagLabels = new Map<string, GmailLabel>();
  for (const label of input.gmailLabels) {
    const name = parseTagLabelName(label.name);
    if (name) gmailTagLabels.set(name.toLowerCase(), label);
  }

  const prunes = input.localTags.filter((t) => !gmailTagLabels.has(t.name.toLowerCase()));

  const localNames = new Set(input.localTags.map((t) => t.name.toLowerCase()));
  const imports: TagImport[] = [];
  for (const [lower, label] of gmailTagLabels) {
    if (localNames.has(lower)) continue;
    const name = parseTagLabelName(label.name);
    if (!name) continue;
    const style = defaultTagStyle(name);
    imports.push({ name, labelId: label.id, color: style.color, icon: style.icon });
  }

  return { prunes, imports };
}
