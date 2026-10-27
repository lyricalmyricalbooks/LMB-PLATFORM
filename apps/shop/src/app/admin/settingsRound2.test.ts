// Round-2 settings fixes (PR 7): PayPal and Resend secrets (#139, #140), nav entries (#141), the email sender (#141),
// a failed notifications load never saves defaults (#137). Already-fixed items are pinned too: tax rates (#37),
// maintenance mode (#38) and the location postal code/country (#138).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resendKeyProblem, scrubSavedSecrets, splitWebsiteSecrets } from "./privateKeys";
import { NAV } from "./riso/nav";
import { routeFromHash, SETTINGS_TABS } from "./adminRoute";
import { senderOf, senderProblems, withSender } from "./senderSettings";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("#139 PayPal client secrets are private and the ids are stored", () => {
  it("moves the client secrets to adminSecrets and blanks the public copy", () => {
    const { publicSettings, secrets } = splitWebsiteSecrets({ payments: { paypal: { connected: true, clientId: "id", testClientId: "tid", clientSecret: " sec ", testClientSecret: "tsec", clientSecretStored: true } } });
    expect(secrets.paypal).toEqual({ clientSecret: "sec", testClientSecret: "tsec" });
    expect(publicSettings.payments.paypal).toMatchObject({ clientId: "id", testClientId: "tid", clientSecret: "", testClientSecret: "" });
    expect(publicSettings.payments.paypal).not.toHaveProperty("clientSecretStored");
  });
  it("marks saved secrets as stored on screen without keeping the value", () => {
    const out = scrubSavedSecrets({ payments: { paypal: { clientSecret: "sec", testClientSecret: "" } } });
    expect(out.payments.paypal).toMatchObject({ clientSecret: "", clientSecretStored: true });
    expect(out.payments.paypal.testClientSecretStored).toBeUndefined();
  });
  it("the Payments page offers secret boxes and the server reads them", () => {
    expect(read("./ShopSettings.tsx")).toContain("Test client secret");
    expect(read("../../../functions/index.js")).toContain('readAdminSecret("paypal")');
  });
});

describe("#140 Resend key", () => {
  it("accepts real-looking keys and blank, refuses other text", () => {
    expect(resendKeyProblem("")).toBe("");
    expect(resendKeyProblem(" re_AbCdEf123456 ")).toBe("");
    expect(resendKeyProblem("abcd efgh ijkl mnop")).toMatch(/spaces/);
    expect(resendKeyProblem("abcdefghijklmnop")).toMatch(/Resend/);
  });
  it("is checked on save and can be removed", () => {
    expect(read("./api.ts")).toContain("resendKeyProblem(secrets.resend.apiKey");
    expect(read("./NotificationEditor.tsx")).toContain("Remove stored key");
  });
});

describe("#141 Taxes and Email sender are in Settings", () => {
  const settings = NAV.find(n => n.id === "settings")!.children!.map(c => c.id);
  it("lists both in the sidebar and the address bar", () => {
    expect(settings).toContain("taxes");
    // Email sender and Notifications are one page now; the old address still opens it.
    expect(NAV.find(n => n.id === "settings")!.children!.find(c => c.id === "notifications")!.label).toBe("Email sender");
    for (const id of settings) expect(SETTINGS_TABS as readonly string[]).toContain(id);
    expect(routeFromHash("#settings/communications")).toMatchObject({ tab: "settings", settingsTab: "notifications" });
  });
  it("edits the sender name and reply-to, keeping the rest of the map", () => {
    const stored = { orderReceipts: true, abandonedCart: false, fromName: "Old" };
    expect(senderOf(stored)).toEqual({ fromName: "Old", replyTo: "", fromEmail: "" });
    expect(withSender(stored, { fromName: "Lyrical", replyTo: "hi@x.org", fromEmail: "" })).toEqual({ orderReceipts: true, abandonedCart: false, fromName: "Lyrical", replyTo: "hi@x.org" });
    expect(withSender(stored, { fromName: "", replyTo: "", fromEmail: "" })).toEqual({ orderReceipts: true, abandonedCart: false });
    expect(senderProblems({ fromName: "Shop", replyTo: "not-an-email", fromEmail: "" }).replyTo).toBeTruthy();
    expect(senderProblems({ fromName: "A <b>", replyTo: "", fromEmail: "" }).fromName).toBeTruthy();
    expect(senderProblems({ fromName: "Shop", replyTo: "a@b.co", fromEmail: "o@b.co" })).toEqual({});
  });
});

describe("#137 a failed load never lets defaults overwrite saved emails", () => {
  const src = read("./NotificationEditor.tsx");
  it("shows an error with Try again and refuses to save", () => {
    expect(src).toContain("setLoadFailed(true)");
    expect(src).toMatch(/if \(loadFailed\)[^\n]*return;/);
    expect(src).toContain("<ErrorState");
  });
  it("no longer treats the defaults as the saved original when the read fails", () => {
    const catchBlock = src.slice(src.indexOf('console.error("Failed to load notifications settings:"'));
    expect(catchBlock.slice(0, 200)).not.toContain("setOriginal(JSON.stringify(DEFAULT_SETTINGS))");
  });
});

describe("already fixed on this branch (pinned)", () => {
  it("#37 tax rates are validated numerically before saving", () => {
    expect(read("./TaxesSettings.tsx")).toContain("taxRateProblem");
  });
  it("#38 maintenance mode is refused by the server and shown in the admin bar", () => {
    expect(read("../../../functions/index.js")).toContain("checkoutClosed(settings)");
    expect(read("./Dashboard.tsx")).toContain("maintenance?.enabled");
  });
  it("#138 Location has a postal code and country", () => {
    const src = read("./ShopSettings.tsx");
    expect(src).toContain('label="Postal code"');
    expect(src).toContain('label="Country"');
  });
});
