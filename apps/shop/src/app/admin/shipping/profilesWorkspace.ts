// The Shipping › Profiles workspace (Julian's "Shipping Profiles v2" mockup), pure parts: each zone's one price,
// what stops Save, the "Try it" answer and the list of writes Save makes. The workspace keeps every edit as a draft.
import { computeShippingCost, findCountry, matchShippingZone, regionList } from "../../features/site/shippingZones";
import { isEmpty, picksOf } from "./zonePlaces";

export const GENERAL = "general-profile";
export const isNewId = (id: string) => id.startsWith("new-");

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
const num = (v: unknown) => Number(String(v ?? "").replace(/[$,\s]/g, ""));

/** The zone's price the workspace edits: its first rate. */
export const zoneRate = (zone: any) => (Array.isArray(zone?.rates) && zone.rates[0]) || null;

/** The zone with its first rate changed (a flat rate is made when it has none). */
export function withRate(zone: any, patch: Record<string, unknown>, newId: () => string) {
  const rates = Array.isArray(zone.rates) ? [...zone.rates] : [];
  const first = rates[0] || { id: newId(), name: "Standard shipping", type: "flat", enabled: true, base: "", additional: 0, deliveryDays: "", minPrice: null, maxPrice: null };
  rates[0] = { ...first, ...patch };
  return { ...zone, rates };
}

export type ZoneProblem = "places" | "price";
export function zoneProblems(zone: any): ZoneProblem[] {
  const out: ZoneProblem[] = [];
  if (isEmpty(picksOf(zone)) && !String(zone?.region || "").trim()) out.push("places");
  const r = zoneRate(zone);
  if (!r || ((r.type || "flat") === "flat" && (blank(r.base) || !(num(r.base) >= 0)))) out.push("price");
  return out;
}
export const profileHasProblems = (p: any) => (p?.zones || []).some((z: any) => zoneProblems(z).length > 0);

/** Prices typed as words become numbers before saving. */
export function cleanProfile(p: any) {
  return {
    ...p,
    freeShippingOver: blank(p.freeShippingOver) ? null : num(p.freeShippingOver),
    zones: (p.zones || []).map((z: any) => ({
      ...z,
      rates: (z.rates || []).map((r: any) => ({ ...r, base: blank(r.base) ? 0 : num(r.base), additional: blank(r.additional) ? 0 : num(r.additional) })),
    })),
  };
}

export type TryResult =
  | { ok: false }
  | { ok: true; zone: string; days: string; price: number; free: boolean; line: string };

const money = (n: number) => `$${n.toFixed(2)}`;

/** What a customer in `dest` ("CA" or "CA-YT") pays for `count` items of `unit` each, using the unsaved zones. */
export function tryIt(profile: any, dest: string, count: number, unit: number): TryResult {
  const [cc, rc] = dest.split("-");
  const zones = (profile?.zones || []).map((z: any) => {
    const r = zoneRate(z) || {};
    return { ...z, base: num(r.base) || 0, additional: num(r.additional) || 0, days: String(r.deliveryDays || "") };
  });
  const country = findCountry(cc);
  const zone: any = matchShippingZone(country?.name || cc, zones, rc ? regionList(cc).find(([c]) => c === rc)?.[1] || rc : undefined);
  if (!zone) return { ok: false };
  const subtotal = unit * count;
  const freeOver = blank(profile?.freeShippingOver) ? 0 : num(profile.freeShippingOver);
  const price = computeShippingCost({ ...zone, freeOver }, count, subtotal);
  const free = freeOver > 0 && subtotal >= freeOver;
  const extra = count - 1;
  const line = free ? `Free: cart of ${money(subtotal)} is over ${money(freeOver)}`
    : `${money(zone.base)} first${extra > 0 ? ` + ${money(zone.additional)} × ${extra} extra` : ""}`;
  return { ok: true, zone: String(zone.name || "Zone"), days: zone.days, price, free, line };
}

/** Name problems for a new profile: required, and not one the shop already has. */
export function nameProblem(name: string, existing: string[]): string | null {
  const n = name.trim();
  if (!n) return "Give the profile a name.";
  if (existing.some((x) => String(x || "").trim().toLowerCase() === n.toLowerCase())) return `You already have “${n}”.`;
  return null;
}

export type Plan = {
  create: any[];
  remove: string[];
  update: any[];
  /** Per profile (temp ids for new ones): books that move here, books that go back to General. */
  assign: { profileId: string; add: string[]; removed: string[] }[];
};

/** Every write Save makes, from the loaded profiles/books to the draft. */
export function savePlan(saved: any[], draft: any[], savedBooks: Record<string, string>, draftBooks: Record<string, string>): Plan {
  const savedById = new Map(saved.map((p) => [p.id, p]));
  const draftIds = new Set(draft.map((p) => p.id));
  const create = draft.filter((p) => isNewId(p.id));
  const remove = saved.filter((p) => !draftIds.has(p.id) && p.id !== GENERAL).map((p) => p.id);
  const update = draft.filter((p) => !isNewId(p.id) && JSON.stringify(savedById.get(p.id)) !== JSON.stringify(p));
  const assign: Plan["assign"] = [];
  for (const p of draft) {
    if (p.id === GENERAL) continue;
    const add = Object.keys(draftBooks).filter((b) => draftBooks[b] === p.id && savedBooks[b] !== p.id);
    const removed = Object.keys(draftBooks).filter((b) => savedBooks[b] === p.id && draftBooks[b] !== p.id);
    if (add.length || removed.length) assign.push({ profileId: p.id, add, removed });
  }
  // Books moved to General from a profile that is being deleted need nothing: deleting moves them.
  return { create, remove, update, assign };
}
