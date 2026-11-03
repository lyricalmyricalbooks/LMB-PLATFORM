// @vitest-environment jsdom
// Settings › Security (plan 22.6) with the Firebase calls pretended: setting up an authenticator app (the picture, the key,
// the code), a wrong code in words, the "sign in again" note once it's on, and turning it off after asking.
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackupApi, TwoStepAuth } from "./adminTwoStep";

vi.mock("../../lib/firebase", () => ({ auth: { currentUser: null } }));
vi.mock("./api", () => ({ adminApi: { getPublicSettings: async () => ({ storeName: "Moth Press" }), logout: vi.fn(async () => {}) } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { SecuritySettings } = await import("./SecuritySettings");

const USER = { email: "owner@example.com" } as any;
function pretend() {
  const enrolled: Array<{ uid: string; factorId: string; displayName: string; enrollmentTime: string }> = [];
  const two: TwoStepAuth = {
    resolverOf: vi.fn(), googleCredentialOf: vi.fn(), signInWithCode: vi.fn(),
    newSecret: vi.fn(async () => ({ secretKey: "JBSWY3DPEHPK3PXP", generateQrCodeUrl: () => "otpauth://totp/Moth%20Press:owner@example.com?secret=JBSWY3DPEHPK3PXP" }) as any),
    enroll: vi.fn(async (_user, _secret, code) => {
      if (code !== "123456") throw Object.assign(new Error("bad"), { code: "auth/invalid-verification-code" });
      enrolled.push({ uid: "f1", factorId: "totp", displayName: "Authenticator app", enrollmentTime: "Tue, 03 Nov 2026 12:00:00 GMT" });
    }),
    unenroll: vi.fn(async () => { enrolled.length = 0; }),
    factors: vi.fn(() => [...enrolled]),
  };
  return two;
}

let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
/** Waits for the lazily loaded picture library and the steps after it. */
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 100 && !ok(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
};
const text = () => document.body.textContent || "";
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await flush(); };
const type = async (value: string) => {
  const input = document.querySelector("[data-two-step-setup] input") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const CODES = ["ABCDE-FGHJK", "BCDEF-GHJKM", "CDEFG-HJKMN", "DEFGH-JKMNP", "EFGHJ-KMNPQ", "FGHJK-MNPQR", "GHJKM-NPQRS", "HJKMN-PQRST", "JKMNP-QRSTU", "KMNPQ-RSTUV"];
function pretendBackup(left = 0): BackupApi & { make: ReturnType<typeof vi.fn> } {
  return {
    status: vi.fn(async () => ({ left, madeAt: left ? "2026-10-01T00:00:00.000Z" : null })),
    make: vi.fn(async () => ({ codes: CODES, madeAt: "2026-11-03T16:00:00.000Z" })),
  };
}
const mount = async (two: TwoStepAuth, backup: BackupApi = pretendBackup()) => {
  const host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(h(SecuritySettings, { two, user: USER, backup })));
  await flush();
};

describe("Settings › Security", () => {
  it("sets up an authenticator app: picture and key, a wrong code in words, then on with a sign-in-again note", async () => {
    const two = pretend();
    await mount(two);
    expect(text()).toContain("Off");
    await click(button("Set up two-step sign-in"));
    await until(() => text().includes("JBSW"));
    expect(text()).toContain("JBSW Y3DP EHPK 3PXP");
    const picture = document.querySelector("[data-two-step-setup] img") as HTMLImageElement;
    expect(picture.src).toMatch(/^data:image\/gif;base64,/);
    await type("654321");
    await click(button("Turn on two-step sign-in"));
    expect(text()).toContain("That code didn't work.");
    await type("123 456");
    await click(button("Turn on two-step sign-in"));
    expect(two.enroll).toHaveBeenLastCalledWith(USER, expect.anything(), "123456");
    expect(text()).toContain("Two-step sign-in is on.");
    expect(text()).toContain("Sign out and in again with your code");
    expect(button("Turn off")).toBeDefined();
  });

  it("turns it off only after asking", async () => {
    const two = pretend();
    await two.enroll(USER, {} as any, "123456");
    await mount(two);
    expect(text()).toContain("On");
    await click(button("Turn off"));
    expect(two.unenroll).not.toHaveBeenCalled();
    const yes = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Turn it off")!;
    await click(yes);
    expect(two.unenroll).toHaveBeenCalledWith(USER, "f1");
    expect(button("Set up two-step sign-in")).toBeDefined();
  });

  it("a code too short is caught before anything is sent", async () => {
    const two = pretend();
    await mount(two);
    await click(button("Set up two-step sign-in"));
    await until(() => !!document.querySelector("[data-two-step-setup]"));
    await type("12");
    await click(button("Turn on two-step sign-in"));
    expect(two.enroll).not.toHaveBeenCalled();
    expect(text()).toContain("Type the 6 digits");
  });

  it("shows the backup codes straight after turning it on, once, with copy and download", async () => {
    const two = pretend();
    const backup = pretendBackup();
    await mount(two, backup);
    await click(button("Set up two-step sign-in"));
    await until(() => !!document.querySelector("[data-two-step-setup]"));
    await type("123456");
    await click(button("Turn on two-step sign-in"));
    expect(backup.make).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Save these now.");
    expect(document.querySelectorAll("[data-new-codes] li")).toHaveLength(10);
    expect(text()).toContain("ABCDE-FGHJK");
    expect(button("Copy codes")).toBeDefined();
    expect(button("Download codes")).toBeDefined();
    expect(text()).toContain("10 left");
    await click(button("I've saved them"));
    expect(text()).not.toContain("ABCDE-FGHJK");
    expect(text()).toContain("10 codes left");
  });

  it("makes new codes only after warning that the old ones stop working", async () => {
    const two = pretend();
    await two.enroll(USER, {} as any, "123456");
    const backup = pretendBackup(2);
    await mount(two, backup);
    expect(text()).toContain("2 codes left");
    expect(text()).toContain("Make new ones soon.");
    await click(button("Make new codes"));
    expect(backup.make).not.toHaveBeenCalled();
    expect(text()).toContain("Your old backup codes stop working");
    await click(button("Make new codes"));
    expect(backup.make).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Save these now.");
  });

  it("offers backup codes to someone who has none, and says why making them was refused", async () => {
    const two = pretend();
    await two.enroll(USER, {} as any, "123456");
    const backup = pretendBackup(0);
    backup.make.mockRejectedValueOnce(new Error("For your safety, sign out and sign in again with your code, then make new backup codes."));
    await mount(two, backup);
    expect(text()).toContain("You have no backup codes.");
    await click(button("Make backup codes"));
    expect(text()).toContain("sign in again with your code");
  });

  it("after a backup-code sign-in, says the app was taken off and how many codes are left", async () => {
    sessionStorage.setItem("lmb.twoStepBackupUsed", "7");
    await mount(pretend());
    expect(document.querySelector("[data-backup-used]")).not.toBeNull();
    expect(text()).toContain("You signed in with a backup code.");
    expect(text()).toContain("You have 7 backup codes left.");
    expect(sessionStorage.getItem("lmb.twoStepBackupUsed")).toBeNull();
  });
});
