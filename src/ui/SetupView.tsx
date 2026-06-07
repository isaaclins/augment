import { useAugment, type View } from "../state/augment";
import { RulesManager } from "./RulesManager";
import { TemplatesManager } from "./TemplatesManager";
import { QuickActionsManager } from "./QuickActionsManager";

// Setup groups the three configuration surfaces — Rules, Templates, Quick
// Actions — under one destination with tabs, instead of three sidebar entries
// (UI-AUDIT H2). Each tab is still its own `view` value, so ⌘K navigation and
// the ⌘4 keybind keep landing here.
const TABS: { id: View; label: string }[] = [
  { id: "rules", label: "Rules" },
  { id: "templates", label: "Templates" },
  { id: "quickActions", label: "Quick Actions" },
];

export function SetupView() {
  const { view, setView } = useAugment();
  const active: View = view === "templates" || view === "quickActions" ? view : "rules";

  return (
    <div className="setup">
      <div className="setup-tabs" role="tablist" aria-label="Setup">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={`setup-tab ${active === tab.id ? "is-active" : ""}`}
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="setup-body">
        {active === "rules" && <RulesManager />}
        {active === "templates" && <TemplatesManager />}
        {active === "quickActions" && <QuickActionsManager />}
      </div>
    </div>
  );
}
