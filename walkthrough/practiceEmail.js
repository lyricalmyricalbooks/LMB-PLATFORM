// The platform's own emails in the walkthrough (sign-in links, waitlist invites, trial and billing notices, support
// answers): written by the real email service (services/email) from its real templates, then dropped in a practice
// inbox instead of reaching an email sender. The walkthrough shows that inbox at /inbox. Nothing leaves the computer.
import { practiceEmailService } from "../services/email/fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { createPracticeInbox } from "../demo/practiceMail.js";

/**
 * `{ sent, list, sendPlatform, inbox }`: records each email as the billing fake does (one per idempotency key, which
 * the tests read through `list`), and sends it through the real email service into `inbox`. A template that can't be
 * written (a kind with no template) is only recorded, and `log` says so.
 */
export function practicePlatformEmail({ env = {}, registry, inbox = createPracticeInbox(), log = () => {}, now = () => new Date() }) {
  const recorded = fakePlatformEmail();
  // The control room's sent log for these (control-room/shopEmails.js and the timeline): one line per email, like the
  // real email service's `emailSent` entries marked `platform`.
  const sentLog = new Map();
  // A made-up mailing address, so the walkthrough's launch emails write the way the real ones will (plan 15.8).
  const real = practiceEmailService({ env: { PLATFORM_MAILING_ADDRESS: "1 Practice Street, Practiceville (practice only, not a real address)", ...env }, registry, deliver: async (body) => ({ id: inbox.send(body).id }) });
  return {
    sent: recorded.sent,
    list: recorded.list,
    inbox,
    async sendPlatform(message) {
      await recorded.sendPlatform(message);
      const key = message?.idempotencyKey ?? `${message?.kind}-${sentLog.size}`;
      try {
        await real.sendPlatform(message);
        if (!sentLog.has(key)) sentLog.set(key, { shopId: message?.shopId ?? null, kind: message?.kind, status: "sent", at: now().toISOString(), platform: true });
      } catch (error) {
        if (!sentLog.has(key)) sentLog.set(key, { shopId: message?.shopId ?? null, kind: message?.kind, status: "failed", error: String(error?.message ?? error), at: now().toISOString(), platform: true });
        log(`practice inbox: couldn't write the ${message?.kind} email (${error?.message ?? error})`);
      }
    },
    /** The emails about one shop, newest first, as the email service's sent log answers. */
    emailLog: {
      listForShop: async (shopId, { limit = 200 } = {}) => [...sentLog.values()].filter((e) => e.shopId === shopId)
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit).map((e) => ({ ...e })),
    },
  };
}
