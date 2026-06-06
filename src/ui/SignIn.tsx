import { useAugment } from "../state/augment";
import { ClockIcon, EyeIcon, MailIcon, ShieldIcon, SlidersIcon } from "./icons";

const FEATURES = [
  { icon: <SlidersIcon size={18} />, title: "Rules", body: "Auto-label and archive with conditions you define." },
  { icon: <ClockIcon size={18} />, title: "Snooze", body: "Hide a thread until later — it resurfaces with a nudge." },
  { icon: <EyeIcon size={18} />, title: "Watch for reply", body: "Get pinged if a thread goes quiet past your deadline." },
  { icon: <ShieldIcon size={18} />, title: "Private rendering", body: "Mail renders with zero remote content. Ever." },
];

export function SignIn() {
  const { status, error, signIn, cancelSignIn } = useAugment();
  const authenticating = status === "authenticating";

  return (
    <div className="signin">
      <div className="signin-card">
        <div className="signin-brand">
          <div className="signin-logo">
            <MailIcon size={26} />
          </div>
          <div>
            <h1>Augment</h1>
            <p className="signin-tag">Power features on top of Gmail</p>
          </div>
        </div>

        <ul className="signin-features">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <span className="signin-feature-icon">{feature.icon}</span>
              <span>
                <strong>{feature.title}</strong>
                <em>{feature.body}</em>
              </span>
            </li>
          ))}
        </ul>

        <button className="btn btn-primary btn-lg" onClick={() => void signIn()} disabled={authenticating} type="button">
          {authenticating ? "Waiting for Google…" : "Sign in with Google"}
        </button>

        {authenticating && (
          <>
            <p className="signin-hint">A browser window opened — approve access, then return here.</p>
            <button className="signin-cancel" type="button" onClick={() => cancelSignIn()}>
              Cancel
            </button>
          </>
        )}
        {status === "error" && error && <p className="signin-error">{error}</p>}

        <p className="signin-foot">
          Augment requests the <code>gmail.modify</code> scope (read, label, archive). It never sends, deletes, or
          marks spam. Your sign-in is saved in your system keychain so you stay logged in — sign out anytime to
          remove it.
        </p>
      </div>
    </div>
  );
}
