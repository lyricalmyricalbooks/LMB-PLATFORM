// Ships-by line under the book page's buy buttons (see PdpShipBy.tsx; the dates come from shipBy.ts, shared with
// the bag). Display only.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "pdp-ship-by",
  style: {
    group: "productPage", subsection: "Extras on the page", subsectionAfter: "showPdpFreeShipping", after: "showPdpInBag",
    fields: [
      { key: "showPdpShipBy", label: "Ships-by line under the buy buttons (“Order now — ships by Monday, Oct 26”, printed books in stock only; words: Text & labels › Product page)", kind: "toggle", defaultValue: false },
      { key: "pdpShipByDays", label: "Ships-by line: working days you need to send an order (0 = the same day)", kind: "number", min: 0, max: 30, step: 1, defaultValue: 2 },
      { key: "pdpShipByCutoff", label: "Ships-by line: orders after this hour (24-hour clock, Toronto time) count from the next working day", kind: "number", min: 0, max: 24, step: 1, defaultValue: 14 },
      { key: "pdpShipByCountdownHours", label: "Ships-by line: show “Order within 2h 15m” this many hours before the cut-off (0 = never)", kind: "number", min: 0, max: 24, step: 1, defaultValue: 4 },
      { key: "pdpShipByClosedDays", label: "Ships-by line: days you don't send orders besides weekends (holidays, time away), as dates like 2026-12-25, 2026-12-26", kind: "text" },
    ],
  },
  copy: {
    group: "Product page", after: "pdpFreeShipQualifies",
    fields: [
      { key: "pdpShipBy", label: "Ships by · date", default: "Order now — ships by {date}", hint: "Under the buy buttons when Style › Book page · photos & layout › Ships-by line is on. Use {date} for the day the order would be sent." },
      { key: "pdpShipByCountdown", label: "Ships by · before the cut-off", default: "Order within {hours}h {minutes}m — ships by {date}", hint: "Shown in the last hours before your daily cut-off. Use {hours}, {minutes} and {date}." },
    ],
  },
  regions: {
    group: "productContent", after: "productFreeShipping", files: ["features/site/extras/pdp-ship-by/PdpShipBy.tsx"],
    fields: [
      { id: "productShipBy", label: "Ships-by line (under the buy buttons)" },
    ],
  },
} satisfies StorefrontFeature;
