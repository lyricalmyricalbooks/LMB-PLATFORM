// The words of every email the platform sends, by kind. Each template takes the email's data plus `{ settings, pressName }`
// and returns { subject, text, html }. Every value from a press or a person is escaped in the HTML, and links must be
// https. Customer-facing words: name the product (settings.platformName), never a rival.
import { closingTemplates } from "./closingTemplates.js";

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

  /** Sign-up and sign-in (signup/signup.js): a one-time link instead of a password. */
  "sign-in-link": ({ link }, { settings }) => layout({
    subject: `Your link to sign in to ${settings.platformName}`,
    greeting: "Hello,",
    paragraphs: [`Use the button below to sign in to ${settings.platformName}. The link works once and runs out after a short while.`, "If you didn't ask for it, you can ignore this email."],
    buttons: [["Sign in", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** Sign-up's daily cap (signup/signup.js admitFromLine, plan 6.13): the press waited in line and its shop is starting. */
  "shop-starting": ({ pressName, link }, { settings }) => layout({
    subject: `Your shop is starting on ${settings.platformName}`,
    greeting: "Hello,",
    paragraphs: [
      `Thanks for waiting. We've started making ${pressName || "your shop"}, and your free trial starts today. No card needed.`,
      "It takes a few minutes. We'll email you the way in as soon as it's ready.",
    ],
    buttons: [["See how it's going", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** The control room's waitlist invite (plan 9.5): the person may start their shop now, past the daily line. */
  "waitlist-invite": ({ link }, { settings }) => layout({
    subject: `Your ${settings.platformName} shop is ready to start`,
    greeting: "Hello,",
    paragraphs: [
      `Thanks for joining the ${settings.platformName} waitlist. Your place has come up: you can start your shop now.`,
      `Sign up with this email address. The first ${settings.trialDays ?? 14} days are free and no card is needed.`,
    ],
    buttons: [["Start your shop", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** A change to the press's per-order fee (plan 9.6), sent 30 days before it starts. */
  "platform-fee-changing": ({ fromPercent, toPercent, startsOn, refunded, link }, { settings, pressName }) => layout({
    subject: `A change to ${pressName}'s fee on each order`,
    greeting: "Hello,",
    paragraphs: [
      `From ${startsOn}, ${settings.platformName}'s fee on each order ${pressName} takes will be ${toPercent}% (it is ${fromPercent}% now).`,
      refunded ? "When you refund an order, the fee is refunded with it." : "When you refund an order, the fee is not refunded.",
      "Nothing changes before that date. Reply to this email if you have a question.",
    ],
    buttons: [["See your plan", safeLink(link)]],
    footer: signOff(settings),
  }),

  /**
   * The health run's alert to the platform's own address (services/health). `data`: { pressName, shopId, check,
   * state: "failing" | "still-failing" | "recovered", detail, since }.
   */
  "health-alert": ({ shopId, check, state, detail, since }, { settings, pressName }) => {
    const what = { pages: "pages", checkout: "checkout", webhook: "payment events", backup: "backups", spending: "spending" }[check];
    if (!what) throw new Error(`the health alert names no known check (${check})`);
    const words = {
      failing: [`${what} failing`, `The ${what} check for ${pressName} started failing at ${since}.`],
      "still-failing": [`${what} still failing`, `The ${what} check for ${pressName} has been failing since ${since}.`],
      recovered: [`${what} working again`, `The ${what} check for ${pressName} passes again.`],
    }[state];
    if (!words) throw new Error(`the health alert has no known state (${state})`);
    return layout({
      subject: `${pressName} (${shopId}): ${words[0]}`,
      greeting: "",
      paragraphs: [words[1], ...(detail && state !== "recovered" ? [`What the check saw: ${detail}`] : [])],
      footer: `${settings.platformName} health checks`,
    });
  },

  /** An owner invited someone to their shop's team (accounts/accounts.js). */
  "invite": ({ pressName, invitedBy, roleWords, link, days }, { settings }) => layout({
    subject: `You're invited to join ${pressName} on ${settings.platformName}`,
    greeting: "Hello,",
    paragraphs: [
      `${invitedBy} invited you to join the team for ${pressName}, as ${roleWords}.`,
      `Accept with the button below and sign in with this email address. The invite works for ${days} days.`,
      "If you weren't expecting it, you can ignore this email.",
    ],
    buttons: [["Accept the invite", safeLink(link)]],
    footer: signOff(settings),
  }),

  // ── Support (services/support). `data`: { pressName, ticketId, subject, body, from?, followUp? }. ──

  /** To the person who asked: we have it. Their own words are repeated so they can check them. */
  "support-received": ({ ticketId, subject, body }, { settings }) => layout({
    subject: `We have your request: ${subject}`,
    greeting: "Hello,",
    paragraphs: [
      `Thanks for writing to ${settings.platformName} support. A person reads every request, and you'll get the answer by email.`,
      `Your request (number ${ticketId}):`,
      body,
    ],
    footer: signOff(settings),
  }),

  /** To the platform's support address: a new request, or more words on one. */
  "support-new": ({ ticketId, subject, body, from, followUp }, { settings, pressName }) => layout({
    subject: `${followUp ? "More on" : "New request"} ${ticketId}: ${subject}`,
    greeting: "",
    paragraphs: [`From ${from}${pressName ? ` (${pressName})` : ""}:`, body, "Answer it in the control room, under Support, so the press gets it by email."],
    footer: `${settings.platformName} support inbox`,
  }),

  /** To the person who asked: the team's answer. */
  "support-reply": ({ ticketId, subject, body }, { settings }) => layout({
    subject: `Re: ${subject}`,
    greeting: "Hello,",
    paragraphs: [body, `This answers your request number ${ticketId}. Add to it from your account page if you need more help.`],
    footer: signOff(settings),
  }),

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

  /** The shop's newsletter paused itself (reputation.js, plan 8.3). Receipts and order emails keep going. */
  "newsletter-paused": ({ problems = [], days }, { settings, pressName }) => layout({
    subject: `${pressName}'s newsletter is paused for now`,
    greeting: "Hello,",
    paragraphs: [
      `We paused ${pressName}'s newsletter. In the last ${days} days, ${problems.join(" and ")}.`,
      "When that happens, email providers start sending everyone's mail to spam, so we stop it early. Your receipts, order emails and shipping notices still go out as normal.",
      "To start again, send only to people who asked for your newsletter, and remove addresses that bounced. Then reply to this email and we'll turn it back on.",
    ],
    footer: signOff(settings),
  }),

  /** The press's own web address opens their shop, with its padlock (services/domains, plan 6.15). Sent once. */
  "domain-live": ({ domain, link }, { settings, pressName }) => layout({
    subject: `${pressName} is open at ${domain}`,
    greeting: "Hello,",
    paragraphs: [
      `Your shop now opens at ${domain}, with the secure padlock.`,
      "The address your shop came with keeps working too. To have emails, links and Google use the new one, make it your main address in your web address settings.",
    ],
    buttons: [["Open your web address settings", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** The press's own domain stopped passing the sending check (ownDomain.js, plan 6.18): Colophon's sender meanwhile. */
  "own-email-paused": ({ domain }, { settings, pressName }) => layout({
    subject: `${pressName}'s emails are coming from ${settings.platformName} for now`,
    greeting: "Hello,",
    paragraphs: [
      `Your shop's emails were coming from orders@${domain}, but that address stopped working for sending. Something changed where you bought ${domain}.`,
      `So nothing gets lost, your receipts and order emails now come from ${settings.platformName}'s address with ${pressName}'s name on them, and replies still reach you.`,
      `When the address works again, your emails switch back to orders@${domain} by themselves. If you moved ${domain} to another company, reply to this email and we'll help.`,
    ],
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

  /**
   * The press's card account has a detail past Stripe's deadline, so Stripe has paused cards or payouts (code plan 7.9;
   * services/payments). Sent once each time it happens. `data`: { provider, needs: plain words, link: the shop's admin }.
   * Never Stripe's own sign-up link: that one works once, for a few minutes, and must not be emailed.
   */
  "payments-past-due": ({ provider = "Stripe", needs = [], link }, { settings, pressName }) => {
    if (!Array.isArray(needs) || !needs.length) throw new Error("the past-due email names nothing that is needed");
    const what = needs.length === 1 ? needs[0] : `${needs.slice(0, -1).join(", ")} and ${needs[needs.length - 1]}`;
    return layout({
      subject: `${provider} has paused payments for ${pressName}`,
      greeting: "Hello,",
      paragraphs: [
        `${provider} still needs ${what} for ${pressName}, and the deadline has passed, so it has paused card payments or payouts until it has them.`,
        `Open your shop's admin and press Continue with ${provider} under Payments. It takes a few minutes.`,
      ],
      buttons: [["Open Payments", safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /**
   * The press changed plan. `prorated`: the new plan costs more and opens an app now, so the next bill is adjusted.
   * `closing`, `date`, `now`: an app the new plan drops ("the stockroom"), closing at the end of the paid month or, in
   * the trial, at once; its download is kept 90 days (code plan 6.11).
   */
  "plan-changed": ({ planName, price, link, prorated = true, closing, date, now }, { settings, pressName }) => layout({
    subject: `${pressName} is now on the ${planName} plan`,
    greeting: "Hello,",
    paragraphs: [
      `${pressName} is now on the ${planName} plan, ${price} a month.${prorated ? " Your next bill is adjusted for the part of the month on each plan." : ""}`,
      closing ? (now ? `Your plan no longer has ${closing}, so it is closed now.` : `Your plan no longer has ${closing}. It stays open until ${date}, the end of the month you've paid for, then closes.`) : "",
      closing ? "You can download everything in it for 90 days after it closes. Change plan again before then to keep it." : "",
    ].filter(Boolean),
    buttons: [["See your plan", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** The card on file runs out within a month (code plan 6.12). Sent once per card. `data`: { card, month, date, link }. */
  "card-expiring": ({ card, date, month, link }, { settings, pressName }) => layout({
    subject: `Your card for ${pressName} runs out soon`,
    greeting: "Hello,",
    paragraphs: [`The ${card || "card"} you pay for ${pressName} with runs out ${month ? `at the end of ${month}` : `on ${date}`}.`, "Add your new card before then so your shop stays open without a break."],
    buttons: [["Update your card", safeLink(link)]],
    footer: signOff(settings),
  }),

  // ── Account safety (accounts/devices.js, accounts/recovery.js). Recovery `data`: { requestId, oldEmail, newEmail,
  //    holdUntil, reason?, by? }. The account page is settings.platformUrl + /accounts/. ──

  /** The account was used from a device it hasn't been used from before. `data`: { browser, at }. */
  "new-device": ({ browser, at }, { settings }) => layout({
    subject: `New sign-in to your ${settings.platformName} account`,
    greeting: "Hello,",
    paragraphs: [
      `Your ${settings.platformName} account was just used from a device it hasn't been used from before: ${browser}, at ${at} (UTC).`,
      "If that was you, there's nothing to do.",
      "If it wasn't, sign out everywhere by changing your Google password or the password of the email address you sign in with, then reply to this email so we can help.",
    ],
    buttons: [["Open your account", safeLink(`${settings.platformUrl}/accounts/`)]],
    footer: signOff(settings),
  }),

  /** To the old address: someone asked to move this account away from it. */
  /**
   * The emergency payments switch (control-room/emergencyPayments.js, plan 8.5): a platform admin moved the shop's card
   * payments. `to`: "own" (the press's own Stripe keys), "square" or "platform" (back to normal); `ready`: whether the
   * press can take cards that way already.
   */
  "payments-moved": ({ to, ready }, { settings, pressName }) => {
    const admin = "Open your shop's admin, then Settings and Payments";
    const words = {
      own: {
        subject: `${pressName} now takes cards with your own Stripe account`,
        paragraphs: [
          `Card payments through ${settings.platformName} are stopped for now, so we moved ${pressName}'s checkout to your own Stripe account to keep you selling.`,
          ready ? "Your own Stripe keys are already saved, so shoppers can pay by card now." : `${admin}, and add your own Stripe keys. Until you do, shoppers can't pay by card.`,
        ],
      },
      square: {
        subject: `${pressName} now takes cards with Square`,
        paragraphs: [
          `Card payments through Stripe are stopped for now, so we moved ${pressName}'s checkout to Square to keep you selling.`,
          ready ? "Your Square account is connected, so shoppers can pay by card now." : `${admin}, and press Connect Square. Until you do, shoppers can't pay by card.`,
        ],
      },
      platform: {
        subject: `${pressName}'s card payments are back to normal`,
        paragraphs: [`Card payments through ${settings.platformName} work again, so we moved ${pressName}'s checkout back. You don't need to do anything.`],
      },
    }[to];
    if (!words) throw new Error("the payments email needs where the payments went");
    return layout({
      subject: words.subject,
      greeting: "Hello,",
      paragraphs: [...words.paragraphs, "Your books, orders and payouts already made are not affected. We'll email you again when anything changes."],
      footer: signOff(settings),
    });
  },

  /**
   * To Julian's own address (PLATFORM_ADMIN_EMAIL): the backup person opened their sealed access or used it
   * (control-room/backupPerson.js, plan 8.7). `data`: { by, action, reason, detail, at, until }.
   */
  "backup-access-used": ({ by, action, reason, detail, at, until }, { settings }) => {
    if (!by || !action) throw new Error("the backup access email needs who and what");
    return layout({
      subject: `${settings.platformName} backup access: ${by} ${action}`,
      greeting: "",
      paragraphs: [
        `${by} ${action} at ${at} (UTC).`,
        ...(reason ? [`Why: ${reason}`] : []),
        ...(detail && detail !== reason ? [detail] : []),
        ...(until ? [`The access stays open until ${until} (UTC).`] : []),
        "Every use is in the emergency log. If you didn't expect this, open the control room and look at once.",
      ],
      footer: `${settings.platformName} control room`,
    });
  },

  "recovery-asked": ({ newEmail }, { settings }) => layout({
    subject: `Someone asked to move your ${settings.platformName} account`,
    greeting: "Hello,",
    paragraphs: [
      `Someone signed in as ${newEmail} asked us to move the ${settings.platformName} account that uses this email address to theirs, saying they've lost access to this one.`,
      "A person on our team checks every request before anything moves, and nothing moves for at least three days after that.",
      "If this wasn't you, sign in to your account page and choose Stop this request.",
    ],
    buttons: [["Open your account", safeLink(`${settings.platformUrl}/accounts/`)]],
    footer: signOff(settings),
  }),

  /** To the person asking: we have it. Never says whether the old address has an account. */
  "recovery-received": ({ oldEmail }, { settings }) => layout({
    subject: "We have your request to move your account",
    greeting: "Hello,",
    paragraphs: [
      `We'll look at your request to move the account that used ${oldEmail}. A person checks every request, so it can take a few days, and we may write to ask you something.`,
      "For your safety we also let the old address know.",
    ],
    footer: signOff(settings),
  }),

  /** To the support address: a request to review in the control room. */
  "recovery-new": ({ requestId, oldEmail, newEmail, accountFound, shopCount }, { settings }) => layout({
    subject: `Account recovery to review: ${requestId}`,
    greeting: "",
    paragraphs: [
      `${newEmail} asks to move the account that uses ${oldEmail}.`,
      accountFound ? `That address has an account and owns ${shopCount} shop(s).` : "No account uses that address.",
      "Review it in the control room, under Account recovery.",
    ],
    footer: `${settings.platformName} account recovery`,
  }),

  /** The request was stopped, by the old owner or by the person asking. */
  "recovery-stopped": ({ requestId, by }, { settings }) => layout({
    subject: `Account recovery request ${requestId} was stopped`,
    greeting: "Hello,",
    paragraphs: [`The request to move a ${settings.platformName} account (${requestId}) was stopped by ${by}. Nothing has moved.`],
    footer: signOff(settings),
  }),

  /** Approved: the move waits until holdUntil, so the old owner can still stop it. */
  "recovery-approved": ({ oldEmail, newEmail, holdUntil }, { settings }) => layout({
    subject: "Your account move is approved and waiting",
    greeting: "Hello,",
    paragraphs: [
      `We've approved moving the ${settings.platformName} account that uses ${oldEmail} to ${newEmail}.`,
      `It will move after ${holdUntil} (UTC). Until then, the owner of ${oldEmail} can stop it from their account page.`,
    ],
    buttons: [["Open your account", safeLink(`${settings.platformUrl}/accounts/`)]],
    footer: signOff(settings),
  }),

  "recovery-denied": ({ oldEmail, reason }, { settings }) => layout({
    subject: "We couldn't move your account",
    greeting: "Hello,",
    paragraphs: [`We couldn't move the account that uses ${oldEmail}.`, reason, "Reply to this email if you can tell us more."],
    footer: signOff(settings),
  }),

  "recovery-applied": ({ oldEmail, newEmail }, { settings }) => layout({
    subject: `Your ${settings.platformName} account has moved`,
    greeting: "Hello,",
    paragraphs: [`The ${settings.platformName} account that used ${oldEmail} now signs in with ${newEmail}.`, "If you didn't expect this, reply to this email at once."],
    footer: signOff(settings),
  }),

  /**
   * A setup tip during the trial (services/trial-tips, plan 6.10): the next step of the shop's setup guide. `data`:
   * { pressName, subject, paragraphs, action, link, offLink }. Always carries the link that turns the tips off.
   */
  "trial-tip": ({ subject, paragraphs = [], action, link, offLink }, { settings, pressName }) => {
    if (!subject || !paragraphs.length || !action) throw new Error("the setup tip has no words");
    return layout({
      subject: `${pressName}: ${subject}`,
      greeting: "Hello,",
      paragraphs: [...paragraphs, `Don't want these setup tips? Turn them off here: ${safeLink(offLink)}. Emails about your plan and payments still come.`],
      buttons: [[action, safeLink(link)]],
      footer: signOff(settings),
    });
  },

  // Closing a shop (code plan 6.8): shop-closed, shop-deletion-warning, shop-deleted.
  ...closingTemplates({ layout, safeLink, signOff }),
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
