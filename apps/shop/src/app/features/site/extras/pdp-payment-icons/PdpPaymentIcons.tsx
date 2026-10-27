import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";
import { PAYMENT_BADGE_OPTIONS } from "../../paymentBadges";
import { PAYMENT_ICONS } from "../../paymentIcons";

/** The payment icons the book page can draw: the footer's list, in its order, minus unknown ids and repeats. */
export function pdpPaymentBadges(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const id of ids) if (typeof id === "string" && PAYMENT_ICONS[id] && !out.includes(id)) out.push(id);
  return out;
}

/** What a screen reader hears for the row: Text & labels › Product page › `pdpPaymentIconsLabel` with the method names. */
export function pdpPaymentLabel(design: any, ids: string[]): string {
  const methods = ids.map((id) => PAYMENT_BADGE_OPTIONS.find((o) => o.id === id)?.label || id).join(", ");
  return getCopy(design, "pdpPaymentIconsLabel", { methods });
}

// Payment icons under the buy buttons (Studio › Style › Book page · photos & layout › showPdpPaymentIcons, off by
// default): the same card and wallet logos as the footer (Style › Payment icons). Display only — checkout still
// decides which payment methods are offered.
export default function PdpPaymentIcons({ badges, design }: { badges: unknown; design: any }) {
  const ids = pdpPaymentBadges(badges);
  if (!ids.length) return null;
  return (
    <div {...regionProps("productPaymentIcons")} className="fm-pdp-pay-icons fm-pdp-meta w-full flex flex-wrap items-center gap-3 select-none"
      role="img" aria-label={pdpPaymentLabel(design, ids)}>
      {ids.map((id) => <span key={id} className="inline-flex opacity-70" aria-hidden="true">{PAYMENT_ICONS[id]}</span>)}
    </div>
  );
}
