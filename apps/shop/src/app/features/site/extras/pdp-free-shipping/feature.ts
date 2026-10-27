// Free-shipping line under the book page's buy buttons (see PdpFreeShipping.tsx). Display only.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "pdp-free-shipping",
  style: {
    group: "productPage", subsection: "Extras on the page", subsectionAfter: "pdpReleaseCountdownWithin", after: "pdpReleaseCountdownWithin",
    fields: [
      { key: "showPdpFreeShipping", label: "Free-shipping line under the buy buttons (“Free shipping on orders over …”, needs a free-shipping amount in Settings › Shipping; words: Text & labels › Product page)", kind: "toggle", defaultValue: false },
    ],
  },
  copy: {
    group: "Product page", after: "pdpDescriptionLess",
    fields: [
      { key: "pdpFreeShipOver", label: "Free shipping · amount", default: "Free shipping on orders over {threshold}", hint: "Under the buy buttons when Style › Book page · photos & layout › Free-shipping line is on. Use {threshold} for the free-shipping amount from Settings › Shipping." },
      { key: "pdpFreeShipAway", label: "Free shipping · amount still to add", default: "Add {amount} more for free shipping", hint: "Shown when the bag already has printed books but not enough. Use {amount} for what's still needed and {threshold} for the full amount." },
      { key: "pdpFreeShipQualifies", label: "Free shipping · bag already qualifies", default: "Your order ships free", hint: "Shown when the printed books already in the bag reach the free-shipping amount." },
    ],
  },
  regions: {
    group: "productContent", after: "productBoxSet", files: ["features/site/extras/pdp-free-shipping/PdpFreeShipping.tsx"],
    fields: [
      { id: "productFreeShipping", label: "Free-shipping line (under the buy buttons)" },
    ],
  },
} satisfies StorefrontFeature;
