// “Ask a question about this book” under the book page's buy buttons (see PdpAskQuestion.tsx): a folded form that
// sends one Admin › Messages row.
import type { StorefrontFeature } from "../featureKit";

export default {
  id: "pdp-ask-question",
  style: {
    group: "productPage", subsection: "Extras on the page", subsectionAfter: "showPdpPickup", after: "showPdpPickup",
    fields: [
      { key: "showPdpAskQuestion", label: "“Ask a question about this book” under the buy buttons (a small form; questions arrive in Admin › Messages; words: Text & labels › Product page)", kind: "toggle", defaultValue: false },
    ],
  },
  copy: {
    group: "Product page", after: "pdpPickupCheckout",
    fields: [
      { key: "pdpAskToggle", label: "Ask a question · link", default: "Ask a question about this book", hint: "Under the buy buttons when Style › Book page · photos & layout › Ask a question is on. Questions arrive in Admin › Messages." },
      { key: "pdpAskIntro", label: "Ask a question · line above the form", default: "We'll answer by email.", hint: "Leave it empty for no line." },
      { key: "pdpAskName", label: "Ask a question · name box", default: "Your name" },
      { key: "pdpAskEmail", label: "Ask a question · email box", default: "Your email" },
      { key: "pdpAskMessage", label: "Ask a question · question box", default: "Your question" },
      { key: "pdpAskSend", label: "Ask a question · send button", default: "Send question" },
      { key: "pdpAskSending", label: "Ask a question · while sending", default: "Sending…" },
      { key: "pdpAskSent", label: "Ask a question · thank-you", default: "Thanks — we'll answer by email soon." },
      { key: "pdpAskInvalid", label: "Ask a question · something missing", default: "Please add your name, a valid email and your question." },
      { key: "pdpAskFailed", label: "Ask a question · couldn't send", default: "Your question couldn't be sent. Please try again." },
      { key: "pdpAskSubject", label: "Ask a question · subject you see in Messages", default: "Question about {title}", hint: "Only you see this. Use {title} for the book's title (and edition)." },
    ],
  },
  regions: {
    group: "productContent", after: "productPickup", files: ["features/site/extras/pdp-ask-question/PdpAskQuestion.tsx"],
    fields: [
      { id: "productAskQuestion", label: "Ask a question (under the buy buttons)" },
    ],
  },
} satisfies StorefrontFeature;
