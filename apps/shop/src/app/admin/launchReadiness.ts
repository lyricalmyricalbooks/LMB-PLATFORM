import { summarizeShipping } from "./shippingHealth";
import { paymentHealth } from "./paymentHealth";
import { isRealPaidOrder } from "./overview/overviewInsights";
import { practiced } from "./firstWeek";
import { taxCollectionOn, uncoveredTaxRegions } from "../features/site/taxRate";
import { platformCardsProvider } from "../../lib/shopProfile";
import { accountConnected, CONTINUE_WITH_STRIPE, needsLine, paymentsReady, providerName, type PlatformPaymentsAnswer } from "./platformPayments";

/** Admin-only "Ready to sell?" checks. Read-only guidance; nothing here changes data. */
export type ReadinessStatus = "ok" | "warn" | "block";
export type ReadinessItem = { id: string; label: string; detail: string; status: ReadinessStatus; tab: string; action: string; href?: string };

export type ReadinessInput = {
  settings: any;
  books: any[];
  shippingProfiles: any[];
  emailLog: any[];
  orders: any[];
  /**
   * A shop whose cards go through Colophon (plan 2.10): its provider (from the shop profile by default) and what the
   * platform says about the press's card account (null: couldn't ask; undefined: not asked yet).
   */
  platformCards?: "stripe" | "square" | null;
  platformAccount?: PlatformPaymentsAnswer | null;
  /**
   * The signed-in person's own sign-in (Settings › Security): two-step on, and how many backup codes are left (null when
   * they couldn't be counted). Left out, or null, when it couldn't be read: no row then.
   */
  signIn?: { twoStep: boolean; codesLeft: number | null } | null;
};

const REQUIRED_POLICIES: Array<[string, string]> = [["shipping", "Shipping"], ["returns", "Returns"], ["privacy", "Privacy"], ["terms", "Terms"]];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const hasText = (v: unknown) => typeof v === "string" && v.trim().length > 0;

