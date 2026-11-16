// The zone page's picks (pure): one tree of continents › countries › states and provinces, quick picks, a suggested
// name and the picked chips. Zones store ISO codes ("CA", "US-AK"); checkout's matchShippingZone puts a state or
// province ahead of its country, so a state picked here can win over its whole country in another zone.
import { CONTINENTS, COUNTRIES, findCountry, isCatchAllZone, regionList, type Continent, type Country } from "../../features/site/shippingZones";
import { REGION_GROUPS, cleanRegions, type RegionCountry } from "./zoneRegions";

export type Picks = { countries: string[]; regions: string[]; restOfWorld: boolean };
export type Tri = "all" | "some" | "none";

export type ZoneIn = {
  id?: string; name?: string; countries?: string[]; continents?: string[]; regions?: string[]; restOfWorld?: boolean; region?: string;
};

/** Which zone already holds each place (other zones of the same profile). */
export type Taken = { countries: Map<string, string>; regions: Map<string, string>; restOfWorld: string | null };

const byContinent = new Map<Continent, Country[]>(CONTINENTS.map((c) => [c, COUNTRIES.filter((x) => x.continent === c).sort((a, b) => a.name.localeCompare(b.name))]));
export const countriesOf = (continent: Continent) => byContinent.get(continent) || [];
const hasRegions = (code: string) => regionList(code).length > 0;
const regionsOfCountry = (code: string) => regionList(code).map(([rc]) => `${code}-${rc}`);
const countryOfRegion = (region: string) => region.split("-")[0];
const nameOf = (code: string) => findCountry(code)?.name || code;
const regionNameOf = (region: string) => {
  const [cc, rc] = region.split("-");
  return regionList(cc).find(([c]) => c === rc)?.[1] || region;
};

/** A stored zone as picks: country names or codes become codes, unknowns are dropped. */
export function picksOf(zone: ZoneIn | null | undefined): Picks {
  const countries = new Set<string>();
  for (const v of zone?.countries || []) { const c = findCountry(v); if (c) countries.add(c.code); }
  for (const cont of zone?.continents || []) for (const c of countriesOf(cont as Continent)) countries.add(c.code);
  // A region whose country is picked whole adds nothing.
  const regions = cleanRegions(zone?.regions).filter((r) => !countries.has(countryOfRegion(r)));
  return { countries: [...countries], regions, restOfWorld: zone?.restOfWorld === true };
}

export function takenBy(otherZones: ZoneIn[]): Taken {
  const countries = new Map<string, string>();
  const regions = new Map<string, string>();
  let restOfWorld: string | null = null;
  for (const z of otherZones) {
    const name = String(z.name || "").trim() || "another zone";
    if (isCatchAllZone({ region: z.region || "", base: 0, additional: 0, restOfWorld: z.restOfWorld })) { restOfWorld ??= name; continue; }
    const p = picksOf(z);
    for (const c of p.countries) if (!countries.has(c)) countries.set(c, name);
    for (const r of cleanRegions(z.regions)) if (!regions.has(r)) regions.set(r, name);
  }
  return { countries, regions, restOfWorld };
}

export const EMPTY_TAKEN: Taken = { countries: new Map(), regions: new Map(), restOfWorld: null };

export const isEmpty = (p: Picks) => !p.restOfWorld && p.countries.length === 0 && p.regions.length === 0;

/* ── Countries ─────────────────────────────────────────────────────── */

export function countryState(p: Picks, code: string): Tri {
  if (p.countries.includes(code)) return "all";
  return p.regions.some((r) => countryOfRegion(r) === code) ? "some" : "none";
}

/** Picks a country whole (dropping its single states, which it covers), or takes it and its states off. */
export function toggleCountry(p: Picks, code: string, taken: Taken = EMPTY_TAKEN): Picks {
  const off = { ...p, countries: p.countries.filter((c) => c !== code), regions: p.regions.filter((r) => countryOfRegion(r) !== code) };
  if (countryState(p, code) === "all") return off;
  if (taken.countries.has(code)) {
    // Its country lives in another zone: pick every state not held elsewhere instead, so they win over it.
    const open = regionsOfCountry(code).filter((r) => !taken.regions.has(r));
    if (countryState(p, code) === "some" && open.every((r) => p.regions.includes(r))) return off;
    return { ...off, regions: [...off.regions, ...open] };
  }
  return { ...off, countries: [...off.countries, code], restOfWorld: false };
}

