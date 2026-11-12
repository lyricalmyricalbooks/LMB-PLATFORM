// The trust page (plan 14.2): where a press's data lives, who can see it, who handles it, backups, and what happens if
// Colophon closes, in plain words. Every promise names a `proof`: a place in this repository where the promise is kept
// (a file and the words that must be in it), and trust.test.js fails when the place or the words are gone. So the page
// cannot promise something the code stopped doing. Every company that handles data is listed with what it handles.
//
// The terms page (terms/terms.js) holds the legal words; this page is the short, friendly answer to "can I trust this?".
import { BACKUP_KEEP_DAYS, PRIVACY_CONTACT, SHUTDOWN_NOTICE_DAYS } from "../terms/terms.js";

export const DRAFT = false;

export const PROMISES = Object.freeze([
  {
    id: "own-copy",
    title: "Your shop is walled off from every other",
    words: "Every press's books, orders and customers sit in their own walled-off space. They are never mixed with another press's, and nobody signed in to another shop can reach them.",
    proof: { file: "apps/shop/firestore.rules", pattern: "match /shops/{shopId}" },
  },
  {
    id: "canada",
    title: "Your data stays in Canada",
    words: "Each shop's records and photos are kept in Montréal.",
    proof: { file: "setup/steps.js", pattern: 'REGION = "northamerica-northeast1"' },
  },
  {
    id: "cards",
    title: "We never see your customers' card numbers",
    words: "Card details go straight to the payment company. Colophon's own code never receives or stores them.",
    proof: { file: "help/articles.js", pattern: "never sees a card number" },
  },
  {
    id: "backups",
    title: "Your shop is backed up every night",
    words: `A copy of your shop is saved every night and kept for ${BACKUP_KEEP_DAYS} days. Once a month we restore one to a scratch copy to prove it works, then delete the scratch copy.`,
    proof: { file: "services/health/restoreDrill.js", pattern: "runRestoreDrill" },
  },
  {
    id: "keep-times",
    title: "We don't keep records longer than we need them",
    words: "Old logs and requests are deleted on a schedule. Orders and billing records are kept for at least six years, because the tax office can ask for them.",
    proof: { file: "docs/keep-times.md", pattern: "at least six years" },
  },
  {
    id: "two-step",
    title: "Our own staff sign in with two steps",
    words: "Anyone at Colophon who can see a shop has to prove who they are twice, and every time they look at a shop it is written in that shop's log.",
    proof: { file: "control-room/supportAccess.js", pattern: "logged the visit" },
  },
  {
    id: "closing",
    title: "If Colophon ever closes, you get a way out",
    words: `You get at least ${SHUTDOWN_NOTICE_DAYS} days' notice, your shop keeps working meanwhile, you can download every book, order and customer, and you can take over your own copy of the shop.`,
    proof: { file: "terms/terms.js", pattern: "SHUTDOWN_NOTICE_DAYS = 90" },
  },
]);

/** Everyone who handles press data for Colophon, and exactly what they handle. */
export const COMPANIES = Object.freeze([
  { name: "Google", handles: "Your shop's website, records and photos, and the sign-in you use. Hosted in Montréal." },
  { name: "Stripe or Square", handles: "Your customers' card payments, into your own account with them. Colophon does not hold your money." },
  { name: "Our email sender", handles: "Order and account emails sent in your press's name: the recipient's address and the message." },
  { name: "Shippo (only if you turn on shipping labels)", handles: "The delivery address of the order being shipped." },
]);

export const CONTACT = PRIVACY_CONTACT;
