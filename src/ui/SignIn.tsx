import { useAugment } from "../state/augment";
import { MailIcon } from "./icons";

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

        <p className="signin-line">
          Rules, snooze, watch-for-reply, and zero-remote rendering on top of your inbox.
        </p>

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
