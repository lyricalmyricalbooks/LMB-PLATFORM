// The platform's own emails to one press (control room, the shop record's Emails section): what was sent, when, and
// whether it went out, with this month's receipts counted next to billing. Read from the email service's sent log
// (`emailSent`, entries marked `platform`); a shop's own emails to its shoppers are never read. Read only.
//
// Clients passed in:
//   registry  getShop(shopId)
//   emailLog  listForShop(shopId, { limit }) -> newest first [{ kind, status, at, error?, via? }]
import { ControlError, adminOf } from "./controlRoom.js";

/** The receipts: a bill paid, and a failed payment that went through on a later try. */
export const RECEIPT_KINDS = Object.freeze(new Set(["bill-paid", "payment-received"]));
export const SHOWN = 30;
const READ = 500;

/** Plain names for the platform's email kinds (services/email/templates.js); any other is its kind in words. */
export const KIND_WORDS = Object.freeze({
  "owner-welcome": "Welcome", "app-added": "App added", "shop-starting": "Shop being made", "setup-ending": "Setup ending soon",
  "platform-fee-changing": "Order fee changing", "terms-changed": "Terms changing", "health-alert": "Shop health alert", "invite": "Team invitation",
  "support-received": "Help request received", "support-new": "Help request (to the platform team)", "support-reply": "Help request answered", "trial-ending": "Trial ending",
  "card-needed": "Card needed", "newsletter-paused": "Newsletter paused", "domain-live": "Web address live", "free-address-live": "Free web address live",
  "quiet-shop": "Quiet shop nudge", "domain-expiring": "Web address expiring", "domain-not-pointing": "Web address not pointing at the shop",
  "own-email-paused": "Own email address paused", "payment-failed": "Plan payment failed", "payment-needs-confirming": "Payment needs confirming",
  "payment-received": "Payment received (receipt)", "bill-paid": "Bill paid (receipt)", "card-changed": "Card changed",
  "shop-reopened": "Shop reopened", "cancel-undone": "Cancelling undone", "subscription-cancelled": "Plan cancelled",
  "subscription-ended": "Plan ended", "payments-past-due": "Stripe needs details", "plan-changed": "Plan changed",
  "app-closing-soon": "App closing soon", "app-closed": "App closed", "app-download-ending": "Download ending",
  "app-records-deleted": "App records deleted", "card-expiring": "Card expiring", "bill-heads-up": "Bill may pass their amount", "payments-moved": "Card payments moved",
  "payments-switched": "Card switch done", "payout-schedule-changed": "Payout timing changed", "chitchats-waiting": "Chit Chats needs a look", "sign-in-link": "Sign-in link",
  "sign-in-code": "Sign-in code", "waitlist-invite": "Waitlist invitation", "new-device": "New sign-in", "account-deleted": "Account deleted",
  "recovery-asked": "Account move asked", "recovery-received": "Account move request received", "recovery-stopped": "Account move stopped",
  "recovery-approved": "Account move approved", "recovery-denied": "Account move refused", "recovery-applied": "Account moved",
  "trial-tip": "Trial tip", "first-sale-tips": "First-sale tips", "shop-checkup": "Monthly check-up", "shop-closed": "Shop closed", "shop-deletion-warning": "Shop deletion warning",
  "shop-deleted": "Shop deleted", "support-access-request": "Support asks to make changes", "press-message": "Message from the platform",
  "data-export-ready": "Data ready to download",
});
export const kindWords = (kind) => KIND_WORDS[kind] ?? (String(kind ?? "email").replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase()));

const monthStart = (now) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

/** The summary for a press's record from its sent-log entries (newest first). */
export function emailsSummary(entries, now) {
  const since = monthStart(now);
  const thisMonth = entries.filter((e) => typeof e.at === "string" && e.at >= since);
  return {
    since,
    receiptsThisMonth: thisMonth.filter((e) => RECEIPT_KINDS.has(e.kind) && e.status === "sent").length,
    failedThisMonth: thisMonth.filter((e) => e.status === "failed").length,
    sentThisMonth: thisMonth.filter((e) => e.status === "sent").length,
    lastReceiptAt: entries.find((e) => RECEIPT_KINDS.has(e.kind) && e.status === "sent")?.at ?? null,
    emails: entries.slice(0, SHOWN).map((e) => ({
      kind: e.kind ?? null, words: kindWords(e.kind), at: e.at ?? null, sent: e.status === "sent",
      ...(e.subject ? { subject: String(e.subject) } : {}), ...(typeof e.text === "string" ? { text: e.text } : {}), ...(e.copy === "withheld" ? { withheld: true } : {}),
      ...(e.status === "failed" && e.error ? { error: String(e.error).slice(0, 200) } : {}),
    })),
    more: Math.max(0, entries.length - SHOWN),
  };
}

export function createShopEmails({ admins, registry, emailLog, now = () => new Date() }) {
  return {
    async forShop(claims, { shopId } = {}) {
      adminOf(claims, admins, now().getTime());
      const row = typeof shopId === "string" && shopId ? await registry.getShop(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop with that id.");
      if (!emailLog?.listForShop) return { shopId, emails: null, words: "The control room can't read the email log here." };
      try {
        const entries = (await emailLog.listForShop(shopId, { limit: READ })).filter((e) => e.platform !== false);
        return { shopId, ...emailsSummary(entries, now()) };
      } catch (failure) {
        throw new ControlError(502, `Couldn't read the email log: ${failure.message}`);
      }
    },
  };
}

//   POST /api/control/shop-emails  { shopId }: the platform's emails to one press, with this month's receipts
export function shopEmailsRoutes(desk) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return { "POST /api/control/shop-emails": (claims, request) => desk.forShop(claims, body(request)) };
}
