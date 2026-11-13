// Staff may look at the connections but only an owner may change them (Settings › Team promises it; index.js
// requireOwner). Each door picks requireOwner for its changing steps and requireAdmin for the rest.
import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { appsLinkActions } = require("./appsLink");
const { customDomainActions } = require("./customDomains");
const { googleConnectActions } = require("./googleConnect");
const { OWNER_ONLY_MESSAGE } = require("./roles");

const res = () => { const r = { statusCode: 200, body: null }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
// A staff member: an admin, but never an owner.
const requireAdmin = async () => ({ email: "sam@example.com" });
const requireOwner = async (_req, r) => { r.status(403).json({ error: OWNER_ONLY_MESSAGE, code: "owner_only" }); return null; };
const fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
const doors = { url: "https://platform.example/x", shopId: "s", serviceKey: () => "k", requireAdmin, requireOwner, fetch };

async function answer(handler, body) {
  const r = res();
  await handler({ body }, r);
  return r.body?.code === "owner_only" ? "refused" : "allowed";
}

describe("staff can look but not change the connections", () => {
  test("apps: look yes, remove no", async () => {
    const { handleApps } = appsLinkActions(doors);
    expect(await answer(handleApps, { step: "installed" })).toBe("allowed");
    expect(await answer(handleApps, { step: "remove", appId: "app_0123456789ab" })).toBe("refused");
  });

  test("web address: list and check yes, every change no", async () => {
    const { handleCustomDomains } = customDomainActions(doors);
    expect(await answer(handleCustomDomains, { step: "list" })).toBe("allowed");
    expect(await answer(handleCustomDomains, { step: "check", domain: "a.example" })).toBe("allowed");
    for (const step of ["add", "connect", "makeMain", "remove", "renameFree"]) expect(await answer(handleCustomDomains, { step, domain: "a.example" })).toBe("refused");
  });

  test("Google: status and the sheet yes, connecting or disconnecting no", async () => {
    const { handleGoogleConnect } = googleConnectActions(doors);
    expect(await answer(handleGoogleConnect, { step: "status" })).toBe("allowed");
    for (const step of ["connectLink", "tryAgain", "disconnect", "turnOff"]) expect(await answer(handleGoogleConnect, { step, returnUrl: "https://a.example", extras: ["drive"] })).toBe("refused");
  });

  test("without a separate owner check the doors behave as before (older callers)", async () => {
    const { handleApps } = appsLinkActions({ ...doors, requireOwner: undefined });
    expect(await answer(handleApps, { step: "remove", appId: "app_0123456789ab" })).toBe("allowed");
  });

  test("index.js holds card payments, the payment webhook and payment domains to the owner too", () => {
    const src = require("node:fs").readFileSync(new URL("./checkoutAdmin.js", import.meta.url), "utf8");
    expect(src).toMatch(/step === "status" \|\| step === "nextStatus" \? requireBooksReader : requireOwner/);
    expect(src).toMatch(/req\.body\?\.fix === true \|\| req\.body\?\.recreate === true \? requireOwner : requireAdmin/);
    const index = require("node:fs").readFileSync(new URL("./index.js", import.meta.url), "utf8");
    expect(index).toMatch(/adminRole\(decoded\) !== "owner"/);
    for (const door of ["appsLinkActions", "customDomainActions", "googleConnectActions", "checkoutAdminActions"]) {
      expect(index).toMatch(new RegExp(`${door}\\(\\{[^)]*requireOwner`, "s"));
    }
  });
});
