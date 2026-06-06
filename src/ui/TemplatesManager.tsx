import { useState } from "react";
import { useAugment } from "../state/augment";
import { templatePreview, type Template } from "../lib/features/templates";
import { RichTextEditor } from "./RichTextEditor";
import { CheckIcon, ExternalIcon, FileIcon, PlusIcon, RefreshIcon, TrashIcon } from "./icons";

interface Draft {
  id?: string;
  name: string;
  body: string;
}

function TemplateEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Draft;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [body, setBody] = useState(initial.body);
  const canSave = name.trim().length > 0;

  return (
    <div className="tpl-editor">
      <input
        className="input"
        value={name}
        placeholder="Template name (used as the email subject)"
        maxLength={200}
        onChange={(event) => setName(event.target.value)}
        autoFocus
      />
      <RichTextEditor
        initialHtml={initial.body}
        placeholder="Write the template body…"
        onChange={setBody}
      />
      <div className="tpl-editor-foot">
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          type="button"
          disabled={!canSave}
          onClick={() => onSave({ id: initial.id, name, body })}
        >
          <CheckIcon size={15} /> Save template
        </button>
      </div>
    </div>
  );
}

export function TemplatesManager() {
  const { templates, templatesLoading, refreshTemplates, saveTemplate, deleteTemplate, useTemplate } =
    useAugment();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h2>{editing.id ? "Edit template" : "New template"}</h2>
        </div>
        <TemplateEditor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={async (draft) => {
            setSaving(true);
            await saveTemplate(draft.name, draft.body, draft.id);
            setSaving(false);
            setEditing(null);
          }}
        />
        {saving && <div className="panel-empty">Saving…</div>}
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Templates</h2>
        <div className="panel-head-actions">
          <button
            className="icon-btn"
            type="button"
            title="Refresh"
            disabled={templatesLoading}
            onClick={() => void refreshTemplates()}
          >
            <RefreshIcon size={16} className={templatesLoading ? "spin" : undefined} />
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setEditing({ name: "", body: "" })}
          >
            <PlusIcon size={15} /> New template
          </button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="panel-empty">
          <FileIcon size={22} />
          <p>
            {templatesLoading
              ? "Loading templates…"
              : "No templates yet. Create one — it's stored in Gmail (as a labeled message, never sent) so it syncs everywhere."}
          </p>
        </div>
      ) : (
        <div className="panel-list">
          {templates.map((template: Template) => (
            <div key={template.id} className="tpl-card">
              <div className="tpl-card-body" onClick={() => setEditing({ ...template })}>
                <div className="tpl-card-name">{template.name}</div>
                <div className="tpl-card-preview">{templatePreview(template) || "Empty template"}</div>
              </div>
              <div className="tpl-card-actions">
                <button className="action-btn" type="button" onClick={() => void useTemplate(template)}>
                  <ExternalIcon size={14} /> Use
                </button>
                <button className="action-btn" type="button" onClick={() => setEditing({ ...template })}>
                  Edit
                </button>
                <button
                  className="icon-btn"
                  type="button"
                  title="Delete template"
                  onClick={() => void deleteTemplate(template.id)}
                >
                  <TrashIcon size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
