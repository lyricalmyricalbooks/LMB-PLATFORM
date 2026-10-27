import { describe, expect, it } from "vitest";
import { planBookMigration, PRIVATE_BOOK_KEYS as SCRIPT_KEYS } from "./migrate-book-private-fields.mjs";
import { PRIVATE_BOOK_KEYS, splitBookPrivate } from "../src/app/admin/bookPrivate";

describe("book private-field migration", () => {
  it("moves exactly the fields the admin editor keeps private", () => {
    expect([...SCRIPT_KEYS].sort()).toEqual([...PRIVATE_BOOK_KEYS].sort());
  });

  it("plans the same split the editor makes on save", () => {
    const data = { title: "A", status: "published", costPrice: 5, shelfLocation: "B2", digitalFileUrl: "https://x/y", variants: [{ id: "p", shelfLocation: "C1" }, { id: "e" }] };
    const plan = planBookMigration(data);
    const { priv } = splitBookPrivate(data);
    expect(plan.priv).toEqual(priv);
    expect(plan.removeKeys.sort()).toEqual(["costPrice", "digitalFileUrl", "shelfLocation"]);
    expect(plan.variants).toEqual([{ id: "p" }, { id: "e" }]);
    expect(plan.status).toBeNull();
    expect(plan.changed).toBe(true);
  });

  it("stamps status 'published' on books saved before statuses existed (the new rule serves only published books)", () => {
    expect(planBookMigration({ title: "Old book" }).status).toBe("published");
    expect(planBookMigration({ title: "Old book", status: "draft" }).status).toBeNull();
  });

  it("is idempotent: a migrated book has nothing left to do", () => {
    expect(planBookMigration({ title: "A", status: "published", retailPrice: 10, variants: [{ id: "p" }] }).changed).toBe(false);
  });

  it("never overwrites a value already saved privately", () => {
    const plan = planBookMigration({ status: "published", costPrice: 5 }, { costPrice: 7 });
    expect(plan.priv).toEqual({});
    expect(plan.removeKeys).toEqual(["costPrice"]);
  });
});
