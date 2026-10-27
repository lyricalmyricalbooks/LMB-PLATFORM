import { describe, expect, it, vi } from "vitest";
import { adminRoleOf, refreshAdminRole } from "./adminAccess";
import { SHOP_OWNER_EMAIL } from "../lib/ownerDevice";

describe("admin access", () => {
  it("reads the role like the server: owner address, then the Team role on the pass", () => {
    expect(adminRoleOf(SHOP_OWNER_EMAIL.toUpperCase(), true)).toBe("owner");
    expect(adminRoleOf("sam@press.test", true, { role: "staff" })).toBe("staff");
    expect(adminRoleOf("sam@press.test", true, { role: "boss" })).toBeNull();
    // An author on the Team is for the stockroom only and never opens the admin.
    expect(adminRoleOf("ana@press.test", true, { role: "author" })).toBeNull();
    expect(adminRoleOf("reader@press.test", true)).toBeNull();
    expect(adminRoleOf(SHOP_OWNER_EMAIL, false)).toBeNull();
  });

  it("refreshes the pass after asking the server, and still decides when the server can't be reached", async () => {
    const user = { email: "sam@press.test", emailVerified: true, getIdToken: vi.fn(async () => "t"), getIdTokenResult: vi.fn(async () => ({ claims: { role: "staff" } })) };
    const refresh = vi.fn(async () => { throw new Error("offline"); });
    expect(await refreshAdminRole(user, refresh)).toBe("staff");
    expect(refresh).toHaveBeenCalledWith("t");
    expect(user.getIdTokenResult).toHaveBeenCalledWith(true);
  });
});
