// Plain words for shop owners (simpler admin plan, change 1, 18 November 2026). Owners say "pack and ship", "website",
// "item code" and "check reviews"; shop-system words like fulfilment, dispatch, storefront, SKU and moderate don't belong
// on an admin screen. This reads every word in the admin's source the way platformPlainWords.test.ts does and fails on one.
// Spreadsheet readers and writers keep SKU and similar headings because the files other systems make use them.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "@typescript/typescript6";

const SHOP = join(__dirname, "..", "..", "..");

/** Words an owner shouldn't meet, each with the everyday word to use instead. */
export const SHOP_SYSTEM_WORDS: { word: string; regex: RegExp; use: string }[] = [
  { word: "fulfil", regex: /\bfulfil/i, use: "pack, ship" },
  { word: "dispatch", regex: /\bdispatch/i, use: "ship" },
  { word: "storefront", regex: /\bstorefront/i, use: "website" },
  { word: "SKU", regex: /\bSKUs?\b/, use: "item code" },
  { word: "moderate", regex: /\bmoderat/i, use: "check" },
  { word: "catalog health", regex: /catalog health/i, use: "what needs a look" },
  { word: "store identity", regex: /store identity/i, use: "your shop's details" },
];

// Files whose words are allowed, with the reason.
const ALLOWED_FILES: Record<string, string> = {
  // Spreadsheet readers and writers: column headings must match the files other shop systems make and read.
  "src/app/admin/shopMove.ts": "file headings", "src/app/admin/shopExport.ts": "file headings", "src/app/admin/shopTakeout.ts": "file headings",
  "src/app/admin/catalogImport.ts": "file headings", "src/app/admin/bulkPricing.ts": "file headings", "src/app/admin/pastOrders.ts": "file headings",
  "src/app/admin/BookImportDialog.tsx": "file headings", "src/app/admin/discountMove.ts": "file headings",
  // Search words that find an answer: an owner may type the old word.
  "src/app/admin/helpAnswers.ts": "search words", "src/app/admin/studio/studioSearch.ts": "search words",
  // A shop's privacy policy, written to shoppers in ordinary English.
  "src/app/admin/starterPolicies.ts": "shopper wording",
  // Expense category names saved in the books; renaming one would split a year's figures.
  "src/app/admin/stockroom/taxExpense.ts": "saved category names",
  // Studio's setting names for the storefront's own words (Text & labels keys), not admin words.
  "src/app/admin/studio/settingsMap.ts": "Studio keys",
};
// Release notes stay as they were written; the Studio preview bridges are code that runs in the preview page.
const SKIP = /\.test\.|\/fixture\/|\.d\.ts$|\/updates\/|adminFixture|Bridge\.ts$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}

/** Sentences and labels in a file's source, as the platform words test reads them. */
function wordsIn(path: string): { at: string; text: string }[] {
  const file = join(SHOP, path);
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: { at: string; text: string }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && /^console\./.test(node.expression.getText())) return;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
    let text: string | null = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
    else if (ts.isJsxText(node)) text = node.getText();
    if (text !== null && text.trim() && (/\s/.test(text.trim()) || /^[A-Z]/.test(text.trim()))) {
      found.push({ at: `${path}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`, text: text.trim().replace(/\s+/g, " ") });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const FILES = walk(join(SHOP, "src/app/admin")).map((f) => relative(SHOP, f).split(sep).join("/"))
  .filter((f) => /\.tsx?$/.test(f) && !SKIP.test(f) && !(f in ALLOWED_FILES));

describe("admin screens use everyday words", () => {
  it("no shop-system word reaches an owner", () => {
    const found: string[] = [];
    for (const path of FILES) for (const w of wordsIn(path)) {
      for (const b of SHOP_SYSTEM_WORDS) if (b.regex.test(w.text)) found.push(`${w.at} “${b.word}” (say ${b.use}): ${w.text.slice(0, 100)}`);
    }
    expect(found).toEqual([]);
  }, 30_000);

  it("the list catches each word and every allowed file exists", () => {
    expect(SHOP_SYSTEM_WORDS.filter((b) => b.regex.test("Fulfillment dispatch storefront SKU moderate catalog health Store identity")).length).toBe(SHOP_SYSTEM_WORDS.length);
    for (const path of Object.keys(ALLOWED_FILES)) expect(() => statSync(join(SHOP, path)), path).not.toThrow();
  });
});
