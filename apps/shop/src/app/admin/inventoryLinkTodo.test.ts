import { describe, expect, it } from "vitest";
import { inventoryLinkAlerts } from "./adminAlerts";
import { appOnlyBooks, shopDraftFrom } from "./inventoryLink";

const NOW = Date.parse("2026-10-25T15:00:00Z");
const base = { startDay: "2026-10-01", links: { b1: { _: "hound" } }, connection: { ok: true }, lastRunAt: "2026-10-25T14:58:00Z" };

describe("books only the inventory app has", () => {
  it("leaves out books matched since the check and books marked Not for the shop", () => {
    const state = { ...base, appOnlyBooks: { items: [{ id: "zine", title: "Fair Zine" }, { id: "hound", title: "The Hound" }, { id: "old", title: "Old" }] }, ignoredAppBooks: { old: "x" } };
    expect(appOnlyBooks(state).map((b) => b.id)).toEqual(["zine"]);
    expect(appOnlyBooks({})).toEqual([]);
  });
  it("starts a draft with the app's details, and its price only when it's in Canadian dollars", () => {
    expect(shopDraftFrom({ id: "z", title: "Fair Zine", author: "Ana", isbn: "123", price: 12, currency: "CA$" }))
      .toMatchObject({ title: "Fair Zine", subtitle: "Ana", isbn: "123", retailPrice: 12, status: "draft", trackInventory: true });
    expect(shopDraftFrom({ id: "a", title: "Altrove", author: "", isbn: "", price: 40, currency: "€" }).retailPrice).toBe(0);
  });
});

describe("alerts from the inventory app", () => {
  it("shows the app's own to-do with a button into the app, and the books it has that the shop doesn't", () => {
    const alerts = inventoryLinkAlerts({
      ...base,
      app: { todo: { at: "2026-10-25T14:00:00Z", items: [{ id: "needs-you", count: 2, title: "2 website orders need your decision", hash: "#website-orders" }] } },
      appOnlyBooks: { items: [{ id: "zine", title: "Fair Zine" }] },
    }, NOW);
    const todo = alerts.find((a) => a.id === "inventory-app-needs-you");
    expect(todo).toMatchObject({ action: "inventoryApp", appHash: "#website-orders", title: "2 website orders need your decision", key: "2" });
    expect(alerts.find((a) => a.id === "inventory-link-app-books")).toMatchObject({ title: "1 book in the inventory app isn't in the shop yet", action: "inventory" });
  });
  it("drops a to-do the app hasn't refreshed for a week, and an unsafe address", () => {
    const stale = inventoryLinkAlerts({ ...base, app: { todo: { at: "2026-10-10T00:00:00Z", items: [{ id: "x", title: "Old", hash: "#todo" }] } } }, NOW);
    expect(stale.some((a) => a.id === "inventory-app-x")).toBe(false);
    const odd = inventoryLinkAlerts({ ...base, app: { todo: { at: "2026-10-25T14:00:00Z", items: [{ id: "x", title: "Odd", hash: "javascript:alert(1)" }] } } }, NOW);
    expect(odd.find((a) => a.id === "inventory-app-x")?.appHash).toBe("#todo");
  });
});

describe("review fixes", () => {
  it("an app to-do with no time is treated as old; exchange failures show one warning", () => {
    const alerts = inventoryLinkAlerts({ ...base, app: { todo: { items: [{ id: "x", title: "No time", hash: "#todo" }] } }, shopCatalogError: "boom" }, NOW);
    expect(alerts.some((a) => a.id === "inventory-app-x")).toBe(false);
    expect(alerts.find((a) => a.id === "inventory-link-exchange")).toMatchObject({ tone: "warning", action: "inventory" });
  });
});

describe("details that differ from the app", () => {
  const diff = (id: string, field: string, shop: string, app: string, title = "The Hound") =>
    ({ id, inventoryBookId: "hound", bookId: "b1", variantId: null, field, title, shop, app });
  it("leaves out a difference kept as is until one of its values changes", async () => {
    const { detailDiffs, detailSignature } = await import("./inventoryLink");
    const items = [diff("hound|price", "price", "65.00", "70.00"), diff("hound|author", "author", "Ana", "Ana Lee")];
    const kept = { "hound|price": detailSignature(items[0]) };
    expect(detailDiffs({ detailDiffs: { items }, keptDetails: kept }).map((d) => d.id)).toEqual(["hound|author"]);
    // The app's price changed again: it is asked about again.
    expect(detailDiffs({ detailDiffs: { items: [diff("hound|price", "price", "65.00", "72.00")] }, keptDetails: kept })).toHaveLength(1);
    expect(detailDiffs({})).toEqual([]);
  });
  it("words the values for the owner", async () => {
    const { detailText } = await import("./inventoryLink");
    expect(detailText("price", "40.00")).toBe("CA$40.00");
    expect(detailText("isbn", "")).toBe("Not filled in");
  });
  it("raises one alert naming the books, opening the link page", () => {
    const alerts = inventoryLinkAlerts({ ...base, detailDiffs: { items: [diff("hound|price", "price", "65.00", "70.00"), diff("hound|title", "title", "Hound", "The Hound")] } }, NOW);
    const alert = alerts.find((a) => a.id === "inventory-link-details");
    expect(alert).toMatchObject({ tone: "info", action: "inventory" });
    expect(alert?.title).toBe("1 book's details differ from the inventory app");
  });
});