/* ── States and provinces ──────────────────────────────────────────── */

export function regionState(p: Picks, region: string): boolean {
  return p.countries.includes(countryOfRegion(region)) || p.regions.includes(region);
}

/**
 * Ticks one state. Taking one state off a country picked whole keeps its other states; ticking the last open state of
 * a country no other zone holds becomes the whole country again.
 */
export function toggleRegion(p: Picks, region: string, taken: Taken = EMPTY_TAKEN): Picks {
  const cc = countryOfRegion(region);
  const open = regionsOfCountry(cc).filter((r) => !taken.regions.has(r));
  if (p.countries.includes(cc)) {
    return { ...p, countries: p.countries.filter((c) => c !== cc), regions: [...p.regions, ...open.filter((r) => r !== region)] };
  }
  if (p.regions.includes(region)) return { ...p, regions: p.regions.filter((r) => r !== region) };
  const regions = [...p.regions, region];
  // Every state ticked, and no other zone holds the country or one of its states: that is the whole country.
  if (!taken.countries.has(cc) && open.length === regionsOfCountry(cc).length && open.every((r) => regions.includes(r))) {
    return { ...p, countries: [...p.countries, cc], regions: regions.filter((r) => countryOfRegion(r) !== cc), restOfWorld: false };
  }
  return { ...p, regions, restOfWorld: false };
}

/** "3 of 13" for a country's row. */
export function regionCount(p: Picks, code: string): { on: number; of: number } {
  const all = regionsOfCountry(code);
  return { on: all.filter((r) => regionState(p, r)).length, of: all.length };
}

/* ── Continents ────────────────────────────────────────────────────── */

const openCountries = (continent: Continent, taken: Taken) => countriesOf(continent).filter((c) => !taken.countries.has(c.code));

export function continentState(p: Picks, continent: Continent, taken: Taken = EMPTY_TAKEN): { state: Tri; on: number; of: number } {
  const open = openCountries(continent, taken);
  const on = open.filter((c) => p.countries.includes(c.code)).length;
  const some = on > 0 || countriesOf(continent).some((c) => countryState(p, c.code) === "some");
  return { state: open.length && on === open.length ? "all" : some ? "some" : "none", on, of: open.length };
}

export function toggleContinent(p: Picks, continent: Continent, taken: Taken = EMPTY_TAKEN): Picks {
  const codes = openCountries(continent, taken).map((c) => c.code);
  if (continentState(p, continent, taken).state === "all") {
    return { ...p, countries: p.countries.filter((c) => !codes.includes(c)), regions: p.regions.filter((r) => !codes.includes(countryOfRegion(r))) };
  }
  return {
    ...p, restOfWorld: false,
    countries: [...p.countries, ...codes.filter((c) => !p.countries.includes(c))],
    regions: p.regions.filter((r) => !codes.includes(countryOfRegion(r))),
  };
}

/* ── Everywhere else ───────────────────────────────────────────────── */

export const everywhereElse = (on: boolean): Picks => ({ countries: [], regions: [], restOfWorld: on });

/* ── Search ────────────────────────────────────────────────────────── */

export type Hit = { kind: "country"; code: string; name: string } | { kind: "region"; code: string; name: string; country: string };

/** Countries and US/Canadian states whose name starts a word with the query (or a two-letter code), countries first. */
export function findPlaces(query: string, limit = 30): Hit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = (s: string) => s.toLowerCase().split(/[\s,.()'-]+/);
  const match = (name: string, code: string) => name.toLowerCase().startsWith(q) || words(name).some((w) => w.startsWith(q)) || (q.length === 2 && code.toLowerCase() === q);
  const countries: Hit[] = COUNTRIES.filter((c) => match(c.name, c.code)).sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ kind: "country", code: c.code, name: c.name }));
  const regions: Hit[] = (["US", "CA"] as const).flatMap((cc) => regionList(cc)
    .filter(([rc, name]) => match(name, q.length === 2 && rc.toLowerCase() === q ? q : "__"))
    .map(([rc, name]) => ({ kind: "region" as const, code: `${cc}-${rc}`, name, country: nameOf(cc) })));
  return [...countries, ...regions].slice(0, limit);
}