export function launchReadiness({ settings, books, shippingProfiles, emailLog, orders, platformCards = platformCardsProvider(), platformAccount, signIn }: ReadinessInput): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const payments = settings?.payments || {};
  // The shop's own Stripe keys count only when the platform doesn't take its cards (a Square shop never reads them).
  const stripe = platformCards ? {} : payments.stripe || {};

  // Cards through Colophon: no keys to check, only whether the press's own account is connected and can take cards.
  if (platformCards) {
    const name = providerName(platformCards);
    const connect = platformCards === "square" ? "Connect Square" : CONTINUE_WITH_STRIPE;
    // What Stripe still needs, with its deadline (plan 7.9); null for Square or when nothing is.
    const needs = platformAccount ? needsLine({ ...platformAccount, provider: platformCards }) : null;
    const finish = platformCards === "square" ? "Open your Square dashboard and finish what it asks for." : `Press ${CONTINUE_WITH_STRIPE} in Payments.`;
    if (platformAccount === undefined || platformAccount === null) {
      items.push({ id: "card-account", label: `Your ${name} account couldn't be checked`, detail: `Open Payments to see whether your ${name} account is connected.`, status: "warn", tab: "payments", action: "Open Payments" });
    } else if (!accountConnected(platformAccount)) {
      items.push({ id: "card-account", label: `${name} isn't connected yet`, detail: `Shoppers can't pay by card until you connect your own ${name} account.${needs ? ` ${needs}` : ""} Press ${connect} in Payments.`, status: "block", tab: "payments", action: connect });
    } else if (platformAccount.pastDue === true) {
      items.push({ id: "card-account", label: `${name} has paused your payments`, detail: `${needs ?? `${name} needs a few more details, and the deadline has passed.`} ${finish}`, status: "block", tab: "payments", action: connect });
    } else if (platformAccount.chargesEnabled !== true) {
      items.push({ id: "card-account", label: `${name} can't take cards yet`, detail: `${needs ?? `Your ${name} account is connected but still needs details from you.`} ${finish}`, status: "block", tab: "payments", action: connect });
    } else if (!paymentsReady({ ...platformAccount, provider: platformCards })) {
      items.push({ id: "card-account", label: `${name} takes cards but isn't paying out yet`, detail: `${needs ?? `${name} needs a few more details before it pays your sales into your bank.`} ${finish}`, status: "warn", tab: "payments", action: connect });
    } else {
      // Cards and payouts work: the step ticks itself. Anything Stripe will need later is still said, with its date.
      items.push({ id: "card-account", label: `${name} is connected and taking cards`, detail: `Payouts go to your own ${name} account.${needs ? ` ${needs}` : ""}`, status: "ok", tab: "payments", action: "Open Payments" });
    }
  }

  // Payments
  // Secret-key findings get their own row below.
  const payIssues = paymentHealth(payments, Boolean(platformCards)).filter(i => !["client-secret", "stripe-test-secret", "stripe-live-secret"].includes(i.id));
  const blocking = payIssues.filter(i => i.severity === "blocking");
  if (blocking.length) items.push({ id: "payments", label: blocking[0].label, detail: blocking[0].detail, status: "block", tab: "payments", action: "Open Payments" });
  else if (payments.testMode) items.push({ id: "payments", label: "Payments are in sandbox mode", detail: "Test payments collect no money. Switch to live payments before launch.", status: "warn", tab: "payments", action: "Open Payments" });
  else if (platformCards) items.push({ id: "payments", label: "Payments are live", detail: "Shoppers pay real money. Place one small order, then refund it, to see it work end to end.", status: "ok", tab: "payments", action: "Open Payments" });
  else items.push({ id: "payments", label: "Live payment configuration is present", detail: "The publishable key is valid. Confirm the server connection and complete a checkout before relying on it.", status: "ok", tab: "payments", action: "Open Payments" });

  if (stripe.connected) {
    const secretStored = payments.testMode ? (stripe.testSecretKeyStored || stripe.testSecretKey) : (stripe.secretKeyStored || stripe.secretKey);
    items.push(secretStored
      ? { id: "stripe-secret", label: "Stripe secret key is stored privately", detail: "Kept in the admin-only store.", status: "ok", tab: "payments", action: "Open Payments" } // Stripe shops only (own keys)
      : payments.testMode
        // Test mode has no fallback key: sandbox checkout cannot work without one.
        ? { id: "stripe-secret", label: "Stripe test secret key is missing", detail: "Sandbox checkout fails without it. Add your sk_test_… key in Payments.", status: "block", tab: "payments", action: "Open Payments" } // Stripe shops only (own keys)
        : { id: "stripe-secret", label: "No Stripe secret key entered here", detail: "Fine only if the STRIPE_SECRET_KEY Functions secret is set — use Payments › Test connection to confirm.", status: "warn", tab: "payments", action: "Open Payments" }); // Stripe shops only (own keys)
  }

  // Catalogue
  const live = (books || []).filter(b => (b.status || "published") === "published");
  if (!live.length) items.push({ id: "books", label: "No published books", detail: "Shoppers have nothing to buy yet.", status: "block", tab: "catalog", action: "Open Books" });
  else {
    const incomplete = live.filter(b => !(Number(b.retailPrice) > 0) || !(b.photos?.length || b.coverImage || b.image) || !hasText(b.description));
    items.push(incomplete.length
      ? { id: "books", label: `${plural(incomplete.length, "published book")} missing a price, photo or description`, detail: incomplete.slice(0, 3).map(b => b.title || "Untitled").join(", ") + (incomplete.length > 3 ? "…" : ""), status: "warn", tab: "catalog", action: "Open Books" }
      : { id: "books", label: `${plural(live.length, "published book")} ready`, detail: "Every published book has a price, photo and description.", status: "ok", tab: "catalog", action: "Open Books" });
  }

  // Reuse the same diagnostics as Shipping, rather than treating a profile count as proof.
  const shipping = summarizeShipping(shippingProfiles || [], live);
  const shipIssue = shipping.issues.find(i => i.severity === "blocking") || shipping.issues[0];
  items.push(shipIssue
    ? { id: "shipping", label: shipIssue.label, detail: `${shipIssue.detail}${shipping.issues.length > 1 ? ` ${shipping.issues.length - 1} additional shipping checks need attention.` : ""}`, status: shipIssue.severity === "blocking" ? "block" : "warn", tab: "shipping", action: "Open Shipping" }
    : { id: "shipping", label: "Shipping configuration passes checks", detail: `${plural(shipping.zoneCount, "zone")}, ${plural(shipping.rateCount, "rate")}. Live carrier quotes and label purchases still need a walkthrough.`, status: "ok", tab: "shipping", action: "Open Shipping" });

  const metadata = live.filter(b => !hasText(b.subtitle) || (!hasText(b.edition) && !(b.variants || []).some((v: any) => hasText(v.name))));
  items.push({ id: "catalog-metadata", label: metadata.length ? `${plural(metadata.length, "book")} need contributor or edition review` : "Contributor and edition metadata present", detail: metadata.length ? metadata.slice(0, 3).map(b => b.title || "Untitled").join(", ") + ". Review display contributors and edition details; these checks never change books." : "Published books identify their contributors and edition.", status: metadata.length ? "warn" : "ok", tab: "catalog", action: "Review Books" });
  const testTitles = live.filter(b => /^(test|sample|demo|placeholder|untitled)(?:\b|[_-])/i.test(String(b.title || "").trim()));
  items.push({ id: "catalog-test-content", label: testTitles.length ? `${plural(testTitles.length, "published title")} may be test content` : "No obvious test titles found", detail: testTitles.length ? testTitles.slice(0, 3).map(b => b.title).join(", ") + ". Review before launch; legitimate titles can match this check." : "This title check does not replace an owner review of the public catalog.", status: testTitles.length ? "warn" : "ok", tab: "catalog", action: "Review Books" });

  // Sales tax (charged server-side from Settings › Taxes rates)
  const collecting = taxCollectionOn(settings);
  const rates = collecting ? (settings?.taxes?.rates || []).filter((r: any) => Number(r?.rate) > 0) : [];
  items.push(!collecting
    ? { id: "tax", label: "Sales tax collection is switched off", detail: "Checkout charges no tax on any order. Turn it back on in Taxes if you are registered to collect.", status: "ok", tab: "taxes", action: "Open Taxes" }
    : rates.length
    ? { id: "tax", label: "Sales tax rates are set", detail: plural(rates.length, "tax rate"), status: "ok", tab: "taxes", action: "Open Taxes" }
    : { id: "tax", label: "No sales tax rates", detail: "Checkout charges no tax. Add GST/HST/PST rates if you are registered to collect them.", status: "warn", tab: "taxes", action: "Open Taxes" });
  // A country with some rates but a province/state with none silently charges $0 there.
  const gaps = rates.length ? uncoveredTaxRegions(settings?.taxes?.rates || []) : [];
  if (gaps.length) {
    const names = gaps.flatMap(g => g.regions.map(r => `${r} (${g.country})`));
    items.push({ id: "taxGaps", label: `No tax rate for ${plural(names.length, "region")}`, detail: `${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""}. Add a rate for each (or a country-wide rate; 0% if you don't collect there).`, status: "warn", tab: "taxes", action: "Open Taxes" });
  }

  // Policies
  const missing = REQUIRED_POLICIES.filter(([k]) => !hasText(settings?.policies?.[k])).map(([, label]) => label);
  items.push(missing.length
    // A block, not a warning (legal review, 3 November 2026): Ontario's and Quebec's consumer laws expect the seller's
    // delivery, returns and privacy terms before an online sale, and card networks ask for them. Each policy has a
    // "Start from our wording" button, so this takes a minute.
    ? { id: "policies", label: `Missing store policies: ${missing.join(", ")}`, detail: "Shoppers must be able to read your shipping, returns, privacy and terms pages before they buy, and card networks ask for them too. Each one has a Start from our wording button to fill it in a minute.", status: "block", tab: "general", action: "Open General" }
    : { id: "policies", label: "Store policy content is present", detail: "Shipping, returns, privacy and terms contain text. Review their public pages for accuracy.", status: "ok", tab: "general", action: "Open General" });

  // Postal address: every email footer carries it (Settings › General › Location) and abandoned-cart
  // reminders are not sent without one. Mirrors functions/marketingOptOut.js footerAddress.
  const loc = settings?.location || {};
  const hasAddress = [loc.street, loc.city, loc.state, loc.zip, loc.country].some(hasText);
  items.push(hasAddress
    ? { id: "mailing-address", label: "A postal address is saved for email footers", detail: "Order and reminder emails carry it.", status: "ok", tab: "general", action: "Open General" }
    : { id: "mailing-address", label: "No postal address saved", detail: "Marketing email needs your postal address in its footer, so abandoned-cart reminders are not sent until Settings › General › Location is filled in.", status: "block", tab: "general", action: "Open General" });

  // Email
  // A "fallback" row only says Gmail missed and the backup sender was tried; the outcome is its own row.
  // "cancelled" = the owner stopped a queued email: it says nothing about the sending setup.
  const lastEmail = (emailLog || []).find(e => e?.status !== "fallback" && e?.status !== "cancelled");
  const emailWorks = lastEmail && lastEmail.status !== "failed" && lastEmail.status !== "queued" && String(lastEmail.from || "").toLowerCase() !== "onboarding@resend.dev";
  // A shop run by Colophon sends through the platform from day one: nothing for the press to set up or verify, so the
  // check turns green once an email has gone out, and a practice order is how the first one goes.
  if (platformCards && !lastEmail) items.push({ id: "email", label: "No emails sent yet", detail: "Your practice order sends you a receipt, so you see exactly what your customers will get.", status: "warn", tab: "payments", action: "Open Payments" });
  else if (platformCards && emailWorks) items.push({ id: "email", label: "Emails are going out", detail: "Receipts and order emails are sent from your shop. Check one arrived to see how it looks.", status: "ok", tab: "notifications", action: "Open Email sender" });
  else items.push(!lastEmail
    ? { id: "email", label: "No emails sent yet", detail: "Send a test from Settings › Email sender, then verify receipt in the destination inbox.", status: "warn", tab: "notifications", action: "Open Email sender" }
    : lastEmail.status === "failed" || lastEmail.status === "queued"
      ? { id: "email", label: lastEmail.status === "queued" ? "The last email could not be sent and is waiting to retry" : "The last email failed to send", detail: String(lastEmail.error || "See Recent deliveries for the reason."), status: "block", tab: "notifications", action: "Open Email sender" }
      // Resend's test sender only delivers to the Resend account owner: customers get nothing.
      : String(lastEmail.from || "").toLowerCase() === "onboarding@resend.dev"
        ? { id: "email", label: "Emails only reach you, not customers", detail: "The last email went out from a test address, which only delivers to your own inbox. Finish setting up your email sender (Settings › Email sender) so customers receive your emails.", status: "block", tab: "notifications", action: "Open Email sender" }
      : { id: "email", label: "Email accepted; inbox delivery unverified", detail: "The provider accepted the latest message. Check the destination inbox and provider delivery events; acceptance does not prove delivery.", status: "warn", tab: "notifications", action: "Open Email sender" });

  // End-to-end proof. On a Colophon shop a practice order (plan 7.6) proves checkout without moving money, so it counts.
  const realSale = (orders || []).some(isRealPaidOrder);
  if (platformCards) items.push(realSale || (orders || []).some(practiced)
    ? { id: "first-sale", label: "Checkout works", detail: realSale ? "A real order has gone through, from the bag to the receipt." : "A practice order went through, from the bag to the receipt. No money moved.", status: "ok", tab: "orders", action: "Open Orders" }
    : { id: "first-sale", label: "Try a practice order", detail: "While your shop is private, press Try a practice order in Payments and buy one item with the practice card. No money moves.", status: "warn", tab: "payments", action: "Open Payments" });
  else items.push(realSale
    ? { id: "first-sale", label: "A real paid order is recorded", detail: "The order is marked paid. Check the payment, the receipt, any refund and the packing separately to confirm the full flow.", status: "warn", tab: "orders", action: "Open Orders" }
    : { id: "first-sale", label: "No real paid order yet", detail: "Place one small live order (then refund it) to prove checkout end to end.", status: "warn", tab: "orders", action: "Open Orders" });

  // Sign-in (code plan 22.6, 22.9): recommended before going live, never required. Without backup codes an owner who
  // loses their phone can only get back in by asking for help.
  if (signIn) {
    items.push(!signIn.twoStep
      ? { id: "sign-in", label: "Two-step sign-in is off", detail: "Turn it on in Settings › Security and save your backup codes, so nobody else can get into your shop, and you can still get in if you lose your phone.", status: "warn", tab: "security", action: "Open Security" }
      : signIn.codesLeft === 0
        ? { id: "sign-in", label: "No backup codes saved", detail: "If you lose your phone, backup codes are how you get back in. Make them in Settings › Security and keep them somewhere safe.", status: "warn", tab: "security", action: "Open Security" }
        : { id: "sign-in", label: "Your sign-in is protected", detail: signIn.codesLeft === null ? "Two-step sign-in is on." : `Two-step sign-in is on, with ${plural(signIn.codesLeft, "backup code")} left.`, status: "ok", tab: "security", action: "Open Security" });
  }

  // Colophon deploys and checks every platform shop's releases; the press has nothing to verify there.
  if (platformCards) return items;
  items.push({ id: "deployment", label: "Production deployment is unverified", detail: "This dashboard has no release or deployment evidence. Compare the latest successful workflow and Firebase release with the intended production version.", status: "warn", tab: "general", action: "Check deployments", href: "https://github.com/lyricalmyricalbooks/LMB-PLATFORM/actions" });
  items.push({ id: "hosting", label: "Hosting release needs verification", detail: "Confirm the live domain and Hosting release in the configured Firebase project. Frontend and Functions releases are separate.", status: "warn", tab: "general", action: "Open Firebase", href: "https://console.firebase.google.com/project/lmb-test-shop/hosting" });
  return items;
}

export function readinessSummary(items: ReadinessItem[]): ReadinessStatus {
  if (items.some(i => i.status === "block")) return "block";
  if (items.some(i => i.status === "warn")) return "warn";
  return "ok";
}

/** "6 of 8 ready": how many checks are green, and the ones still open (blocking first). */
export function readinessProgress(items: ReadinessItem[]) {
  const open = items.filter(i => i.status !== "ok").sort((a, b) => Number(b.status === "block") - Number(a.status === "block"));
  return { done: items.length - open.length, total: items.length, open, completed: items.filter(i => i.status === "ok") };
}
