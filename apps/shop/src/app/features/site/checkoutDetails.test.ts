import { describe, expect, test } from "vitest";
import { checkoutDetailProblems, expressWalletEnabled, postalCodeOptional, detailInputId } from "./checkoutDetails";

const base = { name: "Ada", email: "ada@example.com", digitalOnly: false, needsDeliveryAddress: true };
const addr = (over: Partial<{ street: string; city: string; state: string; zip: string; country: string }>) => ({ street: "1 Main", city: "Utrecht", state: "", zip: "3511 AB", country: "Netherlands", ...over });

describe("checkout field problems", () => {
  test("#22 a Dutch address without a province is complete; Canada still needs one", () => {
    expect(checkoutDetailProblems({ ...base, address: addr({}) })).toEqual([]);
    expect(checkoutDetailProblems({ ...base, address: addr({ country: "Canada", city: "Toronto", zip: "M5V 2T6" }) }).map(p => p.field)).toEqual(["state"]);
    expect(checkoutDetailProblems({ ...base, address: addr({ country: "United States" }) }).map(p => p.field)).toEqual(["state"]);
  });

  test("#22 countries without postal codes may leave it empty; others may not", () => {
    expect(postalCodeOptional("Hong Kong")).toBe(true);
    expect(postalCodeOptional("United Arab Emirates")).toBe(true);
    expect(postalCodeOptional("Netherlands")).toBe(false);
    expect(checkoutDetailProblems({ ...base, address: addr({ country: "Hong Kong", zip: "" }) })).toEqual([]);
    expect(checkoutDetailProblems({ ...base, address: addr({ zip: "" }) }).map(p => p.field)).toEqual(["zip"]);
  });

  test("#24 each missing field is named, in page order, with its own message", () => {
    const problems = checkoutDetailProblems({ ...base, name: "", email: "nope", address: addr({ street: "", city: "", country: "Canada", zip: "" }) });
    expect(problems.map(p => p.field)).toEqual(["email", "name", "street", "city", "state", "zip"]);
    expect(problems[0].copyKey).toBe("coErrEmailFormat");
    expect(new Set(problems.map(p => p.copyKey)).size).toBe(problems.length);
    expect(detailInputId("zip")).toBe("co-field-zip");
  });

  test("#77 an e-book-only bag asks only for country and, where listed, province, with its own wording", () => {
    const digital = { ...base, digitalOnly: true, needsDeliveryAddress: false };
    expect(checkoutDetailProblems({ ...digital, address: addr({ country: "Canada", street: "", city: "", zip: "" }) })).toEqual([{ field: "state", copyKey: "coErrFieldStateDigital" }]);
    expect(checkoutDetailProblems({ ...digital, address: addr({ street: "", city: "", zip: "" }) })).toEqual([]);
  });

  test("#75 the express wallet stays off until the details are valid", () => {
    const ready = { isCompleting: false, canPay: true, needsDeliveryChoice: false, catalogReady: true, total: 20 };
    const incomplete = checkoutDetailProblems({ ...base, email: "", address: addr({ street: "" }) });
    expect(expressWalletEnabled({ ...ready, problems: incomplete })).toBe(false);
    expect(expressWalletEnabled({ ...ready, problems: [] })).toBe(true);
    expect(expressWalletEnabled({ ...ready, problems: [], needsDeliveryChoice: true })).toBe(false);
    expect(expressWalletEnabled({ ...ready, problems: [], total: 0 })).toBe(false);
    // Style › Checkout › policy tick box: the wallet waits until it is ticked (missing = not asked).
    expect(expressWalletEnabled({ ...ready, problems: [], termsAccepted: false })).toBe(false);
    expect(expressWalletEnabled({ ...ready, problems: [], termsAccepted: true })).toBe(true);
  });

  test("pickup without an address asks for no address fields", () => {
    expect(checkoutDetailProblems({ ...base, needsDeliveryAddress: false, address: addr({ street: "", city: "", zip: "" }) })).toEqual([]);
  });
});
