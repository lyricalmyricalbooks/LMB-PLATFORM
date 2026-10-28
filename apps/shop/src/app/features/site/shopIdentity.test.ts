import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_SHOP_NAME, shopName, shopNameFromSettings, wordmarkWords } from "./shopIdentity";
import { COPY_SCHEMA, getCopy } from "./storeCopy";
import { LogoMark } from "../../components/LogoMark";
import { readSource, resolveDynamicSettings } from "./dynamicSources";
import { fb } from "../../components/sectionFallbacks";
import { RISO_NOIR_TOKENS } from "./risoNoir";
import { THEME_LIBRARY } from "../../admin/studio/themeLibrary";
import { defaultSettings } from "../../admin/defaultSettings";

// Plan 1.16: the shop's name, wordmark and the starting words that mention the press are Studio defaults
// (Text & labels › Site & sharing › Site name, Style › Logo & wordmark), never written into a component.

const SRC = join(__dirname, "../../..");
// Release notes describe history; tests may name anything. Everything else must take the name from shopIdentity.ts.
const SKIP = [/\.test\.tsx?$/, /\/__fixtures__\//, /\/admin\/updates\//];

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.(tsx?|css)$/.test(name) && !SKIP.some((re) => re.test(full))) out.push(full);
  }
  return out;
}

// Another press's wordmark, built from parts so this file doesn't name it.
const OTHER_MARKS = new RegExp(`Your Press|YOUR PRESS|F✶M|${["Lyr", "ical"].join("")}<(em|span)>`);

describe("the shop's name is a Studio default, not built into the site (plan 1.16)", () => {
  it("no file but shopIdentity.ts writes the placeholder name or another press's mark", () => {
    const offenders = sources(SRC)
      .filter((file) => !file.endsWith("shopIdentity.ts"))
      .filter((file) => OTHER_MARKS.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("Text & labels › Site name is the one place the name is typed, and words that mention the press follow it", () => {
    const siteName = COPY_SCHEMA.flatMap((g: any) => g.fields).find((f: any) => f.key === "siteName");
    expect(siteName.default).toBe(DEFAULT_SHOP_NAME);
    const design = { copy: { siteName: "Salt Hymns Press" } };
    for (const key of ["footerWordmark", "footerCopyright", "logoAlt", "coBrand", "reviewsReply", "poweredBy", "loadingAria", "loadingWordmarkA", "maintenanceFooter"]) {
      expect(getCopy(design, key), key).toContain("Salt Hymns Press");
      expect(getCopy(design, key), key).not.toContain(DEFAULT_SHOP_NAME);
    }
  });

  it("the wordmark's words default to the site name and stay editable", () => {
    expect(wordmarkWords("Salt Hymns Press")).toEqual({ first: "Salt", rest: "Hymns Press" });
    expect(wordmarkWords("Kestrel")).toEqual({ first: "Kestrel", rest: "" });
    const twoPart = (extra: any) => renderToStaticMarkup(createElement(LogoMark, { design: { wordmarkStyle: "two-part", copy: { siteName: "Salt Hymns" }, ...extra } }));
    expect(twoPart({})).toContain(">Salt</span>");
    expect(twoPart({})).toContain(">Hymns</span>");
    expect(twoPart({ wordmarkPrimary: "Own", wordmarkSecondary: "Words" })).toContain(">Own</span>");
    expect(renderToStaticMarkup(createElement(LogoMark, { design: { copy: { siteName: "Kestrel" } } }))).toContain(">Kestrel</span>");
  });

  it("no theme or the starting design types a name into the wordmark", () => {
    for (const key of ["wordmarkPrimary", "wordmarkSecondary", "logoText", "catalogMastheadText"]) {
      expect((RISO_NOIR_TOKENS as any)[key], key).toBeUndefined();
      expect((defaultSettings().design as any)[key], key).toBeUndefined();
      for (const theme of THEME_LIBRARY as any[]) expect(theme[key] ?? theme.global?.[key], `${theme.id}.${key}`).toBeUndefined();
    }
  });

  it("sections say the shop's name through {{shop.name}} and their fallbacks", () => {
    expect(readSource("shop.name", { shop: { name: "Salt Hymns" } })).toBe("Salt Hymns");
    expect(resolveDynamicSettings({ title: "{{shop.name}}" }, { shop: { name: "Salt Hymns" } }).settings.title).toBe("Salt Hymns");
    expect(fb("HeroSection.title", "Salt Hymns")).toBe("Salt Hymns");
    expect(fb("HeroSection.title")).toBe(DEFAULT_SHOP_NAME);
  });

  it("the admin shows Settings › Store name, else the site name", () => {
    expect(shopName(null)).toBe(DEFAULT_SHOP_NAME);
    expect(shopName({ copy: { siteName: "  " } })).toBe(DEFAULT_SHOP_NAME);
    expect(shopNameFromSettings({ info: { name: "Kestrel Books" }, design: { copy: { siteName: "Other" } } })).toBe("Kestrel Books");
    expect(shopNameFromSettings({ info: { name: "" }, design: { copy: { siteName: "Other" } } })).toBe("Other");
  });
});
