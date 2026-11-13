import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { becameFairHelper, fairHelperInviteEmail, inviteKey, inviteLink, teamChange, teamInviteEmail } = require("./teamInvite");

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

describe("every Team role gets an invitation", () => {
  const at = (ms) => ({ toMillis: () => ms });
  it("is sent when someone is added or the owner asks again, never for a sign-in stamp or a name", () => {
    expect(teamChange(null, { role: "staff" })).toEqual({ invite: true, teamChanged: true });
    expect(teamChange({ role: "staff" }, { role: "staff", lastSignInAt: at(5) })).toEqual({ invite: false, teamChanged: false });
    expect(teamChange({ role: "staff" }, { role: "staff", name: "Sam" })).toEqual({ invite: false, teamChanged: false });
    expect(teamChange({ role: "staff", inviteRequestedAt: at(1) }, { role: "staff", inviteRequestedAt: at(2) })).toEqual({ invite: true, teamChanged: false });
    expect(teamChange({ role: "staff" }, { role: "owner" })).toEqual({ invite: false, teamChanged: true });
    expect(teamChange({ role: "staff" }, null)).toEqual({ invite: false, teamChanged: true });
  });

  it("claims each invite once: a re-add or Send again is a new one", () => {
    expect(inviteKey(" Sam@X.example ", { addedAt: at(10) })).toBe("team-sam@x.example-10");
    expect(inviteKey("sam@x.example", { addedAt: at(10), inviteRequestedAt: at(20) })).toBe("team-sam@x.example-20");
  });

  it("links to the admin with the invited address, or the stockroom for an author", () => {
    expect(inviteLink("https://moth.example/", "staff", "Sam@X.example")).toBe("https://moth.example/admin?invite=sam%40x.example");
    expect(inviteLink("https://moth.example", "author", "a@x.example")).toBe("https://moth.example/stockroom/app");
    expect(inviteLink("", "staff", "a@x.example")).toBe("");
  });

  it("says what the role can do and which Google account to use", () => {
    const staff = teamInviteEmail({ email: "sam@x.example", role: "staff", shopName: "Moth Press", siteUrl: "https://moth.example", invitedBy: "owner@moth.example" });
    expect(staff.subject).toBe("You're on Moth Press's team");
    expect(staff.html).toContain("owner@moth.example has added you");
    expect(staff.html).toContain("Payments, email connections and the Team stay with the owner");
    expect(staff.html).toContain("<strong>sam@x.example</strong>");
    expect(staff.html).toContain('href="https://moth.example/admin?invite=sam%40x.example"');
    const accountant = teamInviteEmail({ email: "b@x.example", role: "bookkeeper", shopName: "Moth", siteUrl: "https://moth.example" });
    expect(accountant.subject).toBe("Your access to Moth's books");
    expect(accountant.html).toContain("to Moth's team as their accountant");
    expect(accountant.html).toContain("expenses with their receipts, the ledger, profit and loss");
    expect(accountant.html).toContain("can't change anything");
    expect(accountant.html).toContain('href="https://moth.example/admin?invite=b%40x.example">Open the books');
    expect(teamInviteEmail({ email: "c@x.example", role: "owner", shopName: "Moth" }).html).toContain("a co-owner");
    expect(teamInviteEmail({ email: "f@x.example", role: "fairHelper", shopName: "Moth", siteUrl: "https://moth.example" }).subject).toBe("You're a fair helper for Moth");
    expect(teamInviteEmail({ email: "x@x.example", role: "boss", shopName: "Moth" })).toBeNull();
    expect(teamInviteEmail({ email: "s@x.example", role: "staff", shopName: "<i>Moth</i>" }).html).not.toContain("<i>");
  });
});
