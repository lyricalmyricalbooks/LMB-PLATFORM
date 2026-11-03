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
//
// The press's own domain (ownDomain.js, plan 6.18): once a shop's own address passes the sending-records check, its
// emails come from orders@<their domain> instead (registry `emailSender.state` "on"); replies still go to the press.
// The press's own Gmail (plan 6.20, switched on by Julian): with `gmailSend` passed in and the registry's
// `gmailSender.on`, the shop's emails go from the press's Gmail through the Google link; if Gmail refuses one, it goes
// the usual way instead, so nothing is lost.
import { platformSettings } from "../settings.js";
import { resendClient } from "./resend.js";
import { COMMERCIAL_KINDS, TEMPLATES, customProblems, withIdentity } from "./templates.js";
import { TEMPLATES_FR, bilingual, shopMailLanguage } from "./templatesFr.js";
import { shopSenderAddress, streamOf, streamSettings } from "./streams.js";
import { NewsletterPausedError } from "./reputation.js";
import { ownDomainSender } from "./ownDomain.js";

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
/**
 * A platform template's words in `language` (templatesFr.js mailLanguage): its French twin, French then English, or
 * English (a kind with no twin). What sendPlatform sends, and what the control room shows as a shop's sample email.
 */
export function platformWords(kind, data, context, language) {
  const french = ["fr", "fr+en"].includes(language) ? TEMPLATES_FR[kind] : null;
  const english = () => TEMPLATES[kind](data, context);
  if (!french) return english();
  return language === "fr" ? french(data, context) : bilingual(french(data, context), english());
}

export function createEmailService({ env = process.env, fetch = globalThis.fetch, registry, sentLog, reputation = null, gmailSend = null, now = () => new Date(), sleep } = {}) {
  if (!registry?.getShop) throw new Error("The email service needs the shop registry");
  if (!sentLog?.get || !sentLog?.put || !sentLog?.findSent) throw new Error("The email service needs its sent log");
  const settings = platformSettings(env);
  const streams = streamSettings(env, settings);
  let client;
  const resend = () => (client ??= resendClient({ apiKey: env.RESEND_API_KEY, fetch, ...(sleep ? { sleep } : {}) }));

  /**
   * The language of the platform's emails for a shop (templatesFr.js mailLanguage): its billing row's choice and
   * province (mirrored on the registry), else the language it signed up in. A registry that can't be read means English.
   */
  const shopLanguage = shopMailLanguage;

  const inLanguage = platformWords;

  const compose = (message, context, language = "en") => {
    // A shop's own email (through the shop door) always carries its own words, even if its kind shares a template's name.
    const template = message.custom ? null : TEMPLATES[message.kind];
    if (template) return inLanguage(message.kind, message.data ?? message, context, language);
    const problems = customProblems(message);
    if (problems.length) throw new Error(`The email can't be sent: ${problems.join("; ")}`);
    return { subject: message.subject.trim(), text: message.text, html: message.html };
  };

  const deliver = async ({ shopId, kind, stream = "orders", to, idempotencyKey, from, replyTo, parts, platform = false }) => {
    const done = await sentLog.get(idempotencyKey);
    if (done?.status === "sent") return { id: done.id, alreadySent: true };
    const at = now().toISOString();
    try {
      const { id } = await resend().send({
        from, to, replyTo, idempotencyKey, ...parts,
        tags: [tag("kind", kind), ...(shopId ? [tag("shop", shopId)] : []), tag("stream", stream)],
      });
      await sentLog.put(idempotencyKey, { shopId, kind, stream, to, id, status: "sent", at, ...(platform ? { platform: true } : {}) });
      return { id, alreadySent: false };
    } catch (error) {
      await sentLog.put(idempotencyKey, { shopId, kind, stream, to, status: "failed", error: error.message, retryable: error.retryable !== false, at, ...(platform ? { platform: true } : {}) });
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
      // The platform's own words (the welcome email, say) in the shop's language; the shop's own words as written.
      const parts = compose(message, { settings, pressName: cleanName(shop.pressName) || shopId }, shopLanguage(shop));
      if (gmailSend && shop.gmailSender?.on === true) {
        const done = await sentLog.get(message.idempotencyKey);
        if (done?.status === "sent") return { id: done.id, alreadySent: true };
        try {
          const { id } = await gmailSend(shopId, { to: message.to.trim(), replyTo, ...parts });
          await sentLog.put(message.idempotencyKey, { shopId, kind: message.kind, stream, to: message.to.trim(), id, via: "gmail", status: "sent", at: now().toISOString() });
          return { id, alreadySent: false };
        } catch (error) {
          console.error(`Gmail sending for ${shopId} failed; sending the usual way:`, error?.message || error);
        }
      }
      // The press's own domain once its records check out (newsletters too: the reputation pause still applies).
      const address = ownDomainSender(shop) ?? shopSenderAddress({ shopId, stream, streams, settings });
      return deliver({
        shopId, kind: message.kind, stream, to: message.to.trim(), idempotencyKey: message.idempotencyKey,
        from: fromLine(shop.pressName || shopId, address), replyTo, parts,
      });
    },

    /**
     * Sends one of the platform's own emails (billing, sign-up, invites), signed with the product's name. `language`
     * (templatesFr.js mailLanguage): "fr" sends a kind's French twin, "fr+en" the French then the English; a kind
     * with no French twin goes in English. With no `language`, a message for a shop takes the shop's own.
     */
    async sendPlatform(message) {
      checkCommon(message);
      if (!TEMPLATES[message.kind]) throw new Error(`There is no platform email called ${message.kind}`);
      if (COMMERCIAL_KINDS.has(message.kind) && !settings.mailingAddress) {
        throw new Error(`PLATFORM_MAILING_ADDRESS is needed before ${settings.platformName} sends a ${message.kind} email: the law asks for a mailing address in commercial emails`);
      }
      const words = { settings, pressName: message.data?.pressName ?? "" };
      // No language given: the shop's own (its billing row's language and province, mirrored on the registry).
      let language = message.language;
      if (language === undefined && message.shopId && TEMPLATES_FR[message.kind]) language = shopLanguage(await registry.getShop(message.shopId).catch(() => null));
      const body = inLanguage(message.kind, message.data ?? {}, words, language);
      const parts = withIdentity(body, settings);
      return deliver({
        shopId: message.shopId ?? null, kind: message.kind, to: message.to.trim(), idempotencyKey: message.idempotencyKey,
        from: fromLine(settings.platformName, settings.senderEmail), replyTo: settings.supportEmail, parts, platform: true,
      });
    },
  };
}

/**
 * The email service's key as the hosted server gets it (server/deploy.js): the environment name this service reads and
 * the Secret Manager secret Cloud Run fills it from. The name stays in this folder.
 */
export const EMAIL_SECRETS = Object.freeze([Object.freeze({ env: "RESEND_API_KEY", secret: "resend-api-key", api: true, jobs: true })]);
