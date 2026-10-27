// "Pre-order · out in 2d 5h" in place of the book page's pre-order stock line in the last hours before the publication
// date (see ReleaseCountdownText.tsx; the maths is in releaseCountdown.ts). Display only.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "pdp-release-countdown",
  style: {
    group: "productPage", subsection: "Extras on the page", subsectionAfter: "pdpDescriptionFoldLines", after: "pdpTabOrder5",
    fields: [
      { key: "showPdpReleaseCountdown", label: "Release countdown on pre-orders (“Pre-order · out in 2d 5h” in the last hours before the publication date instead of “Pre-order · ships …”; needs Books › edit › Inventory › Pre-order with a Publication date; words: Text & labels › Product page)", kind: "toggle", defaultValue: false },
      { key: "pdpReleaseCountdownWithin", label: "Release countdown: start counting this many hours before release day", kind: "number", min: 1, max: 336, step: 1, defaultValue: 72 },
    ],
  },
  copy: {
    group: "Product page", after: "pdpPreorderTba",
    fields: [
      { key: "pdpReleaseCountdownDays", label: "Release countdown · days left", default: "Pre-order · out in {days}d {hours}h", hint: "Replaces the pre-order stock line in the last hours before the publication date when Style › Book page · photos & layout › Release countdown is on. Use {days}, {hours} and {minutes}." },
      { key: "pdpReleaseCountdownHours", label: "Release countdown · hours left", default: "Pre-order · out in {hours}h {minutes}m", hint: "Shown on the day before release. Use {hours} and {minutes}." },
      { key: "pdpReleaseCountdownMinutes", label: "Release countdown · minutes left", default: "Pre-order · out in {minutes} min", hint: "Shown in the last hour before release. Use {minutes}." },
    ],
  },
  regions: { group: "productContent", files: ["features/site/extras/pdp-release-countdown/ReleaseCountdownText.tsx"], fields: [] },
} satisfies StorefrontFeature;
