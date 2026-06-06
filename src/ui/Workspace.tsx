import { useEffect } from "react";
import { useAugment } from "../state/augment";
import { NAV_ACTIONS, matchCombo } from "../lib/keybinds";
import { Sidebar } from "./Sidebar";
import { InboxView } from "./InboxView";
import { SchedulePanel } from "./SchedulePanel";
import { RulesManager } from "./RulesManager";
import { TemplatesManager } from "./TemplatesManager";
import { SettingsView } from "./SettingsView";

// App-wide navigation shortcuts (⌘1–4 by default). We ignore keypresses while
// the user is typing or recording a new binding so they don't steal the keys.
function useNavShortcuts() {
  const { settings, setView } = useAugment();
  const keybinds = settings.keybinds;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"], [data-keycapture]')) return;
      for (const action of NAV_ACTIONS) {
        if (matchCombo(event, keybinds[action.id])) {
          event.preventDefault();
          setView(action.id);
          return;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keybinds, setView]);
}

export function Workspace() {
  const { view } = useAugment();
  useNavShortcuts();

  return (
    <div className="workspace">
      <Sidebar />
      <main className="main">
        {(view === "inbox" || view === "folder") && <InboxView />}
        {view === "snoozed" && <SchedulePanel kind="snooze" />}
        {view === "watching" && <SchedulePanel kind="watch" />}
        {view === "rules" && <RulesManager />}
        {view === "templates" && <TemplatesManager />}
        {view === "settings" && <SettingsView />}
      </main>
    </div>
  );
}
