import { CONTINENTS, COUNTRIES, type Continent, type Country } from "../features/site/shippingZones";

export type ShippingZoneCountries = { id?: string; countries?: string[] };

const countryByValue = new Map(
  COUNTRIES.flatMap((country) => [
    [country.code.toLowerCase(), country],
    [country.name.toLowerCase(), country],
  ] as Array<[string, Country]>),
);

export function countryName(value: string) {
  return countryByValue.get(value.trim().toLowerCase())?.name || value;
}

// Zones are stored with ISO codes — that is what checkout matches on. The editor
// works with names, so convert on save. Unknown entries are dropped.
export function countryCode(value: string) {
  return countryByValue.get(String(value || "").trim().toLowerCase())?.code || null;
}

export function toCountryCodes(values: string[]) {
  return Array.from(new Set((values || []).map(countryCode).filter((code): code is string => !!code)));
}

export function assignedCountryNames(zones: ShippingZoneCountries[], activeZoneId?: string) {
  return new Set(
    zones
      .filter((zone) => zone.id !== activeZoneId)
      .flatMap((zone) => zone.countries || [])
      .map(countryName),
  );
}

export function remainingCountryNames(zones: ShippingZoneCountries[], activeZoneId?: string) {
  const assigned = assignedCountryNames(zones, activeZoneId);
  return COUNTRIES.map((country) => country.name).filter((name) => !assigned.has(name));
}

export function groupedCountries(search = ""): Array<{ continent: Continent; countries: Country[] }> {
  const query = search.trim().toLocaleLowerCase();
  const exactCode = COUNTRIES.some((country) => country.code.toLocaleLowerCase() === query);
  return CONTINENTS.map((continent) => ({
    continent,
    countries: COUNTRIES
      .filter((country) => (
        country.continent === continent
        // A two-letter query matches the code ("us") and names too ("Australia").
        && (!query || (exactCode && country.code.toLocaleLowerCase() === query)
          || country.name.toLocaleLowerCase().includes(query))
      ))
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.countries.length > 0);
}
