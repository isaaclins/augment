import { useEffect } from "react";
import { useAugment } from "./state/augment";
import { SignIn } from "./ui/SignIn";
import { Workspace } from "./ui/Workspace";

// Suppress the webview's native context menu (its "Reload / Inspect Element"),
// so our own right-click menus are the only ones that show. Editable fields keep
// the native menu so copy/paste still works there.
function useSuppressNativeContextMenu() {
  useEffect(() => {
    function onContextMenu(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
    }
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);
}

function Shell() {
  const { status } = useAugment();
  if (status === "restoring") {
    return (
      <div className="signin">
        <div className="restoring">
          <div className="spinner" />
          <p>Restoring your session…</p>
        </div>
      </div>
    );
  }
  return status === "ready" ? <Workspace /> : <SignIn />;
}

export default function App() {
  useSuppressNativeContextMenu();
  return (
    <>
      {/* Draggable strip behind the macOS traffic lights (Overlay title bar). */}
      <div className="titlebar-drag" data-tauri-drag-region />
      <Shell />
    </>
  );
}
