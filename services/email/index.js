// The platform's email service (code plan 2.3). It sends two kinds of email through Resend, from the platform's one
// sending address (settings.senderEmail, notifications@ the platform domain):
//
// - For a shop (`send`): the press's name on the From line and the press's own address as reply-to, so a customer's
//   reply reaches the press, never the platform. Used by the shop maker (the owner's welcome) and by shops that have not
//   connected their own Gmail: a shop with Gmail connected sends its own receipts and notices from its own address and
//   never comes here (apps/shop/functions/email, platform mode).
// - For the platform itself (`sendPlatform`): billing, sign-up and invites, signed with the product's name, replies to
//   settings.supportEmail.
//
// The Resend key is read only from this service's environment (RESEND_API_KEY). It never comes from a shop, a request
// or a file in the repository, and no shop project ever holds it.
//
// Every email has an idempotency key. The sent log remembers each one, so a retry (a setup step re-run, a webhook sent
// twice) never sends a second copy, even after Resend's own 24-hour memory of the key has passed.
//
// Clients passed in:
//   registry   getShop(shopId) -> { pressName, ownerEmail, replyTo?, status } | null   (setup/fakes.js has the shape)
//   sentLog    get(key) -> entry | null; put(key, entry); findSent(shopId, kind) -> entry | null;
//              countSince(shopId, isoTime) -> number of sent emails (the shop door's daily limit, http.js)
//   fetch      the network (tests pass a fake)
//   reputation optional: isPaused(shopId) (reputation.js). A paused shop's newsletter-stream emails are refused;
//              its orders-stream emails (receipts, notices) always go.
//
// Streams (streams.js, plan 8.3): every email is tagged with its stream, "orders" or "newsletter", and with
// SHOP_SENDER_ADDRESSES on, a shop's email comes from its own address on that stream's subdomain.
import { platformSettings } from "../settings.js";
import { resendClient } from "./resend.js";
import { TEMPLATES, customProblems } from "./templates.js";
import { shopSenderAddress, streamOf, streamSettings } from "./streams.js";
import { NewsletterPausedError } from "./reputation.js";

const EMAIL = /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+$/;
const KIND = /^[a-z][a-z0-9-]{1,40}$/;

/** A display name safe inside "Name" <address>: no quotes, angle brackets, backslashes or line breaks. */
export function cleanName(name) {
  return String(name ?? "").replace(/[\r\n"<>\\]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** The From line: the press's (or the product's) name on the platform's address. */
export const fromLine = (name, address) => `"${cleanName(name) || "Shop"}" <${address}>`;

/** Resend tags allow letters, digits, underscores and dashes only. */
const tag = (name, value) => ({ name, value: String(value).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256) });

/**
 * The email service. `env` holds RESEND_API_KEY and the platform settings (services/settings.js); nothing is sent
 * without the key.
 */
export function createEmailService({ env = process.env, fetch = globalThis.fetch, registry, sentLog, reputation = null, now = () => new Date(), sleep } = {}) {
  if (!registry?.getShop) throw new Error("The email service needs the shop registry");
  if (!sentLog?.get || !sentLog?.put || !sentLog?.findSent) throw new Error("The email service needs its sent log");
  const settings = platformSettings(env);
  const streams = streamSettings(env, settings);
  let client;
  const resend = () => (client ??= resendClient({ apiKey: env.RESEND_API_KEY, fetch, ...(sleep ? { sleep } : {}) }));

  const compose = (message, context) => {
    // A shop's own email (through the shop door) always carries its own words, even if its kind shares a template's name.
    const template = message.custom ? null : TEMPLATES[message.kind];
    if (template) return template(message.data ?? message, context);
    const problems = customProblems(message);
    if (problems.length) throw new Error(`The email can't be sent: ${problems.join("; ")}`);
    return { subject: message.subject.trim(), text: message.text, html: message.html };
  };

  const deliver = async ({ shopId, kind, stream = "orders", to, idempotencyKey, from, replyTo, parts }) => {
    const done = await sentLog.get(idempotencyKey);
    if (done?.status === "sent") return { id: done.id, alreadySent: true };
    const at = now().toISOString();
    try {
      const { id } = await resend().send({
        from, to, replyTo, idempotencyKey, ...parts,
        tags: [tag("kind", kind), ...(shopId ? [tag("shop", shopId)] : []), tag("stream", stream)],
      });
      await sentLog.put(idempotencyKey, { shopId, kind, stream, to, id, status: "sent", at });
      return { id, alreadySent: false };
    } catch (error) {
      await sentLog.put(idempotencyKey, { shopId, kind, stream, to, status: "failed", error: error.message, retryable: error.retryable !== false, at });
      throw error;
    }
  };

  const checkCommon = ({ kind, to, idempotencyKey }) => {
    if (!KIND.test(kind ?? "")) throw new Error("The email has no kind");
    if (typeof to !== "string" || !EMAIL.test(to.trim())) throw new Error("The email must go to one email address");
    if (typeof idempotencyKey !== "string" || !idempotencyKey || idempotencyKey.length > 256) throw new Error("The email needs an idempotency key");
  };

  return {
    settings,
    streams,

    /** Has this shop's email of this kind been sent? (setup step 14 checks before it sends) */
    async wasSent(shopId, kind) {
      return Boolean(await sentLog.findSent(shopId, kind));
    },

    /**
     * Sends one email for a shop: `message` is { kind, to, idempotencyKey } plus the template's data (`data`, or the
     * fields themselves, as setup step 14 sends them), or { subject, text?, html? } for a kind with no template.
     * The press's name and reply-to come from the registry, never from the message, so one shop can't sign as another.
     */
    async send(shopId, message) {
      checkCommon(message);
      const shop = await registry.getShop(shopId);
      if (!shop) throw new Error(`The registry has no shop ${shopId}`);
      if (shop.status === "abandoned") throw new Error(`${shopId} is marked abandoned; its email is off`);
      const stream = streamOf(message.kind);
      if (stream === "newsletter" && reputation && (await reputation.isPaused(shopId))) throw new NewsletterPausedError(shopId);
      const replyTo = (shop.replyTo || shop.ownerEmail || "").trim().toLowerCase();
      if (!EMAIL.test(replyTo)) throw new Error(`${shopId} has no reply-to address in the registry`);
      const parts = compose(message, { settings, pressName: cleanName(shop.pressName) || shopId });
      return deliver({
        shopId, kind: message.kind, stream, to: message.to.trim(), idempotencyKey: message.idempotencyKey,
        from: fromLine(shop.pressName || shopId, shopSenderAddress({ shopId, stream, streams, settings })), replyTo, parts,
      });
    },

    /** Sends one of the platform's own emails (billing, sign-up, invites), signed with the product's name. */
    async sendPlatform(message) {
      checkCommon(message);
      if (!TEMPLATES[message.kind]) throw new Error(`There is no platform email called ${message.kind}`);
      const parts = TEMPLATES[message.kind](message.data ?? {}, { settings, pressName: message.data?.pressName ?? "" });
      return deliver({
        shopId: message.shopId ?? null, kind: message.kind, to: message.to.trim(), idempotencyKey: message.idempotencyKey,
        from: fromLine(settings.platformName, settings.senderEmail), replyTo: settings.supportEmail, parts,
      });
    },
  };
}
