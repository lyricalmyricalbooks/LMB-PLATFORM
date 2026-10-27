import { describe, it, expect } from "vitest";
const { explainEmailError } = require("./emailErrors");

describe("explainEmailError", () => {
  it("tells the owner to set the key when it is missing or invalid", () => {
    expect(explainEmailError("Missing API key", { fromEmail: "orders@shop.com" })).toMatch(/RESEND_API_KEY/);
    expect(explainEmailError("API key is invalid", { fromEmail: "orders@shop.com" })).toMatch(/missing or invalid/);
  });

  it("explains the sandbox limit with the sender domain", () => {
    const msg = explainEmailError("You can only send testing emails to your own email address (owner@gmail.com).", { fromEmail: "orders@shop.com", usedSandbox: true });
    expect(msg).toMatch(/shop\.com is not verified/);
    expect(msg).toMatch(/resend\.com\/domains/);
  });

  it("names the unverified domain", () => {
    expect(explainEmailError("The shop.com domain is not verified.", { fromEmail: "orders@shop.com" })).toMatch(/^shop\.com is not verified/);
  });

  it("passes other errors through", () => {
    expect(explainEmailError("Rate limit exceeded", { fromEmail: "a@b.com" })).toBe("Rate limit exceeded");
  });
});
