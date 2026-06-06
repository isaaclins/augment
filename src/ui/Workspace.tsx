import { useAugment } from "../state/augment";
import { Sidebar } from "./Sidebar";
import { InboxView } from "./InboxView";
import { SchedulePanel } from "./SchedulePanel";
import { RulesManager } from "./RulesManager";

export function Workspace() {
  const { view } = useAugment();

  return (
    <div className="workspace">
      <Sidebar />
      <main className="main">
        {(view === "inbox" || view === "folder") && <InboxView />}
        {view === "snoozed" && <SchedulePanel kind="snooze" />}
        {view === "watching" && <SchedulePanel kind="watch" />}
        {view === "rules" && <RulesManager />}
      </main>
    </div>
  );
}
