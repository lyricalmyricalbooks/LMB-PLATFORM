// The words of every email the platform sends, by kind. Each template takes the email's data plus `{ settings, pressName }`
// and returns { subject, text, html }. Every value from a press or a person is escaped in the HTML, and links must be
// https. Customer-facing words: name the product (settings.platformName), never a rival.

export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A link a template may put in an email: https only, so a stored value can never become a script or mail link. */
export function safeLink(url) {
  if (typeof url !== "string" || !/^https:\/\/[^\s<>"']+$/.test(url)) throw new Error("an email link must be an https address");
  return url;
}

/** Builds the three parts from paragraphs of plain text and [label, url] buttons. */
export function layout({ subject, greeting, paragraphs, buttons = [], footer }) {
  const text = [greeting, ...paragraphs, ...buttons.map(([label, url]) => `${label}: ${safeLink(url)}`), footer].filter(Boolean).join("\n\n");
  const html = [
    '<div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;max-width:560px">',
    greeting ? `<p>${escapeHtml(greeting)}</p>` : "",
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    ...buttons.map(([label, url]) => `<p><a href="${escapeHtml(safeLink(url))}" style="display:inline-block;padding:10px 16px;border:2px solid #1a1a1a;color:#1a1a1a;text-decoration:none;font-weight:bold">${escapeHtml(label)}</a></p>`),
    footer ? `<p style="font-size:13px;color:#555">${escapeHtml(footer)}</p>` : "",
    "</div>",
  ].join("");
  return { subject, text, html };
}

const signOff = (settings) => `Sent by ${settings.platformName}. Reply to this email if you need a hand.`;

export const TEMPLATES = {
  /** Setup step 14: the owner's first email, with the links to their new admin and stockroom. */
  "owner-welcome": ({ links = {} }, { settings, pressName }) => {
    const buttons = [];
    if (links.shopAdmin) buttons.push(["Open your shop's admin", links.shopAdmin]);
    if (links.stockroom) buttons.push(["Open your stockroom", links.stockroom]);
    if (!buttons.length) throw new Error("the welcome email has no links");
    return layout({
      subject: `${pressName} is ready on ${settings.platformName}`,
      greeting: "Hello,",
      paragraphs: [
        `${pressName} is set up and ready for you.`,
        "Sign in with this email address. Your setup checklist will walk you through the rest.",
      ],
      buttons,
      footer: signOff(settings),
    });
  },

  // ── Billing (services/billing), sent to the person who pays. `data`: { pressName, planName, price, date, link }. ──

  /** Three days before the trial ends. With no card yet, it asks for one; with a card, it says when the first charge is. */
  "trial-ending": ({ planName, price, date, link, hasCard }, { settings, pressName }) => layout({
    subject: hasCard ? `Your ${settings.platformName} trial ends on ${date}` : `Add a card to keep ${pressName} open after ${date}`,
    greeting: "Hello,",
    paragraphs: hasCard
      ? [`Your free trial for ${pressName} ends on ${date}. After that, your card is charged ${price} a month for the ${planName} plan.`, "You can change plan or cancel at any time before then."]
      : [`Your free trial for ${pressName} ends on ${date}.`, `To keep it open, add a card. The ${planName} plan is ${price} a month, and you can cancel at any time.`, "If there is no card by then, your shop pauses. Nothing is deleted, and adding a card opens it again."],
    buttons: [[hasCard ? "Manage your plan" : "Add a card", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** The trial ended with no card: the subscription paused. */
  "card-needed": ({ link }, { settings, pressName }) => layout({
    subject: `${pressName} is paused until you add a card`,
    greeting: "Hello,",
    paragraphs: [`Your free trial for ${pressName} has ended, so it is paused for now. Nothing is deleted.`, "Add a card and it opens again straight away."],
    buttons: [["Add a card", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** A monthly payment was declined. Stripe tries again; the shop stays open meanwhile. */
  "payment-failed": ({ price, nextTry, link }, { settings, pressName }) => layout({
    subject: `We couldn't take this month's payment for ${pressName}`,
    greeting: "Hello,",
    paragraphs: [
      `Your card was declined for this month's ${price} payment for ${pressName}. Your shop stays open while we sort it out.`,
      nextTry ? `We'll try the card again on ${nextTry}. To avoid another decline, update your card now.` : "Please update your card so your shop stays open.",
    ],
    buttons: [["Update your card", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** The press asked to cancel: the shop stays open until the end of the period already paid for. */
  "subscription-cancelled": ({ date, link }, { settings, pressName }) => layout({
    subject: `${pressName} will close on ${date}`,
    greeting: "Hello,",
    paragraphs: [`You cancelled your ${settings.platformName} plan for ${pressName}. It stays open until ${date}, and you won't be charged again.`, "Changed your mind? You can keep your plan with one click before then."],
    buttons: [["Keep my plan", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** The subscription ended (cancelled, or payments failed for good). */
  "subscription-ended": ({ link }, { settings, pressName }) => layout({
    subject: `${pressName} is closed`,
    greeting: "Hello,",
    paragraphs: [`Your ${settings.platformName} plan for ${pressName} has ended, so the shop is closed. Your books, orders and settings are kept.`, "You can start a plan again at any time and pick up where you left off."],
    buttons: [["Start a plan again", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** The press changed plan. */
  "plan-changed": ({ planName, price, link }, { settings, pressName }) => layout({
    subject: `${pressName} is now on the ${planName} plan`,
    greeting: "Hello,",
    paragraphs: [`${pressName} is now on the ${planName} plan, ${price} a month. Your next bill is adjusted for the part of the month on each plan.`],
    buttons: [["See your plan", safeLink(link)]],
    footer: signOff(settings),
  }),
};

/** Problems with a free-form email a shop asks to send (its own order and account emails), in plain words. */
export function customProblems(message) {
  const problems = [];
  if (typeof message.subject !== "string" || !message.subject.trim()) problems.push("the email has no subject");
  else if (message.subject.length > 200 || /[\r\n]/.test(message.subject)) problems.push("the subject is too long or has line breaks");
  if (!(typeof message.text === "string" && message.text.trim()) && !(typeof message.html === "string" && message.html.trim())) {
    problems.push("the email has no words");
  }
  if ((message.html?.length ?? 0) + (message.text?.length ?? 0) > 400_000) problems.push("the email is too long");
  return problems;
}
