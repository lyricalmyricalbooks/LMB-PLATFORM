// Pure rules behind Settings › Shipping › Profiles › Create profile: the starting points
// (ready-made zones, a copy of another profile, or empty), the quick per-zone prices typed
// in the dialog, and the copy made by a profile's Duplicate button.
import { countryName } from "./shippingCountries";

export type ProfileStarterId = "world" | "north-america" | "canada" | "copy" | "blank";

export const PROFILE_STARTERS: { id: ProfileStarterId; label: string; desc: string }[] = [
  { id: "world", label: "Canada, US & everywhere else", desc: "Three zones with a price each. Ships worldwide." },
  { id: "north-america", label: "Canada & United States", desc: "Two zones. Nowhere else can order these books." },
  { id: "canada", label: "Canada only", desc: "One zone, for books you only send within Canada." },
  { id: "copy", label: "Copy another profile", desc: "Same zones, prices and rules as one you already have." },
  { id: "blank", label: "Start empty", desc: "No zones yet. You add every zone and rate yourself." },
];

/** One row of the dialog's quick price table: a zone and the price of its one rate. */
export type QuickZonePrice = {
  key: string;
  zone: string;
  countries: string[];
  restOfWorld: boolean;
  rateName: string;
  /** Price of the first copy ($). */
  first: string;
  /** Price of each additional copy ($). */
  extra: string;
  /** Optional carrier-backed transit days; blank rather than a guess. */
  days: string;
};

const row = (key: string, zone: string, countries: string[], rateName: string, first: number, extra: number, restOfWorld = false): QuickZonePrice =>
  ({ key, zone, countries, restOfWorld, rateName, first: first.toFixed(2), extra: extra.toFixed(2), days: "" });

/** The zones (with suggested prices the owner edits) a template starts with; none for copy/blank. */
export function starterPrices(starter: ProfileStarterId): QuickZonePrice[] {
  const canada = row("ca", "Canada", ["CA"], "Standard shipping", 8, 3);
  const us = row("us", "United States", ["US"], "Standard shipping", 12, 4);
  const world = row("world", "Rest of world", [], "International shipping", 20, 6, true);
  if (starter === "world") return [canada, us, world];
  if (starter === "north-america") return [canada, us];
  if (starter === "canada") return [canada];
  return [];
}

const money = (value: string) => {
  const n = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};

const optionalMoney = (value: any): number | null => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = money(String(value));
  return Number.isNaN(n) ? null : n;
};

export type NewProfileInput = {
  name: string;
  starter: ProfileStarterId;
  prices?: QuickZonePrice[];
  copyFrom?: any;
  freeShippingOver?: string | number | null;
};

/** What stops Create profile, in plain words; empty = ready. */
export function newProfileProblems(input: NewProfileInput, existingNames: string[] = []): string[] {
  const out: string[] = [];
  const name = String(input.name || "").trim();
  if (!name) out.push("Give the profile a name.");
  else if (existingNames.some((n) => String(n || "").trim().toLowerCase() === name.toLowerCase())) out.push(`You already have a profile called “${name}”. Pick another name.`);
  if (input.starter === "copy" && !input.copyFrom) out.push("Choose the profile to copy.");
  for (const p of input.prices || []) {
    if (Number.isNaN(money(p.first)) || String(p.first ?? "").trim() === "") out.push(`Enter a price for the first book to ${p.zone} (0 for free).`);
    if (String(p.extra ?? "").trim() !== "" && Number.isNaN(money(p.extra))) out.push(`The extra-book price for ${p.zone} isn't a number.`);
  }
  const free = input.freeShippingOver;
  if (free !== null && free !== undefined && String(free).trim() !== "" && Number.isNaN(money(String(free)))) out.push("“Free shipping over” isn't a number.");
  return out;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

/** Zones/rates copied with fresh ids, so the copy never shares ids with its source. */
export function copyZones(zones: any[] = [], newId: () => string): any[] {
  return (Array.isArray(zones) ? zones : []).map((z) => ({
    ...clone(z),
    id: newId(),
    rates: (Array.isArray(z?.rates) ? z.rates : []).map((r: any) => ({ ...clone(r), id: newId() })),
  }));
}

/** The profile saved by Create profile (no id; the store gives it one). Books are assigned afterwards. */
export function buildNewProfile(input: NewProfileInput, newId: () => string) {
  const name = String(input.name || "").trim();
  if (input.starter === "copy" && input.copyFrom) {
    const src = input.copyFrom;
    return {
      name,
      zones: copyZones(src.zones, newId),
      freeShippingOver: optionalMoney(input.freeShippingOver ?? src.freeShippingOver),
      handlingFee: optionalMoney(src.handlingFee),
      defaultItemWeightG: optionalMoney(src.defaultItemWeightG),
    };
  }
  const zones = (input.prices || []).map((p) => ({
    id: newId(),
    name: p.zone,
    countries: p.restOfWorld ? [] : [...p.countries],
    continents: [],
    restOfWorld: p.restOfWorld,
    rates: [{
      id: newId(), name: p.rateName, type: "flat", enabled: true,
      base: money(p.first) || 0, additional: optionalMoney(p.extra) ?? 0,
      deliveryDays: String(p.days || "").trim(), minPrice: null, maxPrice: null,
    }],
  }));
  return { name, zones, freeShippingOver: optionalMoney(input.freeShippingOver), handlingFee: null, defaultItemWeightG: null };
}

/** "Name (copy)", then "Name (copy 2)"… never an existing name. */
export function copyName(name: string, existingNames: string[] = []): string {
  const base = `${String(name || "Profile").trim()} (copy`;
  const taken = new Set(existingNames.map((n) => String(n || "").trim().toLowerCase()));
  if (!taken.has(`${base})`.toLowerCase())) return `${base})`;
  for (let i = 2; ; i += 1) if (!taken.has(`${base} ${i})`.toLowerCase())) return `${base} ${i})`;
}

/** Duplicate button: same zones, rates and rules under a new name; no books move. */
export function duplicateProfile(profile: any, newId: () => string, existingNames: string[] = []) {
  return {
    name: copyName(profile?.name || "Profile", existingNames),
    zones: copyZones(profile?.zones, newId),
    freeShippingOver: optionalMoney(profile?.freeShippingOver),
    handlingFee: optionalMoney(profile?.handlingFee),
    defaultItemWeightG: optionalMoney(profile?.defaultItemWeightG),
  };
}

/** One line for the profile list: where it ships and the cheapest first-book price. */
export function profileSummary(profile: any): string {
  const zones = Array.isArray(profile?.zones) ? profile.zones : [];
  if (zones.length === 0) return "Ships nowhere yet";
  const places = zones.map((z: any) => {
    if (z?.restOfWorld) return "everywhere else";
    const codes: string[] = Array.isArray(z?.countries) ? z.countries : [];
    if (z?.name) return String(z.name);
    return codes.slice(0, 2).map(countryName).join(", ") || "a zone";
  });
  const prices = zones.flatMap((z: any) => (Array.isArray(z?.rates) ? z.rates : []))
    .filter((r: any) => r?.enabled !== false && (r?.type || "flat") !== "pickup")
    .map((r: any) => (r?.type === "free" ? 0 : Number(r?.base) || 0));
  const from = prices.length ? Math.min(...prices) : null;
  const where = places.length > 4 ? `${places.slice(0, 4).join(" · ")} · +${places.length - 4} more` : places.join(" · ");
  return from === null ? `${where} · no prices yet` : `${where} · from ${from === 0 ? "free" : `$${from.toFixed(2)}`}`;
}
