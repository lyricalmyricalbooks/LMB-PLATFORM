import { useEffect, useState } from "react";
import { PackageCheck } from "lucide-react";
import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";
import { designNumber } from "../../designNumber";
import { closedDays, formatShipDate, shipBy, shipByCopy } from "../../shipBy";

// "Order now — ships by {date}" under the buy buttons (Studio › Style › Book page · photos & layout › showPdpShipBy;
// `look` = the book page's resolved design, words from `design`). The date depends on the shopper's clock, so it is
// drawn only after the page mounts (never in the prerendered HTML, which could be days old) and re-checked every 30 s.
export default function PdpShipBy({ design, look }: { design: any; look: any }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (now === null) return null;
  const s = shipBy(now, {
    days: designNumber(look, "pdpShipByDays", 2),
    cutoffHour: designNumber(look, "pdpShipByCutoff", 14),
    closed: closedDays(look?.pdpShipByClosedDays),
  });
  if (!s) return null;
  const copy = shipByCopy(s, formatShipDate(s.date), designNumber(look, "pdpShipByCountdownHours", 4));
  const text = getCopy(design, copy.key, copy.values);
  if (!String(text).trim()) return null;
  return (
    <div {...regionProps("productShipBy")} className="fm-pdp-ship-by w-full flex items-start gap-2.5 text-left" data-countdown={copy.key === "pdpShipByCountdown" ? "on" : undefined}>
      <PackageCheck size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
      <span className="fm-pdp-meta" translate="no">{text}</span>
    </div>
  );
}
