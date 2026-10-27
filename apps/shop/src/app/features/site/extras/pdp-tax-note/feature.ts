// Tax & shipping note under the book page's price (see PdpTaxNote.tsx). Display only.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "pdp-tax-note",
  style: {
    group: "productPage", subsection: "Extras on the page", subsectionAfter: "pdpSaleCountdownWithin", after: "showPdpFreeShipping",
    fields: [
      { key: "showPdpTaxNote", label: "Tax & shipping note under the price (“Taxes and shipping calculated at checkout.”, linking to your shipping policy; words: Text & labels › Product page)", kind: "toggle", defaultValue: false },
    ],
  },
  copy: {
    group: "Product page", after: "pdpSaleCountdownMinutes",
    fields: [
      { key: "pdpTaxNote", label: "Tax & shipping note · printed books", default: "Taxes and [shipping] calculated at checkout.", hint: "Under the price when Style › Book page · photos & layout › Tax & shipping note is on. Words in [brackets] link to your shipping policy (Settings › General › Policies) when it has text." },
      { key: "pdpTaxNoteShippingOnly", label: "Tax & shipping note · printed books, no sales tax", default: "[Shipping] calculated at checkout.", hint: "Used instead while Settings › Taxes › Collect sales tax at checkout is off." },
      { key: "pdpTaxNoteTaxOnly", label: "Tax & shipping note · e-books and other downloads", default: "Taxes calculated at checkout.", hint: "Used for books with nothing to ship. Gift cards show no note (they are never taxed)." },
    ],
  },
  regions: {
    group: "productContent", after: "productSaleEnds", files: ["features/site/extras/pdp-tax-note/PdpTaxNote.tsx"],
    fields: [
      { id: "productTaxNote", label: "Tax & shipping note (under the price)" },
    ],
  },
} satisfies StorefrontFeature;
