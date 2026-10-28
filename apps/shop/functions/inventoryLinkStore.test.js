// The shop-to-stockroom link inside one project (plan 1.21): the link opens the stockroom's named database in the
// shop's own project through the project's own Admin app. No second project, no second app, nothing to grant.
import { describe, test, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const store = require("./inventoryLinkStore");
const { readShopConfig } = require("./shopConfig");
const source = readFileSync(new URL("./inventoryLinkStore.js", import.meta.url), "utf8");

describe("the link's database", () => {
  test("is the stockroom's named database, opened on this project's own app", () => {
    const opened = [];
    const ownApp = { name: "[DEFAULT]" };
    const db = store.inventoryDb({ app: () => ownApp, firestoreFor: (app, id) => { opened.push([app, id]); return { id }; } });
    expect(db).toEqual({ id: "stockroom" });
    expect(opened).toEqual([[ownApp, "stockroom"]]);
    expect(store.STOCKROOM_DATABASE).toBe("stockroom");
  });

  test("follows the shop's setting, and never opens the shop's own (default) database", () => {
    const open = (database) => store.inventoryDb({ app: () => ({}), firestoreFor: (_app, id) => id, database });
    expect(open("stockroom-two")).toBe("stockroom-two");
    expect(() => open("(default)")).toThrow(/missing/);
    expect(() => open("")).toThrow(/missing/);
  });

  test("no second project, second app or project id is left in the link's code", () => {
    const code = source.replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/initializeApp\s*\(/);
    expect(code).not.toMatch(/projectId\s*:/);
    expect(code).not.toMatch(/lmb-test-stockroom|INVENTORY_PROJECT/);
    expect(store.INVENTORY_PROJECT).toBeUndefined();
  });
});

describe("the shop's stockroom database setting", () => {
  test("defaults to the name setup gives every shop, and takes a valid name from the env file", () => {
    expect(readShopConfig({}).stockroomDatabase).toBe("stockroom");
    expect(readShopConfig({ SHOP_STOCKROOM_DATABASE: " stock-two " }).stockroomDatabase).toBe("stock-two");
  });

  test("a malformed name, or the shop's own database, keeps the default", () => {
    for (const bad of ["(default)", "Stockroom", "st", "-x-", "a b c", "x".repeat(70)]) {
      expect(readShopConfig({ SHOP_STOCKROOM_DATABASE: bad }).stockroomDatabase, bad).toBe("stockroom");
    }
  });
});

describe("why the stockroom can't be reached, in the panel's words", () => {
  test("a missing database means the shop has no stockroom yet", () => {
    expect(store.connectionProblem({ code: 5, message: "5 NOT_FOUND: The database stockroom does not exist for project moth-press" })).toBe("no-stockroom");
    expect(store.connectionProblem({ code: "not-found", message: "" })).toBe("no-stockroom");
  });

  test("a refusal means the project took away the shop's own access; anything else is a short reason", () => {
    expect(store.connectionProblem({ code: 7, message: "PERMISSION_DENIED" })).toBe("not-granted");
    expect(store.connectionProblem({ message: "Cloud Firestore API has not been used in project" })).toBe("api-disabled");
    expect(store.connectionProblem({ code: 14, message: "unavailable" })).toBe("unreachable");
  });
});
