// Currency picker in the footer's bottom bar (see FooterCurrency.tsx). Display only: checkout still charges in CAD.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "footer-currency",
  style: {
    group: "footer", subsection: "What the footer shows", subsectionAfter: "backToTopPosition", after: "backToTopPosition",
    fields: [
      { key: "showFooterCurrency", label: "Currency picker in the footer", kind: "toggle", defaultValue: false },
    ],
  },
  copy: {
    group: "Footer", after: "footerAdmin",
    fields: [
      { key: "footerCurrencyLabel", label: "Footer prices drop-down: label", default: "Currency", hint: "Shown when Style › Footer & social links › Currency picker in the footer is on." },
      { key: "footerCurrencyCAD", label: "Footer prices drop-down: Canadian dollars", default: "CA$ · Canadian dollar" },
      { key: "footerCurrencyUSD", label: "Footer prices drop-down: US dollars", default: "US$ · US dollar" },
      { key: "footerCurrencyEUR", label: "Footer prices drop-down: euros", default: "€ · Euro" },
    ],
  },
  regions: {
    group: "catalogElements", after: "footerBackToTop", files: ["features/site/extras/footer-currency/FooterCurrency.tsx"],
    fields: [
      { id: "footerCurrency", label: "Footer currency picker", copy: "Footer" },
    ],
  },
} satisfies StorefrontFeature;
