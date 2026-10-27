import { describe, it, expect } from "vitest";
import { COUNTRIES, findCountry, matchShippingZone } from "./shippingZones";
// @ts-ignore - CommonJS server module
import * as geoModule from "../../../../functions/shared/shippingZones.js";
const geo: any = (geoModule as any).default ?? geoModule;

describe("server and browser country tables", () => {
  it("list the same countries (code, name, continent)", () => {
    expect(geo.COUNTRIES.map(({ code, name, continent }: any) => ({ code, name, continent })))
      .toEqual(COUNTRIES.map(({ code, name, continent }) => ({ code, name, continent })));
  });
  it("resolve names, codes and aliases the same way", () => {
    for (const q of ["Canada", "ca", "usa", "UK", "Guam", "Réunion", "Nowhere"]) {
      expect(geo.resolveCountry(q)?.code ?? null).toBe(findCountry(q)?.code ?? null);
    }
  });
  it("match zones the same way, including zones saved with names", () => {
    const zones: any[] = [
      { id: "by-name", region: "x", base: 0, additional: 0, countries: ["France"] },
      { id: "by-code", region: "x", base: 0, additional: 0, countries: ["GU"] },
      { id: "europe", region: "x", base: 0, additional: 0, continents: ["Europe"] },
      { id: "row", region: "x", base: 0, additional: 0, restOfWorld: true },
    ];
    for (const q of ["France", "FR", "Guam", "Germany", "Japan", "Nowhere"]) {
      expect(geo.matchShippingZone(q, zones)?.id).toBe(matchShippingZone(q, zones)?.id);
    }
    expect(matchShippingZone("FR", zones)?.id).toBe("by-name");
  });
});
