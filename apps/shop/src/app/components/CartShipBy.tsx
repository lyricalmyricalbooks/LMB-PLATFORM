import { useEffect, useState } from "react";
import { PackageCheck } from "lucide-react";
import { getCopy } from "../features/site/storeCopy";
import { designNumber } from "../features/site/designNumber";
import { closedDays, formatShipDate, shipBy, shipByCopy } from "../features/site/shipBy";

// "Order now — ships by {date}" above the bag total (Studio › Style › Cart drawer › Ships-by line). The rules are
// the book page's Ships-by settings; the date depends on the shopper's clock, so it is drawn only after mount and
// re-checked every 30 s. The bag decides whether it may show (bagShipsOnSchedule).
export function CartShipBy({ design }: { design: any }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (now === null) return null;
  const s = shipBy(now, {
    days: designNumber(design, "pdpShipByDays", 2),
    cutoffHour: designNumber(design, "pdpShipByCutoff", 14),
    closed: closedDays(design?.pdpShipByClosedDays),
  });
  if (!s) return null;
  const copy = shipByCopy(s, formatShipDate(s.date), designNumber(design, "pdpShipByCountdownHours", 4), { plain: "cartShipBy", countdown: "cartShipByCountdown" });
  const text = getCopy(design, copy.key, copy.values);
  if (!String(text).trim()) return null;
  return (
    <p data-studio-target="style:cartDrawer|copy:Cart" data-studio-label="Bag ships-by line" className="fm-bag-meta fm-bag-ship-by flex items-start gap-2"
      style={{ textTransform: "none", letterSpacing: "0.02em" }} data-countdown={copy.key === "cartShipByCountdown" ? "on" : undefined}>
      <PackageCheck size={13} aria-hidden="true" className="shrink-0 mt-0.5" />
      <span translate="no">{text}</span>
    </p>
  );
}
