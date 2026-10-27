// “Back to top” button (see BackToTop.tsx). Display only.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "footer-back-to-top",
  style: {
    group: "footer", subsection: "What the footer shows", subsectionAfter: "showFooterAdminLink", after: "showFooterLocation",
    fields: [
      { key: "showBackToTop", label: "Show a “Back to top” button once shoppers scroll down", kind: "toggle", defaultValue: false },
      { key: "backToTopPosition", label: "Back to top button corner", kind: "select", defaultValue: "right", options: [{ value: "right", label: "Bottom right" }, { value: "left", label: "Bottom left" }] },
    ],
  },
  copy: {
    group: "Footer", after: "footerAdmin",
    fields: [
      { key: "backToTop", label: "Back to top button", default: "Back to top", hint: "Shown when Style › Footer & social links › Back to top button is on. Phones show only the arrow; screen readers read these words." },
    ],
  },
  regions: {
    group: "catalogElements", after: "footerAdmin", files: ["features/site/extras/footer-back-to-top/BackToTop.tsx"],
    fields: [
      { id: "footerBackToTop", label: "Back to top button", copy: "Footer" },
    ],
  },
} satisfies StorefrontFeature;
