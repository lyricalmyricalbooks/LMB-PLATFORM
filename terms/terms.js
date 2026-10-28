// Colophon's terms, privacy policy, data agreement and shutdown promise (code plan 8.1), on one page with one version
// id. Plain ES module with no imports, so the page loads it as is and sign-up can store the same id.
//
// DRAFT: none of these words has been read by a lawyer. The page says so at the top until Julian's lawyer has read
// them; then `DRAFT` becomes false and `TERMS_VERSION` gets a new id (a date without "-draft").
//
// Changing any words here means a new `TERMS_VERSION`, so a press's recorded acceptance always points at the exact
// words they agreed to. Words here are customer-facing: plain words, never a rival's name.

/** The id of these words. Sign-up stores it with the date the press ticked the box. */
export const TERMS_VERSION = "2026-10-28-draft";

/** True until a lawyer has read the words. The page shows the draft notice while it is. */
export const DRAFT = true;

/** The version a new sign-up accepts. */
export const currentTermsVersion = () => TERMS_VERSION;

/** How long a press has between our notice and the end of the service, in days. */
export const SHUTDOWN_NOTICE_DAYS = 90;

/**
 * @typedef {{ id: string, title: string, paragraphs: string[] }} Section
 */

/** @type {readonly Section[]} */
export const SECTIONS = Object.freeze([
  {
    id: "terms",
    title: "Terms of service",
    paragraphs: [
      "Colophon gives your press a shop, a stockroom, or both, on a monthly plan. These terms are between your press and the company that runs Colophon.",
      "Your plan starts with a free trial and no card. After the trial, you pay each month for the plan you chose. You can change or cancel your plan at any time from your account page.",
      "If you cancel, your plan runs to the end of the month already paid for. Nothing is deleted when your plan ends; you can download everything first.",
      "You are responsible for what you sell and for the words and pictures you put in your shop. Don't use Colophon to sell anything that is against the law where you or your buyers are.",
      "We may close a shop that sells something unlawful, takes payments by fraud or sends unwanted email. We tell you why, in writing.",
      "We work hard to keep every shop open, and our status page shows how the service is doing. We can't promise it will never stop for a while.",
    ],
  },
  {
    id: "privacy",
    title: "Privacy policy",
    paragraphs: [
      "This part is about you, the person who runs a press on Colophon. Your shoppers are covered by your own shop's privacy policy.",
      "We keep your name, your email address, your press's name, the plan you chose, and your answers when you signed up. We use them to run your shop, bill your plan and write to you about your account.",
      "We never sell your details, and we never show you or your shoppers advertising.",
      "Your shop's information is kept in its own copy, separate from every other press. Each copy is backed up, so a mistake can be put right.",
      "You can ask us for a copy of what we hold about you, or ask us to correct it or delete it. Write to us from your account page.",
    ],
  },
  {
    id: "data",
    title: "Your data and your shoppers' data",
    paragraphs: [
      "Your books, orders, customers and newsletter list belong to your press. We look after them for you and use them only to run your shop.",
      "When a shopper buys from you, your press decides what is kept about them. We keep it on your behalf and follow your instructions.",
      "A few companies help us run Colophon, for example to take card payments, send email and keep each copy online. They see only what they need for that job.",
      "Our team looks inside your shop only when you ask for help, and only for as long as it takes. Every look is recorded.",
      "If something goes wrong with your data, we tell you as soon as we know, in plain words, with what we are doing about it.",
    ],
  },
  {
    id: "shutdown",
    title: "If Colophon ever closes",
    paragraphs: [
      `We will tell you at least ${SHUTDOWN_NOTICE_DAYS} days before Colophon stops, by email and on your account page. Your shop keeps working during those ${SHUTDOWN_NOTICE_DAYS} days.`,
      "You can download all of your books, orders and customers as spreadsheet files at any time, and during those days too.",
      "Your shop runs in its own copy. If you want to keep it running, we hand that copy over to your press, with its books, orders, customers and settings, at no charge.",
      "The same holds if you leave us: you keep your files, and you can ask for your own copy.",
    ],
  },
]);

/**
 * What sign-up stores when a press ticks the box: the version and when. Refuses any version other than the current
 * one, so no shop starts on words the page no longer shows.
 */
export function acceptanceRecord(version, at = new Date()) {
  if (version !== TERMS_VERSION) {
    throw new Error("Please read the terms again: they have changed since this page opened.");
  }
  const when = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(when.getTime())) throw new Error("acceptanceRecord: a real date is needed");
  return { termsVersion: TERMS_VERSION, termsAcceptedAt: when.toISOString() };
}

/** Whether a stored acceptance is for the words shown now (an older one means asking the press again). */
export const acceptedCurrent = (record) => record?.termsVersion === TERMS_VERSION && typeof record?.termsAcceptedAt === "string";
