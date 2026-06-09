// Sidebar folders are backed 1:1 by a nested Gmail label
// (`Augment/Folders/<name>`) so applying or moving one syncs to Gmail and a
// folder existing in Gmail can be auto-imported on sign-in. The folder's
// display name lives in localStorage (see `Folder` in `store.ts`); the thread
// association lives in Gmail.

export const FOLDER_LABEL_PREFIX = "Augment/Folders/";

/** The Gmail label name backing a folder with the given display name. */
export function folderLabelName(name: string): string {
  return `${FOLDER_LABEL_PREFIX}${name}`;
}

/** If `labelName` is a folder-backing label (`Augment/Folders/<name>`), return
 *  the bare folder name. Otherwise null. Used to import pre-existing Gmail
 *  labels as Augment folders on sign-in. */
export function parseFolderLabelName(labelName: string): string | null {
  if (!labelName.startsWith(FOLDER_LABEL_PREFIX)) return null;
  const name = labelName.slice(FOLDER_LABEL_PREFIX.length).trim();
  return name.length > 0 ? name : null;
}
