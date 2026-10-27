// Admin screens that act on many records must report partial failures honestly and see the
// whole catalog (a 500-book page silently drops titles once the catalog grows past it).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { moderationOutcome } from "./reviewInsights";
import { saveSectionsInOrder } from "./settingsSave";

const src = (file: string) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

describe("full-catalog reads", () => {
  it("Inventory and Reviews load every book, not the first page", () => {
    for (const file of ["Inventory.tsx", "ReviewsModeration.tsx"]) {
      expect(src(file)).not.toMatch(/adminApi\.getBooks\(/);
      expect(src(file)).toMatch(/adminApi\.getAllBooks\(\)/);
    }
  });
});

describe("bulk review moderation", () => {
  const ok = { status: "fulfilled", value: undefined } as const;
  const no = { status: "rejected", reason: new Error("denied") } as const;
  it("counts the reviews that failed and keeps them for a retry", () => {
    const out = moderationOutcome(["a", "b", "c"], [ok, no, ok], "approved");
    expect(out.done).toEqual(["a", "c"]);
    expect(out.failed).toEqual(["b"]);
    expect(out.message).toBe("2 reviews approved; 1 failed and stays selected — try again.");
  });
  it("says so when nothing went through, and plainly when everything did", () => {
    expect(moderationOutcome(["a", "b"], [no, no], "rejected").message).toMatch(/Could not update any of the 2 reviews/);
    expect(moderationOutcome(["a"], [ok], "rejected").message).toBe("1 review rejected");
  });
  it("uses allSettled and always reloads after a bulk change", () => {
    const body = src("ReviewsModeration.tsx");
    const moderate = body.slice(body.indexOf("const moderate = async"), body.indexOf("const confirmDelete"));
    expect(moderate).toMatch(/Promise\.allSettled/);
    expect(moderate).not.toMatch(/return;/);
    expect(moderate).toMatch(/load\(\);\s*\};\s*$/);
  });
});

describe("Store settings › Save all", () => {
  it("is only successful when every changed section saved", async () => {
    const tried: string[] = [];
    expect(await saveSectionsInOrder(["info", "location", "policies"], async (k) => { tried.push(k); return k !== "location"; })).toBe(false);
    expect(tried).toEqual(["info", "location"]);
    expect(await saveSectionsInOrder(["info"], async () => true)).toBe(true);
  });
  it("only announces success through that result", () => {
    const body = src("ShopSettings.tsx");
    const saveAll = body.slice(body.indexOf("const saveAll = async"), body.indexOf("const discard = ()"));
    expect(saveAll).toMatch(/if \(await saveSectionsInOrder\([^]*\)\) toast\.success\("Store settings saved"\)/);
  });
});
