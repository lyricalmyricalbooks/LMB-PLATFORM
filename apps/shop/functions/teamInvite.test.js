import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { becameFairHelper, fairHelperInviteEmail } = require("./teamInvite");

describe("fair helper invitation", () => {
  it("is sent when someone becomes a fair helper, never again on a later edit", () => {
    expect(becameFairHelper(null, { role: "fairHelper" })).toBe(true);
    expect(becameFairHelper({ role: "staff" }, { role: "fairHelper" })).toBe(true);
    expect(becameFairHelper({ role: "fairHelper" }, { role: "fairHelper", note: "x" })).toBe(false);
    expect(becameFairHelper({ role: "fairHelper" }, null)).toBe(false);
    expect(becameFairHelper(null, { role: "staff" })).toBe(false);
  });

  it("tells the helper where the till is and which address to sign in with", () => {
    const email = fairHelperInviteEmail({ email: " Sam@Example.com ", shopName: "Moth Press", tillLink: "https://moth.example/stockroom/app" });
    expect(email.to).toBe("sam@example.com");
    expect(email.subject).toBe("You're a fair helper for Moth Press");
    expect(email.html).toContain('href="https://moth.example/stockroom/app"');
    expect(email.html).toContain("sign in with Google as <strong>sam@example.com</strong>");
  });

  it("escapes the shop name and refuses an address that can't take mail", () => {
    expect(fairHelperInviteEmail({ email: "sam@example.com", shopName: "<b>Moth</b>", tillLink: "" }).html).not.toContain("<b>Moth</b>");
    expect(fairHelperInviteEmail({ email: "not an address", shopName: "Moth" })).toBeNull();
  });
});
