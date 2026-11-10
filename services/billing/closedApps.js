// After a plan drops an app (billing.js changePlan / closeDroppedApps), 3 November 2026: the rules for what follows,
// kept apart from billing.js so they can be read (and tested) on their own.
//
// - Why: when a press drops an app, the plan page asks why (optional, like cancelling's question, leaving.js). The answer
//   is kept on the drop's record (`appDrops`), and the control room counts them (control-room/appsClosing.js).
// - The keep link: the reminder a week before the app closes carries a one-time link that keeps it without signing in.
//   Only its SHA-256 is stored (on the billing row, never copied to the registry or the shop). It works once, for this
//   closing only, and only until the app closes; all it can do is keep the closing app (billing.keepClosingAppsByLink).
// - After closing: the press can download everything for 90 days (DOWNLOAD_DAYS). Three days before the end, one last
//   email; once the 90 days are over, and never sooner than three days after that email, the app's records are deleted
//   through the injected `deleteApp` client. A late email pushes the deletion back, so the press always gets its notice.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PLAN_APPS } from "./plans.js";

const DAY = 86_400_000;
/** How long before a closed app's download ends its last email goes out (and the least time between that email and deletion). */
export const DOWNLOAD_ENDING_DAYS = 3;
/** After a closed app's records are deleted, the note saying so is tried for this many days. */
export const TELL_DAYS = 7;

/** The answers to "why are you dropping it?", in the press's own words. */
export const DROP_REASONS = Object.freeze({
  "not-using": "We weren't using it",
  price: "To pay less",
  "other-tool": "We use something else for it",
  "too-hard": "It was hard to use",
  other: "Something else",
});

/** The press's answer, checked: null when none was given; a reason off the list is refused in plain words. */
export function dropReason(reason, fail) {
  if (reason === undefined || reason === null || reason === "") return null;
  if (typeof reason !== "string" || !Object.hasOwn(DROP_REASONS, reason)) throw fail("Choose one of the reasons on the list, or leave the question blank.");
  return reason;
}

const hashOf = (token) => createHash("sha256").update(String(token)).digest("hex");

/** A new keep link for this closing: the token goes in the email, `stored` on the billing row. */
export function newKeepLink({ closesAt, now }) {
  const token = randomBytes(24).toString("base64url");
  return { token, stored: { hash: hashOf(token), for: closesAt, expiresAt: closesAt, madeAt: new Date(now).toISOString() } };
}

/**
 * Why a keep link can't be used, in plain words, or null when it can: it must match the stored one, be for the closing
 * still waiting, be unused and the app not closed yet.
 */
export function keepLinkProblem(row, token, now) {
  const link = row?.keepLink;
  const closing = row?.appsClosing;
  const given = Buffer.from(hashOf(token));
  const known = link?.hash ? Buffer.from(link.hash) : null;
  if (typeof token !== "string" || !token || !known || known.length !== given.length || !timingSafeEqual(known, given)) {
    return { status: 404, message: "This link doesn't work. Sign in and open Plan & billing to keep it." };
  }
  if (link.usedAt) return { status: 410, message: "This link was already used. Your plan is as you left it on Plan & billing." };
  if (!closing?.apps?.length || closing.at !== link.for) return { status: 410, message: "Nothing on your plan is closing any more, so there's nothing to keep." };
  if (now >= Date.parse(link.expiresAt)) return { status: 410, message: "This link ran out when the app closed. You can still add it back to your plan on Plan & billing." };
  return null;
}

/**
 * What a closed app's download holds, file by file in a few words, so the press knows what it gets before the records
 * go. Keyed like services/export/export.js SHOP_COLLECTIONS and STOCKROOM_PARTS (plus its books);
 * a test there keeps the two lists the same.
 */
export const DOWNLOAD_HOLDS = Object.freeze({
  shop: Object.freeze([
    ["books", "your books and products"], ["authors", "authors and artists"], ["orders", "orders"], ["customers", "customers"],
    ["discounts", "discount codes"], ["giftCards", "gift cards"], ["reviews", "reviews"], ["pages", "your own pages"],
    ["newsletter", "newsletter sign-ups"], ["stockists", "stockists"], ["shipping-profiles", "shipping prices"],
  ]),
  stockroom: Object.freeze([
    ["books", "the books in your stockroom"], ["ledger", "the stock ledger"], ["hist", "sales and stock history"], ["expenses", "expenses"],
    ["stores", "stores and consignment"], ["artistTransfers", "money moved to artists"], ["artistPayouts", "artist payouts"], ["artistReceivables", "what artists are owed"],
  ]),
});

const listed = (words) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : words.join(""));

/**
 * "a spreadsheet each of …" for the closed apps given (in plan order), for the closing emails and the account page.
 * The shop's settings are one file of their own (settings.json, not a spreadsheet), so they come after.
 */
export function downloadHolds(apps) {
  const words = ["shop", "stockroom"].filter((app) => apps.includes(app)).flatMap((app) => DOWNLOAD_HOLDS[app].map(([, w]) => w));
  if (!words.length) return "";
  return `a spreadsheet each of ${listed(words)}${apps.includes("shop") ? ", plus your shop's settings" : ""}`;
}

/** The platform's emails about a closing app: a bounce on one of them means the press may never hear it is closing. */
export const CLOSING_EMAILS = Object.freeze(["app-closing-soon", "app-closed", "app-download-ending", "app-records-deleted"]);

/**
 * For when bounces are read (Gmail has no delivery events yet, services/email/reputation.js): a closing email that bounced for good is marked on the
 * shop's registry row as `closingEmailBounce`, for the control room's Apps closing list. Other emails are left alone.
 */
export const closingBounceRecorder = ({ registry }) => async ({ shopId, kind, at }) => {
  if (!shopId || !CLOSING_EMAILS.includes(kind) || !(await registry.getShop(shopId))) return false;
  await registry.updateShop(shopId, { closingEmailBounce: { kind, at } });
  return true;
};

/**
 * What each closed app needs now: "warn" (the last email before the download ends), "delete" (its records go) or
 * "tell" (the note that they went). A closed app back on the plan, told, or still in its 90 days needs nothing.
 */
export function closedAppSteps(row, now) {
  const steps = [];
  for (const [app, closed] of Object.entries(row?.closedApps ?? {})) {
    // Deleted: one short note to the press that it's done ("tell"), tried for a week if the email fails.
    if (closed?.deletedAt) {
      if (!closed.toldAt && now - Date.parse(closed.deletedAt) < TELL_DAYS * DAY) steps.push({ app, step: "tell" });
      continue;
    }
    if (!closed?.downloadUntil || PLAN_APPS[row.plan]?.[app]) continue;
    const until = Date.parse(closed.downloadUntil);
    if (!closed.warnedAt) {
      if (until - now <= DOWNLOAD_ENDING_DAYS * DAY) steps.push({ app, step: "warn" });
      continue;
    }
    if (now >= Math.max(until, Date.parse(closed.warnedAt) + DOWNLOAD_ENDING_DAYS * DAY)) steps.push({ app, step: "delete" });
  }
  return steps;
}
