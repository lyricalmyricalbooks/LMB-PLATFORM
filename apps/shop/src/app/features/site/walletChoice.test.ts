import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { walletChoice } from "./walletChoice";

describe("Apple Pay and Google Pay switches reach the card form", () => {
  it("a switch turned off hides that wallet; on or unset shows it", () => {
    expect(walletChoice({ applePay: false, googlePay: true })).toEqual({ applePay: "never", googlePay: "auto" });
    expect(walletChoice({ applePay: true, googlePay: false })).toEqual({ applePay: "auto", googlePay: "never" });
    expect(walletChoice(undefined)).toEqual({ applePay: "auto", googlePay: "auto" });
  });
  it("the card form and checkout use it (not a fixed \"auto\")", () => {
    const form = readFileSync(new URL("./StripeCardForm.tsx", import.meta.url), "utf8");
    expect(form).not.toMatch(/applePay: "auto"/);
    expect(form).toMatch(/walletChoice\(wallets\)/);
    const checkout = readFileSync(new URL("../../Checkout.tsx", import.meta.url), "utf8");
    expect(checkout).toMatch(/wallets=\{platformCard \? undefined : settings\?\.payments\?\.stripe\}/);
  });
});
