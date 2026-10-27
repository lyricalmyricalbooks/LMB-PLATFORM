import { MapPin } from "lucide-react";
import { getCopy } from "./storeCopy";
import { regionProps } from "./storefrontRegions";
import type { PickupSpot } from "./pickupAvailability";

// "Pickup available at …" under the buy buttons (Studio › Style › Book page · photos & layout ›
// showPdpPickup). Locations, hours and estimates are the owner's own words from Settings › Shipping ›
// Local pickup & delivery; every other word is Text & labels › Product page.
export default function PickupAvailability({ spots, design, formatPrice }: { spots: PickupSpot[]; design: any; formatPrice: (cad: number) => string }) {
  if (!spots.length) return null;
  const one = spots.length === 1 ? spots[0] : null;
  const headline = one
    ? getCopy(design, "pdpPickupOne", { location: one.name })
    : getCopy(design, "pdpPickupMany", { count: spots.length });
  return (
    <div {...regionProps("productPickup")} className="fm-pdp-pickup w-full flex items-start gap-2.5 text-left">
      <MapPin size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1 min-w-0">
        <span className="fm-pdp-meta">{headline}</span>
        {one?.estimate && <span className="text-[12px] text-white/50">{one.estimate}</span>}
        <details className="fm-pdp-pickup-details text-[12px] text-white/50">
          <summary className="cursor-pointer underline underline-offset-2 w-fit">{getCopy(design, "pdpPickupDetails")}</summary>
          <ul className="mt-2 flex flex-col gap-2.5">
            {spots.map((spot) => (
              <li key={spot.id} className="flex flex-col gap-0.5">
                <span className="text-white/80">{spot.name}{spot.place ? ` · ${spot.place}` : ""}</span>
                <span translate="no">{spot.price > 0 ? getCopy(design, "pdpPickupFee", { price: formatPrice(spot.price) }) : getCopy(design, "pdpPickupFree")}</span>
                {spot.hours && <span className="whitespace-pre-line">{getCopy(design, "pdpPickupHours", { hours: spot.hours })}</span>}
                {!one && spot.estimate && <span>{spot.estimate}</span>}
                {spot.localOnly && <span>{getCopy(design, "pdpPickupLocalOnly")}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2">{getCopy(design, "pdpPickupCheckout")}</p>
        </details>
      </div>
    </div>
  );
}
