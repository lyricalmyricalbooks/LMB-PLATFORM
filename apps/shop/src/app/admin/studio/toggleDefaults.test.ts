import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A section switch the storefront treats as on when unset (`settings.x ?? true` / `!== false`) must show on in
// Studio too (`defaultValue: true`), or the owner sees "off" next to a part the shop is showing.
describe("section switches match the storefront's defaults", () => {
  it("marks every default-on switch with defaultValue: true", () => {
    const src = readFileSync("src/app/components/SectionComponents.tsx", "utf8");
    const editor = readFileSync("src/app/admin/ThemeEditorExtensions.tsx", "utf8");
    const keys = new Set([...src.matchAll(/settings\??\.([a-zA-Z]+) (?:\?\? true|!== false)/g)].map(m => m[1]));
    expect(keys.size).toBeGreaterThan(0);
    const wrong: string[] = [];
    for (const key of keys) {
      for (const m of editor.matchAll(new RegExp(`\\{ key: "${key}", label: "[^"]*", kind: "toggle"[^}]*\\}`, "g"))) {
        if (!/defaultValue: true/.test(m[0])) wrong.push(m[0]);
      }
    }
    expect(wrong).toEqual([]);
  });
});
