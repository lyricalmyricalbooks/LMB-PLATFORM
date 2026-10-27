import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { elementTabs, GLOBAL_STYLE_GROUPS, visibleTabs, wordsShown, type ElementRef } from "./elementCatalog";
import { STYLE_GROUPS } from "./styleSchema";
import { REGION_GROUPS, regionProps } from "../../features/site/storefrontRegions";
import { COPY_SCHEMA } from "../../features/site/storeCopy";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? (name === "admin" ? [] : files(p)) : /\.tsx$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}
/** Every clickable part of the storefront, as the preview would report it. */
function storefrontElements(): ElementRef[] {
  const els: ElementRef[] = [];
  for (const f of files("src/app")) for (const m of readFileSync(f, "utf8").matchAll(/data-studio-target="([^"]+)"[^>]*?data-studio-label="([^"]+)"/g))
    els.push({ key: m[1] + m[2], target: m[1], label: m[2] });
  for (const g of REGION_GROUPS) for (const r of g.regions) {
    const p = regionProps(r.id);
    els.push({ key: "r:" + r.id, target: p["data-studio-target"], label: p["data-studio-label"], region: r.id });
  }
  return els;
}

describe("element inspector catalog", () => {
  it("splits a region's controls into style, layout and visibility for the previewed size", () => {
    const tabs = elementTabs({ key: "r:catalogSearch", label: "Catalog search field", target: regionProps("catalogSearch")["data-studio-target"], region: "catalogSearch" }, "desktop", {});
    expect(tabs.layout.map(p => p.field.key)).toContain("regions.catalogSearchPadding");
    expect(tabs.style.map(p => p.field.key)).toContain("regions.catalogSearchBackground");
    expect(tabs.visibility.map(p => p.field.key)).toEqual(["regions.catalogSearchVisible"]);
    expect(tabs.copyGroups).toEqual(["Search & filters"]);
    const phone = elementTabs({ key: "r:catalogSearch", label: "Catalog search field", target: "", region: "catalogSearch" }, "mobile", {});
    expect(phone.layout.every(p => p.field.key.startsWith("regions.catalogSearchMobile"))).toBe(true);
  });

  it("never offers to hide a part shoppers need", () => {
    const tabs = elementTabs({ key: "r:newsletterButton", label: "Newsletter button", target: "", region: "newsletterButton" }, "desktop", {});
    expect(tabs.required).toBe(true);
    expect(tabs.visibility).toEqual([]);
  });

  it("gathers a named part's controls across categories", () => {
    const tabs = elementTabs({ key: "t:buy", label: "Buy card", target: "style:pdp" }, "desktop", {});
    const keys = [...tabs.style, ...tabs.layout, ...tabs.visibility].map(p => p.field.key);
    expect(keys.length).toBeGreaterThan(0);
    // The buy card can also follow a colour scheme (Theme settings › Colour schemes).
    expect(keys).toContain("elementSchemes.buyCard");
    expect(keys.every(k => /^(elementSchemes\.buyCard$|pdpCard|pdpRuledRows|pdpShowTag|pdpTag|pdpTitle|pdpPrice|pdpShowStock|pdpStock|productCta|addToBagLabel|showQtyStepper|showSocialShare|showPdpWishlist|showBackInStock|showComingSoonSignup)/.test(k))).toBe(true);
    expect(tabs.visibility.every(p => /^(show|hide)[A-Z]/.test(p.field.key))).toBe(true);
  });

  it("narrows words to the ones shown inside the part", () => {
    const group = COPY_SCHEMA.find(g => g.group === "Cart")!;
    const field = group.fields.find(f => !/\{/.test(f.default) && f.default.length > 4)!;
    expect(wordsShown(group.fields, {}, `xx ${field.default} yy`).map(f => f.key)).toContain(field.key);
    const custom = wordsShown(group.fields, { copy: { [field.key]: "Your reading pile" } }, "Your reading pile");
    expect(custom.map(f => f.key)).toEqual([field.key]);
    const tabs = elementTabs({ key: "t:bag", label: "Bag heading", target: "style:cartDrawer|copy:Cart", text: field.default }, "desktop", {});
    expect(tabs.wordsNarrowed).toBe(true);
    expect(tabs.words.map(f => f.key)).toContain(field.key);
  });

  it("opens something for every clickable part of the storefront", () => {
    const empty = storefrontElements().filter(e => !visibleTabs(elementTabs(e, "desktop", {})).length && !/^(menus:|pages)/.test(e.target));
    expect(empty.map(e => `${e.label} <${e.target}>`)).toEqual([]);
  });

  it("reaches every style category from a part of the page or the site-wide layer", () => {
    const reached = new Set(GLOBAL_STYLE_GROUPS);
    for (const e of storefrontElements()) elementTabs(e, "desktop", {}).styleGroups.forEach(g => reached.add(g));
    expect(STYLE_GROUPS.filter(g => !reached.has(g.id)).map(g => g.id)).toEqual([]);
    expect(GLOBAL_STYLE_GROUPS.every(id => STYLE_GROUPS.some(g => g.id === id))).toBe(true);
  });
});
