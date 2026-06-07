import { useEffect, useState } from "react";
import { useAugment } from "../state/augment";
import {
  DEFAULT_TAG_COLOR,
  DEFAULT_TAG_ICON,
  TAG_COLOR_KEYS,
  TAG_ICON_KEYS,
  TAG_PALETTE,
  type Tag,
  type TagColor,
  type TagIconKey,
} from "../lib/tags";
import { TagChip, TagGlyph } from "./tags";
import { CheckIcon, TrashIcon } from "./icons";

// Modal for creating or editing a tag: name, colour swatch, and icon, with a
// live preview chip. Backdrop / Escape / Cancel close without saving.
export function TagEditor({ initial, onClose }: { initial: Tag | null; onClose: () => void }) {
  const { createTag, updateTag, deleteTag } = useAugment();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<TagColor>(initial?.color ?? DEFAULT_TAG_COLOR);
  const [icon, setIcon] = useState<TagIconKey>(initial?.icon ?? DEFAULT_TAG_ICON);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0;
  const previewTag: Tag = {
    id: "preview",
    name: trimmed || "Tag name",
    labelId: "",
    color,
    icon,
    source: initial?.source ?? "user",
  };

  async function save() {
    if (!canSave) return;
    if (initial) await updateTag(initial.id, { name: trimmed, color, icon });
    else await createTag({ name: trimmed, color, icon });
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal tag-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{initial ? "Edit tag" : "New tag"}</h2>
        </div>

        <div className="modal-body">
          <div className="tag-preview">
            <TagChip tag={previewTag} size={12} />
          </div>

          <label className="field">
            <span className="field-label">Name</span>
            <input
              className="input"
              autoFocus
              value={name}
              maxLength={40}
              placeholder="e.g. Important"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save();
              }}
            />
          </label>

          <div className="field">
            <span className="field-label">Color</span>
            <div className="swatch-grid">
              {TAG_COLOR_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`swatch ${key === color ? "swatch-active" : ""}`}
                  style={{ background: TAG_PALETTE[key] }}
                  title={key}
                  aria-label={key}
                  onClick={() => setColor(key)}
                >
                  {key === color && <CheckIcon size={14} />}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">Icon</span>
            <div className="icon-grid">
              {TAG_ICON_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`icon-option ${key === icon ? "icon-option-active" : ""}`}
                  title={key}
                  aria-label={key}
                  onClick={() => setIcon(key)}
                >
                  <TagGlyph color={color} icon={key} size={18} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          {initial ? (
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => {
                deleteTag(initial.id);
                onClose();
              }}
            >
              <TrashIcon size={15} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="modal-foot-right">
            <button className="btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" type="button" disabled={!canSave} onClick={() => void save()}>
              <CheckIcon size={15} /> {initial ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
