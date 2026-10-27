// Quill 2.0.3 has an unpatched XSS in its HTML export (GHSA-v3m3-f69x-jf25 / CVE-2025-15056): getSemanticHTML() and
// getHTML() paste formula and video embed values into the HTML unescaped, so the exported string can carry markup.
// The editors save through editorHtml() (quillHtml.ts), which reads the editor's own DOM instead. This test keeps it
// that way: no code may call Quill's export, until a fixed Quill is released and this guard is removed.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("Quill's HTML export stays unused", () => {
  it("no code calls getSemanticHTML() or getHTML()", () => {
    const calls = sourceFiles(SRC).flatMap((file) => {
      const lines = readFileSync(file, "utf8").split("\n");
      return lines.flatMap((line, i) => (/\.(getSemanticHTML|getHTML)\s*\(/.test(line) ? [`${relative(SRC, file)}:${i + 1}`] : []));
    });
    expect(calls).toEqual([]);
  });
});
