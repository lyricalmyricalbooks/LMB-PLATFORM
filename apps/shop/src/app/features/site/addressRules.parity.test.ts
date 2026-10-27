import { describe, it, expect } from "vitest";
import * as client from "./addressRules";
import { NO_POSTAL_CODE as CHECKOUT_LIST } from "./checkoutDetails";
// @ts-ignore - CommonJS server module
import * as serverModule from "../../../../functions/shared/addressRules.js";
const server: any = (serverModule as any).default ?? serverModule;

describe("server and browser address rules", () => {
  it("share the no-postal-code and province lists", () => {
    expect([...server.NO_POSTAL_CODE].sort()).toEqual([...client.NO_POSTAL_CODE].sort());
    // The checkout form is the source of truth for the no-postcode list.
    expect([...server.NO_POSTAL_CODE].sort()).toEqual([...CHECKOUT_LIST].sort());
    expect([...server.REGION_COUNTRIES].sort()).toEqual([...client.REGION_COUNTRIES].sort());
  });
  it("find the same missing boxes", () => {
    const cases = [
      { street: "1 Main", city: "Toronto", state: "", zip: "", country: "Canada" },
      { street: "1 Main", city: "Doha", state: "", zip: "", country: "Qatar" },
      { street: "1 Main", city: "Doha", state: "", zip: "", country: "QA" },
      { street: "1 Rue", city: "Paris", state: "", zip: "75001", country: "France" },
      { street: "1 Rue", city: "Paris", state: "", zip: "", country: "France" },
      { street: "", city: "", state: "", zip: "", country: "" },
      { street: "1 Main", city: "Austin", state: "TX", zip: "", country: "United States" },
    ];
    for (const address of cases) expect(client.addressMissing(address)).toEqual(server.addressMissing(address));
  });
  it("asks Canada and the US for a province, and nobody else", () => {
    expect(server.addressMissing({ street: "1", city: "c", zip: "z", country: "Canada" })).toEqual(["state"]);
    expect(server.addressMissing({ street: "1", city: "c", zip: "z", country: "France" })).toEqual([]);
  });
  it("accepts a country with no postal code and no province", () => {
    expect(server.addressMissing({ street: "1 Corniche", city: "Doha", country: "Qatar" })).toEqual([]);
    expect(server.addressMissing({ street: "1 Corniche", city: "Hong Kong", country: "HK" })).toEqual([]);
  });
});
