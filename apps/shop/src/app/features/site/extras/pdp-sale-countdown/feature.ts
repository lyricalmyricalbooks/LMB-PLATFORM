// “Sale ends …” line under the book page price, with the optional countdown in a sale's last hours (see
// SaleEndsLine.tsx; the countdown maths in saleCountdown.ts is shared with the release and announcement countdowns).
// Display only.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "pdp-sale-countdown",
  style: {
    group: "productPage", subsection: "Extras on the page", subsectionAfter: "showComingSoonSignup", after: "pdpTabOrder5",
    fields: [
      { key: "showPdpSaleCountdown", label: "Sale countdown under the price (“Sale ends in 5h 12m” in a dated sale's last hours instead of “Sale ends …”; needs Books › edit › Pricing › Sale ends; words: Text & labels › Product page)", kind: "toggle", defaultValue: false },
      { key: "pdpSaleCountdownWithin", label: "Sale countdown: start counting this many hours before the sale ends", kind: "number", min: 1, max: 336, step: 1, defaultValue: 72 },
    ],
  },
  copy: {
    group: "Product page", after: "pdpDetailsAria",
    fields: [
      { key: "pdpSaleEnds", label: "Sale end date (under the price)", default: "Sale ends {date}", hint: "Shown while a sale with an end date is on (Books › Pricing › Sale ends). Use {date} for the last day." },
      { key: "pdpSaleCountdownDays", label: "Sale countdown · days left", default: "Sale ends in {days}d {hours}h", hint: "Replaces the sale end date in the sale's last hours when Style › Book page · photos & layout › Sale countdown is on. Use {days}, {hours} and {minutes}." },
      { key: "pdpSaleCountdownHours", label: "Sale countdown · hours left", default: "Sale ends in {hours}h {minutes}m", hint: "Shown in the sale's last day. Use {hours} and {minutes}." },
      { key: "pdpSaleCountdownMinutes", label: "Sale countdown · minutes left", default: "Sale ends in {minutes} min", hint: "Shown in the sale's last hour. Use {minutes}." },
    ],
  },
  regions: {
    group: "productContent", after: "productReviews", files: ["features/site/extras/pdp-sale-countdown/SaleEndsLine.tsx"],
    fields: [
      { id: "productSaleEnds", label: "Sale end date (under the price)" },
    ],
  },
} satisfies StorefrontFeature;
