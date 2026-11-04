import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { FRENCH_DEFAULTS } from "./emailFrenchDefaults";
import { PLACEHOLDERS, REQUIRED_PLACEHOLDERS_FR, templateProblems, withRequiredPlaceholders, type TemplateId } from "./emailTemplateChecks";

const require = createRequire(import.meta.url);
const french = require("../../../functions/emailFrench.js");
const outbox = require("../../../functions/emailOutbox.js");

describe("French customer emails in Settings › Notifications (code plan 25.9)", () => {
  it("shows the same French words the server sends", () => {
    expect(FRENCH_DEFAULTS).toEqual(JSON.parse(JSON.stringify(french.DEFAULT_NOTIFICATIONS_FR)));
  });

  it("uses only placeholders each email knows, so no French word is left blank", () => {
    for (const [id, fields] of Object.entries(FRENCH_DEFAULTS)) {
      expect(PLACEHOLDERS[id as TemplateId], id).toBeDefined();
      expect(templateProblems(id as TemplateId, fields, "fr"), id).toEqual([]);
    }
  });

  it("adds back the French gift-card code line exactly as the server does", () => {
    expect(REQUIRED_PLACEHOLDERS_FR).toEqual(outbox.REQUIRED_PLACEHOLDERS_FR);
    for (const body of ["Profitez-en!", "Code : {{ code }}"]) {
      expect(withRequiredPlaceholders("gift_card", body, "fr")).toBe(outbox.withRequiredPlaceholders("gift_card", body, "fr"));
    }
    expect(templateProblems("gift_card", { ...FRENCH_DEFAULTS.gift_card, body: "Profitez-en!" }, "fr")[0].text).toContain("Votre code de carte-cadeau");
  });

  it("a shop that doesn't sell books asks how the order was, not the book, also when the editor saved the books words", () => {
    const books = french.DEFAULT_NOTIFICATIONS_FR.review_request;
    expect(french.frenchTemplate("review_request", { sells: "clothing" }).subject).toBe("Comment trouvez-vous votre commande?");
    expect(french.frenchTemplate("review_request", { sells: "clothing" }).body).not.toMatch(/livre|lecteurs/);
    expect(french.frenchTemplate("review_request", { sells: "clothing", review_request: { fr: { ...books } } }).subject).toBe("Comment trouvez-vous votre commande?");
    expect(french.frenchTemplate("review_request", { sells: "clothing", review_request: { fr: { subject: "Votre avis?" } } }).subject).toBe("Votre avis?");
    expect(french.frenchTemplate("review_request", { sells: "books" }).subject).toBe(books.subject);
  });

  it("a shopper or gift-card sender with no name reads in French, never \"Bonjour there\"", () => {
    expect(french.frenchValues({ customer_name: "there", recipient_name: "there", sender_name: "Someone" }))
      .toEqual({ customer_name: "à vous", recipient_name: "à vous", sender_name: "Quelqu'un" });
    expect(french.frenchValues({ customer_name: "Ada" }).customer_name).toBe("Ada");
  });

  it("amounts read the French way in a French email", () => {
    const out = french.frenchValues({ total_price: "CA$1,234.50", amount: "US$12.00", order_id: "1001.50" });
    expect(out).toEqual({ total_price: "1\u202f234,50\u00a0$", amount: "12,00\u00a0$ US", order_id: "1001.50" });
    expect(french.frenchMoney("-€5.00")).toBe("-5,00\u00a0€");
    expect(french.frenchMoney("free")).toBe("free");
  });

  it("the payment link reminder names its closing day in French", () => {
    const links = require("../../../functions/paymentLinks.js");
    expect(links.closingDay("2026-11-14T20:00:00Z", "fr")).toBe("14 novembre 2026");
    expect(links.closingDay("2026-11-14T20:00:00Z")).toBe("November 14, 2026");
  });

  it("picks the shopper's language from the order", () => {
    expect(french.emailLanguage({ locale: "fr-CA" })).toBe("fr");
    expect(french.emailLanguage({ locale: "FR" })).toBe("fr");
    expect(french.emailLanguage({ locale: "en-CA" })).toBe("en");
    expect(french.emailLanguage({ locale: "fry" })).toBe("en");
    expect(french.emailLanguage({})).toBe("en");
  });
});
