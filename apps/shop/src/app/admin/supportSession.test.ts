import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("firebase/auth", () => ({ signOut: vi.fn(async () => {}), signInWithCustomToken: vi.fn(async () => ({})) }));
import { signInWithCustomToken, signOut } from "firebase/auth";
import { startSupportVisit, supportOf, supportTokenFromHash } from "./supportSession";
import { adminRoleOf } from "./adminAccess";
import { SupportBanner } from "./SupportBanner";

const later = Math.floor(Date.now() / 1000) + 600;
const claims = (support: unknown, provider = "custom") => ({ firebase: { sign_in_provider: provider }, support });

describe("platform support visits", () => {
  it("reads the token from #support= only", () => {
    expect(supportTokenFromHash("#support=abc.def-ghi_1")).toBe("abc.def-ghi_1");
    expect(supportTokenFromHash("#overview")).toBeNull();
    expect(supportTokenFromHash("#support=<script>")).toBeNull();
  });

  it("is staff while it lasts, only from a custom sign-in, and never owner", () => {
    const visit = claims({ by: "admin@platform.example", reason: "help with tax", until: later });
    expect(supportOf(visit)).toEqual({ by: "admin@platform.example", reason: "help with tax", until: later });
    expect(adminRoleOf(null, false, visit)).toBe("staff");
    expect(adminRoleOf(null, false, claims({ until: later - 1200 }))).toBeNull();
    expect(adminRoleOf(null, false, claims({ until: later }, "google.com"))).toBeNull();
    expect(adminRoleOf(null, false, claims({ until: String(later) }))).toBeNull();
  });

  it("takes the token out of the address before signing in with it", async () => {
    const replace = vi.fn();
    const signedIn = await startSupportVisit({} as never, { hash: "#support=tok", pathname: "/admin", search: "" }, replace);
    expect(signedIn).toBe(true);
    expect(replace).toHaveBeenCalledWith("/admin");
    expect(signOut).toHaveBeenCalled();
    expect(signInWithCustomToken).toHaveBeenCalledWith({}, "tok");
    expect(await startSupportVisit({} as never, { hash: "#orders", pathname: "/admin", search: "" }, replace)).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("the banner says who, why and that the visit is logged, with a way out", () => {
    const html = renderToStaticMarkup(createElement(SupportBanner, { visit: { by: "admin@platform.example", reason: "help with tax", until: later }, onSignOut: () => {} }));
    expect(html).toContain("admin@platform.example is signed in until");
    expect(html).toContain("Why: help with tax. This visit is in your shop&#x27;s log.");
    expect(html).toContain("Sign out");
    expect(renderToStaticMarkup(createElement(SupportBanner, { visit: null, onSignOut: () => {} }))).toBe("");
  });
});