/* ── Quick picks ───────────────────────────────────────────────────── */

export type QuickPick = { id: string; label: string; state: Tri; disabled?: string };

const FAR: Record<RegionCountry, string[]> = { US: ["US-AK", "US-HI", "US-PR"], CA: ["CA-NT", "CA-NU", "CA-YT"] };
const FAR_LABEL: Record<RegionCountry, string> = { US: "Alaska, Hawaii & Puerto Rico", CA: "The territories" };

function regionsState(p: Picks, codes: string[], taken: Taken): Tri {
  const open = codes.filter((r) => !taken.regions.has(r));
  const on = open.filter((r) => regionState(p, r)).length;
  return open.length && on === open.length ? "all" : on ? "some" : "none";
}

/** The one-tap picks a press most often wants: its own country, the far-off part of it, the neighbour, Europe, everywhere else. */
export function quickPicks(p: Picks, home: RegionCountry, taken: Taken = EMPTY_TAKEN): QuickPick[] {
  const neighbour: RegionCountry = home === "US" ? "CA" : "US";
  const country = (code: string): QuickPick => ({
    id: code, label: nameOf(code), state: countryState(p, code) === "all" ? "all" : countryState(p, code),
    disabled: taken.countries.has(code) ? taken.countries.get(code) : undefined,
  });
  const europe = continentState(p, "Europe", taken);
  return [
    country(home),
    { id: "far", label: FAR_LABEL[home], state: regionsState(p, FAR[home], taken),
      disabled: FAR[home].every((r) => taken.regions.has(r)) ? taken.regions.get(FAR[home][0]) : undefined },
    country(neighbour),
    { id: "Europe", label: "Europe", state: europe.state, disabled: europe.of === 0 ? "another zone" : undefined },
    { id: "rest", label: "Everywhere else", state: p.restOfWorld ? "all" : "none", disabled: taken.restOfWorld ?? undefined },
  ];
}

export function applyQuickPick(p: Picks, id: string, home: RegionCountry, taken: Taken = EMPTY_TAKEN): Picks {
  if (id === "rest") return everywhereElse(!p.restOfWorld);
  if (id === "Europe") return toggleContinent(p, "Europe", taken);
  if (id === "far") {
    const open = FAR[home].filter((r) => !taken.regions.has(r));
    if (regionsState(p, FAR[home], taken) === "all") {
      // Off again: when the home country is picked whole, keep the rest of it.
      let next = p;
      for (const r of open) if (regionState(next, r)) next = toggleRegion(next, r, taken);
      return next;
    }
    const cc = countryOfRegion(FAR[home][0]);
    const base = p.countries.includes(cc) ? p : { ...p };
    return { ...base, restOfWorld: false, regions: [...base.regions, ...open.filter((r) => !regionState(base, r))] };
  }
  return toggleCountry(p, id, taken);
}

/* ── What the zone covers, in words ────────────────────────────────── */

/** Places in the zone: whole continents collapse to one chip, many states of one country to "12 states". */
export type Chip = { key: string; label: string; count?: number; remove: (p: Picks) => Picks };

