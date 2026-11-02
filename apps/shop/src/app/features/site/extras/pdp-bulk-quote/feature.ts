// “Ask for a bulk quote” under the book page's buy buttons (see PdpBulkQuote.tsx): a folded form (name, email, how many,
// note) that sends one Admin › Messages row, so a school, library or shop can ask for a price on many copies.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "pdp-bulk-quote",
  style: {
    group: "productPage", subsection: "Extras on the page", subsectionAfter: "showPdpPickup", after: "showPdpAskQuestion",
    fields: [
      { key: "showPdpBulkQuote", label: "“Ask for a bulk quote” under the buy buttons (a small form for big orders; requests arrive in Admin › Messages; words: Text & labels › Product page)", kind: "toggle", defaultValue: false },
    ],
  },
  copy: {
    group: "Product page", after: "pdpAskSubject",
    fields: [
      { key: "pdpQuoteToggle", label: "Bulk quote · link", default: "Ordering many copies? Ask for a quote", hint: "Under the buy buttons when Style › Book page · photos & layout › Ask for a bulk quote is on. Requests arrive in Admin › Messages." },
      { key: "pdpQuoteIntro", label: "Bulk quote · line above the form", default: "Tell us how many you need and we'll send a price.", hint: "Leave it empty for no line." },
      { key: "pdpQuoteName", label: "Bulk quote · name box", default: "Your name or organisation" },
      { key: "pdpQuoteEmail", label: "Bulk quote · email box", default: "Your email" },
      { key: "pdpQuoteQuantity", label: "Bulk quote · how many box", default: "How many copies" },
      { key: "pdpQuoteNote", label: "Bulk quote · note box", default: "Anything we should know (optional)" },
      { key: "pdpQuoteSend", label: "Bulk quote · send button", default: "Ask for a quote" },
      { key: "pdpQuoteSending", label: "Bulk quote · while sending", default: "Sending…" },
      { key: "pdpQuoteSent", label: "Bulk quote · thank-you", default: "Thanks. We'll email you a price soon." },
      { key: "pdpQuoteInvalid", label: "Bulk quote · something missing", default: "Please add your name, a valid email and how many copies." },
      { key: "pdpQuoteFailed", label: "Bulk quote · couldn't send", default: "Your request couldn't be sent. Please try again." },
      { key: "pdpQuoteSubject", label: "Bulk quote · subject you see in Messages", default: "Bulk quote: {title}", hint: "Only you see this. Use {title} for the book's title (and edition)." },
    ],
  },
  regions: {
    group: "productContent", after: "productAskQuestion", files: ["features/site/extras/pdp-bulk-quote/PdpBulkQuote.tsx"],
    fields: [
      { id: "productBulkQuote", label: "Bulk quote (under the buy buttons)" },
    ],
  },
} satisfies StorefrontFeature;
