// The Studio preview runs the real storefront. Its forms show success but must not save anything (#145).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setDoc = vi.fn(async () => undefined);
vi.mock("firebase/firestore/lite", () => ({ doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }), setDoc: (...a: unknown[]) => (setDoc as any)(...a) }));
vi.mock("../../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("../../../lib/authSession", () => ({ restoredUser: async () => null }));
const functionFetch = vi.fn(async () => ({ ok: true, status: 200 }));
vi.mock("../../lib/functionsBase", () => ({ functionFetch: (...a: unknown[]) => (functionFetch as any)(...a) }));

import { subscribeNewsletter } from "./newsletterSignup";
import { saveStockAlert } from "./BackInStockForm";

beforeEach(() => { setDoc.mockClear(); functionFetch.mockClear(); });
afterEach(() => { delete (globalThis as any).window; });

describe("forms in the Studio preview", () => {
  it("the footer newsletter box writes nothing from the preview", async () => {
    (globalThis as any).window = { location: { search: "?preview=true" } };
    await expect(subscribeNewsletter("test@example.com", "website-footer")).resolves.toBeUndefined();
    expect(setDoc).not.toHaveBeenCalled();
    expect(functionFetch).not.toHaveBeenCalled();
  });
  it("the back-in-stock box writes nothing from the preview", async () => {
    (globalThis as any).window = { location: { search: "?preview=true" } };
    await saveStockAlert({ email: "test@example.com", bookId: "b1", bookTitle: "Book" });
    expect(setDoc).not.toHaveBeenCalled();
  });
  it("both still write for a real shopper", async () => {
    (globalThis as any).window = { location: { search: "" } };
    await subscribeNewsletter("reader@example.com", "website-footer");
    await saveStockAlert({ email: "reader@example.com", bookId: "b1", bookTitle: "Book", variantId: "v" });
    // The newsletter signs up through the server (double opt-in); the stock alert writes Firestore.
    expect(functionFetch).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect((setDoc.mock.calls as any[])[0][0].path).toBe("stockAlerts/reader@example.com__b1__v");
  });
});
