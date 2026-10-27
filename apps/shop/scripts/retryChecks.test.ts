import { describe, expect, test } from "vitest";
import { retryFailing, LIVE_RETRY_WAITS_MS } from "./retryChecks.mjs";

// A fake site: each path answers wrongly for its first `staleFor` requests (the CDN still holding the old version).
function fakeSite(staleFor: Record<string, number>) {
  const asked: string[][] = [];
  const run = async (items: string[]) => {
    asked.push(items);
    return items.filter(path => (staleFor[path] = (staleFor[path] || 0) - 1) >= 0)
      .map(item => ({ item, message: "body is not the prerendered page" }));
  };
  return { run, asked };
}

describe("retryFailing", () => {
  test("passes once a deploy that was still settling settles, asking again only for the failing checks", async () => {
    const site = fakeSite({ "/page/about": 2, "/collections/publications": 1 });
    const slept: number[] = [];
    const failures = await retryFailing(["/", "/page/about", "/collections/publications"], site.run, {
      waits: [10, 20, 30],
      sleep: async ms => { slept.push(ms); },
    });
    expect(failures).toEqual([]);
    expect(site.asked).toEqual([
      ["/", "/page/about", "/collections/publications"],
      ["/page/about", "/collections/publications"],
      ["/page/about"],
    ]);
    expect(slept).toEqual([10, 20]);
  });

  test("still fails a check that never comes right, after every wait", async () => {
    const site = fakeSite({ "/spa": Infinity });
    const slept: number[] = [];
    const retries: number[] = [];
    const failures = await retryFailing(["/", "/spa"], site.run, {
      waits: [10, 20],
      sleep: async ms => { slept.push(ms); },
      onRetry: (now, wait) => retries.push(now.length * 1000 + wait),
    });
    expect(failures).toEqual([{ item: "/spa", message: "body is not the prerendered page" }]);
    expect(slept).toEqual([10, 20]);
    expect(retries).toEqual([1010, 1020]);
  });

  test("without waits (the emulator) a failure is final at once", async () => {
    const site = fakeSite({ "/spa": 1 });
    const failures = await retryFailing(["/spa"], site.run);
    expect(failures).toHaveLength(1);
    expect(site.asked).toHaveLength(1);
  });

  test("live runs keep trying for a few minutes, not forever", () => {
    const total = LIVE_RETRY_WAITS_MS.reduce((sum, ms) => sum + ms, 0);
    expect(total).toBeGreaterThanOrEqual(60_000);
    expect(total).toBeLessThanOrEqual(5 * 60_000);
  });
});
