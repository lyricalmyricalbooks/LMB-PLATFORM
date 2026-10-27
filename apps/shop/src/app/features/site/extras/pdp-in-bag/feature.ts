// “Already in your bag” line under the book page's buy buttons (see PdpInBag.tsx). Display only.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "pdp-in-bag",
  style: {
    group: "productPage", subsection: "Extras on the page", subsectionAfter: "pdpReleaseCountdownWithin", after: "pdpDescriptionFoldLines",
    fields: [
      { key: "showPdpInBag", label: "“Already in your bag” line under the buy buttons (“2 copies already in your bag · View bag”, only once the shopper has that edition in the bag; words: Text & labels › Product page)", kind: "toggle", defaultValue: false },
    ],
  },
  copy: {
    group: "Product page", after: "pdpDescriptionLess",
    fields: [
      { key: "pdpInBagOne", label: "Already in your bag · one copy", default: "1 copy already in your bag", hint: "Under the buy buttons when Style › Book page · photos & layout › Already in your bag is on, once the shopper has this edition in the bag." },
      { key: "pdpInBagMany", label: "Already in your bag · several copies", default: "{count} copies already in your bag", hint: "Use {count} for the number of copies." },
      { key: "pdpInBagView", label: "Already in your bag · link", default: "View bag", hint: "Opens the bag. Leave it empty for no link." },
    ],
  },
  regions: {
    group: "productContent", after: "productBoxSet", files: ["features/site/extras/pdp-in-bag/PdpInBag.tsx"],
    fields: [
      { id: "productInBag", label: "Already in your bag (under the buy buttons)" },
    ],
  },
} satisfies StorefrontFeature;
