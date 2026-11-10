// A website-only press (the profile's apps.stockroom is false) gets an admin with no stockroom in it: no Website ·
// Inventory switcher, no Inventory app link tab, no stock list sent from the stockroom, no Author role and no
// stockroom words on the Team page. Its stock is kept on Inventory › Stock. A press with both keeps everything.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SHOP_PROFILE, hasStockroom } from "../../lib/shopProfile";

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

describe("hasStockroom", () => {
  it("follows the plan in the profile", () => {
    expect(hasStockroom({ ...DEFAULT_SHOP_PROFILE, apps: { shop: true, stockroom: false } })).toBe(false);
    expect(hasStockroom({ ...DEFAULT_SHOP_PROFILE, apps: { shop: true, stockroom: true } })).toBe(true);
  });
  it("keeps the stockroom parts on the built-in profile (the test shop has both)", () => {
    expect(hasStockroom(DEFAULT_SHOP_PROFILE)).toBe(true);
  });
});

describe("the admin of a website-only press", () => {
  it("shows no switcher to the stockroom and doesn't read the stockroom link", () => {
    const src = read("Dashboard.tsx");
    // The combined admin (both apps, combined.ts) has no app switcher either: the stockroom is inside it, behind the
    // Website · Stockroom side switch.
    expect(src).toMatch(/top=\{COMBINED \? <SideSwitch [\s\S]*?: hasStockroom\(\) \? <AppSwitcher /);
    expect(src).toMatch(/\{hasStockroom\(\) && !COMBINED && <AppSwitchPill \/>\}/);
    expect(src).toMatch(/hasStockroom\(\) \? inventoryLinkApi\.state\(\)/);
    // Every other use of the switcher is behind the same check.
    expect(src.match(/<AppSwitch(er|Pill)\b/g)).toHaveLength(2);
  });

  it("keeps stock on Inventory › Stock with no link tab", () => {
    const src = read("Inventory.tsx");
    expect(src).toMatch(/const view = stockroom \? chosenView : "inv-stock";/);
    expect(src).toMatch(/\{stockroom && <Tabs variant="page" label="Inventory"/);
    expect(src).toMatch(/\{stockroom && <TabPanel tabId="inv-link"/);
    expect(src).toMatch(/<TabPanel tabId="inv-stock" active=\{view === "inv-stock"\} alone=\{!stockroom\}>/);
  });

  it("doesn't offer the stock list that is read from the stockroom", () => {
    expect(read("GoogleSettings.tsx")).toMatch(/s\.id === "drive" && status\.connected && hasStockroom\(\) && saved\.includes\("drive"\)/);
  });

  it("offers the Author role and stockroom words only with the stockroom", () => {
    const src = read("TeamSettings.tsx");
    expect(src).toMatch(/\{STOCKROOM && <option value="author">/);
    expect(src).toMatch(/const TEAM_ABOUT = STOCKROOM \? "People who can open this admin or the stockroom\." : "People who can open this admin\.";/);
    expect(src).not.toMatch(/description="People who can open this admin or the stockroom/);
  });
});
