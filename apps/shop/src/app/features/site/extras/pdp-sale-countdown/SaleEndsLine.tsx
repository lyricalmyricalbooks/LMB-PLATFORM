import { useEffect, useState } from "react";
import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";
import { formatReleaseDate } from "../../preorder";
import { designNumber } from "../../designNumber";
import { saleCountdown, saleCountdownCopy } from "../../saleCountdown";

// "Sale ends {date}" under the book page price. With Studio › Style › Book page · photos & layout ›
// showPdpSaleCountdown on (`look` = the book page's resolved design; words come from `design`), the sale's last hours count down instead ("Sale ends in 5h 12m"). The clock starts
// only after the page mounts, so the prerendered HTML always carries the plain date line.
export default function SaleEndsLine({ endDate, design, look }: { endDate: string; design: any; look: any }) {
  const countdownOn = look?.showPdpSaleCountdown === true;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!countdownOn) { setNow(null); return; }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [countdownOn, endDate]);
  const left = now === null ? null : saleCountdown(endDate, now, designNumber(look, "pdpSaleCountdownWithin", 72));
  const copy = left ? saleCountdownCopy(left) : null;
  // Past the end while the page stayed open: say nothing rather than a date that has gone.
  if (now !== null && !left && saleCountdown(endDate, now, Number.MAX_SAFE_INTEGER) === null) return null;
  const text = copy ? getCopy(design, copy.key, copy.values) : getCopy(design, "pdpSaleEnds", { date: formatReleaseDate(endDate) });
  if (!String(text).trim()) return null;
  return (
    <span {...regionProps("productSaleEnds")} className="fm-pdp-meta fm-pdp-sale-ends" data-countdown={copy ? "on" : undefined} aria-live={copy ? "off" : undefined}>
      {text}
    </span>
  );
}
