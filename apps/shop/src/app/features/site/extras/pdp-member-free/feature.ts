// "Free for members" line on a product page (Memberships M2b, see MemberFree.tsx). Shown for downloads the owner gives to
// members (Products › edit › Digital product) while Memberships is on; no Style switch, since the product decides.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "pdp-member-free",
  copy: {
    group: "Product page", after: "pdpPwywTooHigh",
    fields: [
      { key: "pdpMemberFree", label: "Free for members · line", default: "Free for members. Sign in with your membership and it costs nothing at checkout." },
      { key: "pdpMemberFreeJoin", label: "Free for members · join link", default: "Become a member" },
    ],
  },
  regions: {
    group: "productContent", after: "productPayWhatYouWant", files: ["features/site/extras/pdp-member-free/MemberFree.tsx"],
    fields: [
      { id: "productMemberFree", label: "Free for members (line)" },
    ],
  },
} satisfies StorefrontFeature;
