// The words of every email the platform sends, by kind. Each template takes the email's data plus `{ settings, pressName }`
// and returns { subject, text, html }. Every value from a press or a person is escaped in the HTML, and links must be
// https. Customer-facing words: name the product (settings.platformName), never a rival.
import { closingTemplates } from "./closingTemplates.js";
import { pressTemplates } from "./pressTemplates.js";

export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A link a template may put in an email: https only, so a stored value can never become a script or mail link. */
export function safeLink(url) {
  if (typeof url !== "string" || !/^https:\/\/[^\s<>"']+$/.test(url)) throw new Error("an email link must be an https address");
  return url;
}

// The Colophon bento look (shared/admin-look/colophon.css, day): a cream page, the subject on the mint tile, the words on
// a white tile with round corners, ink pill buttons. Tables and bgcolor so Outlook keeps the colours; inline styles only,
// since Gmail drops most <style> rules. Corners round everywhere but Outlook on Windows, which shows them square.
const BENTO = { page: "#efede8", tile: "#ffffff", mint: "#a9e8c6", ink: "#1f1e1b", muted: "#55524b", faint: "#67635b", line: "#e4e1da" };
const FONT = "'Archivo','Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'DM Mono','Courier New',Courier,monospace";
/** Where the identity line goes (withIdentity): just before it, at the foot of the email, outside the tiles. */
const FOOT = "<!--colophon-foot-->";

const pillButton = ([label, url]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 8px 6px 0;display:inline-table;border-collapse:separate"><tr><td bgcolor="${BENTO.ink}" style="background:${BENTO.ink};border-radius:999px"><a href="${escapeHtml(safeLink(url))}" style="display:inline-block;padding:13px 24px;border-radius:999px;background:${BENTO.ink};color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.2;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;

/** Builds the three parts from paragraphs of plain text and [label, url] buttons. */
export function layout({ subject, greeting, paragraphs, buttons = [], footer }) {
  const text = [greeting, ...paragraphs, ...buttons.map(([label, url]) => `${label}: ${safeLink(url)}`), footer].filter(Boolean).join("\n\n");
  const para = (p) => `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${BENTO.ink}">${escapeHtml(p)}</p>`;
  const html = [
    `<div style="background:${BENTO.page};margin:0;padding:0">`,
    // What the inbox shows beside the subject: the first line of the words, never the greeting.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BENTO.page}">${escapeHtml(paragraphs[0] ?? "")}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BENTO.page}" style="background:${BENTO.page}"><tr><td align="center" style="padding:28px 12px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;border-collapse:separate">`,
    `<tr><td style="padding:0 4px 12px"><span style="display:inline-block;padding:7px 14px;border-radius:999px;background:${BENTO.ink};color:${BENTO.page};font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:0.01em">Colophon</span></td></tr>`,
    `<tr><td bgcolor="${BENTO.mint}" style="background:${BENTO.mint};border-radius:24px;padding:26px 28px"><div style="font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.01em;color:${BENTO.ink}">${escapeHtml(subject)}</div></td></tr>`,
    `<tr><td style="height:10px;line-height:10px;font-size:0">&nbsp;</td></tr>`,
    `<tr><td bgcolor="${BENTO.tile}" style="background:${BENTO.tile};border-radius:24px;padding:28px 28px 22px">`,
    greeting ? para(greeting) : "",
    ...paragraphs.map(para),
    buttons.length ? `<div style="padding:10px 0 8px">${buttons.map(pillButton).join("")}</div>` : "",
    footer ? `<p style="margin:16px 0 0;padding-top:14px;border-top:1px solid ${BENTO.line};font-family:${FONT};font-size:13px;line-height:1.5;color:${BENTO.muted}">${escapeHtml(footer)}</p>` : "",
    `</td></tr>`,
    `<tr><td style="padding:16px 8px 0;font-family:${MONO};font-size:11px;line-height:1.6;color:${BENTO.faint}">${FOOT}</td></tr>`,
    `</table></td></tr></table></div>`,
  ].join("");
  return { subject, text, html };
}

/**
 * Who the email is from, where, and how to reach us: the line every platform email ends with (code plan 15.8). The
 * address is Colophon's mailing address (PLATFORM_MAILING_ADDRESS); until it is set the line names the product and
 * the support address only, and an email that needs the address refuses to send (`sendPlatform`).
 */
export const identityLine = (settings) =>
  `${settings.platformName}${settings.mailingAddress ? `, ${settings.mailingAddress}` : ""}. Contact: ${settings.supportEmail}.`;

/** Adds the identity line to the end of a rendered email, once (an email that already carries it is left alone). */
export function withIdentity(parts, settings) {
  const line = identityLine(settings);
  if (parts.text.includes(line)) return parts;
  // The bento layout leaves a place for it under the tiles (the last one, in a French-then-English email).
  const at = parts.html.lastIndexOf(FOOT);
  const html = at >= 0
    ? `${parts.html.slice(0, at)}${escapeHtml(line)}${parts.html.slice(at)}`
    : `${parts.html}<p style="font-size:12px;color:${BENTO.faint}">${escapeHtml(line)}</p>`;
  return { ...parts, text: `${parts.text}\n\n${line}`, html };
}

/** Kinds that are commercial messages to people who asked to hear from us: they must carry the mailing address. */
export const COMMERCIAL_KINDS = Object.freeze(new Set(["waitlist-invite"]));

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

  /** Setup step 14 again, after a plan change adds an app: the link to the app that is new. */
  "app-added": ({ links = {} }, { settings, pressName }) => {
    const buttons = [];
    if (links.shopAdmin) buttons.push(["Open your shop's admin", links.shopAdmin]);
    if (links.stockroom) buttons.push(["Open your stockroom", links.stockroom]);
    if (!buttons.length) throw new Error("the new-app email has no links");
    const name = links.shopAdmin && links.stockroom ? "website and stockroom" : links.stockroom ? "stockroom" : "website";
    const ready = `Your ${name} ${links.shopAdmin && links.stockroom ? "are" : "is"} ready`;
    return layout({
      subject: `${ready} on ${settings.platformName}`,
      greeting: "Hello,",
      paragraphs: [
        `${ready} for ${pressName}. Sign in with this email address, as usual.`,
        "Your setup checklist shows what is left to do.",
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

  /** The front door's sign-in (signup/frontDoor.js): a six-digit code to type in, for new and returning presses. */
  "sign-in-code": ({ code }, { settings }) => {
    if (!/^\d{6}$/.test(String(code ?? ""))) throw new Error("A sign-in code is six numbers");
    return layout({
      subject: `${code} is your ${settings.platformName} code`,
      greeting: "Hello,",
      paragraphs: [`Your code to sign in to ${settings.platformName} is ${code}. Type it on the page you came from. It works once, for 10 minutes.`, "If you didn't ask for it, you can ignore this email. Nobody can sign in without the code."],
      footer: signOff(settings),
    });
  },

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

  /** A press still in setup mode that hasn't been back (plan 18.11): 30 and 7 days before its setup is cleared. */
  "setup-ending": ({ pressName, daysLeft, date, link }, { settings }) => layout({
    subject: `Your ${settings.platformName} setup is kept until ${date}`,
    greeting: "Hello,",
    paragraphs: [
      `You started setting up ${pressName || "your shop"} on ${settings.platformName}, but haven't been back for a while. We keep a setup for 60 days after your last visit, so what you've done so far is kept for ${daysLeft} more days, until ${date}.`,
      "Sign in any time before then and everything is where you left it, and the 60 days start again. After that date we clear your answers and any product file you added. You can always start again.",
    ],
    buttons: [["Carry on setting up", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** The control room's waitlist invite (plan 9.5): the person may start their shop now, past the daily line. */
  "waitlist-invite": ({ link, trialDays }, { settings }) => layout({
    subject: `Your ${settings.platformName} shop is ready to start`,
    greeting: "Hello,",
    paragraphs: [
      `Thanks for joining the ${settings.platformName} waitlist. Your place has come up: you can start your shop now.`,
      ((days) => (days > 0 ? `Sign up with this email address. The first ${days} days are free and no card is needed.` : "Sign up with this email address."))(trialDays ?? settings.trialDays ?? 14),
      `You're getting this because you asked to hear from ${settings.platformName} when your place came up. Reply STOP and we'll take you off the list at once.`,
    ],
    buttons: [["Start your shop", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** A change to the press's per-order fee (plan 9.6), sent 30 days before it starts. */
  /**
   * The terms changed (terms/notice.js). `changes`: what changed, in plain lines (terms.js CHANGES); `appliesOn`: the
   * day the new words apply, CHANGE_NOTICE_DAYS after this email.
   */
  "terms-changed": ({ changes = [], appliesOn, link, billing }, { settings, pressName }) => layout({
    subject: `${settings.platformName}'s terms are changing on ${appliesOn}`,
    greeting: "Hello,",
    paragraphs: [
      `We've updated ${settings.platformName}'s terms. The new words apply to ${pressName} from ${appliesOn}. What changed:`,
      ...changes.map((line) => `• ${line}`),
      `If you keep using ${settings.platformName} after ${appliesOn}, you agree to the new terms. If you don't agree, you can cancel before then from your billing page and pay nothing more.`,
    ],
    buttons: [["Read the terms", safeLink(link)], ["Your plan and billing", safeLink(billing)]],
    footer: signOff(settings),
  }),

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
    const what = { pages: "pages", checkout: "checkout", webhook: "payment events", errors: "shopper errors", backup: "backups", drill: "backup restore test", spending: "spending" }[check];
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
      ? [`Your free trial for ${pressName} ends on ${date}. After that, your card is charged ${price} a month for the ${planName} plan, plus what your shop costs to run.`, "You can change plan or cancel at any time before then."]
      : [`Your free trial for ${pressName} ends on ${date}.`, `To keep it open, add a card. The ${planName} plan is ${price} a month plus what your shop costs to run, and you can cancel at any time.`, "If there is no card by then, your shop pauses. Everything is kept for 60 days, and adding a card opens it again."],
    buttons: [[hasCard ? "Manage your plan" : "Add a card", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** The trial ended with no card: the subscription paused. */
  "card-needed": ({ link }, { settings, pressName }) => layout({
    subject: `${pressName} is paused until you add a card`,
    greeting: "Hello,",
    paragraphs: [`Your free trial for ${pressName} has ended, so it is paused for now. Everything is kept for 60 days.`, "Add a card and it opens again straight away."],
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

  /** The shop's free address on the platform's shop domain works (services/domains freeAddress.js). Sent once. */
  "free-address-live": ({ domain, link }, { settings, pressName }) => layout({
    subject: `${pressName} is open at ${domain}`,
    greeting: "Hello,",
    paragraphs: [
      `Your shop now opens at ${domain}, with the secure padlock. This is the address to share: put it on your social pages, your cards and your emails.`,
      "It's free and stays yours for as long as your shop is open. You can change its name, or bring a domain of your own, in your web address settings.",
    ],
    buttons: [["Open your web address settings", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** A paying press whose shop has gone quiet (control-room/driftWatch.js): a gentle check-in, at most every 60 days. */
  "quiet-shop": ({ pressName, link, helpLink }, { settings, w = (text) => text }) => layout({
    subject: `How is ${pressName} getting on?`,
    greeting: "Hello,",
    paragraphs: [
      `Things have been quiet at ${pressName} lately, so we wanted to check in. Shops often slow down between seasons, and that's fine.`,
      w("A few things that tend to bring shoppers back: add a new title or a fresh photo, send your newsletter about it, or put a small discount code on your home page for a week."),
      `If something in ${settings.platformName} is getting in your way, reply to this email and tell us what it is. The help pages are always there too: ${helpLink}`,
    ],
    buttons: [["Open your shop admin", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** The press's web address is paid up only until `date` (services/domains checkAll, from the public registry). 30 and 7 days before. */
  "domain-expiring": ({ domain, daysLeft, date, seller, own }, { settings }) => layout({
    subject: `${domain} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    greeting: "Hello,",
    paragraphs: [
      `Your web address ${domain} is paid up until ${date}. If it isn't renewed by then, your shop stops opening at ${domain}, and anything else that uses it stops too.`,
      `To keep it, renew it where you bought it${seller ? ` (${seller})` : ""}. Most sellers can renew it for you every year: look for "auto-renew" in your account there.`,
      `If you already renewed it, there's nothing to do. Your shop also keeps working at ${own}.`,
    ],
    footer: signOff(settings),
  }),

  /** The press's web address stopped opening their shop (services/domains checkAll): sent once per break, after an hour. */
  "domain-not-pointing": ({ domain, own, link }, { settings }) => layout({
    subject: `${domain} isn't opening your shop`,
    greeting: "Hello,",
    paragraphs: [
      `${domain} no longer leads to your shop. This usually means the settings changed where you bought ${domain}, or the address wasn't renewed.`,
      `Your shop still works at ${own}, and your orders are safe.`,
      `Your web address settings show the lines to put back where you bought ${domain}. Once they are back, your shop opens at ${domain} again by itself.`,
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
  "payment-failed": ({ price, nextTry, link, note }, { settings, pressName }) => layout({
    subject: `We couldn't take this month's payment for ${pressName}`,
    greeting: "Hello,",
    paragraphs: [
      // The owner's own line from the control room's reminder, first, so it reads as a person and not the robot.
      ...(note ? [String(note).slice(0, 300)] : []),
      `Your card was declined for this month's ${price} payment for ${pressName}. Your shop stays open while we sort it out.`,
      nextTry ? `We'll try the card again on ${nextTry}. To avoid another decline, update your card now.` : "Please update your card so your shop stays open.",
    ],
    buttons: [["Update your card", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** The bank wants the press to confirm this month's payment (Stripe keeps the bill open meanwhile, code plan 22.5). */
  "payment-needs-confirming": ({ price, link, note }, { settings, pressName }) => layout({
    subject: `Your bank wants you to confirm ${pressName}'s payment`,
    greeting: "Hello,",
    paragraphs: [
      // The owner's own line from the control room's reminder, first, so it reads as a person and not the robot.
      ...(note ? [String(note).slice(0, 300)] : []),
      `Your bank asked you to confirm this month's ${price} payment for ${pressName} before it goes through. It's a normal safety step some banks take.`,
      `Use the button below to confirm it with your bank. Your shop stays open meanwhile.`,
    ],
    buttons: [["Confirm the payment", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** A payment that had failed went through after all (22.5). Only sent after a problem, never for an ordinary month. */
  "payment-received": ({ price, link, bill }, { settings, pressName }) => layout({
    subject: `Thanks, ${pressName}'s payment went through`,
    greeting: "Hello,",
    paragraphs: [`Your ${price} payment for ${pressName} went through, so everything is back to normal. Your bills are on your billing page whenever you need them.`],
    buttons: [...(bill ? [["See this bill", safeLink(bill)]] : []), ["See your bills", safeLink(link)]],
    footer: signOff(settings),
  }),

  /**
   * A receipt for a paid bill (code plan 25.1), every month and for any other bill with money on it. `data`: { price
   * (what was paid), number (the bill's number, or ""), paidOn, from and to (the days the bill covers, or ""), tax (the
   * tax in it, or ""), bill (the bill's own page, https, or null), link (the billing page) }.
   */
  "bill-paid": ({ price, number, paidOn, from, to, tax, bill, link, planName }, { settings, pressName }) => {
    if (!price) throw new Error("a receipt needs the amount paid");
    return layout({
      subject: `Your ${settings.platformName} receipt for ${pressName}${number ? ` (${number})` : ""}`,
      greeting: "Hello,",
      paragraphs: [
        `Thanks: we received your ${price} payment for ${pressName}${planName ? `, ${planName} plan` : ""}${paidOn ? `, on ${paidOn}` : ""}.`,
        ...(from && to ? [`It pays for ${from} to ${to}.`] : []),
        ...(tax ? [`It includes ${tax} in sales tax.`] : []),
        `${number ? `Bill ${number} is` : "This bill is"} kept on your billing page, with all your earlier ones, whenever you need them for your books.`,
      ],
      buttons: [...(bill ? [["See this bill", safeLink(bill)]] : []), ["See your bills", safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** A card was added or made the one that pays (code plan 25.2): a safety notice. `data`: { card (e.g. "Visa ending 4242"), link }. */
  "card-changed": ({ card, link }, { settings, pressName }) => layout({
    subject: `The card that pays for ${pressName} changed`,
    greeting: "Hello,",
    paragraphs: [
      `${card ? `${card} now pays` : "A new card now pays"} for ${pressName}'s ${settings.platformName} plan.`,
      "If you made this change, there's nothing to do.",
      "If you didn't, sign in and check your billing page now, then reply to this email so we can help straight away.",
    ],
    buttons: [["See your billing", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** A card reopened a shop that was paused (code plan 25.3). `data`: { card, link }. */
  "shop-reopened": ({ card, price, planName, link }, { settings, pressName }) => layout({
    subject: `${pressName} is open again`,
    greeting: "Hello,",
    paragraphs: [
      `Thanks for adding ${card || "a card"}. ${pressName} is open again, and shoppers can order as usual.`,
      "Your plan carries on from today, billed each month as before, and you can change or cancel it at any time.",
    ],
    buttons: [["See your plan", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** The press kept a plan they had cancelled (code plan 25.3). `data`: { link }. */
  "cancel-undone": ({ price, planName, link }, { settings, pressName }) => layout({
    subject: `${pressName} stays open`,
    greeting: "Hello,",
    paragraphs: [
      `You kept your ${settings.platformName} plan, so ${pressName} won't close. We're glad you're staying.`,
      "Your plan carries on just as before, and you won't be asked to set anything up again.",
    ],
    buttons: [["See your plan", safeLink(link)]],
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
    paragraphs: [`Your ${settings.platformName} plan for ${pressName} has ended, so the shop is closed. For 90 days you can sign in and press Download your shop (Settings, then Plan) to get everything in one zip; after that it is deleted, and we email you 30 and 7 days before.`, "You can start a plan again before then and pick up where you left off."],
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
  "plan-changed": ({ planName, price, link, prorated = true, closing, date, now, everything, adds }, { settings, pressName }) => everything ? layout({
    // An older shop or stockroom plan moved to the one plan (billing.js giveEveryApp, 10 November 2026).
    subject: `${pressName} now has the website and the stockroom`,
    greeting: "Hello,",
    paragraphs: [
      `Every ${settings.platformName} shop now comes with both the website and the stockroom, for the same ${price} a month plus what your shop costs to run.`,
      Array.isArray(adds) && adds.length ? `We're setting up your ${adds.includes("shop") ? "website" : "stockroom"} now. It shows in your admin within the hour, with nothing for you to do.` : "",
    ].filter(Boolean),
    buttons: [["Open your admin", safeLink(link)]],
    footer: signOff(settings),
  }) : layout({
    subject: `${pressName} is now on the ${planName} plan`,
    greeting: "Hello,",
    paragraphs: [
      `${pressName} is now on the ${planName} plan, ${price} a month plus what your shop costs to run.${prorated ? " Your next bill is adjusted for the part of the month on each plan." : ""}`,
      closing ? (now ? `Your plan no longer has ${closing}, so it is closed now.` : `Your plan no longer has ${closing}. It stays open until ${date}, the end of the month you've paid for, then closes.`) : "",
      closing ? "You can download everything in it for 90 days after it closes. Change plan again before then to keep it." : "",
    ].filter(Boolean),
    buttons: [["See your plan", safeLink(link)]],
    footer: signOff(settings),
  }),

  /**
   * A week before an app a plan change dropped closes (billing.js closeDroppedApps). `data`: { closing, date, link,
   * signIn }: `signIn` when the link is the plan page (sign in, then one click) rather than the one-time keep link.
   */
  "app-closing-soon": ({ closing, date, link, signIn = false }, { settings, pressName }) => layout({
    subject: `${String(closing || "An app").replace(/^t/, "T")} for ${pressName} ${/ and /.test(closing) ? "close" : "closes"} on ${date}`,
    greeting: "Hello,",
    paragraphs: [
      `When you changed your plan, you left out ${closing || "an app"}. It closes on ${date}, the end of the month you've paid for.`,
      `${signIn ? "If you meant to keep it, one click on your plan page keeps it." : `If you meant to keep it, the button below keeps it, with no need to sign in. It works once, until ${date}.`} If not, there's nothing to do: you can download everything in it for 90 days after it closes.`,
    ],
    buttons: [[signIn ? "Keep it or see your plan" : "Keep it", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** A dropped app closed today (billing closeDroppedApps). `data`: { closing, date (the last day to download), link }. */
  "app-closed": ({ closing, holds, date, link }, { settings, pressName }) => {
    const many = / and /.test(closing ?? "");
    const [it, them] = many ? ["they", "them"] : ["it", "it"];
    return layout({
      subject: `${String(closing || "An app").replace(/^t/, "T")} for ${pressName} ${many ? "are" : "is"} closed. Download ${them} by ${date}`,
      greeting: "Hello,",
      paragraphs: [
        `Your plan no longer has ${closing || "this app"}, so ${it} closed today, at the end of the month you paid for.`,
        `Everything that was in ${them} is kept until ${date}. To save a copy, open your account and choose Download all your data: we'll email you a link to every file${holds ? `, with ${holds}` : ""}.`,
        `Changed your mind? Add ${them} back to your plan before ${date} and ${many ? "they open" : "it opens"} again with everything in ${them}.`,
      ],
      buttons: [["Download your data", safeLink(link)]],
      footer: signOff(settings),
    });
  },

  /** Three days before a closed app's download ends (billing closedApps.js). `data`: { closing, holds? (what the download holds), date (the last day), link }. */
  "app-download-ending": ({ closing, holds, date, link }, { settings, pressName }) => layout({
    subject: `Last days to download ${closing || "your closed app"} for ${pressName}`,
    greeting: "Hello,",
    paragraphs: [
      `${String(closing || "The app").replace(/^t/, "T")} you dropped from your plan closed a while ago. Everything that was in it is kept until ${date}, then deleted for good.`,
      `To save a copy, open your account and choose Download all your data: we'll email you a link to every file${holds ? `, with ${holds}` : ""}. To keep using it instead, add it back to your plan before then.`,
    ],
    buttons: [["Download your data", safeLink(link)]],
    footer: signOff(settings),
  }),

  /** A closed app's records were deleted after its 90 days (billing closedApps.js). `data`: { closing, link }. */
  "app-records-deleted": ({ closing, link }, { settings, pressName }) => layout({
    subject: `Everything that was in ${closing || "your closed app"} for ${pressName} is now deleted`,
    greeting: "Hello,",
    paragraphs: [
      `As we wrote before, the 90 days to download ${closing || "the app you dropped"} are over, so everything that was in it has now been deleted for good.`,
      "Nothing else was deleted with it. If you want it again one day, you can add it back to your plan; it starts empty.",
    ],
    buttons: [["Open your account", safeLink(link)]],
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

  /** Pay what you use: this month's bill looks set to pass the amount the press chose. `data`: { month, projected, limit, link }. */
  "bill-heads-up": ({ month, projected, limit, link }, { settings, pressName }) => layout({
    subject: `${pressName}'s bill for ${month} may pass ${limit}`,
    greeting: "Hello,",
    paragraphs: [`At this pace, ${pressName}'s bill for ${month} comes to about ${projected}: the platform fee plus what the shop costs to run. You asked us to tell you when it may pass ${limit}.`, "A busy month (a sale, a mention, lots of visitors) is the usual reason. You can see the month so far, or change this amount, under Billing."],
    buttons: [["See your bill", safeLink(link)]],
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

  /** Delete my account (accounts/deleteAccount.js, plan 24.2): the goodbye note to the address that was deleted. */
  "account-deleted": ({ shops = [] }, { settings }) => layout({
    subject: `Your ${settings.platformName} account is deleted`,
    greeting: "Hello,",
    paragraphs: [
      `Your ${settings.platformName} account and your sign-in are deleted, as you asked.`,
      shops.length ? `You're no longer on the team of ${shops.join(", ")}.` : "",
      "Invoices and billing records are kept for six years because tax law asks for it, and your past support messages stay as a record. Nothing else about you is kept.",
      "If you didn't do this, reply to this email straight away.",
    ].filter(Boolean),
    footer: signOff(settings),
  }),

  /** To the old address: someone asked to move this account away from it. */
  /**
   * The emergency payments switch (control-room/emergencyPayments.js, plan 8.5): a platform admin moved the shop's card
   * payments. `to`: "own" (the press's own Stripe keys), "square" or "platform" (back to normal); `ready`: whether the
   * press can take cards that way already.
   */
  "payments-moved": ({ to, ready }, { settings, pressName, w = (text) => text }) => {
    const admin = "Open your shop's admin, then Settings and Payments";
    const words = {
      own: {
        subject: `${pressName} now takes cards with your own Stripe account`,
        paragraphs: [
          `Card payments through ${settings.platformName} are stopped for now, so we moved ${pressName}'s checkout to your own Stripe account to keep you selling.`,
          ready ? "Your own Stripe account is already connected, so shoppers can pay by card now." : `${admin}, and connect your own Stripe account. Until you do, shoppers can't pay by card.`,
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
      paragraphs: [...words.paragraphs, w("Your books, orders and payouts already made are not affected. We'll email you again when anything changes.")],
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
  /** Tips for a first sale (control-room/notSelling.js): sent by the platform owner to a live shop with no sale yet. */
  "first-sale-tips": (_data, { settings, pressName }) => layout({
    subject: `${pressName}: a few ways to get your first order`,
    greeting: "Hello,",
    paragraphs: [
      "Your shop has been open a couple of weeks. Here are the things that most often bring a first order.",
      "Share your shop's address everywhere: your social pages, your email signature, your cards and your newsletter.",
      "Put up one item you know people want, with a clear photo and a short description.",
      "Tell your friends and regulars it's open, and ask them to pass it on.",
      "Turn on Google in your admin so your items show up when people search.",
      "Reply to this email if anything is in the way. We read every one.",
    ],
    footer: signOff(settings),
  }),

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

  /**
   * The monthly shop check-up (services/checkup, plan 14.9). `data`: { pressName, lines: [{ state, words, fix?: { label,
   * link } }], offLink }. Every line that needs doing has its own button; a month with nothing to fix says so.
   */
  "shop-checkup": ({ lines = [], offLink }, { settings, pressName }) => {
    if (!lines.length) throw new Error("the check-up has no lines");
    const fixes = lines.filter((l) => l.state === "fix");
    return layout({
      subject: fixes.length ? `${pressName}: ${fixes.length === 1 ? "one thing" : `${fixes.length} things`} to fix in your shop` : `${pressName}: your shop is in good shape`,
      greeting: "Hello,",
      paragraphs: [
        `Here is this month's check-up of ${pressName}. ${fixes.length ? "Each thing that needs you has a button." : "Nothing needs you this month."}`,
        ...lines.map((l) => `${l.state === "ok" ? "Good: " : "To do: "}${l.words}`),
        `Don't want this email each month? Turn it off here: ${safeLink(offLink)}. Emails about your plan and payments still come.`,
      ],
      buttons: fixes.filter((l) => l.fix).map((l) => [l.fix.label, safeLink(l.fix.link)]),
      footer: signOff(settings),
    });
  },

  // Closing a shop (code plan 6.8): shop-closed, shop-deletion-warning, shop-deleted.
  ...closingTemplates({ layout, safeLink, signOff }),

  /**
   * Support asks before making changes in a shop (control-room/accessRequests.js, plan 19.6): who, why, and the way to
   * say yes or no on the account page. Nothing happens without a yes.
   */
  "support-access-request": ({ by, reason, until, link }, { settings, pressName }) => layout({
    subject: `${settings.platformName} support asks to make changes in ${pressName}`,
    greeting: "Hello,",
    paragraphs: [
      `${by} from ${settings.platformName} support would like to open ${pressName}'s admin for 30 minutes, able to make changes.`,
      `Why: ${reason}`,
      `Nothing changes unless you say yes. Approve or decline on your account page${until ? ` by ${until}` : ""}; after that the request runs out. Every visit is written in your shop's log.`,
    ],
    buttons: [["Approve or decline", safeLink(link)]],
    footer: signOff(settings),
  }),

  /**
   * The weekly deletion note to the platform owner (control-room/deletionNote.js). `data.apps`: [{ shopId, pressName,
   * ownerEmail, app, date (download ends), overdue, warned (date of the last email, or null), problem, bounced }].
   */
  "apps-deleting-soon": ({ apps }, { settings }) => {
    if (!Array.isArray(apps) || !apps.length) throw new Error("the deletion note lists no apps");
    const line = (a) => [
      `${a.pressName} (${a.shopId}${a.ownerEmail ? `, ${a.ownerEmail}` : ""}): ${a.app}.`,
      a.overdue ? `Its download ended ${a.date} and it is still waiting to be deleted${a.problem ? `: ${a.problem}` : ""}.` : `Its download ends ${a.date}; its records are deleted after that.`,
      a.warned ? `The last-days email went out ${a.warned}${a.bounced ? ", but a closing email bounced" : ""}.` : `The last-days email hasn't gone out yet${a.bounced ? ", and a closing email bounced" : ""}.`,
    ].join(" ");
    const stuck = apps.filter((a) => a.overdue).length;
    return layout({
      subject: `${apps.length} closed app${apps.length === 1 ? "" : "s"} to be deleted this week${stuck ? ` (${stuck} overdue)` : ""}`,
      greeting: "",
      paragraphs: [
        "These closed apps' records are deleted within the next week. A press that asks in time can still add the app back to its plan, or download everything first.",
        ...apps.map(line),
        "Open Apps closing in the control room for the whole list. You get this note once a week, and only when something is due.",
      ],
      footer: `${settings.platformName} control room`,
    });
  },

  /**
   * The Monday summary to the platform owner (control-room/weeklySummary.js). `data`: { income (cents), currency, live,
   * started: [name], leaving: [name], waiting, lines: [words] }.
   */
  "weekly-summary": ({ income, currency, live, started = [], leaving = [], waiting = 0, lines = [], notSelling = null }, { settings }) => {
    const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: currency || "CAD" }).format((Number(income) || 0) / 100);
    const names = (list) => list.join(", ");
    return layout({
      subject: `Your week: ${money} a month, ${started.length} new, ${waiting} waiting`,
      greeting: "",
      paragraphs: [
        `Plan income this month: ${money}, from ${live} live shop${live === 1 ? "" : "s"}.`,
        started.length ? `New this week (${started.length}): ${names(started)}.` : "No new shops this week.",
        leaving.length ? `Said they're leaving (${leaving.length}): ${names(leaving)}.` : "Nobody said they're leaving this week.",
        ...(Array.isArray(notSelling) && notSelling.length ? [`No sale yet after two weeks (${notSelling.length}): ${names(notSelling.slice(0, 10))}${notSelling.length > 10 ? ` and ${notSelling.length - 10} more` : ""}. Send them tips from Shops.`] : []),
        waiting ? `Waiting on you (${waiting}):` : "Nothing is waiting on you.",
        ...lines.map((l) => `• ${l}`),
        ...(waiting > lines.length ? [`and ${waiting - lines.length} more on Today.`] : []),
      ],
      footer: `${settings.platformName} control room`,
    });
  },

  /**
   * The Chit Chats morning note to the platform owner (control-room/chitChatsNote.js). `data`: { shops: [{ shopId,
   * pressName, late: [order], lateCount, problems: [{ order, words }], problemCount, refused }], stillLate, days }.
   */
  "chitchats-late": ({ shops, stillLate, days }, { settings }) => {
    if (!Array.isArray(shops) || !shops.length) throw new Error("the Chit Chats note names no shop");
    const orders = (n) => `${n} order${n === 1 ? "" : "s"}`;
    const more = (shown, n) => (n > shown.length ? ` and ${n - shown.length} more` : "");
    const lines = shops.flatMap((s) => [
      ...(s.refused ? [`${s.pressName} (${s.shopId}): Chit Chats stopped accepting their account details (${s.refused.replace(/\.$/, "")}), so no new order reaches it until they enter them again.`] : []),
      ...(s.lateCount ? [`${s.pressName} (${s.shopId}): ${orders(s.lateCount)} passed ${days} days without a tracking number: ${s.late.join(", ")}${more(s.late, s.lateCount)}.`] : []),
      ...s.problems.map((p) => `${s.pressName} (${s.shopId}): order ${p.order} ran into a problem${p.words ? `: ${p.words}` : "."}`),
      ...(s.problemCount > s.problems.length ? [`${s.pressName}: ${s.problemCount - s.problems.length} more orders ran into a problem.`] : []),
    ]);
    const late = shops.reduce((n, s) => n + s.lateCount, 0);
    const problems = shops.reduce((n, s) => n + s.problemCount, 0);
    const refused = shops.filter((s) => s.refused).length;
    return layout({
      subject: `Chit Chats: ${[refused ? `${refused} shop${refused === 1 ? "" : "s"} refused` : "", late ? `${orders(late)} waiting for tracking` : "", problems ? `${orders(problems)} with a problem` : ""].filter(Boolean).join(", ")}`,
      greeting: "",
      paragraphs: [
        "This went wrong in Chit Chats in the last day. The press has been emailed too, unless they turned those emails off.",
        ...lines,
        ...(stillLate ? [`${orders(stillLate)} from before ${stillLate === 1 ? "is" : "are"} still waiting too.`] : []),
        "Open App store in the control room for the Chit Chats table. Each order is in this note once, on the day it goes wrong.",
      ],
      footer: `${settings.platformName} control room`,
    });
  },

  /**
   * The stuck-switch note to the platform owner (control-room/switchNote.js). `data`: { shops: [{ shopId, pressName,
   * from, to, since, problem }], stillWaiting, days }.
   */
  "switch-stuck": ({ shops = [], stillWaiting, days, paused = [] }, { settings }) => {
    if ((!Array.isArray(shops) || !shops.length) && (!Array.isArray(paused) || !paused.length)) throw new Error("the stuck-switch note names no shop");
    const name = (p) => ({ stripe: "Stripe", square: "Square" })[p] ?? p ?? "?";
    const lines = shops.map((s) => `${s.pressName} (${s.shopId}): ${name(s.from)} to ${name(s.to)}, started ${s.since}${s.problem ? `. Last try: ${s.problem}` : "."}`);
    const pausedLines = paused.map((s) => `${s.pressName} (${s.shopId}): payouts paused since ${s.since}${s.pastDue ? ", because Stripe is waiting on overdue details (the press was emailed)." : "."}`);
    const subject = [
      shops.length ? `Card switch${shops.length === 1 ? "" : "es"} waiting ${days} days: ${shops.map((s) => s.pressName).join(", ")}` : null,
      paused.length ? `Payouts paused ${days} days: ${paused.map((s) => s.pressName).join(", ")}` : null,
    ].filter(Boolean).join("; ");
    return layout({
      subject: subject.slice(0, 150),
      greeting: "",
      paragraphs: [
        ...(shops.length ? [
          `${shops.length === 1 ? "This press's switch" : "These presses' switches"} between Stripe and Square passed ${days} days without finishing. Their Payments page tells them Colophon is on it. Both accounts take sales meanwhile, so nothing is lost.`,
          ...lines,
          ...(stillWaiting ? [`${stillWaiting} older switch${stillWaiting === 1 ? " is" : "es are"} still waiting too.`] : []),
          `Open each press in the control room's Shops list and press Finish the switch. Each switch is in this note once, on the day it passes ${days} days.`,
        ] : []),
        ...(paused.length ? [
          `Stripe has paused payouts for ${paused.length === 1 ? "this press" : "these presses"} for ${days} days, so their sales aren't reaching their bank.`,
          ...pausedLines,
          `Pick "Payouts paused" under Cards in the Shops list to see them all. Each press is in this note once, on the day it passes ${days} days.`,
        ] : []),
      ],
      footer: `${settings.platformName} control room`,
    });
  },

  /**
   * A scheduled job stopped running on time (services/jobs, plan 19.11), to the platform's alert address only.
   * `data`: { job, words, every (minutes), lastRunAt }.
   */
  "job-late": ({ job, words, every, lastRunAt }, { settings }) => {
    if (!job || !Number.isFinite(every)) throw new Error("the late job alert names no job");
    const gap = every < 60 ? `${every} minute${every === 1 ? "" : "s"}` : every < 1440 ? `${every / 60} hour${every === 60 ? "" : "s"}` : `${every / 1440} day${every === 1440 ? "" : "s"}`;
    return layout({
      subject: `Job late: ${words ?? job}`,
      greeting: "",
      paragraphs: [
        `The job "${job}" (${words ?? job}) should run every ${gap}, but its last run started at ${lastRunAt ?? "an unknown time"}.`,
        "Open the Jobs page in the control room to see its runs, or press Run now. You get this email once; another comes only if it runs on time and then stops again.",
      ],
      footer: `${settings.platformName} jobs`,
    });
  },

  // From the control room to a press (code plan 19.14, 19.16): press-message, data-export-ready.
  ...pressTemplates({ layout, safeLink, signOff }),
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
