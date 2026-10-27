// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

// Studio's preview (and Check every page, which opens /account?preview=true by itself) shares the owner's sign-in.
// It must never create a customer record for them: that write would also send the owner a welcome email.
const setDoc = vi.fn(async () => {});
const user = { uid: "owner-uid", email: "owner@example.com", displayName: "Owner", emailVerified: true };
vi.mock("../../../lib/firebase", () => ({ auth: {}, db: {}, googleProvider: {} }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {}, signInWithPopup: vi.fn(), signOut: vi.fn(), sendSignInLinkToEmail: vi.fn(),
  isSignInWithEmailLink: () => false, signInWithEmailLink: vi.fn(),
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => { setTimeout(() => cb(user), 0); return () => {}; },
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })), doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })), setDoc,
}));

const { MemoryRouter } = await import("react-router");
const { default: AccountPage } = await import("./Account");
const { CurrencyProvider } = await import("../../CurrencyContext");
const { CartProvider } = await import("../../CartContext");

async function mountAt(search: string) {
  window.history.replaceState(null, "", `/account${search}`);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(h(MemoryRouter, { initialEntries: [`/account${search}`] }, h(CurrencyProvider, null, h(CartProvider, null, h(AccountPage))))); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return () => act(() => root.unmount());
}
afterEach(() => { setDoc.mockClear(); window.history.replaceState(null, "", "/"); });

describe("customer account in the Studio preview", () => {
  it("doesn't create a customer record for the signed-in owner", async () => {
    const done = await mountAt("?preview=true");
    expect(setDoc).not.toHaveBeenCalled();
    await done();
  });
  it("still creates one for a customer on the live shop", async () => {
    const done = await mountAt("");
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect((setDoc.mock.calls[0] as any)[0]).toMatchObject({ path: "customers/owner-uid" });
    await done();
  });
});
