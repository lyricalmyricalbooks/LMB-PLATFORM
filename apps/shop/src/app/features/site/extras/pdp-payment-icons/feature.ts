// Payment icons under the book page's buy buttons (see PdpPaymentIcons.tsx). Display only.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "pdp-payment-icons",
  style: {
    group: "productPage", subsection: "Extras on the page", subsectionAfter: "pdpReleaseCountdownWithin", after: "pdpDescriptionFoldLines",
    fields: [
      { key: "showPdpPaymentIcons", label: "Payment icons under the buy buttons (the same card and wallet logos as the footer — pick them in Style › Payment icons; hidden while the book can't be bought; read-aloud words: Text & labels › Product page)", kind: "toggle", defaultValue: false },
    ],
  },
  copy: {
    group: "Product page", after: "pdpDescriptionLess",
    fields: [
      { key: "pdpPaymentIconsLabel", label: "Payment icons · read aloud", default: "Ways to pay: {methods}", hint: "What screen readers say for the payment icons under the buy buttons (Style › Book page · photos & layout › Payment icons). Use {methods} for the names of the icons shown." },
    ],
  },
  regions: {
    group: "productContent", after: "productBoxSet", files: ["features/site/extras/pdp-payment-icons/PdpPaymentIcons.tsx"],
    fields: [
      { id: "productPaymentIcons", label: "Payment icons (under the buy buttons)" },
    ],
  },
} satisfies StorefrontFeature;
