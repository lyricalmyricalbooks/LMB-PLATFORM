import { describe, expect, it } from "vitest";
const { sellerSection } = require("./sellerDetails");

const link = (p) => `https://moth.example${p}`;
const website = {
  info: { name: "Moth Press", email: "hello@moth.example" },
  location: { street: "12 Paper Lane", city: "Halifax", state: "NS", zip: "B3H 1A1", country: "Canada" },
  policies: { returns: "Thirty days.", terms: "Our terms.", shipping: "", privacy: "We keep little." },
};

describe("seller details on the order confirmation", () => {
  it("names the seller, its address and email, and links each written policy", () => {
    const html = sellerSection(website, link, "Fallback");
    expect(html).toContain("Sold by Moth Press, 12 Paper Lane, Halifax, NS, B3H 1A1, Canada, hello@moth.example.");
    expect(html).toContain('href="https://moth.example/page/policy-returns"');
    expect(html).toContain('href="https://moth.example/page/policy-terms"');
    expect(html).toContain('href="https://moth.example/page/policy-privacy"');
    expect(html).not.toContain("policy-shipping");
  });
  it("escapes what the owner typed and says nothing when nothing is known", () => {
    expect(sellerSection({ info: { name: "<b>X</b>" } }, link, "")).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(sellerSection({ info: { name: "Your Press" } }, link, "")).toBe("");
  });
});
