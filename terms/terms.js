// Colophon's terms, privacy policy, data agreement and shutdown promise (code plan 8.1), on one page with one version
// id. Plain ES module with no imports, so the page loads it as is and sign-up can store the same id.
//
// DRAFT: none of these words has been read by a lawyer. The page says so at the top until Julian's lawyer has read
// them; then `DRAFT` becomes false and `TERMS_VERSION` gets a new id (a date without "-draft").
//
// Changing any words here means a new `TERMS_VERSION`, so a press's recorded acceptance always points at the exact
// words they agreed to. Words here are customer-facing: plain words, never a rival's name.

/** The id of these words. Sign-up stores it with the date the press ticked the box. */
export const TERMS_VERSION = "2026-11-10-draft.2";

/** True until a lawyer has read the words. The page shows the draft notice while it is. */
export const DRAFT = true;

/** The version a new sign-up accepts. */
export const currentTermsVersion = () => TERMS_VERSION;

/** The company's contact address (Julian, 3 November 2026); apps-isolation.test.js allows exactly this line. */
export const OPERATOR_EMAIL = "lyricalmyricalbooks@gmail.com";

/**
 * Who answers privacy questions (plan 8.6). The control room's PLATFORM_PRIVACY_CONTACT (control-room/people.js)
 * defaults to it; terms.test.js keeps the two equal.
 */
export const PRIVACY_CONTACT = OPERATOR_EMAIL;

/** Where anyone reports a shop selling something unlawful or copying someone's work. */
export const REPORT_CONTACT = OPERATOR_EMAIL;

/**
 * The company that runs Colophon, its mailing address and the law that governs the terms (Julian, 3 November 2026).
 * The name is the one place outside shops/ that may name it (apps-isolation.test.js allows exactly this line).
 */
export const OPERATOR_NAME = "Lyricalmyrical Books";
export const OPERATOR_ADDRESS = "456 Montrose Avenue, Toronto, Ontario M6G 3H1, Canada";
export const GOVERNING_LAW = "the province of Ontario and the laws of Canada that apply there";

/** How long each backup of a shop is kept, in days (the shop's nightly backup removes older ones). */
export const BACKUP_KEEP_DAYS = 30;

/** How long a press has between our notice and the end of the service, in days. */
export const SHUTDOWN_NOTICE_DAYS = 90;

/** The free trial, in days (services/settings.js TRIAL_DAYS default; terms.test.js keeps them equal). */
export const TRIAL_DAYS = 14;

/** A paused shop is kept this many days before it closes (services/billing/closing.js PAUSED_DAYS). */
export const PAUSED_DAYS = 60;

/** A closed shop or app can be downloaded this many days before it is deleted (closing.js DOWNLOAD_DAYS). */
export const DOWNLOAD_DAYS = 90;

/** Days of notice before a change to these terms, a price rise or a new helper company. */
export const CHANGE_NOTICE_DAYS = 30;

/**
 * The companies that help run Colophon (the sub-processor list): each line names the company, what it does and where
 * it works. Changing this list is a change to the words, so it gets a new version and presses hear about it
 * CHANGE_NOTICE_DAYS ahead.
 */
export const HELPERS = Object.freeze([
  "Google Cloud: keeps each shop online, stores its information, handles sign-in and runs the writing helper. Works from Canada (Montréal), with some services in the United States.",
  "Stripe: takes card payments for your shop and for your Colophon plan. Works from the United States and Canada.",
  "Resend: sends your shop's emails and ours. Works from the United States.",
  "Shippo and Canada Post: shipping rates and labels, only when you turn them on. Works from the United States and Canada.",
]);

/**
 * @typedef {{ id: string, title: string, paragraphs: string[] }} Section
 */

