import { describe, expect, it } from "vitest";
import { COUNTRIES } from "./shippingZones";
import { flagEmoji, guessCountryName, matchCountries, orderedCountries, parsePinned } from "./countryPicker";

const pins = parsePinned(undefined);
const names = (q: string) => matchCountries(q, pins).map(c => c.name);

describe("country picker", () => {
  it("pins Canada, the US and Europe first, then A–Z", () => {
    const { pinned, rest } = orderedCountries(pins);
    expect(pinned.slice(0, 3).map(c => c.code)).toEqual(["CA", "US", "GB"]);
    expect(rest.map(c => c.name)).toEqual([...rest.map(c => c.name)].sort((a, b) => a.localeCompare(b)));
    expect(pinned.length + rest.length).toBe(COUNTRIES.length);
  });
  it("finds countries from the first letters", () => {
    expect(names("can")[0]).toBe("Canada");
    expect(names("ca")[0]).toBe("Canada");
    expect(names("uni")[0]).toBe("United States");
    expect(names("fr")[0]).toBe("France");
  });
  it("understands common nicknames and codes", () => {
    expect(names("usa")[0]).toBe("United States");
    expect(names("uk")[0]).toBe(COUNTRIES.find(c => c.code === "GB")!.name);
    expect(names("england")[0]).toBe(COUNTRIES.find(c => c.code === "GB")!.name);
    expect(names("holland")[0]).toBe("Netherlands");
  });
  it("ignores unknown pinned codes", () => expect(parsePinned("CA, XX, us")).toEqual(["CA", "US"]));
  it("makes flags and guesses from the browser language", () => {
    expect(flagEmoji("CA")).toBe("🇨🇦");
    expect(guessCountryName(["en-CA", "en"])).toBe("Canada");
    expect(guessCountryName(["fr"])).toBeNull();
  });
});
