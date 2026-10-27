// Round-2 security fixes that are plain functions: imported themes (#118), connected fields in HTML (#119),
// spreadsheet exports (#120) and the star rating over all reviews (#146).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseThemeFile, serializeThemeFile, stripImportedCustomCode } from "./admin/studio/savedThemes";
import { escapeHtml, HTML_SETTING_KEYS, resolveDynamicSettings } from "./features/site/dynamicSources";
import { customersToCsv } from "./admin/customerInsights";
import { catalogToCsv, inventoryCsv } from "./admin/bulkPricing";
import { ratingData } from "./lib/bookSeo";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("imported theme files carry no code (#118)", () => {
  const withCode = { accent: "#f00", customHeadHtml: "<script src='https://evil.example/x.js'></script>", customFooterScripts: "fetch('//evil.example')", customCss: "a{color:red}", storefront: { customFooterScripts: "alert(1)", accent: "#0f0" }, page: { sections: [] } };

  it("removes head HTML and footer scripts, at the top level and inside surface overrides", () => {
    const { design, removed } = stripImportedCustomCode(withCode);
    expect(design).not.toHaveProperty("customHeadHtml");
    expect(design).not.toHaveProperty("customFooterScripts");
    expect(design.storefront).not.toHaveProperty("customFooterScripts");
    expect(design.storefront.accent).toBe("#0f0");
    expect(design.accent).toBe("#f00");
    expect(removed.sort()).toEqual(["Extra <head> HTML", "Footer scripts"]);
  });

  it("parseThemeFile strips them and says so", () => {
    const parsed: any = parseThemeFile(serializeThemeFile({ name: "Shared", design: withCode }));
    expect(parsed.design).not.toHaveProperty("customHeadHtml");
    expect(parsed.strippedCustomCode).toEqual(expect.arrayContaining(["Footer scripts"]));
  });

  it("leaves a code-free file exactly as before", () => {
    expect(parseThemeFile(serializeThemeFile({ name: "Autumn", design: { a: [1] } }))).toEqual({ name: "Autumn", design: { a: [1] } });
  });

  it("Studio's import tells the owner what was left out", () => {
    expect(read("src/app/admin/studio/StudioEditor.tsx")).toMatch(/without its custom code/);
  });
});

describe("connected book details are escaped inside HTML fields (#119)", () => {
  const book = { title: "Fear & <Loathing>", custom: { note: "<img src=x onerror=alert(1)>" } };
  const resolve = (type: string, settings: any) =>
    resolveDynamicSettings(settings, { book }, { htmlKeys: HTML_SETTING_KEYS[type] }).settings;

  it("escapes a token substituted into markup", () => {
    expect(resolve("CustomHTMLSection", { html: "<h2>{{book.title}}</h2>" }).html).toBe("<h2>Fear &amp; &lt;Loathing&gt;</h2>");
    expect(resolve("RichTextSection", { html: "<p>{{book.custom.note}}</p>" }).html).not.toMatch(/<img/);
  });

  it("wraps a whole-field connection that has angle brackets, and leaves safe text alone", () => {
    expect(resolve("RichTextSection", { html: { $dyn: "book.title" } }).html).toBe("<p>Fear &amp; &lt;Loathing&gt;</p>");
    expect(resolve("RichTextSection", { html: { $dyn: "book.custom.note" } }).html).not.toMatch(/<img/);
    expect(resolveDynamicSettings({ html: { $dyn: "book.title" } }, { book: { title: "Plain" } }, { htmlKeys: ["html"] }).settings.html).toBe("Plain");
  });

  it("escapes tokens in a collapsible's items", () => {
    const out = resolve("CollapsibleSection", { items: [{ heading: "{{book.title}}", content: "<p>{{book.title}}</p>" }] });
    expect(out.items[0].content).toBe("<p>Fear &amp; &lt;Loathing&gt;</p>");
    expect(out.items[0].heading).toBe("Fear & <Loathing>"); // plain text: React escapes it
  });

  it("a plain-text field is never double-escaped", () => {
    expect(resolve("TextSection", { title: "{{book.title}}" }).title).toBe("Fear & <Loathing>");
  });

  it("every section that draws HTML is listed (so a new one can't skip escaping)", () => {
    const source = read("src/app/components/SectionComponents.tsx");
    const used = [...source.matchAll(/__html: (?:sampleHtml\()?([A-Za-z.]+)/g)].map(m => m[1].split(".").pop()!);
    const known = new Set([...Object.values(HTML_SETTING_KEYS).flat(), "body"]);
    for (const key of used) expect(known.has(key), `dangerouslySetInnerHTML field "${key}" must be in HTML_SETTING_KEYS`).toBe(true);
  });

  it("escapeHtml handles quotes", () => {
    expect(escapeHtml(`"a" & 'b'`)).toBe("&quot;a&quot; &amp; &#x27;b&#x27;");
  });
});

describe("spreadsheet exports neutralise tab and carriage-return formulas (#120)", () => {
  const row = { name: "\t=HYPERLINK(\"http://evil\",\"x\")", email: "a@b.co", segment: "new", orderCount: 1, totalSpent: 10, avgOrder: 10, city: "\r=1+1", country: "CA", orders: [] } as any;

  it("the Customers export guards them", () => {
    const csv = customersToCsv([row]);
    expect(csv).toContain("\"'\t=HYPERLINK");
    expect(csv).toContain("\"'\r=1+1");
  });

  it("every CSV cell guard in the admin uses the same character set", () => {
    for (const file of ["bulkPricing.ts", "inventoryInsights.ts", "customerInsights.ts", "overview/salesReport.ts"]) {
      expect(read(`src/app/admin/${file}`), file).toMatch(/\[=\+\\-@\\t\\r\]/);
    }
    expect(read("src/app/admin/catalogImport.ts")).toMatch(/\[=\+\\-@\\t\\r\]/);
  });

  it("the catalog and inventory exports guard a title that starts with a tab", () => {
    const books = [{ id: "1", title: "\t=cmd|' /C calc'!A0", retailPrice: 5, trackInventory: true, stockLevel: 2 }] as any;
    expect(catalogToCsv(books)).toContain("\"'\t=cmd");
    expect(inventoryCsv(books)).toContain("\"'\t=cmd");
  });
});

describe("the star rating covers every approved review (#146)", () => {
  const page = Array.from({ length: 50 }, (_, i) => ({ authorName: `R${i}`, rating: 5, body: "Great" }));
  it("uses Firestore's count and average, not the newest page", () => {
    const data: any = ratingData(page, { count: 213, average: 4.2 });
    expect(data.aggregateRating).toMatchObject({ reviewCount: 213, ratingValue: 4.2 });
  });
  it("falls back to the loaded reviews when no total is known", () => {
    const data: any = ratingData(page);
    expect(data.aggregateRating).toMatchObject({ reviewCount: 50, ratingValue: 5 });
  });
  it("ignores a total that contradicts the reviews on screen", () => {
    const data: any = ratingData(page, { count: 3, average: 1 });
    expect(data.aggregateRating.reviewCount).toBe(50);
  });
});
