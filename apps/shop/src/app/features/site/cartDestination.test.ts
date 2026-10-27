// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { readCartDestination, saveCartDestination, prefillCartAddress } from "./cartDestination";
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });
test("preserves the estimate destination through checkout reload", () => { saveCartDestination({ country: " Canada ", postalCode: " M6G 3H1 " }); expect(readCartDestination()).toEqual({ country: "Canada", postalCode: "M6G 3H1" }); });
test("rejects corrupt or incomplete storage", () => { sessionStorage.setItem("lm-cart-destination-v1", "broken"); expect(readCartDestination()).toBeNull(); saveCartDestination({ country: "Canada", postalCode: "" }); expect(readCartDestination()).toBeNull(); });
test("unavailable browser storage never blocks checkout", () => { vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error(); }); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error(); }); expect(readCartDestination()).toBeNull(); expect(() => saveCartDestination({ country: "Canada", postalCode: "M6G" })).not.toThrow(); });

test("uses a matching account address without replacing the preview destination", () => {
  const current = { street: "", unit: "", city: "", state: "", zip: "M6G 3H1", country: "Canada" };
  const source = { street: "1 Main", unit: "2", city: "Toronto", state: "ON", zip: "m6g3h1", country: "CA" };
  expect(prefillCartAddress(current, source, { country: "Canada", postalCode: "M6G 3H1" })).toEqual({ ...source, zip: "M6G 3H1", country: "Canada" });
  expect(prefillCartAddress({ ...current, street: "My edited street" }, source, { country: "Canada", postalCode: "M6G 3H1" }).street).toBe("My edited street");
});
test("a mismatched saved/recovered address cannot mix street data with a new destination", () => {
  const current = { street: "", unit: "", city: "", state: "", zip: "90210", country: "United States" };
  expect(prefillCartAddress(current, { street: "1 Main", city: "Toronto", zip: "M6G3H1", country: "Canada" }, { country: "United States", postalCode: "90210" })).toEqual(current);
});

test("late account data cannot overwrite a destination edited in checkout", () => {
  const current = { street: "", city: "", zip: "75001", country: "France" };
  const source = { street: "1 Main", city: "Toronto", zip: "M6G3H1", country: "Canada" };
  expect(prefillCartAddress(current, source, { country: "Canada", postalCode: "M6G3H1" })).toEqual(current);
});
