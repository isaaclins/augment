// Visual bits for triage results on inbox rows. With the open taxonomy the label
// itself is shown as a chip: tinted like its tag when the label is known, or in a
// muted "proposed" style (with a ✨) when it's a brand-new label still awaiting
// approval in the assistant. High-priority mail also gets a small red "High" pill.

import type { ReactElement } from "react";
import { defaultTagStyle, TAG_PALETTE, type Tag } from "../lib/tags";
import { TAG_ICON_COMPONENTS, tagChipStyle } from "./tags";
import type { TriagePriority } from "../lib/features/triage";
import { SparkleIcon, TagIcon } from "./icons";

/** The small red pill shown for high-priority mail (nothing otherwise). */
export function PriorityPill({ priority }: { priority: TriagePriority }): ReactElement | null {
  if (priority !== "high") return null;
  return <span className="triage-priority">High</span>;
}

/** The label chip. `tag` present → render it tinted in the tag's colour (a known
 *  label). Absent → a muted, ✨-marked "proposed" chip for a not-yet-approved label. */
export function CategoryChip({ name, tag }: { name: string; tag?: Tag }): ReactElement {
  if (tag) {
    const Icon = TAG_ICON_COMPONENTS[tag.icon] ?? TagIcon;
    return (
      <span className="tag-chip" style={tagChipStyle(tag.color)}>
        <Icon size={11} />
        <span className="tag-chip-label">{name}</span>
      </span>
    );
  }
  const color = TAG_PALETTE[defaultTagStyle(name).color];
  return (
    <span
      className="tag-chip triage-chip-proposed"
      style={{ color, background: "transparent", borderColor: `${color}66` }}
      title="Proposed label — approve it in the assistant to apply"
    >
      <SparkleIcon size={11} />
      <span className="tag-chip-label">{name}</span>
    </span>
  );
}
