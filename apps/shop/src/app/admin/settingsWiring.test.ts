// Every on/off switch in the shop's settings (Settings › Payments, Taxes, General, …) must change what happens, and the
// switches that decide money must be read by the server, not only by the checkout page: a direct call skips the page.
// PayPal checkout, Stripe checkout, Apple Pay and Google Pay and a book's "Charge sales tax" were all saved and then
// ignored somewhere until 12 November 2026. Each switch below names the files that read it and what that read looks like.
// A new on/off value in the starting settings fails here until it is wired up (or listed as having no switch on screen).
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { defaultSettings } from "./defaultSettings";

const ROOT = new URL("../../../", import.meta.url);
const source = (file: string) => readFileSync(new URL(file, ROOT), "utf8");

/** Switch path in `settings/website` → [file, the read] for each place it takes effect. */
const WIRED: Record<string, Array<[string, RegExp]>> = {
  "payments.testMode": [["functions/payments/stripe.js", /data\(\)\?\.payments\?\.testMode/]],
  "payments.stripe.connected": [
    ["functions/checkoutPayment.js", /settings\.payments\?\.stripe\?\.connected !== true/],
    ["src/app/Checkout.tsx", /payments\.stripe\?\.connected/],
  ],
  "payments.paypal.connected": [["functions/index.js", /config\.settingsPaypal\.connected !== true/]],
  "payments.stripe.applePay": [
    ["src/app/features/site/walletChoice.ts", /applePay === false/],
    ["src/app/features/site/StripeCardForm.tsx", /walletChoice\(wallets\)/],
  ],
  "payments.stripe.googlePay": [
    ["src/app/features/site/walletChoice.ts", /googlePay === false/],
    ["src/app/features/site/StripeCardForm.tsx", /walletChoice\(wallets\)/],
  ],
  "maintenance.enabled": [["functions/shopSettings.js", /settings\?\.maintenance\?\.enabled === true/]],
  "localFulfillment.enabled": [["src/shared/localFulfillment.ts", /!config\?\.enabled/], ["functions/index.js", /resolveLocalSelection\(settings\.localFulfillment/]],
};

/** On/off values in the starting settings with no switch on any screen and nothing reading them (kept so old saves load). */
const NO_SWITCH_ON_SCREEN = new Set([
  "inventory.tracking", "inventory.overselling", "checkout.requirePhone", "aiShield.blockTraining", "aiShield.blockShopping",
  "communications.orderReceipts", "communications.shippingStatus", "communications.abandonedCart", "communications.newOrderNotifications",
  "payments.stripe.afterpay", "payments.stripe.affirm", "payments.stripe.klarna", "payments.stripe.subscriptions",
  "payments.paypal.venmo", "payments.paypal.buyNowPayLater",
]);

/** Switches saved on other documents or on each product, which the starting settings don't hold. */
const WIRED_ELSEWHERE: Record<string, Array<[string, RegExp]>> = {
  "taxes.collect": [["functions/index.js", /if \(!taxCollectionOn\(settings\)\)/], ["src/app/features/site/taxRate.ts", /taxCollectionOn/]],
  "manualMethods[].enabled": [["functions/checkoutPayment.js", /method\.enabled === true/]],
  "book.chargeTax": [["src/shared/taxByKind.ts", /chargeTax !== false/], ["functions/index.js", /chargesTax\(booksById\[item\.id\]\)/], ["src/app/Checkout.tsx", /chargesTax\(/]],
};

function booleanPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "boolean") return [prefix];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, inner]) => booleanPaths(inner, prefix ? `${prefix}.${key}` : key));
}

describe("every settings switch is wired to where it takes effect", () => {
  test("each on/off value in the starting settings (outside Studio's design) is wired or has no switch on screen", () => {
    const { design: _design, ...settings } = defaultSettings();
    const unlisted = booleanPaths(settings).filter((path) => !WIRED[path] && !NO_SWITCH_ON_SCREEN.has(path));
    expect(unlisted).toEqual([]);
  });

  test.each(Object.entries({ ...WIRED, ...WIRED_ELSEWHERE }))("%s is read where it takes effect", (_path, readers) => {
    for (const [file, pattern] of readers) expect(source(file), file).toMatch(pattern);
  });

  test("a value with no switch on screen really has none: no admin screen or shop page reads it", () => {
    const files = readdirSync(new URL("src/app/", ROOT), { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$|defaultSettings\.ts$|features\/site\/types\.ts$/.test(file));
    const code = files.map((file) => source(`src/app/${file}`)).join("\n");
    for (const path of NO_SWITCH_ON_SCREEN) {
      const [parent, leaf] = path.split(".").slice(-2);
      expect(code, path).not.toMatch(new RegExp(`\\b${parent}\\??\\.${leaf}\\b`));
    }
  });
});
