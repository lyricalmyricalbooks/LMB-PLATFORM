// "Start from our wording" for an empty store policy (Settings › General › Store policies, plan 7.5).
// Pure: the owner's saved shop details go in, plain policy text comes out. It is a starting point for the owner (and
// their lawyer) to edit, never legal advice, and it only ever fills a policy that is still empty.
import { getCopy } from "../features/site/storeCopy";
import type { PolicyKey } from "../features/site/policyPages";

export const STARTER_POLICY_NOTE = "A starting point, not legal advice.";

export type StarterFacts = { name: string; address: string; email: string; returnDays: number };

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The shop details the starter wording uses, read from the settings document the General tab edits. */
export function starterFacts(settings: any): StarterFacts {
  const loc = settings?.location || {};
  const region = [clean(loc.state), clean(loc.zip)].filter(Boolean).join(" ");
  const address = [clean(loc.street), clean(loc.city), region, clean(loc.country)].filter(Boolean).join(", ");
  // The returns window is the one book pages already tell search engines (Text & labels › seoReturnDays): 0 = none.
  const days = Math.floor(Number(getCopy(settings?.design, "seoReturnDays")));
  return { name: clean(settings?.info?.name), address, email: clean(settings?.info?.email), returnDays: Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 0 };
}

const contact = (f: StarterFacts) => (f.email ? `write to us at ${f.email}` : "contact us");
const sentences = (...parts: Array<string | false>) => parts.filter(Boolean).join(" ");

/** Starter text for one policy, with the shop's own name, address and returns window filled in. */
export function starterPolicy(key: PolicyKey, f: StarterFacts): string {
  const we = f.name || "We";
  switch (key) {
    case "shipping":
      return [
        sentences(f.address && `${f.name || "We"} ship${f.name ? "s" : ""} from ${f.address}.`,
          "We process orders within 1–3 business days of payment. Carrier transit time is additional and shown at checkout for your destination and selected service."),
        "You will receive an email with tracking once your order ships. Digital titles are available to download immediately after payment.",
        `If your parcel is late or goes missing, ${contact(f)} and we will help trace it.`,
      ].join("\n\n");
    case "returns":
      return [
        sentences(f.name && `This is how returns work for orders from ${f.name}.`, f.returnDays
          ? `You can send a book back within ${f.returnDays} days of delivery for a refund, as long as it is in the condition you received it. Before you send it, ${contact(f)} so we can tell you where to send it.`
          : "Once an order has shipped it can't be returned. Until it ships, you can ask to cancel it from the order tracking page (the link is in your order confirmation email)."),
        `If your book arrives damaged or incorrect, ${contact(f)} within 30 days of delivery and we will replace it or refund you.`,
        "Digital downloads are non-refundable once accessed, unless the file is faulty.",
      ].join("\n\n");
    case "privacy":
      return [
        sentences(`${we} ${f.address ? `(${f.address}) ` : ""}${f.name ? "is" : "are"} responsible for the personal information you share with this shop.`,
          "We collect only what we need to fulfil your order and, if you opt in, send you our newsletter: your name, email, shipping address and order details."),
        "Payments are processed by Stripe; we never see or store your card number. We do not sell your personal information.",
        `To see, correct or delete the information we hold about you, ${contact(f)}.`,
      ].join("\n\n");
    case "terms":
      return [
        sentences(`These terms apply to every order placed with ${f.name || "this shop"}.`,
          "By placing an order you agree that the details you provide are accurate and that you are authorised to use the payment method."),
        "Prices are shown at checkout in the currency you pay in. We may cancel and refund an order if a title is unavailable or a pricing error occurred.",
        sentences(`Questions about an order? ${contact(f).replace(/^./, (c) => c.toUpperCase())}.`, f.address && `Our address is ${f.address}.`),
      ].join("\n\n");
  }
}

/** The starter only fills an empty policy: saved words (anything but blank space) are always kept as they are. */
export const withStarter = (current: string | undefined, key: PolicyKey, f: StarterFacts) =>
  clean(current) ? (current as string) : starterPolicy(key, f);
