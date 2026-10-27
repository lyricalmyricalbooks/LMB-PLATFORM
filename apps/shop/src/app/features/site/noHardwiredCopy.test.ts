import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
// TypeScript 7 (the compiler) has no JS API; Microsoft's @typescript/typescript6 keeps the classic parser for tools like this.
import ts from "@typescript/typescript6";

// Nothing shopper-facing may be typed straight into a storefront component: words go through
// getCopy() + COPY_SCHEMA (Studio › Text & labels), so the owner can change every one of them.
// Section renderers (SectionComponents) take their words from section fields instead, and the
// admin UI / generated ui primitives are not shopper-facing.
const APP_DIR = join(__dirname, "..", "..");
const SKIP_DIRS = new Set(["admin", "ui", "figma"]);
const SKIP_FILES = new Set(["SectionComponents.tsx", "RichTextEditor.tsx"]);
const ATTRS = new Set(["placeholder", "aria-label", "title", "alt", "label"]);

// Brand marks and units that are not editable words.
// Also allowed: wordmark defaults (Studio › Style › wordmark fields) and the fallback contact address (Settings › General).
const ALLOWED = new Set(["AX", "GPay", "afterpay", "Kl.", "CAD", "USD", "EUR", "Lyricalmyrical", "Books", "lyricalmyricalbooks@gmail.com"]);

function files(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(n)) files(p, out); }
    else if (/\.tsx$/.test(n) && !/\.test\./.test(n) && !SKIP_FILES.has(n)) out.push(p);
  }
  return out;
}

describe("storefront has no hard-wired copy", () => {
  it("every visible string comes from getCopy / settings", () => {
    const found: string[] = [];
    for (const file of files(APP_DIR)) {
      const src = readFileSync(file, "utf8");
      const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const at = (n: ts.Node) => `${relative(APP_DIR, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
      const visit = (n: ts.Node) => {
        if (ts.isJsxText(n)) {
          const t = n.getText().replace(/\s+/g, " ").trim();
          if (/[A-Za-z]{2,}/.test(t) && !ALLOWED.has(t)) found.push(`${at(n)} text “${t}”`);
        } else if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && ATTRS.has(n.name.getText())) {
          const t = n.initializer.text;
          if (/[A-Za-z]{2,}/.test(t)) found.push(`${at(n)} ${n.name.getText()} “${t}”`);
        }
        // "text" fallbacks and ternary branches rendered straight into the page: {x || "Words"} / {a ? "One" : "Two"}
        if (ts.isStringLiteral(n) && /[A-Za-z]{3,}/.test(n.text) && !/[-\[\]:/=_$]|^[a-z]+$/.test(n.text)) {
          const p = n.parent;
          const inJsx = (() => { for (let q: ts.Node | undefined = n; q; q = q.parent) { if (ts.isJsxExpression(q)) return !ts.isJsxAttribute(q.parent); if (ts.isJsxAttribute(q) || ts.isFunctionLike(q)) return false; } return false; })();
          const isBranch = (ts.isConditionalExpression(p) && (p.whenTrue === n || p.whenFalse === n))
            || (ts.isBinaryExpression(p) && (p.operatorToken.kind === ts.SyntaxKind.BarBarToken || p.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) && p.right === n);
          const isCopyKey = (() => { for (let q: ts.Node | undefined = n; q; q = q.parent) { if (ts.isCallExpression(q) && /^(getCopy|c)$/.test(q.expression.getText())) return true; if (ts.isJsxExpression(q)) return false; } return false; })();
          if (inJsx && isBranch && !isCopyKey && !ALLOWED.has(n.text)) found.push(`${at(n)} string “${n.text}”`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(found, `Move these into COPY_SCHEMA and read them with getCopy():\n${found.join("\n")}`).toEqual([]);
  });
});
