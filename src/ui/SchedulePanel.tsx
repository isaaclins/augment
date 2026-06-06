import type { ReactElement } from "react";
import { useAugment } from "../state/augment";
import type { ScheduleKind } from "../lib/scheduler/api";
import { formatDateTime, formatRelative } from "../lib/time";
import { ClockIcon, ExternalIcon, EyeIcon } from "./icons";

const COPY: Record<ScheduleKind, { title: string; empty: string; cancel: string; icon: () => ReactElement }> = {
  snooze: {
    title: "Snoozed",
    empty: "No snoozed conversations. Snooze one from the reader to hide it until later.",
    cancel: "Bring back now",
    icon: () => <ClockIcon size={16} />,
  },
  watch: {
    title: "Watching for replies",
    empty: "Not watching any threads. Use “Watch for reply” in the reader to get nudged if a thread goes quiet.",
    cancel: "Stop watching",
    icon: () => <EyeIcon size={16} />,
  },
};

export function SchedulePanel({ kind }: { kind: ScheduleKind }) {
  const { schedule, cancelSchedule, openInGmail } = useAugment();
  const copy = COPY[kind];
  const items = schedule.filter((item) => item.kind === kind).sort((a, b) => a.dueAt - b.dueAt);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{copy.title}</h2>
        <span className="panel-count">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className="panel-empty">{copy.empty}</div>
      ) : (
        <div className="panel-list">
          {items.map((item) => {
            const overdue = item.dueAt <= Date.now();
            return (
              <div key={item.id} className="schedule-card">
                <div className="schedule-icon">{copy.icon()}</div>
                <div className="schedule-body">
                  <div className="schedule-subject">{item.subject}</div>
                  <div className="schedule-meta">
                    <span className={overdue ? "schedule-due overdue" : "schedule-due"}>
                      {kind === "snooze" ? "Returns" : "Deadline"} {formatRelative(item.dueAt)}
                    </span>
                    <span className="schedule-abs">{formatDateTime(item.dueAt)}</span>
                  </div>
                </div>
                <div className="schedule-actions">
                  <button className="action-btn" type="button" onClick={() => void openInGmail(item.threadId)}>
                    <ExternalIcon size={14} />
                    <span>Gmail</span>
                  </button>
                  <button className="action-btn" type="button" onClick={() => void cancelSchedule(item)}>
                    {copy.cancel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
