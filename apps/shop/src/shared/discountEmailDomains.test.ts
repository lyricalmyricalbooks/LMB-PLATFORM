import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { emailDomainAllowed } from "./discountMath";

// Discounts › a code › Allowed email domains. The owner may type ".edu", "school.example" or "@school.example"; checkout (the hint
// shown before paying) and the server (which decides) must read every form the same way.
describe("a code limited to some email domains", () => {
  it("reads '.example', 'school.example' and '@school.example' alike, sub-domains included", () => {
    expect(emailDomainAllowed("ada@uni.example", ".example")).toBe(true);
    expect(emailDomainAllowed("ada@school.example", "school.example")).toBe(true);
    expect(emailDomainAllowed("ada@school.example", "@school.example")).toBe(true);
    expect(emailDomainAllowed("Ada@Mail.School.example", " @School.example , other.example")).toBe(true);
    expect(emailDomainAllowed("ada@other.example", "@school.example, other.example")).toBe(true);
  });
  it("refuses look-alike domains and an empty email", () => {
    expect(emailDomainAllowed("ada@notschool.example", "school.example")).toBe(false);
    expect(emailDomainAllowed("ada@school.example.evil.example", "@school.example")).toBe(false);
    expect(emailDomainAllowed("", "school.example")).toBe(false);
  });
  it("lets everyone in when no domain is listed", () => {
    expect(emailDomainAllowed("ada@anywhere.example", "")).toBe(true);
    expect(emailDomainAllowed("ada@anywhere.example", " , ")).toBe(true);
  });
  it("is the one rule checkout and the server use", () => {
    const checkout = readFileSync(new URL("../app/Checkout.tsx", import.meta.url), "utf8");
    expect(checkout).toContain("emailDomainAllowed(");
    const server = readFileSync(new URL("../../functions/index.js", import.meta.url), "utf8");
    expect(server).toMatch(/emailDomainAllowed\(normalized, discount\.allowedEmailDomains\)/);
  });
});
