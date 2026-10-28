import { useEffect } from "react";
import { SecondaryButton } from "./riso/components";
import type { SupportVisit } from "./supportSession";

/** "10:42 pm": the end of a support visit, in the viewer's own clock. */
export const supportEndText = (until: number) => new Date(until * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * Shown on every admin page while platform support is signed in (supportSession.ts): who, why and until when, with a
 * Sign out button. When the time runs out it signs out by itself; the server and rules already refuse it by then.
 */
export function SupportBanner({ visit, onSignOut }: { visit: SupportVisit | null; onSignOut: () => void }) {
  useEffect(() => {
    if (!visit) return;
    const left = visit.until * 1000 - Date.now();
    const timer = window.setTimeout(onSignOut, Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [visit?.until]);
  if (!visit) return null;
  return (
    <div role="status" className="rp-alert" data-tone="warning" data-support-banner="">
      <span className="rp-alert-glyph" aria-hidden="true">!</span>
      <div className="rp-alert-text">
        <span className="rp-alert-kicker">Platform support</span>
        <strong className="rp-alert-title">{visit.by || "Platform support"} is signed in until {supportEndText(visit.until)}.</strong>
        {visit.reason && <span className="rp-alert-detail">Why: {visit.reason}. This visit is in your shop's log.</span>}
      </div>
      <div className="rp-alert-actions">
        <SecondaryButton size="sm" onClick={onSignOut}>Sign out</SecondaryButton>
      </div>
    </div>
  );
}
