// Tax receipts for registered charities (Donations & tips G3): the registration number, the owner's details, the giver's
// address, numbering and which gifts get one, against the shop's copy and the server's generated one.
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";
import * as shop from "./charityReceipts";

const server = createRequire(import.meta.url)("../../functions/shared/charityReceipts.js") as typeof shop;
const CA = { kind: "ca" as const, number: "123456789 RR 0001", name: "Moth Press Society", address: "1 Press St", signer: "Ada" };
const HOME = { street: "1 Main St", city: "Toronto", state: "on", zip: "m6g 3h1", country: "ca" };

describe.each([["shop", shop], ["server", server]])("charity receipts (%s copy)", (_name, r) => {
  test("a Canadian business number or a US tax ID, written the usual way", () => {
    expect(r.charityNumber(" 123456789 rr 0001 ")).toEqual({ kind: "ca", number: "123456789 RR 0001" });
    expect(r.charityNumber("123456789")).toEqual({ kind: "us", number: "12-3456789" });
    expect(r.charityNumber("1234567")).toBeNull();
    expect(r.charityNumber("12-3456789")).toEqual({ kind: "us", number: "12-3456789" });
    expect(r.charityNumber("123456789RT0001")).toBeNull();
    expect(r.charityNumber("")).toBeNull();
  });

  test("the owner's details: off, cleaned, or the field to fix", () => {
    expect(r.cleanCharity(null)).toEqual({ charity: null });
    expect(r.cleanCharity({ ...CA, on: false })).toEqual({ charity: null });
    expect(r.cleanCharity({ ...CA, name: "  Moth   Press Society " })).toEqual({ charity: CA });
    expect(r.cleanCharity({ ...CA, number: "x" })).toMatchObject({ field: "number" });
    expect(r.cleanCharity({ ...CA, name: " " })).toMatchObject({ field: "name" });
    expect(r.cleanCharity({ ...CA, address: "" })).toMatchObject({ field: "address" });
    expect(r.cleanCharity({ ...CA, signer: "" })).toMatchObject({ field: "signer" });
    expect(r.cleanCharity({ ...CA, number: "12-3456789", signer: "" })).toMatchObject({ charity: { kind: "us", signer: "" } });
  });

  test("the giver's address is whole or nothing", () => {
    expect(r.cleanReceiptAddress(HOME)).toEqual({ street: "1 Main St", street2: "", city: "Toronto", state: "ON", zip: "M6G 3H1", country: "CA" });
    expect(r.cleanReceiptAddress({ ...HOME, city: "" })).toBeNull();
    expect(r.cleanReceiptAddress({ ...HOME, country: "Canada" })).toBeNull();
    expect(r.receiptAddressLine(r.cleanReceiptAddress(HOME))).toBe("1 Main St, Toronto, ON M6G 3H1, CA");
    expect(r.receiptAddressLine(null)).toBe("");
  });

  test("numbers run per year, test gifts on their own", () => {
    expect(r.receiptNumber(2026, 12)).toBe("2026-00012");
    expect(r.receiptNumber(2026, 1, true)).toBe("TEST-2026-00001");
    expect(r.receiptCounterId(2026)).toBe("2026");
    expect(r.receiptCounterId(2026, true)).toBe("test-2026");
  });

  test("who gets one and for how much", () => {
    const gift = { amountMinor: 2500, feeMinor: 106, receiptAsked: true, receiptAddress: HOME };
    expect(r.receiptEligibleMinor(gift, CA)).toBe(2606);
    expect(r.receiptEligibleMinor(gift, null)).toBe(0);
    expect(r.receiptEligibleMinor({ ...gift, receiptAsked: false }, CA)).toBe(0);
    expect(r.receiptEligibleMinor({ ...gift, reward: { id: "rw1" } }, CA)).toBe(0);
    expect(r.receiptEligibleMinor({ ...gift, receiptAddress: null }, CA)).toBe(0);
    expect(r.receiptEligibleMinor({ ...gift, receiptAddress: null }, { ...CA, kind: "us" })).toBe(2606);
  });
});
