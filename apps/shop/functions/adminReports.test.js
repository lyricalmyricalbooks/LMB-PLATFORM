import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";

const { adminReportActions } = createRequire(import.meta.url)("./adminReports");
const source = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");

const res = () => { const r = { statusCode: 0, body: null }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };

describe("admin report actions", () => {
  it("answers the six report actions, each only for a signed-in admin", async () => {
    const requireAdmin = vi.fn(async () => null);
    const hitLimit = vi.fn();
    const actions = adminReportActions({ db: {}, admin: {}, requireAdmin, readAdminSecret: vi.fn(), hitLimit, LIMITS: {} });
    expect(Object.keys(actions).sort()).toEqual(["aiWrite", "backups", "bigQueryJourneys", "ga4Report", "resetTraffic", "searchConsole"]);
    for (const handler of Object.values(actions)) {
      const r = res();
      await handler({ body: {} }, r);
      expect(r.body).toBeNull();
    }
    expect(requireAdmin).toHaveBeenCalledTimes(6);
    expect(hitLimit).not.toHaveBeenCalled();
  });

  it("index.js reaches them only through the own-key action table", () => {
    expect(source).toContain("...adminReportActions({ db, admin, requireAdmin, readAdminSecret, hitLimit, LIMITS }),");
    expect(source).toContain('typeof action === "string" && Object.hasOwn(CHECKOUT_FUNCTION_ACTIONS, action)');
    expect(source).not.toMatch(/req\.body\?\.action === "(aiWrite|backups|ga4Report)"/);
  });
});
