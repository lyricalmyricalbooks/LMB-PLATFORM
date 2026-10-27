// Shipping-rate engine, one copy for the shop and the Functions (src/shared/CLAUDE.md). Pure (no Firebase, no
// network). The server's run of it (functions/shared/shippingEngine.js) is authoritative and decides the charge;
// the shop runs the same code only to DISPLAY the quotes.
//
// Profiles hold zones; zones hold rates. Rate fields (all optional, defaults
// reproduce the original base + per-extra-item behaviour):
//   enabled        false hides the rate
//   type           "flat" (base + additional per extra item; default)
//                  "order"   base once per order, regardless of quantity
//                  "weight"  base + perKg × cart kg
//                  "percent" base + percent% of the profile's item subtotal
//                  "free"    always 0
//                  "pickup"  0, collect in person (needs no address)
//   base, additional, perKg, percent, handlingFee
//   freeOver       order total at/above which the rate becomes free
//   minPrice/maxPrice   order-total range the rate is offered for
//   minWeight/maxWeight cart grams range          minItems/maxItems  cart item count
// Profile fields: handlingFee (once per order), freeShippingOver, defaultItemWeightG.
import { matchShippingZone } from "./shippingZones";

export type ShippingQuote = { id: string; name: string; price: number; deliveryDays?: string; type: string };
export type ShippingItem = { price: number; quantity: number; shippingProfileId?: string | null; weightGrams?: number | null };

