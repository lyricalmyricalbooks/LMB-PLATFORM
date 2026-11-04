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

  it("picks the shopper's language from the order", () => {
    expect(french.emailLanguage({ locale: "fr-CA" })).toBe("fr");
    expect(french.emailLanguage({ locale: "FR" })).toBe("fr");
    expect(french.emailLanguage({ locale: "en-CA" })).toBe("en");
    expect(french.emailLanguage({ locale: "fry" })).toBe("en");
    expect(french.emailLanguage({})).toBe("en");
  });
});
