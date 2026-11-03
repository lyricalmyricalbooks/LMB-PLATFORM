// The billing hub's extra calls (code plan 22.2), the parts of Shopify's Settings › Billing the plan didn't have yet:
//
// - saved cards: every card on the account, which one is primary (it pays this shop's plan), make another one primary,
//   remove one that pays nothing. A card is added on Stripe's own page (billing.cardLink), never typed here.
// - billing details: the business name, the email bills go to, the address, and a GST/HST (or Quebec QST) number, all
//   printed on every bill. With tax on, the address is also where Stripe Tax places the press.
// - the next bill: what Stripe will charge next and when, line by line (Stripe's preview invoice), with any discount
//   (the founding offer) and the tax.
// - pay now: after a declined payment, try the bill again at once with the primary card (the bank may want the press to
//   confirm it on Stripe's own page; the answer says so).
//
// Composed inside createBilling (billing.js) with its Stripe call (retries included), store and save, so every change
// is kept, copied to the registry and the shop, and logged exactly like the rest of billing.
import { cardWords } from "./cards.js";

/** Plan states with a bill that can be paid now: retrying, unpaid, or waiting for a first payment. */
const OWING = new Set(["past_due", "unpaid", "incomplete"]);
const ENDED = new Set(["canceled", "incomplete_expired"]);

/** Tax numbers Stripe can print on a Canadian bill: GST/HST (business number + RT + account) and Quebec's QST. */
export const TAX_NUMBERS = Object.freeze([
  Object.freeze({ type: "ca_gst_hst", pattern: /^\d{9}RT\d{4}$/, example: "123456789RT0001", label: "GST/HST" }),
  Object.freeze({ type: "ca_qst", pattern: /^\d{10}TQ\d{4}$/, example: "1234567890TQ0001", label: "QST" }),
]);

