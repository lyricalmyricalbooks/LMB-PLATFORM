// Free sample on a product page (Digital D3b, Beta, see PdpSample.tsx). Shown for products with a sample (Books › edit ›
// Digital product › Free sample); no Style switch, since the product decides.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "pdp-sample",
  copy: {
    group: "Product page", after: "pdpPwywTooHigh",
    fields: [
      { key: "pdpSampleListen", label: "Free sample · audio", default: "Listen to a sample" },
      { key: "pdpSampleWatch", label: "Free sample · video", default: "Watch a sample" },
      { key: "pdpSampleRead", label: "Free sample · PDF link", default: "Read a sample" },
    ],
  },
  regions: {
    group: "productContent", after: "productPayWhatYouWant", files: ["features/site/extras/pdp-sample/PdpSample.tsx"],
    fields: [
      { id: "productSample", label: "Free sample (player or link)" },
    ],
  },
} satisfies StorefrontFeature;
