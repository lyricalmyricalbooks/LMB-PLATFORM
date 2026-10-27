import { useEffect, useState } from "react";
import { getCopy } from "../../storeCopy";
import { designNumber } from "../../designNumber";
import { releaseCountdown, releaseCountdownCopy } from "./releaseCountdown";

// The pre-order stock line's words. With Studio › Style › Book page · photos & layout › showPdpReleaseCountdown on
// (`look` = the book page's resolved design; words come from `design`), the last hours before the release day count down
// ("Out in 2d 5h · pre-order now"); otherwise, and in the prerendered HTML (the clock starts after mount), `fallback`.
export default function ReleaseCountdownText({ releaseDate, fallback, design, look }: { releaseDate: string; fallback: string; design: any; look: any }) {
  const countdownOn = look?.showPdpReleaseCountdown === true;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!countdownOn) { setNow(null); return; }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [countdownOn, releaseDate]);
  const left = now === null ? null : releaseCountdown(releaseDate, now, designNumber(look, "pdpReleaseCountdownWithin", 72));
  const text = left ? getCopy(design, releaseCountdownCopy(left).key, releaseCountdownCopy(left).values) : "";
  if (!left || !String(text).trim()) return <>{fallback}</>;
  return <span className="fm-pdp-release-countdown" data-countdown="on">{text}</span>;
}