/** @type {readonly Section[]} */
export const SECTIONS = Object.freeze([
  {
    id: "terms",
    title: "Terms of service",
    paragraphs: [
      `These terms are between your press and ${OPERATOR_NAME}, the company that runs Colophon, at ${OPERATOR_ADDRESS}. The person who ticks the box at sign-up agrees for the press, and confirms they may.`,
      "Colophon gives your press a shop, a stockroom, or both. It is made for businesses, not for people buying for themselves.",
      "Your shop is your own business. Your press is the seller to your shoppers, sets its own prices and policies, and follows the shopping, privacy and tax laws of the places it sells to.",
      "You are responsible for what you sell and for the words and pictures you put in your shop. Don't use Colophon to sell anything that is against the law where you or your buyers are.",
      "Your books, words and pictures stay yours. You let us copy and show them only to run your shop, and that ends when your shop is deleted.",
      "Keep your sign-in safe, and tell us at once if you think someone else has used it.",
      "We may close a shop that sells something unlawful, takes payments by fraud, sends unwanted email or puts other shops at risk. We tell you why, in writing, and how to ask us to look again.",
      "We work hard to keep every shop open, and our status page shows how the service is doing. We can't promise it will never stop for a while.",
      "As far as the law allows, our total responsibility to your press for any claim is what you paid us in the 12 months before it. We are not responsible for lost sales or profits.",
      `If we change these terms, we email you at least ${CHANGE_NOTICE_DAYS} days before, and ask you to agree again. If you don't agree, you can cancel before the change and pay nothing more.`,
      `These terms follow the law of ${GOVERNING_LAW}.`,
    ],
  },
  {
    id: "paying",
    title: "Your plan and paying",
    paragraphs: [
      `Your plan starts with a free trial of ${TRIAL_DAYS} days, and we never ask for a card to start it. If the trial ends with no card, your shop pauses and nothing is charged.`,
      "Once you add a card, your plan renews every month until you cancel. Each month we charge that card the plan's fee plus what your shop cost to run the month before (storage, web traffic, background jobs and emails), at what it costs us. Your billing page shows the cost so far.",
      "Prices are shown before tax. We add the sales tax that applies where your press is, and your receipt shows it.",
      "A press that already pays a share of its website's sales instead of a monthly price keeps paying that way until it switches. It isn't offered to new presses.",
      "The founding offer gives the first presses a lower fee for as long as they keep their plan. If a founding press cancels before its first payment, its place goes to the next press.",
      `If we raise a price, we email you at least ${CHANGE_NOTICE_DAYS} days before your first payment at the new price, and you can cancel before then.`,
      "You can cancel at any time from Plan & billing in your account, with no call or email needed. We email you to confirm.",
      "When you cancel, your plan runs to the end of the month already paid for, and we don't refund part of a month. You can change your mind until then.",
      `If a payment fails, we tell you and keep your shop open while you fix it. A shop that still can't be paid pauses, and everything in it is kept for ${PAUSED_DAYS} days.`,
      `When a plan ends, or a paused shop reaches ${PAUSED_DAYS} days, the shop closes. You then have ${DOWNLOAD_DAYS} days to download everything in it.`,
      `We email you 30 days and 7 days before a closed shop is deleted. After that it is deleted for good, except records the law makes us keep, such as invoices for your plan.`,
    ],
  },
  {
    id: "privacy",
    title: "Privacy policy",
    paragraphs: [
      "This part is about you, the person who runs a press on Colophon. Your shoppers are covered by your own shop's privacy policy.",
      `${OPERATOR_NAME} is responsible for what we keep about you. Our privacy officer answers for it, at ${PRIVACY_CONTACT}.`,
      "We keep your name, your email address, your press's name, the plan you chose, and your answers when you signed up. We use them to run your shop, bill your plan and write to you about your account.",
      "Card numbers are held by our payment company. We see only the card's brand, its last four numbers and when it runs out.",
      "We also keep a record of sign-ins, new devices and what our team does in your shop, to keep accounts safe.",
      "We use your details because we need them to give you the service you signed up for, because the law makes us keep some records, and to protect Colophon from fraud.",
      "We email you about your account, your plan and your shop. Anything else, such as news about Colophon, only if you ask for it, and each of those emails has a way to stop them.",
      "We never sell your details, and we never show you or your shoppers advertising. Colophon's own pages use no advertising or tracking cookies.",
      "Your shop's information is kept apart from every other press's, behind its own wall, and stored in Canada. Some of the companies listed below work in the United States, where its laws may let officials see it.",
      `Each backup is kept for ${BACKUP_KEEP_DAYS} days, then deleted. If your shop is deleted, its backups are kept ${BACKUP_KEEP_DAYS} days more and then they are gone too.`,
      "Records of what happened in your shop are deleted after two years. Invoices and tax records are kept at least six years, as tax law asks.",
      "You can ask us for a copy of what we hold about you, or ask us to correct it or delete it. Write to us from your account page, and we answer within 30 days.",
      `For any privacy question, write to our privacy contact at ${PRIVACY_CONTACT}. If we can't put it right, you can complain to the privacy commissioner where you live.`,
    ],
  },
  {
    id: "data",
    title: "Your data and your shoppers' data",
    paragraphs: [
      "Your books, orders, customers and newsletter list belong to your press. We look after them for you and use them only to run your shop.",
      "When a shopper buys from you, your press decides what is kept about them. We keep it on your behalf and follow your instructions, given through your settings and your requests.",
      "If a law ever makes us do something else with it, we tell you first, unless that law forbids it.",
      "Everyone on our team who can see your data has promised to keep it private. Our team looks inside your shop only when you ask for help, and only for as long as it takes. Every look is recorded.",
      "We protect your data with two-step sign-in, encryption, a wall between each shop's data, nightly backups and a record of every look.",
      "When a shopper asks to see or delete their details, your shop has the tools to do it, and we help if you ask.",
      `The companies that help us are listed below. We email you at least ${CHANGE_NOTICE_DAYS} days before adding one, and if you object you can leave without paying for the rest of the month.`,
      "If something goes wrong with your data, we tell you as soon as we know, and within 72 hours, in plain words, with what we are doing about it.",
      `When your shop is deleted, after the ${DOWNLOAD_DAYS} days to download it, your shoppers' data is deleted with it.`,
      "If the law where your shoppers live asks for a signed data agreement, ask us and we will sign one based on these words.",
    ],
  },
  {
    id: "helpers",
    title: "Companies that help us",
    paragraphs: [
      ...HELPERS,
      "If your press connects its own Square or PayPal account, your press's own agreement with that company covers it.",
    ],
  },
  {
    id: "reports",
    title: "Reporting a shop",
    paragraphs: [
      `Anyone can report a shop that sells something unlawful or copies someone else's work. Write to ${REPORT_CONTACT}, saying which shop and page, what is wrong, and how to reach you.`,
      "We look at every report and tell the press about it. We take down what is clearly unlawful, and tell both sides what we decided and why.",
      "A report that a shop copies someone's work is passed on to the press, as Canadian copyright law asks. A press reported again and again for copying may have its shop closed.",
    ],
  },
  {
    id: "shutdown",
    title: "If Colophon ever closes",
    paragraphs: [
      `We will tell you at least ${SHUTDOWN_NOTICE_DAYS} days before Colophon stops, by email and on your account page. Your shop keeps working during those ${SHUTDOWN_NOTICE_DAYS} days.`,
      "You can download all of your books, orders and customers as spreadsheet files at any time, and during those days too.",
      "Your shop's data is kept apart from every other press's. If you want to keep it running, we make a full copy of your shop and hand that copy over to your press, with its books, orders, customers and settings, at no charge.",
      `The same holds if you leave us: during the ${DOWNLOAD_DAYS} days after your shop closes, you keep your files and you can ask for your own copy.`,
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
