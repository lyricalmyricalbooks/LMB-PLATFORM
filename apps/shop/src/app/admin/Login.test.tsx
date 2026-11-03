// @vitest-environment jsdom
// The admin sign-in (plan 22.6): Google, then for someone who uses an authenticator app, the code step; a wrong code
// in words, and "Use another Google account" goes back.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ auth: { currentUser: null } }));
const { TwoStepNeeded } = await import("./adminTwoStep");
const pending = new TwoStepNeeded({ hints: [] } as any, "f1", null);
const login = vi.fn(async () => { throw pending; });
const finishTwoStepLogin = vi.fn(async (_p: unknown, code: string) => {
  // Like the real one (adminTwoStep.finishTwoStep): only the digits count.
  if (code.replace(/\D/g, "") !== "123456") throw Object.assign(new Error("bad"), { code: "auth/invalid-verification-code" });
  return { token: "pass-with-code", user: {} };
});
vi.mock("./api", () => ({ adminApi: { login, finishTwoStepLogin, getPublicSettings: async () => ({ storeName: "Moth Press" }) } }));
vi.mock("./shopWords", () => ({ useShopWords: () => (s: string) => s }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { Login } = await import("./Login");

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => document.body.textContent || "";
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await flush(); };
const type = async (value: string) => {
  const input = document.querySelector("[data-two-step-code] input") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("admin sign-in with an authenticator app", () => {
  it("asks for the code after Google, says when it's wrong, and signs in with the right one", async () => {
    const onLogin = vi.fn();
    const host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(h(Login, { onLogin })));
    await flush();
    await click(button("Sign in with Google"));
    expect(document.querySelector("[data-two-step-code]")).not.toBeNull();
    expect(text()).toContain("Code from your authenticator app");
    await type("111111");
    await click(button("Sign in"));
    expect(text()).toContain("That code didn't work.");
    expect(onLogin).not.toHaveBeenCalled();
    await type("123 456");
    await click(button("Sign in"));
    expect(finishTwoStepLogin).toHaveBeenLastCalledWith(pending, "123 456");
    expect(onLogin).toHaveBeenCalledWith("pass-with-code");
  });

  it("goes back to Google from the code step", async () => {
    const host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(h(Login, { onLogin: vi.fn() })));
    await flush();
    await click(button("Sign in with Google"));
    await click(button("Use another Google account"));
    expect(button("Sign in with Google")).toBeDefined();
  });
});
