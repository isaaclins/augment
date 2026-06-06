// A minimal rich-text editor with two modes:
//  • Rich:  a contenteditable using document.execCommand for formatting.
//  • HTML:  a raw-source textarea, for pasting HTML you already have.
// Pasting rendered content (text/html) is sanitized on the way in, and the
// source view always yields a clean, body-only fragment — so neither path can
// leave raw markup or stylesheet text in the stored template.

import { useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from "react";
import { htmlToTemplateBody, sanitizeTemplateHtml } from "../lib/features/templates";

interface RichTextEditorProps {
  initialHtml: string;
  placeholder?: string;
  onChange: (html: string) => void;
}

const TOOLS: { cmd: string; label: string; title: string; className?: string }[] = [
  { cmd: "bold", label: "B", title: "Bold", className: "rte-b" },
  { cmd: "italic", label: "I", title: "Italic", className: "rte-i" },
  { cmd: "underline", label: "U", title: "Underline", className: "rte-u" },
  { cmd: "insertUnorderedList", label: "• List", title: "Bulleted list" },
  { cmd: "insertOrderedList", label: "1. List", title: "Numbered list" },
];

export function RichTextEditor({ initialHtml, placeholder, onChange }: RichTextEditorProps) {
  const richRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(sanitizeTemplateHtml(initialHtml));
  const [mode, setMode] = useState<"rich" | "html">("rich");
  const [sourceText, setSourceText] = useState(valueRef.current);

  // Seed the contenteditable whenever the rich view is (re)shown.
  useEffect(() => {
    if (mode === "rich" && richRef.current) richRef.current.innerHTML = valueRef.current;
  }, [mode]);

  function emit(html: string) {
    valueRef.current = html;
    onChange(html);
  }

  function syncFromRich() {
    emit(richRef.current?.innerHTML ?? "");
  }

  function run(cmd: string, value?: string) {
    richRef.current?.focus();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(cmd, false, value);
    syncFromRich();
  }

  function addLink() {
    const url = window.prompt("Link URL (https://…)");
    if (url) run("createLink", url);
  }

  // Prefer the clipboard's HTML flavor (sanitized) so pasting rendered content
  // from a browser keeps its formatting instead of dumping tags as text.
  function onPaste(event: ReactClipboardEvent<HTMLDivElement>) {
    const html = event.clipboardData.getData("text/html");
    if (!html) return; // plain text — let the default paste happen
    event.preventDefault();
    document.execCommand("insertHTML", false, htmlToTemplateBody(html));
    syncFromRich();
  }

  function toggleMode() {
    if (mode === "rich") {
      const current = richRef.current?.innerHTML ?? valueRef.current;
      valueRef.current = current;
      setSourceText(current);
      setMode("html");
    } else {
      emit(htmlToTemplateBody(sourceText));
      setMode("rich");
    }
  }

  function onSourceChange(text: string) {
    setSourceText(text);
    // Store the rendered body, so Saving from source view is always clean.
    emit(htmlToTemplateBody(text));
  }

  return (
    <div className="rte">
      <div className="rte-toolbar">
        {mode === "rich" && (
          <>
            {TOOLS.map((tool) => (
              <button
                key={tool.cmd}
                type="button"
                className={`rte-btn ${tool.className ?? ""}`}
                title={tool.title}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run(tool.cmd)}
              >
                {tool.label}
              </button>
            ))}
            <span className="rte-sep" />
            <button
              type="button"
              className="rte-btn"
              title="Add link"
              onMouseDown={(event) => event.preventDefault()}
              onClick={addLink}
            >
              Link
            </button>
            <button
              type="button"
              className="rte-btn"
              title="Clear formatting"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => run("removeFormat")}
            >
              Clear
            </button>
          </>
        )}
        <span className="rte-spacer" />
        <button
          type="button"
          className={`rte-btn rte-code ${mode === "html" ? "rte-btn-active" : ""}`}
          title={mode === "html" ? "Back to rich text" : "Edit / paste HTML source"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleMode}
        >
          &lt;/&gt;
        </button>
      </div>

      {mode === "rich" ? (
        <div
          ref={richRef}
          className="rte-area"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onInput={syncFromRich}
          onPaste={onPaste}
        />
      ) : (
        <textarea
          className="rte-source"
          value={sourceText}
          placeholder="Paste HTML source here (a full document is fine — only the body is kept)…"
          spellCheck={false}
          onChange={(event) => onSourceChange(event.target.value)}
        />
      )}
    </div>
  );
}