/** A tax number as typed ("123456789 RT 0001") -> { type, value } or null; throws on one in neither form. */
export function taxNumberOf(text, BillingError) {
  const value = String(text ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (!value) return null;
  const kind = TAX_NUMBERS.find((t) => t.pattern.test(value));
  if (!kind) throw new BillingError(400, "That tax number isn't in a form we know. A GST/HST number looks like 123456789 RT 0001, and a QST number like 1234567890 TQ 0001.");
  return { type: kind.type, value };
}

const clip = (text, max) => String(text ?? "").trim().slice(0, max);
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** The address as Stripe takes it, checked: street, city, province or state, postal code and a two-letter country. */
export function addressOf(raw, BillingError) {
  if (!raw || typeof raw !== "object") return null;
  const address = {
    line1: clip(raw.line1, 200), line2: clip(raw.line2, 200), city: clip(raw.city, 100),
    state: clip(raw.state, 60).toUpperCase(), postal_code: clip(raw.postal_code ?? raw.postalCode, 20).toUpperCase(), country: clip(raw.country || "CA", 2).toUpperCase(),
  };
  if (!Object.values(address).some(Boolean) || (!address.line1 && !address.city && !address.postal_code)) return null;
  if (!address.line1 || !address.city || !address.postal_code) throw new BillingError(400, "Fill in the street, the city and the postal code, or leave the whole address empty.");
  if (!/^[A-Z]{2}$/.test(address.country)) throw new BillingError(400, "Choose the country from the list.");
  if (address.country === "CA" && !/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/.test(address.postal_code)) throw new BillingError(400, "That postal code doesn't look Canadian. It should look like M5V 2T6.");
  return Object.fromEntries(Object.entries(address).filter(([, v]) => v));
}

const https = (url) => (typeof url === "string" && url.startsWith("https://") ? url : null);

export function createBillingHub({ call, rowFor, save, logChange, subscriptions, settings, tax, BillingError, money, iso, nowIso, refresh }) {
  const cardOf = (method) => ({
    id: method.id, brand: method.card?.brand ?? "card", last4: method.card?.last4 ?? "", expMonth: method.card?.exp_month ?? null, expYear: method.card?.exp_year ?? null,
  });

  /** The account's saved cards, straight from Stripe (the customer is the account's). */
  async function cards(row) {
    const list = await call("GET", `/v1/customers/${row.customerId}/payment_methods`, { params: { type: "card", limit: 20 } });
    return (list?.data ?? []).map(cardOf);
  }

  /** Is this card paying another running plan of the same account? Then it can't be removed. */
  async function payingElsewhere(row, cardId) {
    return (await subscriptions.list()).some((other) => other.shopId !== row.shopId && other.customerId === row.customerId && other.card?.id === cardId && !ENDED.has(other.status));
  }

  return {
    /** Saved cards, the primary one first: { cards: [{ id, words, brand, last4, expMonth, expYear, primary, expired }] }. */
    async paymentMethods(shopId) {
      const row = await rowFor(shopId);
      const nowDate = new Date(Date.parse(nowIso()));
      const month = nowDate.getUTCFullYear() * 12 + nowDate.getUTCMonth();
      const list = (await cards(row)).map((card) => ({
        ...card, words: cardWords(card), primary: card.id === row.card?.id,
        expired: Number.isInteger(card.expYear) && Number.isInteger(card.expMonth) && card.expYear * 12 + (card.expMonth - 1) < month,
      }));
      list.sort((a, b) => Number(b.primary) - Number(a.primary));
      return { cards: list };
    },

    /** Makes a saved card the one that pays this shop's plan (and the account's default for new bills). */
    async makePrimary({ shopId, cardId }) {
      const row = await rowFor(shopId);
      const card = (await cards(row)).find((c) => c.id === cardId);
      if (!card) throw new BillingError(404, "That card isn't saved on your account any more. Reload the page.");
      if (row.card?.id === cardId && row.hasCard) return { changed: false };
      await call("POST", `/v1/customers/${row.customerId}`, { params: { invoice_settings: { default_payment_method: cardId } }, idempotencyKey: `primary-customer-${row.customerId}-${cardId}-${shopId}-${row.cardChanges ?? 0}` });
      if (!ENDED.has(row.status)) {
        await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { default_payment_method: cardId }, idempotencyKey: `primary-${row.subscriptionId}-${cardId}-${row.cardChanges ?? 0}` });
      }
      await save(shopId, { card, hasCard: true, cardChanges: (row.cardChanges ?? 0) + 1 }, null);
      await logChange(shopId, "card-made-primary", { card: cardWords(card) });
      return { changed: true };
    },

    /** Removes a saved card that pays nothing. The primary card of a running plan stays until another is primary. */
    async removeCard({ shopId, cardId }) {
      const row = await rowFor(shopId);
      const card = (await cards(row)).find((c) => c.id === cardId);
      if (!card) return { removed: false };
      if (row.card?.id === cardId && !ENDED.has(row.status)) throw new BillingError(409, "This card pays your plan. Make another card primary first, then remove this one.");
      if (await payingElsewhere(row, cardId)) throw new BillingError(409, "This card pays the plan of another shop on your account. Change that shop's card first.");
      await call("POST", `/v1/payment_methods/${cardId}/detach`, { idempotencyKey: `detach-${cardId}` });
      await logChange(shopId, "card-removed", { card: cardWords(card) });
      return { removed: true };
    },

    /** The details printed on every bill: { name, email, address, taxNumber, taxLabel, plusTax }. */
    async billingDetails(shopId) {
      const row = await rowFor(shopId);
      const customer = await call("GET", `/v1/customers/${row.customerId}`);
      const ids = await call("GET", `/v1/customers/${row.customerId}/tax_ids`, { params: { limit: 10 } });
      const taxId = (ids?.data ?? []).find((t) => TAX_NUMBERS.some((k) => k.type === t.type));
      return {
        name: customer?.name ?? "", email: customer?.email ?? row.billingEmail ?? "",
        address: customer?.address && customer.address.line1 ? { line1: customer.address.line1 ?? "", line2: customer.address.line2 ?? "", city: customer.address.city ?? "", state: customer.address.state ?? "", postalCode: customer.address.postal_code ?? "", country: customer.address.country ?? "CA" } : null,
        taxNumber: taxId?.value ?? "", taxLabel: TAX_NUMBERS.find((k) => k.type === taxId?.type)?.label ?? "", plusTax: tax,
      };
    },

    /** Saves the details on the account's Stripe customer; the email is also where Colophon's billing emails go. */
    async saveBillingDetails({ shopId, name, email, address, taxNumber }) {
      const row = await rowFor(shopId);
      const cleanName = clip(name, 120);
      const cleanEmail = clip(email, 200).toLowerCase();
      if (!cleanEmail || !EMAIL.test(cleanEmail)) throw new BillingError(400, "Give the email address your bills should go to.");
      const cleanAddress = addressOf(address, BillingError);
      const number = taxNumberOf(taxNumber, BillingError);
      const changes = (row.detailChanges ?? 0) + 1;
      await call("POST", `/v1/customers/${row.customerId}`, {
        params: { email: cleanEmail, name: cleanName || null, ...(cleanAddress ? { address: cleanAddress } : {}) },
        idempotencyKey: `details-${row.customerId}-${shopId}-${changes}`,
      });
      // One tax number: an old one that differs is taken off, the new one put on.
      const ids = (await call("GET", `/v1/customers/${row.customerId}/tax_ids`, { params: { limit: 10 } }))?.data ?? [];
      for (const old of ids.filter((t) => TAX_NUMBERS.some((k) => k.type === t.type) && !(number && t.type === number.type && t.value === number.value))) {
        await call("DELETE", `/v1/customers/${row.customerId}/tax_ids/${old.id}`);
      }
      if (number && !ids.some((t) => t.type === number.type && t.value === number.value)) {
        await call("POST", `/v1/customers/${row.customerId}/tax_ids`, { params: number, idempotencyKey: `taxid-${row.customerId}-${number.value}` });
      }
      // With tax on, an address on file lets Stripe Tax work from the next bill (a card alone used to be the only way).
      if (tax && cleanAddress && row.hasCard && !ENDED.has(row.status)) {
        await call("POST", `/v1/subscriptions/${row.subscriptionId}`, { params: { automatic_tax: { enabled: true } }, idempotencyKey: `tax-on-${row.subscriptionId}-${changes}` });
      }
      await save(shopId, { billingEmail: cleanEmail, detailChanges: changes }, null);
      await logChange(shopId, "billing-details-changed", { taxNumber: number ? number.type : null, address: Boolean(cleanAddress) });
      return { saved: true };
    },

    /**
     * The next bill, or null when none is coming (cancelled, ended, or paying as they sell):
     * { date, lines: [{ words, amount }], subtotal, discount, tax, total }.
     */
    async upcomingBill(shopId) {
      const row = await subscriptions.get(shopId);
      if (!row?.subscriptionId || ENDED.has(row.status) || row.cancelAtPeriodEnd || row.paymentWay === "payAsYouSell") return null;
      const preview = await call("POST", "/v1/invoices/create_preview", { params: { customer: row.customerId, subscription: row.subscriptionId } });
      if (!preview) return null;
      const currency = preview.currency ?? settings.currency;
      const discount = (preview.total_discount_amounts ?? []).reduce((sum, d) => sum + (d.amount ?? 0), 0);
      const taxAmount = preview.tax ?? (preview.total_taxes ?? []).reduce((sum, t) => sum + (t.amount ?? 0), 0);
      return {
        date: iso(preview.next_payment_attempt ?? preview.period_end) ?? row.currentPeriodEnd ?? row.trialEnd,
        lines: (preview.lines?.data ?? []).map((line) => ({ words: clip(line.description ?? `${settings.platformName} plan`, 200), amount: money(line.amount ?? 0, currency) })),
        subtotal: money(preview.subtotal ?? preview.amount_due ?? 0, currency),
        discount: discount ? money(discount, currency) : "",
        tax: taxAmount ? money(taxAmount, currency) : "",
        total: money(preview.total ?? preview.amount_due ?? 0, currency),
      };
    },

    /**
     * Tries the unpaid bill again now with the primary card: { paid: true } or, when the bank wants the press to
     * confirm it, { needsConfirming: true, url } (Stripe's own bill page). A decline answers in plain words.
     */
    async payNow({ shopId }) {
      const row = await rowFor(shopId);
      if (!OWING.has(row.status)) throw new BillingError(409, "There's nothing to pay right now.");
      if (!row.hasCard) throw new BillingError(409, "Add a card first, then pay the bill.");
      const open = await call("GET", "/v1/invoices", { params: { subscription: row.subscriptionId, status: "open", limit: 1 } });
      const invoice = open?.data?.[0];
      if (!invoice) throw new BillingError(409, "There's nothing to pay right now. It can take a minute to show here.");
      const tries = (row.payNowTries ?? 0) + 1;
      await save(shopId, { payNowTries: tries }, null);
      try {
        await call("POST", `/v1/invoices/${invoice.id}/pay`, { params: { payment_method: row.card?.id ?? undefined }, idempotencyKey: `pay-now-${invoice.id}-${tries}` });
      } catch (error) {
        if (error.code === "invoice_payment_intent_requires_action" || error.code === "authentication_required") {
          await logChange(shopId, "pay-now-needs-confirming", {});
          return { needsConfirming: true, url: https(invoice.hosted_invoice_url) };
        }
        if (error.statusCode === 402 || error.type === "card_error") {
          await logChange(shopId, "pay-now-declined", { code: error.code ?? null });
          throw new BillingError(402, "Your bank declined the payment again. Add another card, or make another card primary, then try again.");
        }
        throw error;
      }
      await logChange(shopId, "pay-now-paid", { invoice: invoice.id });
      await refresh(shopId);
      return { paid: true };
    },
  };
}
