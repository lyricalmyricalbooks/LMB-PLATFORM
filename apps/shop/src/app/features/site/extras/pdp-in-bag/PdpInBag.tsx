import { ShoppingBag } from "lucide-react";
import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";

/** The words for "N already in your bag" — one copy and several copies have their own Text & labels entries. */
export function inBagText(design: any, count: number): string {
  if (!(count > 0)) return "";
  return count === 1 ? getCopy(design, "pdpInBagOne") : getCopy(design, "pdpInBagMany", { count });
}

// "Already in your bag" under the buy buttons (Studio › Style › Book page · photos & layout › showPdpInBag, off by
// default): how many copies of the chosen edition the bag holds, with a link that opens the bag. Display only.
// Words: Text & labels › Product page (`pdpInBag*`).
export default function PdpInBag({ count, design, onOpenBag }: { count: number; design: any; onOpenBag: () => void }) {
  const text = inBagText(design, count);
  if (!String(text).trim()) return null;
  const view = getCopy(design, "pdpInBagView");
  return (
    <div {...regionProps("productInBag")} className="fm-pdp-in-bag w-full flex items-start gap-2.5 text-left" role="status">
      <ShoppingBag size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
      <span className="fm-pdp-meta" translate="no">
        {text}
        {String(view).trim() && (
          <>
            {" · "}
            <button type="button" onClick={onOpenBag} className="underline underline-offset-2">{view}</button>
          </>
        )}
      </span>
    </div>
  );
}
