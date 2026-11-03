// The combined admin's offline copy: who gets it (adminOffline.ts), and what the worker keeps (public/admin-sw.js).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { adminWorker, keepAdminOffline } from "./adminOffline";

describe("turning the admin's offline copy on and off", () => {
  it("scopes the worker to the admin's own address, under any sub-path", () => {
    expect(adminWorker("/")).toEqual({ url: "/admin-sw.js", scope: "/admin" });
    expect(adminWorker("/shop")).toEqual({ url: "/shop/admin-sw.js", scope: "/shop/admin" });
  });
  it("registers for the combined admin and takes only its own worker away otherwise", async () => {
    const own = { scope: "https://shop.example/admin", active: { scriptURL: "https://shop.example/admin-sw.js" }, unregister: vi.fn() };
    const stockroom = { scope: "https://shop.example/stockroom/", active: { scriptURL: "https://shop.example/stockroom/sw.js" }, unregister: vi.fn() };
    const workers = { register: vi.fn(async () => ({}) as any), getRegistrations: vi.fn(async () => [own, stockroom] as any) };
    expect(await keepAdminOffline(true, { base: "/", workers })).toBe(true);
    expect(workers.register).toHaveBeenCalledWith("/admin-sw.js", { scope: "/admin" });
    await keepAdminOffline(false, { base: "/", workers });
    expect(own.unregister).toHaveBeenCalled();
    expect(stockroom.unregister).not.toHaveBeenCalled();
  });
  it("stays quiet when the browser has no service workers or refuses", async () => {
    expect(await keepAdminOffline(true, { workers: undefined })).toBe(false);
    expect(await keepAdminOffline(true, { workers: { register: async () => { throw new Error("no"); }, getRegistrations: async () => [] } as any })).toBe(false);
  });
});

// A small stand-in for a browser's worker: its events, caches and the network.
function worker({ online }: { online: () => boolean }) {
  const handlers: Record<string, (e: any) => void> = {};
  const stores = new Map<string, Map<string, any>>();
  const keyOf = (r: any) => (typeof r === "string" ? r : r.url);
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name)!;
      return {
        match: async (r: any) => m.get(keyOf(r)), put: async (r: any, v: any) => { m.set(keyOf(r), v); },
        keys: async () => [...m.keys()], delete: async (k: string) => m.delete(k),
      };
    },
    keys: async () => [...stores.keys()], delete: async (n: string) => stores.delete(n),
  };
  const fetched: string[] = [];
  const fetch = async (r: any) => {
    fetched.push(r.url);
    if (!online()) throw new TypeError("offline");
    return { ok: true, body: `net:${r.url}`, clone() { return this; } };
  };
  const self: any = {
    location: { origin: "https://shop.example" }, registration: { scope: "https://shop.example/admin" },
    addEventListener: (type: string, fn: any) => { handlers[type] = fn; }, skipWaiting: () => {}, clients: { claim: async () => {} },
  };
  runInNewContext(readFileSync(join(__dirname, "../../../public/admin-sw.js"), "utf8"), { self, caches, fetch, URL, setTimeout, Promise });
  const send = async (url: string, mode = "cors", method = "GET") => {
    let answer: Promise<any> | undefined;
    handlers.fetch({ request: { url, mode, method }, respondWith: (p: Promise<any>) => { answer = p; } });
    return answer ? answer.then((r) => r.body, () => "failed") : "left alone";
  };
  return { send, fetched, stores };
}

describe("what the admin's offline copy keeps", () => {
  it("opens the admin and its files with no signal once it opened with one", async () => {
    let online = true;
    const w = worker({ online: () => online });
    expect(await w.send("https://shop.example/admin?debug=true", "navigate")).toBe("net:https://shop.example/admin?debug=true");
    expect(await w.send("https://shop.example/assets/Dashboard-abc.js")).toBe("net:https://shop.example/assets/Dashboard-abc.js");
    expect(await w.send("https://shop.example/shop-profile.js")).toBe("net:https://shop.example/shop-profile.js");
    online = false;
    expect(await w.send("https://shop.example/admin", "navigate")).toBe("net:https://shop.example/admin?debug=true");
    expect(await w.send("https://shop.example/assets/Dashboard-abc.js")).toBe("net:https://shop.example/assets/Dashboard-abc.js");
    expect(await w.send("https://shop.example/shop-profile.js")).toBe("net:https://shop.example/shop-profile.js");
  });
  it("leaves the shop's pages, the stockroom, other sites, server answers and changes alone", async () => {
    const w = worker({ online: () => true });
    for (const [url, mode, method] of [
      ["https://shop.example/", "navigate"], ["https://shop.example/admin-fixture.html", "navigate"], ["https://shop.example/books/salt", "navigate"],
      ["https://shop.example/stockroom/app", "navigate"], ["https://shop.example/stockroom/assets/index-1.js"],
      ["https://firestore.googleapis.com/v1/x"], ["https://shop.example/api/orders"], ["https://shop.example/assets/a.js", "cors", "POST"],
    ] as const) expect(await w.send(url, mode, method), url).toBe("left alone");
  });
});
