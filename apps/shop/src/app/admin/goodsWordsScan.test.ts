// Word scan (plan 12.1): the admin's visible text goes through `w(...)` so a shop that doesn't sell books never reads
// "book" or "author". This finds plain JSX text and common label attributes that still say them. Files and phrases that
// are meant to say book are listed in KEEP with the reason.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "@typescript/typescript6";

const ROOT = __dirname;
const WORD = /(?<![-\w])([Bb]ooks?|BOOKS?|[Aa]uthors?)\b/;
const ATTRS = /^(label|placeholder|title|aria-label|hint|description|helper|emptyText|message|alt)$/;
/** Files left on purpose: the analytics views, and Studio (shopper words live in Text & labels). */
const KEEP = new Set(["overview/OverviewVisitorPath.tsx", "overview/AnalyticsDashboard.tsx", "Dashboard.tsx", "BookEditor.tsx"]);

function files(dir: string, out: string[] = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "studio" && e.name !== "fixture") files(p, out); }
    else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

describe("admin words for a shop that doesn't sell books", () => {
  it("has no plain text or label that says book or author outside w(...)", () => {
    const found: string[] = [];
    for (const f of files(ROOT)) {
      const rel = f.slice(ROOT.length + 1).replace(/\\/g, "/");
      if (KEEP.has(rel)) continue;
      const src = readFileSync(f, "utf8");
      const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node) => {
        if (ts.isJsxText(n) && WORD.test(n.getText())) found.push(`${rel}: ${n.getText().trim().slice(0, 60)}`);
        if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && ATTRS.test(n.name.getText()) && WORD.test(n.initializer.text)) found.push(`${rel}: ${n.initializer.text.slice(0, 60)}`);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(found).toEqual([]);
  });
});
