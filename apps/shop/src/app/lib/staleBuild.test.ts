import { describe, expect, it, vi } from "vitest";
import { isStaleChunkError, reloadForNewBuild } from "./staleBuild";

const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe("stale build", () => {
  it("recognises a page's code that could not be fetched after an update, in each browser's wording", () => {
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: https://x.web.app/assets/Orders-abc.js"))).toBe(true);
    expect(isStaleChunkError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new Error("Unable to preload CSS for /assets/x.css"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });

  it("reloads once, then not again within a minute, so a broken deploy never loops", () => {
    const s = store(), reload = vi.fn();
    expect(reloadForNewBuild(s, reload, 1_000_000)).toBe(true);
    expect(reloadForNewBuild(s, reload, 1_030_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadForNewBuild(s, reload, 1_070_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("still reloads when the browser blocks storage", () => {
    const reload = vi.fn();
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(reloadForNewBuild(blocked, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