export function pickedChips(p: Picks, taken: Taken = EMPTY_TAKEN): Chip[] {
  if (p.restOfWorld) return [{ key: "rest", label: "Everywhere else", remove: () => everywhereElse(false) }];
  const chips: Chip[] = [];
  const shown = new Set<string>();
  for (const cont of CONTINENTS) {
    const s = continentState(p, cont, taken);
    if (s.state === "all" && s.of > 1) {
      chips.push({ key: `cont-${cont}`, label: `All of ${cont}`, count: s.of, remove: (x) => toggleContinent(x, cont, taken) });
      for (const c of openCountries(cont, taken)) shown.add(c.code);
    }
  }
  for (const code of [...p.countries].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))) {
    if (shown.has(code)) continue;
    chips.push({ key: code, label: nameOf(code), remove: (x) => toggleCountry(x, code, taken) });
  }
  const byCountry = new Map<string, string[]>();
  for (const r of p.regions) byCountry.set(countryOfRegion(r), [...(byCountry.get(countryOfRegion(r)) || []), r]);
  for (const [cc, rs] of byCountry) {
    if (rs.length > 4) {
      chips.push({ key: `regions-${cc}`, label: `${rs.length} ${cc === "CA" ? "provinces" : "states"} in ${nameOf(cc)}`, count: rs.length,
        remove: (x) => ({ ...x, regions: x.regions.filter((r) => countryOfRegion(r) !== cc) }) });
    } else {
      for (const r of rs) chips.push({ key: r, label: regionNameOf(r), remove: (x) => ({ ...x, regions: x.regions.filter((y) => y !== r) }) });
    }
  }
  return chips;
}

/** How many places the zone holds, counting a country picked whole as one. */
export const placeCount = (p: Picks) => p.countries.length + p.regions.length;

/** A name for the zone from what it holds, so the owner never has to invent one. */
export function suggestName(p: Picks, taken: Taken = EMPTY_TAKEN): string {
  if (p.restOfWorld) return "Everywhere else";
  if (isEmpty(p)) return "";
  const parts: string[] = [];
  const covered = new Set<string>();
  for (const cont of CONTINENTS) {
    const s = continentState(p, cont, taken);
    if (s.state === "all" && s.of > 1) { parts.push(cont); for (const c of openCountries(cont, taken)) covered.add(c.code); }
  }
  for (const code of p.countries) if (!covered.has(code)) parts.push(nameOf(code));
  const byCountry = new Map<string, string[]>();
  for (const r of p.regions) byCountry.set(countryOfRegion(r), [...(byCountry.get(countryOfRegion(r)) || []), r]);
  for (const [cc, rs] of byCountry) {
    const group = (REGION_GROUPS[cc as RegionCountry] || []).find((g) => g.codes.length === rs.length && g.codes.every((c) => rs.includes(`${cc}-${c}`)));
    const far = FAR[cc as RegionCountry];
    if (group) parts.push(group.label);
    else if (far && far.length === rs.length && far.every((r) => rs.includes(r))) parts.push(FAR_LABEL[cc as RegionCountry]);
    else if (rs.length > 3) parts.push(`${rs.length} ${cc === "CA" ? "provinces" : "states"}`);
    else parts.push(...rs.map(regionNameOf));
  }
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
  if (parts.length === 3) return `${parts[0]}, ${parts[1]} & ${parts[2]}`;
  return `${parts[0]} and ${parts.length - 1} more`;
}

/** What the zone page saves: codes only, with no leftovers from the older continent list. */
export function zoneFromPicks<T extends ZoneIn>(zone: T, p: Picks, name: string): T {
  return {
    ...zone, name,
    countries: p.restOfWorld ? [] : [...p.countries],
    regions: p.restOfWorld ? [] : [...p.regions],
    continents: [],
    restOfWorld: p.restOfWorld,
  };
}

export const hasStates = hasRegions;
export const statesOf = (code: string) => regionList(code).map(([rc, name]) => ({ code: `${code}-${rc}`, name }));

/** One line for the profile's zone list: "All of Europe, Canada, Alaska". */
export function zoneSummary(zone: ZoneIn): string {
  const p = picksOf(zone);
  if (p.restOfWorld) return "Everywhere else";
  const words = pickedChips(p).map((c) => c.label);
  if (words.length === 0) return String(zone.region || "").trim() || "No places yet";
  return words.length > 6 ? `${words.slice(0, 5).join(", ")} and ${words.length - 5} more` : words.join(", ");
}

/** True when no zone of the profile catches shoppers from places the others leave out. */
export const lacksEverywhereElse = (zones: ZoneIn[]) => zones.length > 0 && !zones.some((z) => isCatchAllZone({ region: z.region || "", base: 0, additional: 0, restOfWorld: z.restOfWorld }));
