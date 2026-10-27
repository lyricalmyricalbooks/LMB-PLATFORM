import { Truck } from "lucide-react";
import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";
import type { PdpFreeShip } from "./pdpFreeShipping";

// The free-shipping line under the buy buttons (Studio › Style › Book page · photos & layout ›
// showPdpFreeShipping). The amount comes from Settings › Shipping; the words are Text & labels › Product page.
export default function PdpFreeShipping({ info, design, formatPrice }: { info: PdpFreeShip | null; design: any; formatPrice: (cad: number) => string }) {
  if (!info) return null;
  const text = info.kind === "free"
    ? getCopy(design, "pdpFreeShipQualifies")
    : info.kind === "away"
      ? getCopy(design, "pdpFreeShipAway", { amount: formatPrice(info.remaining), threshold: formatPrice(info.threshold) })
      : getCopy(design, "pdpFreeShipOver", { threshold: formatPrice(info.threshold) });
  if (!String(text).trim()) return null;
  return (
    <div {...regionProps("productFreeShipping")} className="fm-pdp-free-ship w-full flex items-start gap-2.5 text-left">
      <Truck size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
      <span className="fm-pdp-meta" translate="no">{text}</span>
    </div>
  );
}
