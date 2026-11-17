// "Pay what you want" box on a product page (Digital D2, see PayWhatYouWant.tsx). Shown for products set to pay what
// you want (Books › edit › Pricing); no Style switch, since the product decides.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "pdp-pay-what-you-want",
  copy: {
    group: "Product page", after: "pdpGiftDelivery",
    fields: [
      { key: "pdpPwywLabel", label: "Pay what you want · label", default: "Pay what you want" },
      { key: "pdpPwywHint", label: "Pay what you want · lowest amount", default: "{min} or more", hint: "Use {min} for the product's price, the least a buyer can pay." },
      { key: "pdpPwywFreeHint", label: "Pay what you want · free products", default: "Free, or pay what you like" },
      { key: "pdpPwywTooLow", label: "Pay what you want · too little", default: "Enter at least {min}.", hint: "Use {min} for the product's price." },
      { key: "pdpPwywTooHigh", label: "Pay what you want · too much", default: "Enter {max} or less.", hint: "Use {max} for the highest amount." },
    ],
  },
  regions: {
    group: "productContent", after: "productGiftCardForm", files: ["features/site/extras/pdp-pay-what-you-want/PayWhatYouWant.tsx"],
    fields: [
      { id: "productPayWhatYouWant", label: "Pay what you want (amount box)" },
    ],
  },
} satisfies StorefrontFeature;