const num = (v: any, d = 0): number => {
  if (v === "" || v === null || v === undefined) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const opt = (v: any): number | null => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export { parseWeightGrams } from "./weightGrams";

export function rateEligible(rate: any, cart: any): boolean {
  if (rate.enabled === false) return false;
  const lo = opt(rate.minPrice), hi = opt(rate.maxPrice);
  if (lo !== null && cart.total < lo) return false;
  if (hi !== null && cart.total > hi) return false;
  const wlo = opt(rate.minWeight), whi = opt(rate.maxWeight);
  if (wlo !== null && cart.weightG < wlo) return false;
  if (whi !== null && cart.weightG > whi) return false;
  const ilo = opt(rate.minItems), ihi = opt(rate.maxItems);
  if (ilo !== null && cart.count < ilo) return false;
  if (ihi !== null && cart.count > ihi) return false;
  return true;
}

// A group's price split into a fixed part (the leader's base counts once) and a
// variable part (charged for every group).
function groupCharge(rate: any, group: any, cart: any, leader: boolean) {
  const type = rate.type || "flat";
  const freeOver = opt(rate.freeOver);
  if (type === "free" || type === "pickup" || (freeOver !== null && freeOver > 0 && cart.total >= freeOver)) {
    return { fixed: 0, variable: 0 };
  }
  const base = num(rate.base);
  if (type === "order") return { fixed: base, variable: 0 };
  if (type === "weight") return { fixed: base, variable: num(rate.perKg) * (group.weightG / 1000) };
  if (type === "percent") return { fixed: base, variable: (num(rate.percent) / 100) * group.subtotal };
  const additional = num(rate.additional);
  return { fixed: base, variable: additional * (leader ? Math.max(0, group.qty - 1) : group.qty) };
}

function zoneFor(profile: any, country: string) {
  const zones = profile && Array.isArray(profile.zones) ? profile.zones : [];
  return zones.length ? matchShippingZone(country, zones) || null : null;
}

/**
 * items: [{ price, quantity, shippingProfileId, weightGrams? }]
 * Returns quotes sorted cheapest-first: [{ id, name, price, deliveryDays, type }]
 */
export function quoteShipping(items: ShippingItem[], address: { country?: string } | null | undefined, profiles: any[], opts: { freeAll?: boolean } = {}): ShippingQuote[] {
  const country = (address && address.country) || "Canada";
  const list = Array.isArray(profiles) ? profiles : [];
  const byId = new Map<string, any>(list.map((p) => [p.id, p] as [string, any]));
  const general = byId.get("general-profile") || list[0] || null;

  const groups = new Map<string, any>();
  let total = 0, count = 0, weightG = 0;
  for (const it of items) {
    const qty = Math.max(1, Math.floor(num(it.quantity, 1)));
    const price = num(it.price);
    const profile = byId.get(it.shippingProfileId as string) || general;
    const pid = profile ? profile.id : "none";
    const w = (opt(it.weightGrams) ?? opt(profile && profile.defaultItemWeightG) ?? 0) * qty;
    if (!groups.has(pid)) groups.set(pid, { profile, qty: 0, subtotal: 0, weightG: 0 });
    const g = groups.get(pid);
    g.qty += qty; g.subtotal += price * qty; g.weightG += w;
    total += price * qty; count += qty; weightG += w;
  }
  const cart = { total, count, weightG };
  if (!groups.size) return [];

  // Eligible rates per group (matched zone -> rates), keyed by lower-case name.
  const anyZones = list.some((p: any) => Array.isArray(p && p.zones) && p.zones.length > 0);
  const perGroup: any[] = [];
  for (const g of groups.values()) {
    const zone = zoneFor(g.profile, country);
    if (!zone) {
      // Legacy flat profile (no zones): a single synthetic rate.
      const p = g.profile || {};
      // Once any profile uses zones, a profile without a matching zone can't ship here —
      // never invent the old flat $15 + $5 rate for it.
      if ((Array.isArray(p.zones) && p.zones.length) || anyZones) { perGroup.push({ g, rates: new Map(), none: true }); continue; }
      perGroup.push({ g, rates: new Map<string, any>([["standard shipping", {
        id: "legacy", name: p.serviceName || "Standard Shipping", base: num(p.base, 15), additional: num(p.additional, 5),
        deliveryDays: p.deliveryDays || undefined, freeOver: p.freeThreshold,
      }]]) });
      continue;
    }
    const rates = new Map<string, any>();
    for (const r of (zone.rates || []) as any[]) {
      if (rateEligible(r, cart)) rates.set(String(r.name || "").trim().toLowerCase(), r);
    }
    perGroup.push({ g, rates });
  }
  if (perGroup.some((x: any) => x.none)) return [];

  const names = new Map<string, string>();
  for (const { rates } of perGroup as any[]) for (const [k, r] of rates) if (!names.has(k)) names.set(k, r.name);

  const usedIds = new Set<string>();
  const uniqueId = (id: string) => { let out = String(id); let n = 2; while (usedIds.has(out)) out = `${id}-${n++}`; usedIds.add(out); return out; };
  const quotes: ShippingQuote[] = [];
  for (const [key, label] of names) {
    const charges = perGroup.map(({ g, rates }: any) => {
      const named = rates.has(key);
      let rate = rates.get(key);
      if (!rate) rate = [...rates.values()].sort((a: any, b: any) => num(a.base) - num(b.base))[0];
      return { g, rate, named };
    });
    if (charges.some((c: any) => !c.rate)) continue; // a group can't ship this way
    const leaderIdx = charges.reduce((best: number, c: any, i: number) => (num(c.rate.base) > num(charges[best].rate.base) ? i : best), 0);
    let fixed = 0, variable = 0, handling = 0;
    const days: string[] = [];
    charges.forEach((c: any, i: number) => {
      const ch = groupCharge(c.rate, c.g, cart, i === leaderIdx);
      fixed = Math.max(fixed, ch.fixed);
      variable += ch.variable;
      if (ch.fixed || ch.variable || (c.rate.type || "flat") === "flat") handling = Math.max(handling, num(c.rate.handlingFee));
      if (c.rate.deliveryDays) days.push(String(c.rate.deliveryDays));
    });
    const profileHandling = Math.max(0, ...charges.map((c: any) => num(c.g.profile && c.g.profile.handlingFee)));
    let price = fixed + variable + handling + profileHandling;
    const profFree = Math.max(0, ...charges.map((c: any) => num(c.g.profile && c.g.profile.freeShippingOver)));
    const anyPickup = charges.every((c: any) => (c.rate.type || "flat") === "pickup");
    if (anyPickup) price = 0;
    else if (profFree > 0 && total >= profFree) price = 0;
    quotes.push({
      // Unique per option: the id of the rate actually named this (not the leader's
      // fallback rate, which several options can share), else the name key.
      id: uniqueId(charges.find((c: any) => c.named)?.rate.id || key),
      name: label,
      price: round2(price),
      deliveryDays: days[0] || undefined,
      type: anyPickup ? "pickup" : (charges[leaderIdx].rate.type || "flat"),
    });
  }
  const sorted = quotes.sort((a, b) => a.price - b.price);
  return opts.freeAll ? sorted.map((q) => ({ ...q, price: 0 })) : sorted;
}

// Chooses the quote the customer selected; falls back to the cheapest.
export function pickQuote(quotes: ShippingQuote[], method?: string | null): ShippingQuote | null {
  if (!quotes.length) return null;
  const want = String(method || "").trim().toLowerCase();
  return quotes.find((q) => q.name.trim().toLowerCase() === want) || quotes[0];
}
