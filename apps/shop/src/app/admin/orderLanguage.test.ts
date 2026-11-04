import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { orderInFrench } from "./orderLanguage";

const server = createRequire(import.meta.url)("../../../functions/emailFrench.js");

describe("the French tag on orders", () => {
  it("matches the language the server sends the order's emails in", () => {
    for (const locale of ["fr", "fr-CA", "FR-ca", "en-CA", "fry", "", undefined, 3]) {
      expect(orderInFrench({ locale }), String(locale)).toBe(server.emailLanguage({ locale }) === "fr");
    }
    expect(orderInFrench(null)).toBe(false);
  });
});
