// A right-click context menu rendered at a screen position. Supports actions,
// separators, and one level of hover-opened submenus. Closes on outside click,
// Escape, scroll, resize, or window blur.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type MenuNode =
  | { kind: "item"; label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }
  | { kind: "submenu"; label: string; icon?: ReactNode; items: MenuNode[]; disabled?: boolean }
  | { kind: "separator" };

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuNode[];
  onClose: () => void;
}

function MenuList({ items, onClose }: { items: MenuNode[]; onClose: () => void }) {
  const [openSub, setOpenSub] = useState<number | null>(null);

  return (
    <div className="ctx-menu" role="menu">
      {items.map((item, i) => {
        if (item.kind === "separator") return <div key={i} className="ctx-sep" />;

        if (item.kind === "submenu") {
          const open = openSub === i && !item.disabled;
          return (
            <div
              key={i}
              className={`ctx-item ctx-has-sub ${item.disabled ? "ctx-disabled" : ""}`}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open}
              onMouseEnter={() => setOpenSub(i)}
            >
              {item.icon && <span className="ctx-icon">{item.icon}</span>}
              <span className="ctx-label">{item.label}</span>
              <span className="ctx-caret">›</span>
              {open && (
                <div className="ctx-submenu">
                  <MenuList items={item.items} onClose={onClose} />
                </div>
              )}
            </div>
          );
        }

        return (
          <button
            key={i}
            type="button"
            className={`ctx-item ${item.danger ? "ctx-danger" : ""}`}
            role="menuitem"
            disabled={item.disabled}
            onMouseEnter={() => setOpenSub(null)}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            {item.icon && <span className="ctx-icon">{item.icon}</span>}
            <span className="ctx-label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Keep the menu fully on-screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 8;
    const { width, height } = el.getBoundingClientRect();
    const nx = x + width + pad > window.innerWidth ? Math.max(pad, window.innerWidth - width - pad) : x;
    const ny = y + height + pad > window.innerHeight ? Math.max(pad, window.innerHeight - height - pad) : y;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="ctx-root"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuList items={items} onClose={onClose} />
    </div>
  );
}
