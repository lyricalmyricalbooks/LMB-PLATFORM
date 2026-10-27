import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const { addressKeyProblem, predictionsToRows, componentsToAddress, handleAddressLookup } = createRequire(import.meta.url)("./addressLookup");

const KEY = "AIza" + "x".repeat(35);
const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const deps = (over = {}) => ({ readKey: async () => KEY, allow: async () => true, isAdmin: async () => true, fetchImpl: vi.fn(), ...over });

const COMPONENTS = [
  { longText: "456", shortText: "456", types: ["street_number"] },
  { longText: "Montrose Avenue", shortText: "Montrose Ave", types: ["route"] },
  { longText: "Old Toronto", shortText: "Old Toronto", types: ["sublocality_level_1", "sublocality", "political"] },
  { longText: "Toronto", shortText: "Toronto", types: ["locality", "political"] },
  { longText: "Ontario", shortText: "ON", types: ["administrative_area_level_1", "political"] },
  { longText: "Canada", shortText: "CA", types: ["country", "political"] },
  { longText: "M6G 3H1", shortText: "M6G 3H1", types: ["postal_code"] },
];

describe("address finder (Google Places)", () => {
  it("accepts only Google-shaped keys", () => {
    expect(addressKeyProblem(KEY)).toBe("");
    expect(addressKeyProblem("")).toMatch(/Enter/);
    expect(addressKeyProblem("sk_live_123")).toMatch(/AIza/);
  });

  it("turns address components into checkout fields with the postal code", () => {
    expect(componentsToAddress(COMPONENTS)).toEqual({
      street: "456 Montrose Avenue", unit: "", city: "Toronto", stateCode: "ON", stateName: "Ontario",
      zip: "M6G 3H1", country: "CA", hasNumber: true,
    });
  });

  it("keeps the unit and writes the number after the street where that is the local form", () => {
    const de = componentsToAddress([
      { longText: "5", types: ["street_number"] }, { longText: "Hauptstraße", types: ["route"] },
      { longText: "3", types: ["subpremise"] }, { longText: "Berlin", types: ["locality"] },
      { longText: "Deutschland", shortText: "DE", types: ["country"] }, { longText: "10115", types: ["postal_code"] },
    ]);
    expect(de).toMatchObject({ street: "Hauptstraße 5", unit: "3", city: "Berlin", country: "DE", zip: "10115" });
  });

  it("drops predictions that are only a city or region", () => {
    const rows = predictionsToRows({ suggestions: [
      { placePrediction: { placeId: "ChIJcity000001", types: ["locality", "political"], text: { text: "Toronto, ON, Canada" } } },
      { placePrediction: { placeId: "ChIJaddress001", types: ["street_address"], text: { text: "456 Montrose Ave, Toronto, ON, Canada" },
        structuredFormat: { mainText: { text: "456 Montrose Ave" }, secondaryText: { text: "Toronto, ON, Canada" } } } },
      { queryPrediction: { text: { text: "pizza" } } },
    ] });
    expect(rows).toEqual([{ placeId: "ChIJaddress001", label: "456 Montrose Ave, Toronto, ON, Canada", main: "456 Montrose Ave", secondary: "Toronto, ON, Canada" }]);
  });

  it("asks Google for the chosen country with the session token, key in a header", async () => {
    const d = deps();
    d.fetchImpl.mockResolvedValue(reply(200, { suggestions: [] }));
    const out = await handleAddressLookup({ action: "addressSuggest", query: "456 montrose", country: "CA", sessionToken: "abc12345-6789" }, d);
    expect(out).toEqual({ status: 200, body: { provider: "google", items: [] } });
    const [url, init] = d.fetchImpl.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(url).not.toContain(KEY);
    expect(init.headers["X-Goog-Api-Key"]).toBe(KEY);
    expect(JSON.parse(init.body)).toEqual({ input: "456 montrose", languageCode: "en", includedRegionCodes: ["ca"], sessionToken: "abc12345-6789" });
  });

  it("reads only the address components of the picked place", async () => {
    const d = deps();
    d.fetchImpl.mockResolvedValue(reply(200, { addressComponents: COMPONENTS }));
    const out = await handleAddressLookup({ action: "addressDetails", placeId: "ChIJaddress001", sessionToken: "abc12345-6789" }, d);
    expect(out.body.address).toMatchObject({ street: "456 Montrose Avenue", zip: "M6G 3H1", country: "CA" });
    const [url, init] = d.fetchImpl.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places/ChIJaddress001?languageCode=en&sessionToken=abc12345-6789");
    expect(init.headers["X-Goog-FieldMask"]).toBe("addressComponents");
  });

  it("tells the browser to use the free finder when no key is saved, Google fails, or the limit is reached", async () => {
    expect((await handleAddressLookup({ action: "addressSuggest", query: "456 montrose" }, deps({ readKey: async () => "" }))).body)
      .toEqual({ provider: "none", fallback: true });
    const failing = deps();
    failing.fetchImpl.mockResolvedValue(reply(403, { error: { message: "denied", status: "PERMISSION_DENIED" } }));
    expect(await handleAddressLookup({ action: "addressSuggest", query: "456 montrose" }, failing)).toEqual({ status: 502, body: { error: "unavailable", fallback: true } });
    expect((await handleAddressLookup({ action: "addressSuggest", query: "456 montrose" }, deps({ allow: async () => false }))).status).toBe(429);
  });

  it("refuses odd place ids and never sends a short query", async () => {
    const d = deps();
    expect((await handleAddressLookup({ action: "addressDetails", placeId: "../secret" }, d)).status).toBe(400);
    expect((await handleAddressLookup({ action: "addressSuggest", query: "45" }, d)).body.items).toEqual([]);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("checks the key for the admin only, in plain words", async () => {
    expect(await handleAddressLookup({ action: "addressKeyCheck" }, deps({ isAdmin: async () => false }))).toBeNull();
    const d = deps();
    d.fetchImpl.mockResolvedValue(reply(403, { error: { message: "Places API (New) has not been used", status: "PERMISSION_DENIED" } }));
    const out = await handleAddressLookup({ action: "addressKeyCheck" }, d);
    expect(out.body.ok).toBe(false);
    expect(out.body.error).toMatch(/Places API \(New\)/);
  });
});
