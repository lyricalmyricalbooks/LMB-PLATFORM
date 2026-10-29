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
export function practicePlatformEmail({ env = {}, registry, inbox = createPracticeInbox(), log = () => {} }) {
  const recorded = fakePlatformEmail();
  const real = practiceEmailService({ env, registry, deliver: async (body) => ({ id: inbox.send(body).id }) });
  return {
    sent: recorded.sent,
    list: recorded.list,
    inbox,
    async sendPlatform(message) {
      await recorded.sendPlatform(message);
      try {
        await real.sendPlatform(message);
      } catch (error) {
        log(`practice inbox: couldn't write the ${message?.kind} email (${error?.message ?? error})`);
      }
    },
  };
}
