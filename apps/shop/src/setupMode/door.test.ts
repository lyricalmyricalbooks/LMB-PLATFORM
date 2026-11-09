import { describe, expect, it, vi } from "vitest";
import { platformDoor, pressToOpen, type SetupPress } from "./door";

const press = (pressId: string, status: SetupPress["status"]): SetupPress => ({ pressId, status, plan: "", pressName: "", sells: "", country: "", look: "", adminLook: "", stagedImport: null });
const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("setup mode's door to the platform", () => {
  it("reads the presses and saves answers with the person's token, and reads plans without one", async () => {
    const fetchImpl = vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith("/press")) return answer(200, { presses: [press("press-moth", "setup")] });
      if (url.endsWith("/press/setup")) return answer(200, { press: { ...press("press-moth", "setup"), ...JSON.parse(String(init.body)) } });
      return answer(200, { plans: [], trialDays: 14 });
    });
    const door = platformDoor("https://platform.example/api", async () => "token-1", fetchImpl as unknown as typeof fetch);
    expect((await door.presses())[0].pressId).toBe("press-moth");
    expect((await door.save("press-moth", { look: "press-riso" })).look).toBe("press-riso");
    await door.plans();
    const [, saveCall, plansCall] = fetchImpl.mock.calls;
    expect(saveCall[0]).toBe("https://platform.example/api/press/setup");
    expect(JSON.parse(String(saveCall[1].body))).toEqual({ pressId: "press-moth", look: "press-riso" });
    expect((saveCall[1].headers as Record<string, string>).Authorization).toBe("Bearer token-1");
    expect((plansCall[1].headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("turns a refusal or a lost connection into plain words", async () => {
    const refused = platformDoor("/api", async () => "t", (() => answer(409, { ok: false, message: "Your shop is already opening, so setup is locked." })) as unknown as typeof fetch);
    await expect(refused.save("press-moth", { pressName: "Late" })).rejects.toThrow(/setup is locked/);
    const offline = platformDoor("/api", async () => "t", (() => Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch);
    await expect(offline.presses()).rejects.toThrow(/couldn't reach Colophon/);
  });
});

describe("keeping a product file (18.7)", () => {
  it("asks for an upload link, sends the file straight to it without the person's token, then records it", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const fetchImpl = vi.fn((url: string, init: RequestInit) => {
      calls.push([url, init]);
      if (url.endsWith("/press/import")) return answer(200, { upload: { url: "https://uploads.example/up1", method: "PUT", headers: { "Content-Type": "text/csv" } } });
      if (url === "https://uploads.example/up1") return Promise.resolve(new Response(null, { status: 200 }));
      return answer(200, { press: { ...press("press-moth", "setup"), stagedImport: { name: "a.csv", size: 9, rows: 1, at: "2026-11-03T09:00:00Z" } } });
    });
    const door = platformDoor("/api", async () => "token-1", fetchImpl as unknown as typeof fetch);
    const file = new Blob(["Title\nA\n"], { type: "text/csv" });
    const saved = await door.keepImport("press-moth", file, { name: "a.csv", rows: 1 });
    expect(saved.stagedImport?.rows).toBe(1);
    expect(calls.map(([url]) => url)).toEqual(["/api/press/import", "https://uploads.example/up1", "/api/press/import/kept"]);
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ pressId: "press-moth", size: file.size });
    expect((calls[1][1].headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(String(calls[2][1].body))).toEqual({ pressId: "press-moth", name: "a.csv", rows: 1 });
  });

  it("says so when the file doesn't arrive, and records nothing", async () => {
    const fetchImpl = vi.fn((url: string) => (url.endsWith("/press/import")
      ? answer(200, { upload: { url: "https://uploads.example/up1", method: "PUT", headers: {} } })
      : Promise.resolve(new Response(null, { status: 403 }))));
    const door = platformDoor("/api", async () => "t", fetchImpl as unknown as typeof fetch);
    await expect(door.keepImport("press-moth", new Blob(["x"]), { name: "a.csv", rows: 1 })).rejects.toThrow(/didn't finish sending/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("which press setup mode opens", () => {
  it("Open my shop sends the plan and the terms the press agreed to, and answers with the record and the shop", async () => {
    const fetchImpl = vi.fn((_url: string, _init: RequestInit) => answer(200, { press: { ...press("press-moth", "opening"), shopId: "moth-press" }, shop: { status: "queued", trialEnd: null } }));
    const door = platformDoor("/api", async () => "t", fetchImpl as unknown as typeof fetch);
    const opened = await door.openShop("press-moth", { plan: "shop", termsVersion: "v1" });
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/press/open");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1].body))).toEqual({ pressId: "press-moth", plan: "shop", termsAccepted: true, termsVersion: "v1" });
    expect([opened.press.status, opened.press.shopId, opened.shop?.status]).toEqual(["opening", "moth-press", "queued"]);
  });

  it("opens the press in the address, else the only one still in setup", () => {
    const presses = [press("press-open-one", "open"), press("press-new-one", "setup")];
    expect(pressToOpen(presses, "press-open-one")?.pressId).toBe("press-open-one");
    expect(pressToOpen(presses, null)?.pressId).toBe("press-new-one");
    expect(pressToOpen(presses, "press-someone-else")).toBeNull();
    expect(pressToOpen([...presses, press("press-third", "setup")], null)).toBeNull();
  });

  it("with none in setup, opens the one shop being made, so the press can follow it (code plan 18.9)", () => {
    expect(pressToOpen([press("press-old", "open"), press("press-making", "opening")], null)?.pressId).toBe("press-making");
    expect(pressToOpen([press("press-a", "opening"), press("press-b", "opening")], null)).toBeNull();
    expect(pressToOpen([press("press-making", "opening"), press("press-new", "setup")], null)?.pressId).toBe("press-new");
  });
});

describe("asking a person for help from setup", () => {
  it("sends the request to the support inbox with the person's token, and carries the inbox's field problems back", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => (JSON.parse(String(init.body)).body === "short"
      ? answer(400, { ok: false, message: "Check the highlighted fields.", problems: { body: "Tell us a little more, so we can help." } })
      : answer(200, { ticket: { id: "t-1" } })));
    const door = platformDoor("/api", async () => "token-1", fetchImpl as unknown as typeof fetch);
    await door.askForHelp({ subject: "Look", body: "Which look suits zines?", requestId: "r-1" });
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/support/open");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1].body))).toEqual({ subject: "Look", body: "Which look suits zines?", requestId: "r-1" });
    expect((fetchImpl.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer token-1");
    await expect(door.askForHelp({ subject: "Look", body: "short", requestId: "r-2" })).rejects.toMatchObject({ problems: { body: expect.stringContaining("a little more") } });
  });
});
