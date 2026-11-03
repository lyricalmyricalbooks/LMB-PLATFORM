import { describe, expect, it, vi } from "vitest";
import { platformDoor, pressToOpen, type SetupPress } from "./door";

const press = (pressId: string, status: SetupPress["status"]): SetupPress => ({ pressId, status, plan: "", pressName: "", sells: "", country: "", look: "", adminLook: "" });
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

describe("which press setup mode opens", () => {
  it("opens the press in the address, else the only one still in setup", () => {
    const presses = [press("press-open-one", "open"), press("press-new-one", "setup")];
    expect(pressToOpen(presses, "press-open-one")?.pressId).toBe("press-open-one");
    expect(pressToOpen(presses, null)?.pressId).toBe("press-new-one");
    expect(pressToOpen(presses, "press-someone-else")).toBeNull();
    expect(pressToOpen([...presses, press("press-third", "setup")], null)).toBeNull();
  });
});
