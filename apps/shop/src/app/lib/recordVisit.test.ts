// #126: the visit counter follows the same rules as every other storefront signal (not the signed-in owner, not previews).
import { beforeEach, expect, it, vi } from "vitest";

const setDoc = vi.hoisted(() => vi.fn(async () => {}));
const allowed = vi.hoisted(() => ({ value: true }));
vi.mock("firebase/firestore/lite", () => ({
  collection: vi.fn(), doc: vi.fn((_db: unknown, ...path: string[]) => path.join("/")), documentId: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
  increment: vi.fn((n: number) => ({ inc: n })), limit: vi.fn(), orderBy: vi.fn(), query: vi.fn(), setDoc, startAfter: vi.fn(), where: vi.fn(),
}));
vi.mock("../../lib/firestoreLite", () => ({ liteDb: {} }));
vi.mock("./trackingGuard", () => ({ trackingAllowed: async () => allowed.value }));
vi.mock("./functionsBase", () => ({ functionFetch: vi.fn() }));

beforeEach(() => { setDoc.mockClear(); allowed.value = true; });

it("does not count a visit from the signed-in owner", async () => {
  const { publicApi } = await import("./publicApi");
  allowed.value = false;
  await publicApi.recordVisit();
  expect(setDoc).not.toHaveBeenCalled();
});

it("counts a normal shopper visit", async () => {
  const { publicApi } = await import("./publicApi");
  await publicApi.recordVisit();
  expect(setDoc).toHaveBeenCalledTimes(1);
});
