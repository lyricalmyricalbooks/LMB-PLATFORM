import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { emailDomainAllowed } from "./discountMath";

// Discounts › a code › Allowed email domains. The owner may type ".edu", "school.ca" or "@school.ca"; checkout (the hint
// shown before paying) and the server (which decides) must read every form the same way.
describe("a code limited to some email domains", () => {
  it("reads '.edu', 'school.ca' and '@school.ca' alike, sub-domains included", () => {
    expect(emailDomainAllowed("ada@mit.edu", ".edu")).toBe(true);
    expect(emailDomainAllowed("ada@school.ca", "school.ca")).toBe(true);
    expect(emailDomainAllowed("ada@school.ca", "@school.ca")).toBe(true);
    expect(emailDomainAllowed("Ada@Mail.School.CA", " @School.ca , other.org")).toBe(true);
    expect(emailDomainAllowed("ada@other.org", "@school.ca, other.org")).toBe(true);
  });
  it("refuses look-alike domains and an empty email", () => {
    expect(emailDomainAllowed("ada@notschool.ca", "school.ca")).toBe(false);
    expect(emailDomainAllowed("ada@school.ca.evil.com", "@school.ca")).toBe(false);
    expect(emailDomainAllowed("", "school.ca")).toBe(false);
  });
  it("lets everyone in when no domain is listed", () => {
    expect(emailDomainAllowed("ada@anywhere.com", "")).toBe(true);
    expect(emailDomainAllowed("ada@anywhere.com", " , ")).toBe(true);
  });
  it("is the one rule checkout and the server use", () => {
    const checkout = readFileSync(new URL("../app/Checkout.tsx", import.meta.url), "utf8");
    expect(checkout).toContain("emailDomainAllowed(");
    const server = readFileSync(new URL("../../functions/index.js", import.meta.url), "utf8");
    expect(server).toMatch(/emailDomainAllowed\(normalized, discount\.allowedEmailDomains\)/);
  });
});
