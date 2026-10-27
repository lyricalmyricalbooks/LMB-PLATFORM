import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { waitedText } from "./orderListHelpers";
import { adminManifestHref, ADMIN_THEME_COLOR } from "./adminApp";
import { NAV, sidebarItems } from "./riso/nav";

describe("phone admin (Pocket Pressroom)", () => {
  it("says how long an order has waited in one short word", () => {
    const now = Date.parse("2026-10-23T12:00:00Z");
    expect(waitedText("2026-10-23T11:59:40Z", now)).toBe("now");
    expect(waitedText("2026-10-23T11:20:00Z", now)).toBe("40m");
    expect(waitedText("2026-10-23T07:00:00Z", now)).toBe("5h");
    expect(waitedText("2026-10-20T11:00:00Z", now)).toBe("3d");
    expect(waitedText("", now)).toBe("");
    expect(waitedText("not a date", now)).toBe("");
    expect(waitedText("2026-10-24T12:00:00Z", now)).toBe("now");
  });

  it("marks each Settings page in the drawer so phones can lay them out two to a row", () => {
    const items = sidebarItems(NAV);
    const settings = items.filter((i: any) => i.section === "Settings" || i.group);
    expect(settings.length).toBeGreaterThan(0);
    expect(items.filter((i: any) => i.group).every((i: any) => typeof i.group === "string")).toBe(true);
    expect(items.filter((i: any) => !String(i.id).includes("/")).every((i: any) => !i.group)).toBe(true);
  });

  it("names the admin's own app file under the build's base address", () => {
    expect(adminManifestHref("/")).toBe("/admin.webmanifest");
    expect(adminManifestHref("/shop")).toBe("/shop/admin.webmanifest");
    expect(adminManifestHref("/shop/")).toBe("/shop/admin.webmanifest");
  });

  it("ships an installable admin app file that stays inside /admin", () => {
    const m = JSON.parse(readFileSync("public/admin.webmanifest", "utf8"));
    expect(m.scope).toBe("/admin");
    expect(String(m.start_url).startsWith("/admin")).toBe(true);
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBe(ADMIN_THEME_COLOR);
    const sizes = m.icons.map((i: any) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of m.icons) expect(() => readFileSync(`public${icon.src}`)).not.toThrow();
    for (const s of m.shortcuts) expect(String(s.url).startsWith("/admin")).toBe(true);
  });

  it("keeps the Play Store wrapper pointed at the same app and never commits a real signing key", () => {
    const twa = JSON.parse(readFileSync("android/twa-manifest.json", "utf8"));
    const m = JSON.parse(readFileSync("public/admin.webmanifest", "utf8"));
    expect(twa.startUrl).toBe(m.start_url);
    expect(twa.themeColor).toBe(m.theme_color);
    expect(twa.backgroundColor).toBe(m.background_color);
    expect(readFileSync("android/.gitignore", "utf8")).toMatch(/\*\.keystore/);
  });
});
