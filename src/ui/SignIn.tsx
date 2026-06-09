import { useState } from "react";
import { useAugment } from "../state/augment";
import {
  MailIcon,
  SlidersIcon,
  ClockIcon,
  EyeIcon,
  ShieldIcon,
  CheckIcon,
  CloseIcon,
} from "./icons";

type Step = 0 | 1 | 2;

export function SignIn() {
  const { status, error, signIn, cancelSignIn } = useAugment();
  const authenticating = status === "authenticating";
  const [step, setStep] = useState<Step>(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const go = (next: Step) => {
    if (next === step) return;
    setDirection(next > step ? "forward" : "back");
    setStep(next);
  };

  return (
    <div className="signin">
      <div className="signin-grain" aria-hidden />
      <div className="signin-card" role="dialog" aria-label="Welcome to Augment">
        <header className="signin-head">
          <div className="signin-eyebrow">
            <span className="signin-dot" aria-hidden />
            <span>{authenticating ? "WAITING ON GOOGLE" : `STEP ${step + 1} OF 3`}</span>
            <span className="signin-eyebrow-sep" aria-hidden>·</span>
            <span>v0.1</span>
          </div>
          <div className="signin-mark-mini">
            <div className="signin-logo signin-logo--sm">
              <MailIcon size={14} />
            </div>
            <span className="signin-wordmark">Augment</span>
          </div>
        </header>

        <div
          className="signin-stepper"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={3}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`signin-step-dot${i <= step ? " is-active" : ""}${i === step ? " is-current" : ""}`}
            />
          ))}
        </div>

        <div key={step} className={`signin-step signin-step--${direction}`}>
          {step === 0 && <WelcomeStep onNext={() => go(1)} />}
          {step === 1 && <FeaturesStep onNext={() => go(2)} onBack={() => go(0)} />}
          {step === 2 && (
            <ConnectStep
              authenticating={authenticating}
              error={status === "error" ? error : null}
              onSignIn={() => void signIn()}
              onCancel={() => cancelSignIn()}
              onBack={() => go(1)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <>
      <div className="signin-hero">
        <div className="signin-logo signin-logo--xl">
          <MailIcon size={30} />
        </div>
        <h1 className="signin-title">Make Gmail work the way you do.</h1>
        <p className="signin-sub">
          A small Mac app that sits on top of your inbox. Augment adds rules,
          snooze, and reply reminders — without sending your email anywhere.
        </p>
      </div>
      <div className="signin-nav signin-nav--end">
        <button className="btn btn-primary btn-lg signin-cta" type="button" onClick={onNext}>
          <span>Get started</span>
          <span className="signin-cta-arrow" aria-hidden>→</span>
        </button>
      </div>
    </>
  );
}

function FeaturesStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <>
      <h2 className="signin-title signin-title--step">What you can do</h2>
      <ul className="signin-feats">
        <li>
          <span className="signin-feat-icon"><SlidersIcon size={15} /></span>
          <div>
            <strong>Rules that fire automatically</strong>
            <em>Label, archive, or sort messages by sender, subject, or keyword.</em>
          </div>
        </li>
        <li>
          <span className="signin-feat-icon"><ClockIcon size={15} /></span>
          <div>
            <strong>Snooze until later</strong>
            <em>Hide a thread until tomorrow morning, next Monday, or a date you pick.</em>
          </div>
        </li>
        <li>
          <span className="signin-feat-icon"><EyeIcon size={15} /></span>
          <div>
            <strong>Watch for reply</strong>
            <em>Get nudged if nobody writes back within the window you set.</em>
          </div>
        </li>
        <li>
          <span className="signin-feat-icon"><ShieldIcon size={15} /></span>
          <div>
            <strong>Local-first by design</strong>
            <em>Your inbox stays on your Mac. Augment talks straight to Gmail.</em>
          </div>
        </li>
      </ul>
      <div className="signin-nav">
        <button className="signin-back" type="button" onClick={onBack}>← Back</button>
        <button className="btn btn-primary btn-lg signin-cta" type="button" onClick={onNext}>
          <span>Continue</span>
          <span className="signin-cta-arrow" aria-hidden>→</span>
        </button>
      </div>
    </>
  );
}

function ConnectStep({
  authenticating,
  error,
  onSignIn,
  onCancel,
  onBack,
}: {
  authenticating: boolean;
  error: string | null;
  onSignIn: () => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <h2 className="signin-title signin-title--step">Connect your Gmail</h2>
      <p className="signin-sub">
        Sign in with Google to finish setup. You can sign out from Settings at
        any time and Augment forgets your account.
      </p>

      <div className="signin-perms">
        <div className="signin-perms-col">
          <p className="signin-perms-label">Augment can</p>
          <ul className="signin-perm-list">
            <li><span className="signin-perm-yes" aria-hidden><CheckIcon size={11} /></span>Read messages to run rules</li>
            <li><span className="signin-perm-yes" aria-hidden><CheckIcon size={11} /></span>Add and remove labels</li>
            <li><span className="signin-perm-yes" aria-hidden><CheckIcon size={11} /></span>Archive messages</li>
          </ul>
        </div>
        <div className="signin-perms-col">
          <p className="signin-perms-label">Never will</p>
          <ul className="signin-perm-list">
            <li><span className="signin-perm-no" aria-hidden><CloseIcon size={11} /></span>Send mail as you</li>
            <li><span className="signin-perm-no" aria-hidden><CloseIcon size={11} /></span>Delete messages</li>
            <li><span className="signin-perm-no" aria-hidden><CloseIcon size={11} /></span>Mark messages spam</li>
          </ul>
        </div>
      </div>

      <button
        className="btn btn-primary btn-lg signin-cta"
        onClick={onSignIn}
        disabled={authenticating}
        type="button"
      >
        <span>{authenticating ? "Waiting for Google…" : "Sign in with Google"}</span>
        <span className="signin-cta-arrow" aria-hidden>→</span>
      </button>

      {authenticating && (
        <div className="signin-pending">
          <p className="signin-hint">A browser window opened — approve access, then return here.</p>
          <button className="signin-cancel" type="button" onClick={onCancel}>Cancel</button>
        </div>
      )}
      {error && <p className="signin-error">{error}</p>}

      {!authenticating && (
        <div className="signin-nav signin-nav--start">
          <button className="signin-back" type="button" onClick={onBack}>← Back</button>
        </div>
      )}

      <p className="signin-foot">
        Augment requests the <code>gmail.modify</code> scope. Your sign-in is saved
        in your system keychain so you stay logged in across launches.
      </p>
    </>
  );
}
