// A small popover that picks a duration preset and reports the absolute due
// timestamp. Shared by the snooze and watch controls.

import { useState, type ReactNode } from "react";
import { dueAtFromPreset, type DurationPreset } from "../lib/time";
import { useClickOutside } from "./hooks";

interface DurationMenuProps {
  label: string;
  icon: ReactNode;
  presets: DurationPreset[];
  onPick: (dueAt: number) => void;
  align?: "left" | "right";
}

export function DurationMenu({ label, icon, presets, onPick, align = "left" }: DurationMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  return (
    <div className="menu" ref={ref}>
      <button className="action-btn" onClick={() => setOpen((o) => !o)} type="button">
        {icon}
        <span>{label}</span>
      </button>
      {open && (
        <div className={`menu-pop menu-pop-${align}`} role="menu">
          {presets.map((preset) => (
            <button
              key={preset.id}
              className="menu-item"
              role="menuitem"
              type="button"
              onClick={() => {
                onPick(dueAtFromPreset(preset));
                setOpen(false);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
