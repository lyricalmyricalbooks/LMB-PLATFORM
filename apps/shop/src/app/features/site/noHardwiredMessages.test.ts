import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
// TypeScript 7 (the compiler) has no JS API; Microsoft's @typescript/typescript6 keeps the classic parser for tools like this.
import ts from "@typescript/typescript6";

// Companion to noHardwiredCopy.test.ts. That one reads JSX; this one reads the sentences that reach
// the shopper *indirectly* — error messages, notices, prompts, and word-fallbacks in renderers.
// Every one must come from getCopy() (Studio › Text & labels) or from a section's Content fields.
const APP_DIR = join(__dirname, "..", "..");
const SKIP_DIRS = new Set(["admin", "ui", "figma"]);
// commerce.ts / reviews.ts / seo.ts / functionsBase.ts are data layers: their strings are audit-log
// notes or developer diagnostics, never shown as-is to a shopper (seo.ts is covered by its own tests).
const SKIP_FILES = new Set(["RichTextEditor.tsx", "commerce.ts", "functionsBase.ts", "ErrorBoundary.tsx"]);

function files(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(n)) files(p, out); }
    else if (/\.tsx?$/.test(n) && !/\.test\./.test(n) && !SKIP_FILES.has(n)) out.push(p);
  }
  return out;
}

// A literal that reads like a sentence/label: has a space and at least two letters-words.
const wordy = (s: string) => /[A-Za-z]{3,}/.test(s) && /\s/.test(s.trim()) && /^[A-Z"'(]/.test(s.trim());
// A lone capitalised word ("JOIN", "Explore") is also copy when it is a renderer fallback.
const wordyOrSingle = (s: string) => wordy(s) || /^[A-Z][A-Za-z]{2,}$/.test(s.trim());
const MSG_CALLEE = /^(?:useSEO|set(?:Error|Notice|Message|Status|Msg|Feedback|Success|\w*Error)|alert|prompt|window\.prompt|window\.alert)$/;
const MSG_PROPS = new Set(["text", "message", "error", "placeholder", "label", "title", "description"]);

describe("storefront has no hard-wired messages", () => {
  it("errors, notices and prompts shown to shoppers come from getCopy()", () => {
    const found: string[] = [];
    for (const file of files(APP_DIR)) {
      const src = readFileSync(file, "utf8");
      const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const at = (n: ts.Node) => `${relative(APP_DIR, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
      const literalOf = (n: ts.Node): string | null => {
        if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
        if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => s.literal.text).join(" ");
        return null;
      };
      const check = (n: ts.Node, why: string) => {
        const t = literalOf(n);
        if (t && wordy(t)) found.push(`${at(n)} ${why} “${t.replace(/\s+/g, " ")}”`);
      };
      const visit = (n: ts.Node) => {
        if (ts.isNewExpression(n) && n.expression.getText() === "Error" && n.arguments?.[0]) check(n.arguments[0], "new Error");
        if (ts.isCallExpression(n) && MSG_CALLEE.test(n.expression.getText())) {
          for (const a of n.arguments) {
            check(a, n.expression.getText());
            if (ts.isObjectLiteralExpression(a)) for (const p of a.properties) if (ts.isPropertyAssignment(p) && MSG_PROPS.has(p.name.getText())) check(p.initializer, `${n.expression.getText()}({${p.name.getText()}})`);
          }
        }
        // Word fallbacks rendered by section renderers: `settings.title || "Words"` (defaults belong in the registry).
        if (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.BarBarToken || n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
          && /(^|\.)(settings|s|block|item|d|design)\b/.test(n.left.getText()) && /\.(title|subtitle|ctaText|buttonLabel|description|body|eyebrow|label|text|tagline|heading|placeholder|prevAria|nextAria)\b/.test(n.left.getText())) { const t = literalOf(n.right); if (t && wordyOrSingle(t)) found.push(`${at(n.right)} fallback “${t}”`); }
        // Template-literal accessible names: aria-label={`Go to cover ${n}`}
        if (ts.isJsxAttribute(n) && /^(aria-label|alt|title|placeholder)$/.test(n.name.getText()) && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) {
          // Also each branch of a ternary: aria-label={soldOut ? `${t} is sold out` : `Add ${t}`}
          const branches = (e: ts.Expression): ts.Expression[] => { while (ts.isParenthesizedExpression(e)) e = e.expression; return ts.isConditionalExpression(e) ? [...branches(e.whenTrue), ...branches(e.whenFalse)] : [e]; };
          for (const e of branches(n.initializer.expression)) {
            if (ts.isTemplateExpression(e) && /[A-Za-z]{3,}/.test(e.head.text + e.templateSpans.map((s) => s.literal.text).join(""))) found.push(`${at(n)} ${n.name.getText()} template “${e.getText().slice(0, 60)}”`);
          }
        }
        // Tab titles: document.title = "Shop name" / `${x} | Shop name` (use useSEO — Text & labels › Site & sharing).
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && n.left.getText() === "document.title") {
          const t = literalOf(n.right) ?? (ts.isTemplateExpression(n.right) ? n.right.head.text + n.right.templateSpans.map((s) => s.literal.text).join(" ") : undefined);
          if (t && /[A-Za-z]{3,}/.test(t)) found.push(`${at(n)} document.title “${t}”`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(found, `Move these into COPY_SCHEMA / registry defaults:\n${found.join("\n")}`).toEqual([]);
  });
});
