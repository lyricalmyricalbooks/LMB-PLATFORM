// A search box and four products on the missing page (see NotFoundPicks.tsx). Display only.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "not-found-picks",
  style: {
    group: "customPages", subsection: "What custom pages show", subsectionAfter: "showNotFoundBack", after: "showNotFoundBack",
    fields: [
      { key: "showNotFoundSearch", label: "Search box on the missing page (sends shoppers to the shop page with their words)", kind: "toggle", defaultValue: false },
      { key: "showNotFoundProducts", label: "Four products on the missing page (featured first, in stock only)", kind: "toggle", defaultValue: false },
    ],
  },
  copy: {
    group: "Custom pages & 404", after: "notFoundBack",
    fields: [
      { key: "notFoundSearchLabel", label: "404 search box", default: "Search the shop", hint: "Shown when Style › Custom pages › Search box on the missing page is on." },
      { key: "notFoundSearchButton", label: "404 search button", default: "Search" },
      { key: "notFoundPicksHeading", label: "404 products heading", default: "Or start with one of these", hint: "Shown when Style › Custom pages › Four products on the missing page is on." },
    ],
  },
  regions: {
    group: "recoveryLayout", after: "notFoundHeading", files: ["features/site/extras/not-found-picks/NotFoundPicks.tsx"],
    fields: [
      { id: "notFoundSearch", label: "Not-found search box", copy: "Custom pages & 404" },
      { id: "notFoundProducts", label: "Not-found products", copy: "Custom pages & 404" },
    ],
  },
} satisfies StorefrontFeature;
