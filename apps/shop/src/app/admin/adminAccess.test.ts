import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminRoleOf, currentAdminRole, refreshAdminRole } from "./adminAccess";

const OWNER = "hello@moth.example";
const pass = (email: string, claims: Record<string, unknown> = {}) => ({
  email, emailVerified: true, getIdToken: vi.fn(async () => "t"), getIdTokenResult: vi.fn(async () => ({ claims })),
});

describe("admin access", () => {
  it("knows no owner address until the server names one, so the old placeholder opens nothing", () => {
    expect(adminRoleOf("owner@example.com", true)).toBeNull();
    expect(adminRoleOf(OWNER, true)).toBeNull();
  });

  it("refreshes the pass after asking the server, and still decides when the server can't be reached", async () => {
    const user = pass("sam@press.test", { role: "staff" });
    const refresh = vi.fn(async () => { throw new Error("offline"); });
    expect(await refreshAdminRole(user, refresh)).toBe("staff");
    expect(refresh).toHaveBeenCalledWith("t");
    expect(user.getIdTokenResult).toHaveBeenCalledWith(true);
  });

  it("a restored session learns the owner's address with one server call, then reads roles like the server", async () => {
    const refresh = vi.fn(async () => new Response(JSON.stringify({ role: "owner", ownerEmail: OWNER })));
    expect(await currentAdminRole(pass(OWNER.toUpperCase()), refresh)).toBe("owner");
    expect(await currentAdminRole(pass(OWNER), refresh)).toBe("owner");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(adminRoleOf(OWNER.toUpperCase(), true)).toBe("owner");
    expect(adminRoleOf(OWNER, false)).toBeNull();
    expect(adminRoleOf("sam@press.test", true, { role: "staff" })).toBe("staff");
    expect(adminRoleOf("sam@press.test", true, { role: "boss" })).toBeNull();
    // An author on the Team is for the stockroom only and never opens the admin.
    expect(adminRoleOf("ana@press.test", true, { role: "author" })).toBeNull();
    expect(adminRoleOf("reader@press.test", true)).toBeNull();
  });

  it("the owner's address is never built into the page", () => {
    const source = readFileSync(join(__dirname, "..", "lib", "ownerDevice.ts"), "utf8");
    expect(source).not.toMatch(/=\s*["'][^"'\s]+@[^"'\s]+["']/);
    expect(readFileSync(join(__dirname, "..", "..", "..", "functions", "index.js"), "utf8"))
      .toMatch(/const opensAdmin = role === "owner" \|\| role === "staff";[\s\S]{0,200}opensAdmin \? \{ ownerEmail: shopConfig\.ownerEmail \}/);
  });
});
