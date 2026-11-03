// A reminder on the admin home (code plan 22.10): an owner on a paid plan without two-step sign-in is asked to set it
// up before a plan, card or billing change is refused for want of it (accounts/twoStep.js). "Not now" hides it on this
// browser for two weeks; it never shows to staff, on a trial, or once two-step is on.
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { User } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { adminApi } from "./api";
import { appsSetUp, firebaseTwoStep, type TwoStepAuth } from "./adminTwoStep";
import { PrimaryButton, SecondaryButton } from "./riso/components";
import type { PlatformPlan } from "./platformPlan";

export const REMINDER_KEY = "lmb.twoStepReminderHiddenUntil";
const HIDE_MS = 14 * 24 * 60 * 60 * 1000;

/** The plan states that are paid (the same ones accounts/twoStep.js asks two-step for). */
export const planIsPaid = (plan: PlatformPlan | null | undefined) => plan?.state === "active" || plan?.state === "payment-problem";

function hiddenNow(now: number): boolean {
  try { return Number(localStorage.getItem(REMINDER_KEY) || 0) > now; } catch { return false; }
}

export function TwoStepReminder({ plan, two = firebaseTwoStep(auth), user = auth.currentUser, role = adminApi.myRole, now = Date.now }: {
  plan: PlatformPlan | null | undefined;
  two?: TwoStepAuth;
  user?: User | null;
  role?: () => Promise<string | null>;
  now?: () => number;
}) {
  const [owner, setOwner] = useState(false);
  const [hidden, setHidden] = useState(() => hiddenNow(now()));
  const due = !!user && planIsPaid(plan) && !hidden && appsSetUp(two, user).length === 0;
  useEffect(() => {
    if (!due) return;
    let live = true;
    role().then((r) => { if (live) setOwner(r === "owner"); }).catch(() => { if (live) setOwner(false); });
    return () => { live = false; };
  }, [due]);
  if (!due || !owner) return null;
  const notNow = () => {
    try { localStorage.setItem(REMINDER_KEY, String(now() + HIDE_MS)); } catch { /* hidden for this visit only */ }
    setHidden(true);
  };
  return (
    <div role="status" className="rp-alert" data-tone="info" data-two-step-reminder="">
      <span className="rp-alert-glyph" aria-hidden="true"><ShieldCheck size={16} /></span>
      <div className="rp-alert-text">
        <strong className="rp-alert-title">Protect your shop with two-step sign-in.</strong>
        <span className="rp-alert-detail">Your plan is paid, so changes to your plan, cards and billing details need a code from an authenticator app. Setting it up takes two minutes.</span>
      </div>
      <div className="rp-alert-actions">
        <PrimaryButton size="sm" onClick={() => { window.location.hash = "#settings/security"; }}>Set it up</PrimaryButton>
        <SecondaryButton size="sm" onClick={notNow}>Not now</SecondaryButton>
      </div>
    </div>
  );
}
