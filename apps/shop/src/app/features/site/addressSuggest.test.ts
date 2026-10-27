import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const functionFetch = vi.fn();
vi.mock("../../lib/functionsBase", () => ({ functionFetch: (...args: any[]) => functionFetch(...args) }));

import { applySuggestion, expandStreet, parseTypedAddress, resetAddressFinder, resolveAddress, searchAddresses, toSuggestion } from "./addressSuggest";

const json = (data: any, status = 200) => ({ ok: status < 300, status, json: async () => data });
const noKey = () => functionFetch.mockResolvedValue(json({ provider: "none", fallback: true }));
const photon = (features: any[]) => vi.fn(async () => json({ features: features.map(properties => ({ properties })) }));

beforeEach(() => { resetAddressFinder(); functionFetch.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe("parseTypedAddress", () => {
  it("reads the Canadian unit-house form and unit words before or after the street", () => {
    expect(parseTypedAddress("12-456 Montrose Ave", "ca")).toMatchObject({ unit: "12", number: "456", street: "Montrose Ave" });
    expect(parseTypedAddress("Apt 3, 456 Montrose Ave", "ca")).toMatchObject({ unit: "3", number: "456" });
    expect(parseTypedAddress("456 Montrose Ave Unit 5B, Toronto", "ca")).toMatchObject({ unit: "5B", number: "456", street: "Montrose Ave", tail: "Toronto" });
    expect(parseTypedAddress("456 Montrose Ave, Suite 200, Toronto", "ca")).toMatchObject({ unit: "200", tail: "Toronto" });
    expect(parseTypedAddress("456 Montrose Ave #7", "ca")).toMatchObject({ unit: "7", number: "456" });
    expect(parseTypedAddress("12 Rue Ste Anne", "ca")).toMatchObject({ unit: "", number: "12", street: "Rue Ste Anne" });
    expect(parseTypedAddress("12 Main St Unit B", "ca")).toMatchObject({ unit: "B", street: "Main St" });
  });
  it("keeps a Queens-style hyphenated house number whole in the US", () => {
    expect(parseTypedAddress("12-34 31st Ave", "us")).toMatchObject({ unit: "", number: "12-34", street: "31st Ave" });
  });
});

describe("expandStreet", () => {
  it("spells out the street type and direction at the end, never the name", () => {
    expect(expandStreet("Queen St W")).toBe("Queen street west");
    expect(expandStreet("montrose ave")).toBe("montrose avenue");
    expect(expandStreet("St Clair Ave W")).toBe("St Clair avenue west");
    expect(expandStreet("W 42nd St")).toBe("west 42nd street");
    expect(expandStreet("Avenue Rd")).toBe("Avenue road");
  });
});

describe("toSuggestion", () => {
  it("maps a Photon house result to checkout fields", () => {
    const s = toSuggestion({ housenumber: "456", street: "Montrose Avenue", city: "Toronto", state: "Ontario", postcode: "M6G 3H1", countrycode: "CA" }, "Canada");
    expect(s).toMatchObject({ street: "456 Montrose Avenue", city: "Toronto", state: "ON", zip: "M6G 3H1", country: "Canada", source: "osm" });
  });
  it("skips places that aren't street addresses", () => {
    expect(toSuggestion({ name: "Toronto", type: "city", countrycode: "CA" }, "Canada")).toBeNull();
  });
  it("keeps the typed number and drops a neighbour's postal code", () => {
    const s = toSuggestion({ housenumber: "12", street: "Montrose Avenue", city: "Toronto", state: "Ontario", postcode: "M6J 2T5", countrycode: "CA" }, "Canada", "456");
    expect(s).toMatchObject({ street: "456 Montrose Avenue", zip: "", state: "ON" });
  });
  it("finds the province from the postal code when Photon has none", () => {
    expect(toSuggestion({ housenumber: "1", street: "Rue X", city: "Montréal", postcode: "H2X 1Y4", countrycode: "CA" }, "Canada")?.state).toBe("QC");
  });
});

describe("searchAddresses (free OpenStreetMap finder)", () => {
  it("biases to the chosen country, filters out others and keeps the typed house number", async () => {
    noKey();
    const fetchMock = photon([
      { type: "street", name: "New Street", city: "Birmingham", countrycode: "GB" },
      { type: "street", name: "New Street", city: "Toronto", state: "Ontario", countrycode: "CA" },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const out = await searchAddresses("57 new st", "Canada");
    const url = String((fetchMock.mock.calls[0] as any[])[0]);
    expect(url).toContain("limit=25");
    expect(url).toContain("lat=45.5");
    expect(decodeURIComponent(url)).toContain("q=57 new street");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ street: "57 New Street", city: "Toronto", state: "ON", zip: "" });
  });

  it("ranks the house the shopper typed first and biases to their province", async () => {
    noKey();
    const fetchMock = photon([
      { type: "house", housenumber: "12", street: "Montrose Avenue", city: "Toronto", state: "Ontario", postcode: "M6J 2T5", countrycode: "CA" },
      { type: "house", housenumber: "456", street: "Montrose Avenue", city: "Toronto", state: "Ontario", postcode: "M6G 3H1", countrycode: "CA" },
      { type: "house", housenumber: "456", street: "Montrose Avenue", city: "Montreal", state: "Quebec", postcode: "H1A 1A1", countrycode: "CA" },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const out = await searchAddresses("12-456 montrose ave", "Canada", undefined, { state: "ON" });
    expect(String((fetchMock.mock.calls[0] as any[])[0])).toContain("lat=43.7");
    expect(out[0]).toMatchObject({ street: "456 Montrose Avenue", city: "Toronto", zip: "M6G 3H1", unit: "12" });
  });
});

describe("Google address finder", () => {
  it("lists Google's rows and fills the picked one from the place's components", async () => {
    functionFetch.mockResolvedValueOnce(json({ provider: "google", items: [{ placeId: "ChIJaddress001", label: "456 Montrose Ave, Toronto, ON, Canada", main: "456 Montrose Ave", secondary: "Toronto, ON, Canada" }] }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const [row] = await searchAddresses("Apt 3 456 montrose", "Canada", undefined, { sessionToken: "abc12345-6789" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(functionFetch.mock.calls[0][1].body)).toMatchObject({ action: "addressSuggest", country: "ca", sessionToken: "abc12345-6789" });
    expect(row).toMatchObject({ source: "google", placeId: "ChIJaddress001", unit: "3" });

    functionFetch.mockResolvedValueOnce(json({ provider: "google", address: { street: "456 Montrose Avenue", unit: "", city: "Toronto", stateCode: "ON", stateName: "Ontario", zip: "M6G 3H1", country: "CA", hasNumber: true } }));
    const full = await resolveAddress(row, "Apt 3 456 montrose", "abc12345-6789");
    expect(full).toMatchObject({ street: "456 Montrose Avenue", unit: "3", city: "Toronto", state: "ON", zip: "M6G 3H1", country: "Canada" });
  });

  it("keeps the typed house number when Google only matched the street", async () => {
    functionFetch.mockResolvedValueOnce(json({ provider: "google", address: { street: "Montrose Avenue", city: "Toronto", stateCode: "ON", zip: "", country: "CA", hasNumber: false } }));
    const full = await resolveAddress({ label: "Montrose Ave", placeId: "ChIJstreet0001", street: "", city: "", state: "", zip: "", country: "Canada", source: "google" }, "458 montrose");
    expect(full.street).toBe("458 Montrose Avenue");
  });

  it("falls back to OpenStreetMap when no key is saved, and stops asking the shop for a while", async () => {
    noKey();
    vi.stubGlobal("fetch", photon([]));
    await searchAddresses("456 montrose ave", "Canada");
    await searchAddresses("456 montrose aven", "Canada");
    expect(functionFetch).toHaveBeenCalledTimes(1);
  });
});

describe("applySuggestion", () => {
  const prev = { street: "1 Old Rd", unit: "", city: "Ottawa", state: "ON", zip: "K1A 0A1", country: "Canada" };
  it("never leaves the old postal code behind for a different town", () => {
    const next = applySuggestion(prev, { label: "", street: "456 Montrose Avenue", city: "Toronto", state: "ON", zip: "", country: "Canada", source: "osm" });
    expect(next).toEqual({ street: "456 Montrose Avenue", unit: "", city: "Toronto", state: "ON", zip: "", country: "Canada" });
  });
  it("keeps a postal code the shopper typed for the same town and fills the unit", () => {
    const next = applySuggestion(prev, { label: "", street: "2 Sparks St", unit: "4", city: "Ottawa", state: "", zip: "", country: "Canada", source: "osm" });
    expect(next).toMatchObject({ zip: "K1A 0A1", state: "ON", unit: "4" });
  });
  it("writes the unit into the street when the unit box is turned off", () => {
    const next = applySuggestion(prev, { label: "", street: "456 Montrose Avenue", unit: "12", city: "Toronto", state: "ON", zip: "M6G 3H1", country: "Canada", source: "osm" }, { unitField: false });
    expect(next.street).toBe("12-456 Montrose Avenue");
  });
});
