// Shared visual helpers for tags: the per-tag icon registry, the small inline
// glyph (an icon tinted in the tag's colour), and the pill chip rendered on
// inbox rows. Colours come from TAG_PALETTE; chip backgrounds are the same hue
// at low alpha so they read on both light and dark themes.

import type { CSSProperties, ReactElement } from "react";
import { TAG_PALETTE, type Tag, type TagColor, type TagIconKey } from "../lib/tags";
import {
  BoltIcon,
  BookmarkIcon,
  DotIcon,
  FlagIcon,
  FlameIcon,
  HeartIcon,
  StarIcon,
  TagIcon,
} from "./icons";

type IconProps = { size?: number; style?: CSSProperties; className?: string };
type IconComponent = (props: IconProps) => ReactElement;

export const TAG_ICON_COMPONENTS: Record<TagIconKey, IconComponent> = {
  tag: TagIcon,
  star: StarIcon,
  flag: FlagIcon,
  bolt: BoltIcon,
  heart: HeartIcon,
  bookmark: BookmarkIcon,
  flame: FlameIcon,
  dot: DotIcon,
};

/** An icon in the tag's colour, for sidebar rows and menus. */
export function TagGlyph({
  color,
  icon,
  size = 14,
}: {
  color: TagColor;
  icon: TagIconKey;
  size?: number;
}): ReactElement {
  const Icon = TAG_ICON_COMPONENTS[icon] ?? TagIcon;
  return <Icon size={size} style={{ color: TAG_PALETTE[color] }} />;
}

/** Inline style for a tinted tag surface (chip / swatch background). */
export function tagChipStyle(color: TagColor): CSSProperties {
  const hex = TAG_PALETTE[color];
  return { color: hex, background: `${hex}1f`, borderColor: `${hex}4d` };
}

/** The colored pill shown on inbox rows and in the editor preview. */
export function TagChip({ tag, size = 11 }: { tag: Tag; size?: number }): ReactElement {
  const Icon = TAG_ICON_COMPONENTS[tag.icon] ?? TagIcon;
  return (
    <span className="tag-chip" style={tagChipStyle(tag.color)}>
      <Icon size={size} />
      <span className="tag-chip-label">{tag.name}</span>
    </span>
  );
}
