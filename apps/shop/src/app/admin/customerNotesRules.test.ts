import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rules = readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8");
const block = (name: string) => {
  const start = rules.indexOf(`match /${name}/`);
  return start < 0 ? "" : rules.slice(start, rules.indexOf("\n    match /", start + 1));
};

describe("admin-only customer data rules", () => {
  it("customerNotes are admin-only with a bounded shape", () => {
    const b = block("customerNotes");
    expect(b).toMatch(/allow read, delete: if isAdmin\(\);/);
    expect(b).toMatch(/allow create, update: if isAdmin\(\)/);
    expect(b).toMatch(/hasOnly\(\["email", "note", "tags", "updatedAt"\]\)/);
    expect(b).not.toMatch(/if true/);
  });
  it("marketing opt-outs are readable by the admin and never writable from a browser", () => {
    const b = block("marketing-optout");
    expect(b).toMatch(/allow read: if isAdmin\(\);/);
    expect(b).toMatch(/allow write: if false;/);
  });
});
